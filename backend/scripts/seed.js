// Recria o banco do zero com os dados de exemplo. Uso: npm run seed
import { rmSync } from 'node:fs';
import { abrirBanco, BANCO_PADRAO } from '../src/db.js';
import { criarApp } from '../src/app.js';
import { popular } from '../src/seed.js';

const banco = process.env.PETLOVE_DB ?? BANCO_PADRAO;
for (const sufixo of ['', '-wal', '-shm']) rmSync(banco + sufixo, { force: true });
const db = abrirBanco(banco);
await popular({ ...criarApp({ db }), db });
console.log(`Banco recriado em ${banco}.`);
