import { agoraIso } from '../db.js';
import { invalido, naoEncontrado } from '../erros.js';
import { validarProduto } from '../regras.js';

/** Converte a linha do banco para o formato JSON da API (camelCase). */
export function produtoDaLinha(l) {
  return {
    id: l.id,
    nome: l.nome,
    categoria: l.categoria,
    descricao: l.descricao,
    preco: l.preco,
    avaliacao: l.avaliacao,
    numAvaliacoes: l.num_avaliacoes,
    imagem: l.imagem,
    estoque: l.estoque,
    ativo: l.ativo === 1,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

export function criarServicoProdutos(db) {
  const buscarLinha = (id) =>
    db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(id);

  return {
    listar({ busca = '', categoria = '' } = {}) {
      const linhas = db
        .prepare(
          `SELECT * FROM produtos
            WHERE ativo = 1
              AND (? = '' OR lower(nome || ' ' || categoria) LIKE '%' || lower(?) || '%')
              AND (? = '' OR categoria = ?)
            ORDER BY id`,
        )
        .all(busca, busca, categoria, categoria);
      return linhas.map(produtoDaLinha);
    },

    obter(id) {
      const l = buscarLinha(id);
      if (!l) throw naoEncontrado('Produto');
      return produtoDaLinha(l);
    },

    criar(dados) {
      const erros = validarProduto(dados);
      if (Object.keys(erros).length) throw invalido(erros);
      const agora = agoraIso();
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO produtos (nome, categoria, descricao, preco, avaliacao, num_avaliacoes,
                                 imagem, estoque, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          dados.nome.trim(),
          dados.categoria.trim(),
          dados.descricao ?? '',
          dados.preco,
          dados.avaliacao ?? 0,
          dados.numAvaliacoes ?? 0,
          dados.imagem ?? '',
          dados.estoque ?? 0,
          agora,
          agora,
        );
      return this.obter(Number(lastInsertRowid));
    },

    atualizar(id, dados) {
      const atual = buscarLinha(id);
      if (!atual) throw naoEncontrado('Produto');
      const erros = validarProduto(dados, { parcial: true });
      if (Object.keys(erros).length) throw invalido(erros);
      const novo = { ...produtoDaLinha(atual), ...dados };
      db.prepare(
        `UPDATE produtos SET nome = ?, categoria = ?, descricao = ?, preco = ?, avaliacao = ?,
                             num_avaliacoes = ?, imagem = ?, estoque = ?, atualizado_em = ?
          WHERE id = ?`,
      ).run(
        novo.nome.trim(),
        novo.categoria.trim(),
        novo.descricao,
        novo.preco,
        novo.avaliacao,
        novo.numAvaliacoes,
        novo.imagem,
        novo.estoque,
        agoraIso(),
        id,
      );
      return this.obter(id);
    },

    /**
     * Exclusão lógica: o produto some do catálogo mas continua nos pedidos antigos.
     * Também sai do carrinho e dos favoritos.
     */
    remover(id) {
      if (!buscarLinha(id)) throw naoEncontrado('Produto');
      const agora = agoraIso();
      db.prepare('UPDATE produtos SET ativo = 0, atualizado_em = ? WHERE id = ?').run(agora, id);
      db.prepare('DELETE FROM carrinho WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM favoritos WHERE produto_id = ?').run(id);
      db.prepare("INSERT INTO exclusoes (tabela, registro, excluido_em) VALUES ('produtos', ?, ?)").run(id, agora);
    },
  };
}
