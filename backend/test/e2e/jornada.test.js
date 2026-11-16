// Teste E2E (ponta a ponta): sobe o servidor de verdade (processo separado, banco em arquivo),
// e percorre a jornada do usuário no app pela rede, exatamente nas chamadas que o app faz.
// O ViaCEP é um servidor HTTP falso local, para o teste não depender da internet.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const PORTA = 3900 + Math.floor(Math.random() * 90);
const API = `http://127.0.0.1:${PORTA}/api`;

let servidor;
let viaCepFalso;
let pasta;

async function chamar(metodo, rota, corpo) {
  const r = await fetch(API + rota, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

async function esperarServidor() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${API}/saude`)).ok) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('A API não subiu a tempo.');
}

before(async () => {
  viaCepFalso = createServer((req, res) => {
    const cep = req.url.split('/')[1];
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        cep === '01310100'
          ? { cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' }
          : { erro: true },
      ),
    );
  });
  await new Promise((ok) => viaCepFalso.listen(0, '127.0.0.1', ok));

  pasta = mkdtempSync(join(tmpdir(), 'petlove-e2e-'));
  servidor = spawn(process.execPath, ['--no-warnings', 'src/server.js'], {
    cwd: RAIZ,
    env: {
      ...process.env,
      PORT: String(PORTA),
      PETLOVE_DB: join(pasta, 'e2e.db'),
      PETLOVE_HISTORICO: '0',
      VIACEP_URL: `http://127.0.0.1:${viaCepFalso.address().port}`,
    },
    stdio: 'ignore',
  });
  await esperarServidor();
});

after(() => {
  servidor?.kill();
  viaCepFalso?.close();
  rmSync(pasta, { recursive: true, force: true });
});

describe('Jornada de compra no app (E2E)', () => {
  let marcoSync;
  let pedido;

  it('1. abrir o app: sincronização completa traz catálogo, carrinho e favoritos', async () => {
    const { status, corpo } = await chamar('GET', '/sincronizacao');
    assert.equal(status, 200);
    assert.equal(corpo.produtos.length, 4);
    assert.deepEqual(corpo.carrinho, { 1: 2, 2: 1 });
    assert.deepEqual(corpo.favoritos, [1, 3]);
    marcoSync = corpo.servidorEm;
  });

  it('2. buscar "cama" na tela inicial', async () => {
    const { corpo } = await chamar('GET', '/produtos?busca=cama');
    assert.deepEqual(
      corpo.map((p) => p.nome),
      ['Cama donut marshmallow'],
    );
  });

  it('3. favoritar a varinha e adicionar a cama ao carrinho', async () => {
    assert.equal((await chamar('POST', '/favoritos/2')).status, 201);
    const { corpo } = await chamar('PUT', '/carrinho', { itens: { 1: 2, 2: 1, 3: 1 } });
    assert.deepEqual(corpo, { 1: 2, 2: 1, 3: 1 });
  });

  it('4. informar o CEP no checkout (Correios/ViaCEP)', async () => {
    const { status, corpo } = await chamar('GET', '/cep/01310-100');
    assert.equal(status, 200);
    assert.equal(corpo.cidade, 'São Paulo');
    assert.equal((await chamar('GET', '/cep/00000000')).status, 404);
  });

  it('5. confirmar o pedido (com reenvio por queda de rede sem duplicar)', async () => {
    const corpoPedido = {
      idLocal: 'e2e-pedido-1',
      cep: '01310100',
      itens: [
        { produtoId: 1, quantidade: 2 },
        { produtoId: 2, quantidade: 1 },
        { produtoId: 3, quantidade: 1 },
      ],
    };
    const primeiro = await chamar('POST', '/pedidos', corpoPedido);
    assert.equal(primeiro.status, 201);
    assert.equal(primeiro.corpo.total, 85.38); // 25,98 + 8,50 + 45,00 + 5,90
    assert.equal(primeiro.corpo.uf, 'SP');
    pedido = primeiro.corpo;

    const reenvio = await chamar('POST', '/pedidos', corpoPedido);
    assert.equal(reenvio.status, 200);
    assert.equal(reenvio.corpo.id, pedido.id);
    assert.deepEqual((await chamar('GET', '/carrinho')).corpo, {});
  });

  it('6. "Meus pedidos" e "Detalhes do pedido" mostram o pedido', async () => {
    const lista = await chamar('GET', '/pedidos');
    assert.equal(lista.corpo.length, 1);
    const detalhe = await chamar('GET', `/pedidos/${pedido.id}`);
    assert.equal(detalhe.corpo.itens.length, 3);
  });

  it('7. administrador cadastra, edita e remove produto pelo app', async () => {
    const novo = await chamar('POST', '/produtos', { nome: 'Coleira refletiva', categoria: 'Acessórios', preco: 29.9, estoque: 15 });
    assert.equal(novo.status, 201);
    const editado = await chamar('PUT', `/produtos/${novo.corpo.id}`, { preco: 24.9 });
    assert.equal(editado.corpo.preco, 24.9);
    assert.equal((await chamar('DELETE', '/produtos/4')).status, 204);
  });

  it('8. outro aparelho sincroniza só as mudanças desde a última vez', async () => {
    const { corpo } = await chamar('GET', `/sincronizacao?desde=${encodeURIComponent(marcoSync)}`);
    assert.equal(corpo.completa, false);
    assert.ok(corpo.produtos.some((p) => p.nome === 'Coleira refletiva'));
    assert.deepEqual(corpo.produtosRemovidos, [4]);
    assert.equal(corpo.pedidos.length, 1);
    assert.deepEqual(corpo.favoritos.sort(), [1, 2, 3]);
  });

  it('9. botão "Gerar dados em JSON" devolve o arquivo do dashboard', async () => {
    const r = await fetch(`${API}/exportar?download=1`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /petlove-dados-.*\.json/);
    const dados = await r.json();
    assert.equal(dados.resumo.totalPedidos, 1);
    assert.equal(dados.resumo.faturamento, 85.38);
    assert.equal(dados.itensVendidos.length, 3);
  });

  it('10. dados persistem no banco: o pedido continua lá após nova consulta', async () => {
    const { corpo } = await chamar('GET', `/pedidos/${pedido.id}`);
    assert.equal(corpo.codigo, pedido.codigo);
  });
});
