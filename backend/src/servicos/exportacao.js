// Gera os dados em JSON para o dashboard em Python (disciplina Análise de Dados e Estatística).
// O formato traz tabelas "planas" (uma linha por registro), prontas para pandas.DataFrame.
import { arredondar } from '../regras.js';

export function criarServicoExportacao(db, { produtos, pedidos, preferencias }) {
  return {
    gerar() {
      const listaProdutos = produtos.listar();
      const listaPedidos = pedidos.listar();
      const validos = listaPedidos.filter((p) => p.status !== 'Cancelado');
      const faturamento = arredondar(validos.reduce((s, p) => s + p.total, 0));

      const itensVendidos = listaPedidos.flatMap((p) =>
        p.itens.map((i) => ({
          pedidoId: p.id,
          codigoPedido: p.codigo,
          data: p.criadoEm,
          status: p.status,
          uf: p.uf,
          cidade: p.cidade,
          produtoId: i.produtoId,
          produto: i.nome,
          categoria: i.categoria,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
          totalItem: i.totalItem,
        })),
      );

      return {
        metadados: {
          app: 'Petlove',
          geradoEm: new Date().toISOString(),
          versao: 1,
          moeda: 'BRL',
          descricao:
            'Dados exportados pelo app Petlove para o dashboard. ' +
            'Pedidos cancelados entram nas tabelas, mas não no faturamento do resumo.',
        },
        resumo: {
          totalPedidos: listaPedidos.length,
          pedidosValidos: validos.length,
          pedidosCancelados: listaPedidos.length - validos.length,
          faturamento,
          ticketMedio: validos.length ? arredondar(faturamento / validos.length) : 0,
          itensVendidos: validos.reduce((s, p) => s + p.quantidadeItens, 0),
          produtosAtivos: listaProdutos.length,
          favoritos: preferencias.listarFavoritos().length,
        },
        produtos: listaProdutos.map(({ id, nome, categoria, preco, avaliacao, numAvaliacoes, estoque }) => ({
          id,
          nome,
          categoria,
          preco,
          avaliacao,
          numAvaliacoes,
          estoque,
          favorito: preferencias.listarFavoritos().includes(id),
        })),
        pedidos: listaPedidos.map(({ itens, idLocal, ...resto }) => resto),
        itensVendidos,
      };
    },
  };
}
