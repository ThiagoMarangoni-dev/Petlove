// Favoritos e carrinho do usuário, guardados no servidor para sincronizar entre aparelhos.
import { agoraIso, transacao } from '../db.js';
import { invalido, naoEncontrado } from '../erros.js';

export function criarServicoPreferencias(db) {
  const produtoAtivo = (id) => db.prepare('SELECT id FROM produtos WHERE id = ? AND ativo = 1').get(id);

  return {
    listarFavoritos() {
      return db.prepare('SELECT produto_id FROM favoritos ORDER BY criado_em').all().map((l) => l.produto_id);
    },

    adicionarFavorito(produtoId) {
      if (!produtoAtivo(produtoId)) throw naoEncontrado('Produto');
      db.prepare('INSERT OR IGNORE INTO favoritos (produto_id, criado_em) VALUES (?, ?)').run(produtoId, agoraIso());
      return this.listarFavoritos();
    },

    removerFavorito(produtoId) {
      db.prepare('DELETE FROM favoritos WHERE produto_id = ?').run(produtoId);
      return this.listarFavoritos();
    },

    /** Carrinho no formato que o app usa: { "1": 2, "2": 1 } (produtoId -> quantidade). */
    obterCarrinho() {
      const itens = {};
      for (const l of db.prepare('SELECT produto_id, quantidade FROM carrinho').all()) {
        itens[l.produto_id] = l.quantidade;
      }
      return itens;
    },

    /** Substitui o carrinho inteiro pelo enviado pelo app. Quantidade 0 remove o item. */
    salvarCarrinho(itens) {
      if (!itens || typeof itens !== 'object' || Array.isArray(itens)) {
        throw invalido({ itens: 'Envie um objeto { produtoId: quantidade }.' });
      }
      const erros = {};
      const linhas = [];
      for (const [chave, qtd] of Object.entries(itens)) {
        const id = Number(chave);
        if (!Number.isInteger(qtd) || qtd < 0 || qtd > 99) erros[chave] = 'Quantidade de 0 a 99.';
        else if (qtd > 0 && !produtoAtivo(id)) erros[chave] = 'Produto indisponível.';
        else if (qtd > 0) linhas.push([id, qtd]);
      }
      if (Object.keys(erros).length) throw invalido(erros);
      transacao(db, () => {
        const agora = agoraIso();
        db.prepare('DELETE FROM carrinho').run();
        for (const [id, qtd] of linhas) {
          db.prepare('INSERT INTO carrinho (produto_id, quantidade, atualizado_em) VALUES (?, ?, ?)').run(id, qtd, agora);
        }
      });
      return this.obterCarrinho();
    },
  };
}
