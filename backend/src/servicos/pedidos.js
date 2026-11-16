import { agoraIso, transacao } from '../db.js';
import { ErroApi, invalido, naoEncontrado } from '../erros.js';
import {
  STATUS_PEDIDO,
  calcularTotais,
  codigoPedido,
  normalizarCep,
  podeMudarStatus,
  validarPedido,
} from '../regras.js';

function pedidoDaLinha(l, itens) {
  return {
    id: l.id,
    codigo: l.codigo,
    idLocal: l.id_local,
    cliente: l.cliente,
    cep: l.cep,
    endereco: l.endereco,
    cidade: l.cidade,
    uf: l.uf,
    subtotal: l.subtotal,
    entrega: l.entrega,
    total: l.total,
    status: l.status,
    quantidadeItens: itens.reduce((s, i) => s + i.quantidade, 0),
    itens,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

const itemDaLinha = (l) => ({
  produtoId: l.produto_id,
  nome: l.nome,
  categoria: l.categoria,
  imagem: l.imagem,
  precoUnitario: l.preco_unitario,
  quantidade: l.quantidade,
  totalItem: Math.round(l.preco_unitario * l.quantidade * 100) / 100,
});

/**
 * @param db banco
 * @param buscarCep função opcional (cep) => Promise<{logradouro, bairro, cidade, uf}>
 */
export function criarServicoPedidos(db, { buscarCep } = {}) {
  const itensDo = (pedidoId) =>
    db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY id').all(pedidoId).map(itemDaLinha);

  const montar = (linha) => pedidoDaLinha(linha, itensDo(linha.id));

  return {
    listar({ status = '' } = {}) {
      return db
        .prepare(`SELECT * FROM pedidos WHERE (? = '' OR status = ?) ORDER BY criado_em DESC, id DESC`)
        .all(status, status)
        .map(montar);
    },

    obter(id) {
      const l = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
      if (!l) throw naoEncontrado('Pedido');
      return montar(l);
    },

    /**
     * Cria o pedido. Os preços vêm SEMPRE do banco (o app não define preço).
     * Se o app mandar um idLocal já gravado (reenvio após queda de rede),
     * devolve o pedido existente em vez de duplicar: { pedido, criado:false }.
     */
    async criar(dados, { cliente = 'Sarah Santos', criadoEm } = {}) {
      const erros = validarPedido(dados);
      if (Object.keys(erros).length) throw invalido(erros);

      if (dados.idLocal) {
        const existente = db.prepare('SELECT * FROM pedidos WHERE id_local = ?').get(dados.idLocal);
        if (existente) return { pedido: montar(existente), criado: false };
      }

      const cep = dados.cep ? normalizarCep(dados.cep) : '';
      let endereco = { logradouro: '', bairro: '', cidade: '', uf: '' };
      if (cep && buscarCep) {
        try {
          endereco = await buscarCep(cep);
        } catch {
          // Sem internet ou ViaCEP fora do ar: o pedido segue sem o endereço completo.
        }
      }

      const pedidoId = transacao(db, () => {
        const itens = dados.itens.map(({ produtoId, quantidade }) => {
          const p = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(produtoId);
          if (!p) throw new ErroApi(422, `O produto ${produtoId} não está mais disponível.`);
          if (p.estoque < quantidade) {
            throw new ErroApi(409, `Estoque insuficiente para "${p.nome}" (restam ${p.estoque}).`);
          }
          return { p, quantidade, preco: p.preco };
        });
        const { subtotal, entrega, total } = calcularTotais(itens);
        const agora = criadoEm ?? agoraIso();
        const { lastInsertRowid } = db
          .prepare(
            `INSERT INTO pedidos (codigo, id_local, cliente, cep, endereco, cidade, uf,
                                  subtotal, entrega, total, status, criado_em, atualizado_em)
             VALUES ('tmp', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmado', ?, ?)`,
          )
          .run(
            dados.idLocal ?? null,
            cliente,
            cep,
            [endereco.logradouro, endereco.bairro].filter(Boolean).join(', '),
            endereco.cidade ?? '',
            endereco.uf ?? '',
            subtotal,
            entrega,
            total,
            agora,
            agora,
          );
        const id = Number(lastInsertRowid);
        db.prepare('UPDATE pedidos SET codigo = ? WHERE id = ?').run(codigoPedido(id), id);
        for (const { p, quantidade } of itens) {
          db.prepare(
            `INSERT INTO pedido_itens (pedido_id, produto_id, nome, categoria, imagem, preco_unitario, quantidade)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).run(id, p.id, p.nome, p.categoria, p.imagem, p.preco, quantidade);
          db.prepare('UPDATE produtos SET estoque = estoque - ?, atualizado_em = ? WHERE id = ?').run(
            quantidade,
            agoraIso(),
            p.id,
          );
        }
        // Pedido fechado: esvazia o carrinho sincronizado.
        db.prepare('DELETE FROM carrinho').run();
        return id;
      });

      return { pedido: this.obter(pedidoId), criado: true };
    },

    mudarStatus(id, status) {
      if (!STATUS_PEDIDO.includes(status)) {
        throw invalido({ status: `Use um destes: ${STATUS_PEDIDO.join(', ')}.` });
      }
      const atual = this.obter(id);
      if (!podeMudarStatus(atual.status, status)) {
        throw new ErroApi(409, `Não é possível ir de "${atual.status}" para "${status}".`);
      }
      transacao(db, () => {
        const agora = agoraIso();
        db.prepare('UPDATE pedidos SET status = ?, atualizado_em = ? WHERE id = ?').run(status, agora, id);
        if (status === 'Cancelado') {
          // Devolve os itens ao estoque.
          for (const item of atual.itens) {
            db.prepare('UPDATE produtos SET estoque = estoque + ?, atualizado_em = ? WHERE id = ?').run(
              item.quantidade,
              agora,
              item.produtoId,
            );
          }
        }
      });
      return this.obter(id);
    },

    /** Apaga o pedido. Só pedidos cancelados ou entregues podem ser apagados. */
    remover(id) {
      const atual = this.obter(id);
      if (!['Cancelado', 'Entregue'].includes(atual.status)) {
        throw new ErroApi(409, 'Cancele o pedido antes de apagá-lo.');
      }
      db.prepare('DELETE FROM pedidos WHERE id = ?').run(id);
      db.prepare("INSERT INTO exclusoes (tabela, registro, excluido_em) VALUES ('pedidos', ?, ?)").run(
        id,
        agoraIso(),
      );
    },
  };
}
