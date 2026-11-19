// Dados iniciais: os 4 produtos do protótipo + histórico de pedidos para o dashboard.
// Imagens ficam em backend/public/imagens e são servidas pela API em /imagens.
const IMG = '/imagens/';

export const PRODUTOS_INICIAIS = [
  {
    nome: 'Biscoitos orgânicos de osso',
    categoria: 'Petiscos para cães',
    descricao: 'Biscoitos crocantes feitos com ingredientes naturais, sem corantes.',
    preco: 12.99,
    avaliacao: 4.9,
    numAvaliacoes: 120,
    imagem: IMG + 'biscoitos.png',
    estoque: 300,
  },
  {
    nome: 'Varinha com penas',
    categoria: 'Diversão para gatos',
    descricao: 'Brinquedo interativo com penas coloridas para estimular o instinto de caça.',
    preco: 8.5,
    avaliacao: 4.8,
    numAvaliacoes: 85,
    imagem: IMG + 'varinha.png',
    estoque: 300,
  },
  {
    nome: 'Cama donut marshmallow',
    categoria: 'Camas e conforto',
    descricao: 'Cama redonda e macia, com borda alta para o pet se aconchegar.',
    preco: 45,
    avaliacao: 5,
    numAvaliacoes: 210,
    imagem: IMG + 'cama.png',
    estoque: 250,
  },
  {
    nome: 'Comedouro elevado de cerâmica',
    categoria: 'Alimentação',
    descricao: 'Comedouro com base elevada que melhora a postura durante as refeições.',
    preco: 22,
    avaliacao: 4.7,
    numAvaliacoes: 46,
    imagem: IMG + 'comedouro.png',
    estoque: 200,
  },
];

// Endereços de exemplo (já resolvidos, para o seed não depender da internet).
const ENDERECOS = [
  { cep: '01310100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' },
  { cep: '13010111', logradouro: 'Rua Barão de Jaguara', bairro: 'Centro', cidade: 'Campinas', uf: 'SP' },
  { cep: '20040020', logradouro: 'Avenida Rio Branco', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' },
  { cep: '30130010', logradouro: 'Avenida Afonso Pena', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG' },
  { cep: '80010000', logradouro: 'Rua XV de Novembro', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' },
  { cep: '90010150', logradouro: 'Rua dos Andradas', bairro: 'Centro Histórico', cidade: 'Porto Alegre', uf: 'RS' },
];

// Gerador pseudoaleatório com semente fixa: o seed gera sempre os mesmos dados.
function aleatorio(semente) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Popula o banco se estiver vazio.
 * @param historico quantidade de pedidos antigos (0 = só produtos).
 */
export async function popular({ servicos, db }, { historico = 80 } = {}) {
  const jaTem = db.prepare('SELECT COUNT(*) AS n FROM produtos').get().n;
  if (jaTem > 0) return false;

  const criados = PRODUTOS_INICIAIS.map((p) => servicos.produtos.criar(p));
  const rnd = aleatorio(2026);
  const hoje = Date.now();
  const dia = 24 * 60 * 60 * 1000;

  for (let n = 0; n < historico; n++) {
    const diasAtras = Math.floor(rnd() * 90) + 1;
    const data = new Date(hoje - diasAtras * dia + Math.floor(rnd() * 12 + 8) * 60 * 60 * 1000);
    const qtdProdutos = 1 + Math.floor(rnd() * 3);
    const escolhidos = [...criados].sort(() => rnd() - 0.5).slice(0, qtdProdutos);
    const end = ENDERECOS[Math.floor(rnd() * ENDERECOS.length)];
    const { pedido } = await servicos.pedidos.criar(
      {
        itens: escolhidos.map((p) => ({ produtoId: p.id, quantidade: 1 + Math.floor(rnd() * 3) })),
        cep: end.cep,
        idLocal: `seed-${n}`,
      },
      { criadoEm: data.toISOString() },
    );
    db.prepare('UPDATE pedidos SET endereco = ?, cidade = ?, uf = ? WHERE id = ?').run(
      `${end.logradouro}, ${end.bairro}`,
      end.cidade,
      end.uf,
      pedido.id,
    );
    // Pedidos antigos já foram entregues; alguns foram cancelados.
    const sorteio = rnd();
    const caminho =
      diasAtras > 3
        ? sorteio < 0.08
          ? ['Cancelado']
          : ['Em preparo', 'A caminho', 'Entregue']
        : sorteio < 0.5
          ? ['Em preparo', 'A caminho']
          : ['Em preparo'];
    for (const status of caminho) servicos.pedidos.mudarStatus(pedido.id, status);
    // Mantém a data do pedido como a data histórica.
    db.prepare('UPDATE pedidos SET atualizado_em = criado_em WHERE id = ?').run(pedido.id);
  }

  // Estado inicial do app: carrinho e favoritos do protótipo.
  servicos.preferencias.salvarCarrinho({ [criados[0].id]: 2, [criados[1].id]: 1 });
  servicos.preferencias.adicionarFavorito(criados[0].id);
  servicos.preferencias.adicionarFavorito(criados[2].id);
  return true;
}
