// Sincronização incremental: o app manda a data da última sincronização e recebe
// só o que mudou desde então (produtos, pedidos e exclusões), além do carrinho e favoritos.
import { produtoDaLinha } from './produtos.js';

export function criarServicoSincronizacao(db, { pedidos, preferencias }) {
  return {
    alteracoesDesde(desde) {
      const servidorEm = new Date().toISOString();
      const marco = desde && !Number.isNaN(Date.parse(desde)) ? new Date(desde).toISOString() : '';

      const produtos = db
        .prepare(`SELECT * FROM produtos WHERE ativo = 1 AND (? = '' OR atualizado_em > ?) ORDER BY id`)
        .all(marco, marco)
        .map(produtoDaLinha);

      const idsPedidos = db
        .prepare(`SELECT id FROM pedidos WHERE (? = '' OR atualizado_em > ?) ORDER BY criado_em DESC`)
        .all(marco, marco)
        .map((l) => l.id);

      const exclusoes = marco
        ? db.prepare('SELECT tabela, registro FROM exclusoes WHERE excluido_em > ?').all(marco)
        : [];

      return {
        servidorEm,
        completa: !marco,
        produtos,
        pedidos: idsPedidos.map((id) => pedidos.obter(id)),
        produtosRemovidos: exclusoes.filter((e) => e.tabela === 'produtos').map((e) => e.registro),
        pedidosRemovidos: exclusoes.filter((e) => e.tabela === 'pedidos').map((e) => e.registro),
        carrinho: preferencias.obterCarrinho(),
        favoritos: preferencias.listarFavoritos(),
      };
    },
  };
}
