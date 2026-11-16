// Testes UNITÁRIOS: regras de negócio puras, sem banco e sem HTTP.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TAXA_ENTREGA,
  calcularTotais,
  codigoPedido,
  normalizarCep,
  podeMudarStatus,
  validarPedido,
  validarProduto,
} from '../../src/regras.js';

describe('calcularTotais', () => {
  it('soma os itens e acrescenta a taxa de entrega', () => {
    const r = calcularTotais([
      { preco: 12.99, quantidade: 2 },
      { preco: 8.5, quantidade: 1 },
    ]);
    assert.deepEqual(r, { subtotal: 34.48, entrega: TAXA_ENTREGA, total: 40.38 });
  });

  it('não cobra entrega quando não há itens', () => {
    assert.deepEqual(calcularTotais([]), { subtotal: 0, entrega: 0, total: 0 });
  });

  it('arredonda para centavos (evita 0.1 + 0.2 = 0.30000000000000004)', () => {
    const r = calcularTotais([
      { preco: 0.1, quantidade: 1 },
      { preco: 0.2, quantidade: 1 },
    ]);
    assert.equal(r.subtotal, 0.3);
  });
});

describe('podeMudarStatus', () => {
  it('segue o fluxo Confirmado → Em preparo → A caminho → Entregue', () => {
    assert.ok(podeMudarStatus('Confirmado', 'Em preparo'));
    assert.ok(podeMudarStatus('Em preparo', 'A caminho'));
    assert.ok(podeMudarStatus('A caminho', 'Entregue'));
  });

  it('não deixa pular etapas nem voltar', () => {
    assert.equal(podeMudarStatus('Confirmado', 'Entregue'), false);
    assert.equal(podeMudarStatus('Entregue', 'Confirmado'), false);
  });

  it('não deixa cancelar pedido que já saiu para entrega', () => {
    assert.ok(podeMudarStatus('Em preparo', 'Cancelado'));
    assert.equal(podeMudarStatus('A caminho', 'Cancelado'), false);
  });

  it('recusa status desconhecido', () => {
    assert.equal(podeMudarStatus('Inventado', 'Entregue'), false);
  });
});

describe('normalizarCep', () => {
  it('aceita CEP com ou sem hífen', () => {
    assert.equal(normalizarCep('01310-100'), '01310100');
    assert.equal(normalizarCep('01310100'), '01310100');
  });

  it('recusa CEP com tamanho errado ou vazio', () => {
    assert.equal(normalizarCep('1234'), null);
    assert.equal(normalizarCep(''), null);
    assert.equal(normalizarCep(undefined), null);
  });
});

describe('codigoPedido', () => {
  it('gera o código no formato PL-xxxx', () => {
    assert.equal(codigoPedido(48), 'PL-1048');
  });
});

describe('validarProduto', () => {
  const valido = { nome: 'Bolinha', categoria: 'Brinquedos', preco: 9.9 };

  it('aceita um produto completo', () => {
    assert.deepEqual(validarProduto(valido), {});
  });

  it('aponta todos os campos obrigatórios que faltam', () => {
    const erros = validarProduto({});
    assert.deepEqual(Object.keys(erros).sort(), ['categoria', 'nome', 'preco']);
  });

  it('recusa preço zero ou negativo e estoque fracionado', () => {
    assert.ok(validarProduto({ ...valido, preco: 0 }).preco);
    assert.ok(validarProduto({ ...valido, preco: -1 }).preco);
    assert.ok(validarProduto({ ...valido, estoque: 1.5 }).estoque);
  });

  it('recusa avaliação fora de 0 a 5', () => {
    assert.ok(validarProduto({ ...valido, avaliacao: 6 }).avaliacao);
  });

  it('no modo parcial só valida o que foi enviado', () => {
    assert.deepEqual(validarProduto({ preco: 20 }, { parcial: true }), {});
    assert.ok(validarProduto({ nome: '' }, { parcial: true }).nome);
  });
});

describe('validarPedido', () => {
  it('aceita um pedido válido', () => {
    assert.deepEqual(validarPedido({ itens: [{ produtoId: 1, quantidade: 2 }], cep: '01310-100' }), {});
  });

  it('exige ao menos um item', () => {
    assert.ok(validarPedido({ itens: [] }).itens);
  });

  it('recusa quantidade fora de 1 a 99 e produto repetido', () => {
    assert.ok(validarPedido({ itens: [{ produtoId: 1, quantidade: 0 }] })['itens[0].quantidade']);
    assert.ok(
      validarPedido({
        itens: [
          { produtoId: 1, quantidade: 1 },
          { produtoId: 1, quantidade: 1 },
        ],
      }).itens,
    );
  });

  it('recusa CEP inválido', () => {
    assert.ok(validarPedido({ itens: [{ produtoId: 1, quantidade: 1 }], cep: '123' }).cep);
  });
});
