// Regras de negócio puras (sem banco), fáceis de testar com testes unitários.

export const TAXA_ENTREGA = 5.9;
export const STATUS_PEDIDO = ['Confirmado', 'Em preparo', 'A caminho', 'Entregue', 'Cancelado'];

/** Transições permitidas entre status de pedido. */
const TRANSICOES = {
  Confirmado: ['Em preparo', 'Cancelado'],
  'Em preparo': ['A caminho', 'Cancelado'],
  'A caminho': ['Entregue'],
  Entregue: [],
  Cancelado: [],
};

export const arredondar = (n) => Math.round(n * 100) / 100;

/** Calcula subtotal, entrega e total de uma lista de itens {preco, quantidade}. */
export function calcularTotais(itens) {
  const subtotal = arredondar(itens.reduce((s, i) => s + i.preco * i.quantidade, 0));
  const entrega = subtotal > 0 ? TAXA_ENTREGA : 0;
  return { subtotal, entrega, total: arredondar(subtotal + entrega) };
}

export function podeMudarStatus(atual, novo) {
  return (TRANSICOES[atual] ?? []).includes(novo);
}

/** Normaliza e valida um CEP brasileiro. Devolve só os 8 dígitos ou null. */
export function normalizarCep(cep) {
  const digitos = String(cep ?? '').replace(/\D/g, '');
  return /^\d{8}$/.test(digitos) ? digitos : null;
}

/** Gera o código público do pedido, ex.: PL-2048. */
export const codigoPedido = (id) => `PL-${String(1000 + id)}`;

const texto = (v) => typeof v === 'string' && v.trim().length > 0;
const numero = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Valida o corpo de criação/edição de produto.
 * parcial=true (PUT parcial) só valida os campos enviados.
 * Devolve um objeto { campo: mensagem } (vazio se estiver tudo certo).
 */
export function validarProduto(dados, { parcial = false } = {}) {
  const erros = {};
  const tem = (c) => dados?.[c] !== undefined;
  if (!dados || typeof dados !== 'object') return { corpo: 'Envie um objeto JSON.' };

  if (!parcial || tem('nome')) {
    if (!texto(dados.nome)) erros.nome = 'Informe o nome do produto.';
    else if (dados.nome.trim().length > 80) erros.nome = 'Use no máximo 80 caracteres.';
  }
  if (!parcial || tem('categoria')) {
    if (!texto(dados.categoria)) erros.categoria = 'Informe a categoria.';
  }
  if (!parcial || tem('preco')) {
    if (!numero(dados.preco) || dados.preco <= 0) erros.preco = 'O preço deve ser maior que zero.';
  }
  if (tem('estoque') && (!Number.isInteger(dados.estoque) || dados.estoque < 0)) {
    erros.estoque = 'O estoque deve ser um número inteiro maior ou igual a zero.';
  }
  if (tem('avaliacao') && (!numero(dados.avaliacao) || dados.avaliacao < 0 || dados.avaliacao > 5)) {
    erros.avaliacao = 'A avaliação vai de 0 a 5.';
  }
  if (tem('imagem') && typeof dados.imagem !== 'string') erros.imagem = 'Envie a URL da imagem.';
  if (tem('descricao') && typeof dados.descricao !== 'string') erros.descricao = 'Texto inválido.';
  return erros;
}

/** Valida o corpo de criação de pedido. */
export function validarPedido(dados) {
  const erros = {};
  if (!dados || typeof dados !== 'object') return { corpo: 'Envie um objeto JSON.' };
  if (!Array.isArray(dados.itens) || dados.itens.length === 0) {
    erros.itens = 'O pedido precisa de pelo menos um item.';
  } else {
    dados.itens.forEach((item, i) => {
      if (!Number.isInteger(item?.produtoId)) erros[`itens[${i}].produtoId`] = 'Produto inválido.';
      if (!Number.isInteger(item?.quantidade) || item.quantidade < 1 || item.quantidade > 99) {
        erros[`itens[${i}].quantidade`] = 'A quantidade vai de 1 a 99.';
      }
    });
    const ids = dados.itens.map((i) => i?.produtoId);
    if (new Set(ids).size !== ids.length) erros.itens = 'Não repita o mesmo produto: some as quantidades.';
  }
  if (dados.cep !== undefined && dados.cep !== '' && !normalizarCep(dados.cep)) {
    erros.cep = 'CEP inválido. Use 8 dígitos.';
  }
  if (dados.idLocal !== undefined && (typeof dados.idLocal !== 'string' || dados.idLocal.length > 64)) {
    erros.idLocal = 'idLocal deve ser um texto de até 64 caracteres.';
  }
  return erros;
}
