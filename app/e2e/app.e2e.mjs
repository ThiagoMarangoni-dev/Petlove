// Teste E2E da INTERFACE do app (versão web do Expo) com Playwright.
// Pré-requisitos: API rodando (cd backend && npm start) e o app web aberto
// (cd app && npx expo start --web), ou o build estático servido.
//   APP_URL=http://localhost:8081 node e2e/app.e2e.mjs
// Salva prints de cada etapa em e2e/telas/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const APP_URL = process.env.APP_URL ?? 'http://localhost:8081';
const PASTA = new URL('./telas/', import.meta.url).pathname;
mkdirSync(PASTA, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
let n = 0;
const print = (nome) => page.screenshot({ path: `${PASTA}${String(++n).padStart(2, '0')}-${nome}.png` });
const passo = async (descricao, fn) => {
  await fn();
  console.log(`ok - ${descricao}`);
};

try {
  await page.goto(APP_URL);

  await passo('carrega o catálogo vindo da API', async () => {
    await page.getByText('Cama donut marshmallow').waitFor();
    await print('inicio');
  });

  await passo('busca filtra os produtos', async () => {
    await page.getByLabel('Buscar produtos').fill('varinha');
    await page.getByText('Varinha com penas').waitFor();
    assert.equal(await page.getByText('Cama donut marshmallow').count(), 0);
    await print('busca');
    await page.getByLabel('Buscar produtos').fill('');
  });

  await passo('abre o produto, favorita e adiciona ao carrinho', async () => {
    await page.getByText('Cama donut marshmallow').click();
    await page.getByText('em estoque').waitFor();
    await print('produto');
    await page.getByText('Adicionar ao carrinho').click();
    await page.getByText('Meu carrinho').waitFor();
    await print('carrinho');
  });

  await passo('consulta o CEP (Correios/ViaCEP) no checkout', async () => {
    await page.getByText('Continuar para pagamento →').click();
    await page.getByLabel('CEP').fill('01310-100');
    await page.getByText('Buscar', { exact: true }).click();
    await page.getByText(/Avenida Paulista/).waitFor();
    await print('checkout-cep');
  });

  await passo('confirma o pedido e o servidor devolve o código', async () => {
    await page.getByText('Confirmar pedido').click();
    await page.getByText('Pedido confirmado!').waitFor();
    assert.ok(await page.getByText(/#PL-\d+/).isVisible());
    await print('pedido-confirmado');
  });

  await passo('Meus pedidos lista o pedido gravado no banco', async () => {
    await page.getByText('Ir para Meus Pedidos').click();
    await page.getByText(/Pedido #PL-\d+/).first().waitFor();
    await print('meus-pedidos');
    await page.getByText(/Pedido #PL-\d+/).first().click();
    await page.getByText('Detalhes do pedido').waitFor();
    await print('detalhe-pedido');
  });

  await passo('cadastra um produto (CRUD) pelo app', async () => {
    await page.getByLabel('Voltar').click(); // volta para "Meus pedidos", que tem a barra de abas
    await page.getByLabel('Perfil').click();
    await page.getByText('Gerenciar produtos').click();
    await print('gerenciar-produtos');
    await page.getByText('+ Novo').click();
    await page.getByText('Cadastrar produto').click(); // sem dados: a API recusa
    await page.getByText('Informe o nome do produto.').waitFor();
    await print('produto-validacao');
    await page.getByLabel('Nome').fill('Coleira refletiva');
    await page.getByLabel('Categoria').fill('Acessórios');
    await page.getByLabel('Preço (R$)').fill('29,90');
    await page.getByLabel('Estoque').fill('15');
    await page.getByText('Cadastrar produto').click();
    await page.getByText('Coleira refletiva').waitFor();
    await print('produto-cadastrado');
  });

  await passo('botão "Gerar dados em JSON" mostra o resumo e baixa o arquivo', async () => {
    await page.getByLabel('Perfil').click();
    await page.getByText('Sincronizado às').waitFor();
    await print('perfil-sincronizado');
    await page.getByText('Gerar dados em JSON').click();
    await page.getByText('Prévia do arquivo').waitFor();
    await print('exportar-json');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByText('Baixar arquivo JSON').click(),
    ]);
    assert.match(download.suggestedFilename(), /^petlove-dados-\d{4}-\d{2}-\d{2}\.json$/);
    await download.saveAs(`${PASTA}petlove-dados-exemplo.json`);
  });

  assert.deepEqual(erros, [], 'sem erros de JavaScript na página');
  console.log(`\nE2E da interface: todos os passos passaram. Prints em ${PASTA}`);
} catch (erro) {
  await print('falha').catch(() => {});
  console.error('FALHOU:', erro.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
