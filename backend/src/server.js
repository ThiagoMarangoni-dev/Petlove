import { abrirBanco, BANCO_PADRAO } from './db.js';
import { criarApp } from './app.js';
import { popular } from './seed.js';
import { criarBuscaCep } from './integracao/viacep.js';

const PORTA = Number(process.env.PORT ?? 3333);
const HISTORICO = Number(process.env.PETLOVE_HISTORICO ?? 80);
const BANCO = process.env.PETLOVE_DB ?? BANCO_PADRAO;

const db = abrirBanco(BANCO);
// VIACEP_URL permite apontar para um ViaCEP falso nos testes E2E.
const buscarCep = criarBuscaCep(process.env.VIACEP_URL ? { baseUrl: process.env.VIACEP_URL } : {});
const montado = criarApp({ db, buscarCep });
if (await popular({ ...montado, db }, { historico: HISTORICO })) console.log('Banco novo: produtos e pedidos de exemplo gravados.');

// 0.0.0.0 para o celular na mesma rede Wi-Fi conseguir acessar.
montado.app.listen(PORTA, '0.0.0.0', () => {
  console.log(`API Petlove em http://localhost:${PORTA}/api (banco: ${BANCO})`);
});
