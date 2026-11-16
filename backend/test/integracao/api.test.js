// Testes de INTEGRAÇÃO: rotas HTTP + serviços + banco SQLite real (em memória).
// Só o ViaCEP é substituído por uma função falsa, para não depender da internet.
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { abrirBanco } from '../../src/db.js';
import { criarApp } from '../../src/app.js';
import { popular } from '../../src/seed.js';
import { ErroApi } from '../../src/erros.js';

const cepFalso = async (cep) => {
  if (cep === '99999999') throw new ErroApi(404, 'CEP não encontrado.');
  return { cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' };
};

let app;
let db;

beforeEach(async () => {
  db = abrirBanco(':memory:');
  const montado = criarApp({ db, buscarCep: cepFalso });
  await popular({ ...montado, db }, { historico: 0 });
  app = montado.app;
});

describe('Produtos (CRUD)', () => {
  it('GET /api/produtos lista os 4 produtos iniciais', async () => {
    const r = await request(app).get('/api/produtos').expect(200);
    assert.equal(r.body.length, 4);
    assert.equal(r.body[0].nome, 'Biscoitos orgânicos de osso');
  });

  it('GET /api/produtos?busca= filtra por nome ou categoria', async () => {
    const r = await request(app).get('/api/produtos').query({ busca: 'gato' }).expect(200);
    assert.deepEqual(
      r.body.map((p) => p.nome),
      ['Varinha com penas'],
    );
  });

  it('POST cria, GET lê, PUT altera e DELETE remove', async () => {
    const criado = await request(app)
      .post('/api/produtos')
      .send({ nome: 'Arranhador', categoria: 'Diversão para gatos', preco: 59.9, estoque: 10 })
      .expect(201);
    const id = criado.body.id;
    assert.equal(criado.body.ativo, true);

    const lido = await request(app).get(`/api/produtos/${id}`).expect(200);
    assert.equal(lido.body.preco, 59.9);

    const alterado = await request(app).put(`/api/produtos/${id}`).send({ preco: 49.9 }).expect(200);
    assert.equal(alterado.body.preco, 49.9);
    assert.equal(alterado.body.nome, 'Arranhador', 'PUT parcial mantém os outros campos');

    await request(app).delete(`/api/produtos/${id}`).expect(204);
    await request(app).get(`/api/produtos/${id}`).expect(404);
    const lista = await request(app).get('/api/produtos').expect(200);
    assert.equal(lista.body.length, 4);
  });

  it('POST com dados inválidos devolve 400 com os campos', async () => {
    const r = await request(app).post('/api/produtos').send({ nome: '', preco: -5 }).expect(400);
    assert.ok(r.body.campos.nome);
    assert.ok(r.body.campos.preco);
    assert.ok(r.body.campos.categoria);
  });

  it('id inválido na rota devolve 400 e id inexistente devolve 404', async () => {
    await request(app).get('/api/produtos/abc').expect(400);
    await request(app).get('/api/produtos/999').expect(404);
  });

  it('JSON malformado devolve 400', async () => {
    await request(app).post('/api/produtos').set('Content-Type', 'application/json').send('{"nome":').expect(400);
  });
});

describe('Pedidos (CRUD)', () => {
  const novoPedido = { itens: [{ produtoId: 1, quantidade: 2 }, { produtoId: 2, quantidade: 1 }], cep: '01310-100' };

  it('cria o pedido com preços do servidor, endereço do CEP e baixa no estoque', async () => {
    const antes = (await request(app).get('/api/produtos/1')).body.estoque;
    const r = await request(app)
      .post('/api/pedidos')
      .send({ ...novoPedido, itens: novoPedido.itens.map((i) => ({ ...i, preco: 0.01 })) }) // preço do app é ignorado
      .expect(201);
    assert.equal(r.body.subtotal, 34.48);
    assert.equal(r.body.total, 40.38);
    assert.equal(r.body.status, 'Confirmado');
    assert.match(r.body.codigo, /^PL-\d+$/);
    assert.equal(r.body.cidade, 'São Paulo');
    assert.equal(r.body.quantidadeItens, 3);
    const depois = (await request(app).get('/api/produtos/1')).body.estoque;
    assert.equal(depois, antes - 2);
  });

  it('fechar o pedido esvazia o carrinho sincronizado', async () => {
    await request(app).post('/api/pedidos').send(novoPedido).expect(201);
    const r = await request(app).get('/api/carrinho').expect(200);
    assert.deepEqual(r.body, {});
  });

  it('reenviar o mesmo idLocal não duplica o pedido (sincronização idempotente)', async () => {
    const primeiro = await request(app).post('/api/pedidos').send({ ...novoPedido, idLocal: 'app-123' }).expect(201);
    const repetido = await request(app).post('/api/pedidos').send({ ...novoPedido, idLocal: 'app-123' }).expect(200);
    assert.equal(repetido.body.id, primeiro.body.id);
    const lista = await request(app).get('/api/pedidos').expect(200);
    assert.equal(lista.body.length, 1);
  });

  it('recusa pedido acima do estoque com 409 e não grava nada', async () => {
    await request(app).put('/api/produtos/3').send({ estoque: 1 }).expect(200);
    const r = await request(app)
      .post('/api/pedidos')
      .send({ itens: [{ produtoId: 1, quantidade: 1 }, { produtoId: 3, quantidade: 2 }] })
      .expect(409);
    assert.match(r.body.mensagem, /Estoque insuficiente/);
    const lista = await request(app).get('/api/pedidos').expect(200);
    assert.equal(lista.body.length, 0, 'a transação foi desfeita');
    const biscoito = await request(app).get('/api/produtos/1').expect(200);
    assert.equal(biscoito.body.estoque, 300, 'o estoque do 1º item voltou');
  });

  it('recusa produto removido com 422', async () => {
    await request(app).delete('/api/produtos/4').expect(204);
    await request(app)
      .post('/api/pedidos')
      .send({ itens: [{ produtoId: 4, quantidade: 1 }] })
      .expect(422);
  });

  it('pedido continua sendo gravado quando o CEP não é encontrado', async () => {
    const r = await request(app)
      .post('/api/pedidos')
      .send({ itens: [{ produtoId: 1, quantidade: 1 }], cep: '99999-999' })
      .expect(201);
    assert.equal(r.body.cidade, '');
  });

  it('muda o status pelo fluxo e recusa transição inválida', async () => {
    const { body: p } = await request(app).post('/api/pedidos').send(novoPedido).expect(201);
    await request(app).patch(`/api/pedidos/${p.id}/status`).send({ status: 'Entregue' }).expect(409);
    await request(app).patch(`/api/pedidos/${p.id}/status`).send({ status: 'Em preparo' }).expect(200);
    await request(app).patch(`/api/pedidos/${p.id}/status`).send({ status: 'Xyz' }).expect(400);
  });

  it('cancelar devolve o estoque e só então permite apagar', async () => {
    const { body: p } = await request(app).post('/api/pedidos').send(novoPedido).expect(201);
    await request(app).delete(`/api/pedidos/${p.id}`).expect(409);
    await request(app).patch(`/api/pedidos/${p.id}/status`).send({ status: 'Cancelado' }).expect(200);
    const biscoito = await request(app).get('/api/produtos/1').expect(200);
    assert.equal(biscoito.body.estoque, 300);
    await request(app).delete(`/api/pedidos/${p.id}`).expect(204);
    await request(app).get(`/api/pedidos/${p.id}`).expect(404);
  });
});

describe('Favoritos e carrinho', () => {
  it('adiciona e remove favorito', async () => {
    let r = await request(app).post('/api/favoritos/2').expect(201);
    assert.deepEqual(r.body.sort(), [1, 2, 3]);
    r = await request(app).delete('/api/favoritos/1').expect(200);
    assert.deepEqual(r.body.sort(), [2, 3]);
  });

  it('favoritar produto inexistente devolve 404', async () => {
    await request(app).post('/api/favoritos/999').expect(404);
  });

  it('PUT /api/carrinho substitui o carrinho e ignora quantidade 0', async () => {
    const r = await request(app).put('/api/carrinho').send({ itens: { 3: 1, 1: 0 } }).expect(200);
    assert.deepEqual(r.body, { 3: 1 });
  });

  it('PUT /api/carrinho recusa quantidade inválida', async () => {
    await request(app).put('/api/carrinho').send({ itens: { 1: -2 } }).expect(400);
    await request(app).put('/api/carrinho').send({ itens: [1, 2] }).expect(400);
  });

  it('remover um produto tira ele do carrinho e dos favoritos', async () => {
    await request(app).delete('/api/produtos/1').expect(204);
    assert.deepEqual((await request(app).get('/api/carrinho')).body, { 2: 1 });
    assert.deepEqual((await request(app).get('/api/favoritos')).body, [3]);
  });
});

describe('Sincronização', () => {
  it('sem "desde" devolve tudo (sincronização completa)', async () => {
    const r = await request(app).get('/api/sincronizacao').expect(200);
    assert.equal(r.body.completa, true);
    assert.equal(r.body.produtos.length, 4);
    assert.ok(r.body.servidorEm);
  });

  it('com "desde" devolve só o que mudou, incluindo exclusões', async () => {
    const { body: inicial } = await request(app).get('/api/sincronizacao').expect(200);
    await new Promise((ok) => setTimeout(ok, 5));
    await request(app).put('/api/produtos/2').send({ preco: 9.5 }).expect(200);
    await request(app).delete('/api/produtos/4').expect(204);
    await request(app).post('/api/pedidos').send({ itens: [{ produtoId: 3, quantidade: 1 }] }).expect(201);

    const r = await request(app).get('/api/sincronizacao').query({ desde: inicial.servidorEm }).expect(200);
    assert.equal(r.body.completa, false);
    assert.deepEqual(
      r.body.produtos.map((p) => p.id).sort(),
      [2, 3], // 2 mudou de preço, 3 mudou de estoque
    );
    assert.deepEqual(r.body.produtosRemovidos, [4]);
    assert.equal(r.body.pedidos.length, 1);
  });
});

describe('CEP e exportação', () => {
  it('GET /api/cep/:cep devolve o endereço', async () => {
    const r = await request(app).get('/api/cep/01310100').expect(200);
    assert.equal(r.body.uf, 'SP');
  });

  it('GET /api/cep/:cep repassa o erro do serviço', async () => {
    await request(app).get('/api/cep/99999999').expect(404);
  });

  it('GET /api/exportar gera o JSON do dashboard com resumo coerente', async () => {
    await request(app).post('/api/pedidos').send({ itens: [{ produtoId: 1, quantidade: 2 }] }).expect(201);
    const { body: p2 } = await request(app).post('/api/pedidos').send({ itens: [{ produtoId: 3, quantidade: 1 }] });
    await request(app).patch(`/api/pedidos/${p2.id}/status`).send({ status: 'Cancelado' }).expect(200);

    const r = await request(app).get('/api/exportar').expect(200);
    assert.deepEqual(Object.keys(r.body), ['metadados', 'resumo', 'produtos', 'pedidos', 'itensVendidos']);
    assert.equal(r.body.resumo.totalPedidos, 2);
    assert.equal(r.body.resumo.pedidosCancelados, 1);
    assert.equal(r.body.resumo.faturamento, 31.88); // 2 x 12,99 + 5,90 (o cancelado não entra)
    assert.equal(r.body.itensVendidos.length, 2);
    assert.equal(r.body.produtos.find((p) => p.id === 1).favorito, true);
  });

  it('GET /api/exportar?download=1 manda como arquivo', async () => {
    const r = await request(app).get('/api/exportar').query({ download: '1' }).expect(200);
    assert.match(r.headers['content-disposition'], /attachment; filename="?petlove-dados-\d{4}-\d{2}-\d{2}\.json"?/);
  });

  it('rota desconhecida devolve 404 em JSON', async () => {
    const r = await request(app).get('/api/nada').expect(404);
    assert.equal(r.body.mensagem, 'Rota não encontrada.');
  });
});
