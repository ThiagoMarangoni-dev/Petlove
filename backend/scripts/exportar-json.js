import { fileURLToPath } from 'node:url';
// Gera o arquivo JSON do dashboard direto do banco, sem precisar subir a API.
// Uso: npm run exportar  ->  exportacoes/petlove-dados.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { abrirBanco, BANCO_PADRAO } from '../src/db.js';
import { criarApp } from '../src/app.js';
import { popular } from '../src/seed.js';

const banco = process.env.PETLOVE_DB ?? BANCO_PADRAO;
const db = abrirBanco(banco);
const montado = criarApp({ db });
await popular({ ...montado, db });

const pasta = new URL('../exportacoes/', import.meta.url);
mkdirSync(fileURLToPath(pasta), { recursive: true });
const destino = new URL('petlove-dados.json', pasta);
const dados = montado.servicos.exportacao.gerar();
writeFileSync(fileURLToPath(destino), JSON.stringify(dados, null, 2));
console.log(`Gerado ${fileURLToPath(destino)}: ${dados.resumo.totalPedidos} pedidos, ${dados.itensVendidos.length} itens.`);
