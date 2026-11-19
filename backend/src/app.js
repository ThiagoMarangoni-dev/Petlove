import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { ErroApi, invalido } from './erros.js';
import { criarServicoProdutos } from './servicos/produtos.js';
import { criarServicoPedidos } from './servicos/pedidos.js';
import { criarServicoPreferencias } from './servicos/preferencias.js';
import { criarServicoSincronizacao } from './servicos/sincronizacao.js';
import { criarServicoExportacao } from './servicos/exportacao.js';
import { criarBuscaCep } from './integracao/viacep.js';

/** Troca "imagem": "/imagens/x.png" por "http://host/imagens/x.png" em qualquer nível do JSON. */
function completarImagens(valor, base) {
  if (Array.isArray(valor)) return valor.map((v) => completarImagens(v, base));
  if (valor && typeof valor === 'object') {
    const novo = {};
    for (const [chave, v] of Object.entries(valor)) {
      novo[chave] =
        chave === 'imagem' && typeof v === 'string' && v.startsWith('/imagens/') ? base + v : completarImagens(v, base);
    }
    return novo;
  }
  return valor;
}

const idDaRota = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw invalido({ id: 'Id inválido.' });
  return id;
};

/**
 * Monta a aplicação Express. Recebe o banco e, opcionalmente, a função de CEP
 * (os testes passam uma função falsa para não depender da internet).
 */
export function criarApp({ db, buscarCep = criarBuscaCep() }) {
  const produtos = criarServicoProdutos(db);
  const pedidos = criarServicoPedidos(db, { buscarCep });
  const preferencias = criarServicoPreferencias(db);
  const sincronizacao = criarServicoSincronizacao(db, { pedidos, preferencias });
  const exportacao = criarServicoExportacao(db, { produtos, pedidos, preferencias });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '200kb' }));

  // Imagens dos produtos e das telas: http://<servidor>:3333/imagens/<arquivo>.png
  app.use('/imagens', express.static(fileURLToPath(new URL('../public/imagens', import.meta.url)), { maxAge: '1d' }));

  // O banco guarda o caminho ("/imagens/cama.png"); a resposta leva o endereço completo,
  // com o mesmo host que o celular usou para chamar a API.
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (corpo) => json(completarImagens(corpo, `${req.protocol}://${req.get('host')}`));
    next();
  });

  app.get('/api/saude', (_req, res) => res.json({ status: 'ok', servidorEm: new Date().toISOString() }));

  // ---------- Produtos (CRUD) ----------
  app.get('/api/produtos', (req, res) =>
    res.json(produtos.listar({ busca: String(req.query.busca ?? ''), categoria: String(req.query.categoria ?? '') })),
  );
  app.get('/api/produtos/:id', (req, res) => res.json(produtos.obter(idDaRota(req))));
  app.post('/api/produtos', (req, res) => res.status(201).json(produtos.criar(req.body)));
  app.put('/api/produtos/:id', (req, res) => res.json(produtos.atualizar(idDaRota(req), req.body ?? {})));
  app.delete('/api/produtos/:id', (req, res) => {
    produtos.remover(idDaRota(req));
    res.status(204).end();
  });

  // ---------- Pedidos (CRUD) ----------
  app.get('/api/pedidos', (req, res) => res.json(pedidos.listar({ status: String(req.query.status ?? '') })));
  app.get('/api/pedidos/:id', (req, res) => res.json(pedidos.obter(idDaRota(req))));
  app.post('/api/pedidos', async (req, res) => {
    const { pedido, criado } = await pedidos.criar(req.body);
    // 201 = criado agora; 200 = reenvio do mesmo idLocal (já estava gravado).
    res.status(criado ? 201 : 200).json(pedido);
  });
  app.patch('/api/pedidos/:id/status', (req, res) => res.json(pedidos.mudarStatus(idDaRota(req), req.body?.status)));
  app.delete('/api/pedidos/:id', (req, res) => {
    pedidos.remover(idDaRota(req));
    res.status(204).end();
  });

  // ---------- Favoritos e carrinho ----------
  app.get('/api/favoritos', (_req, res) => res.json(preferencias.listarFavoritos()));
  app.post('/api/favoritos/:id', (req, res) => res.status(201).json(preferencias.adicionarFavorito(idDaRota(req))));
  app.delete('/api/favoritos/:id', (req, res) => res.json(preferencias.removerFavorito(idDaRota(req))));
  app.get('/api/carrinho', (_req, res) => res.json(preferencias.obterCarrinho()));
  app.put('/api/carrinho', (req, res) => res.json(preferencias.salvarCarrinho(req.body?.itens)));

  // ---------- Sincronização ----------
  app.get('/api/sincronizacao', (req, res) => res.json(sincronizacao.alteracoesDesde(req.query.desde)));

  // ---------- Serviço externo: CEP (Correios via ViaCEP) ----------
  app.get('/api/cep/:cep', async (req, res) => res.json(await buscarCep(req.params.cep)));

  // ---------- Exportação JSON para o dashboard ----------
  app.get('/api/exportar', (req, res) => {
    const dados = exportacao.gerar();
    if (req.query.download === '1') {
      const dia = dados.metadados.geradoEm.slice(0, 10);
      res.attachment(`petlove-dados-${dia}.json`);
    }
    res.json(dados);
  });

  // ---------- Erros ----------
  app.use('/api', (_req, _res, next) => next(new ErroApi(404, 'Rota não encontrada.')));
  // eslint-disable-next-line no-unused-vars
  app.use((erro, _req, res, _next) => {
    if (erro instanceof ErroApi) {
      return res.status(erro.status).json({ mensagem: erro.message, ...(erro.campos && { campos: erro.campos }) });
    }
    if (erro.type === 'entity.parse.failed') {
      return res.status(400).json({ mensagem: 'JSON malformado.' });
    }
    console.error(erro);
    res.status(500).json({ mensagem: 'Erro interno no servidor.' });
  });

  return { app, servicos: { produtos, pedidos, preferencias, sincronizacao, exportacao } };
}
