// Banco de dados SQLite usando o módulo nativo do Node (node:sqlite, Node 22.5+).
// Não precisa instalar nada nem compilar dependências nativas.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// O esquema (tabelas) fica em banco/schema.sql, na raiz do projeto.
const ESQUEMA = readFileSync(new URL('../../banco/schema.sql', import.meta.url), 'utf8');

/** Caminho padrão do arquivo do banco: banco/petlove.db */
export const BANCO_PADRAO = fileURLToPath(new URL('../../banco/petlove.db', import.meta.url));

/**
 * Abre (ou cria) o banco. Use ':memory:' nos testes.
 */
export function abrirBanco(caminho = ':memory:') {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(ESQUEMA);
  migrarImagens(db);
  return db;
}

// Os primeiros bancos guardavam links temporários do Figma, que expiram.
// Troca esses links pelas imagens locais (backend/public/imagens).
const IMAGENS_FIGMA = {
  'ddd39f46-b284-42c4-b247-8d20286dc763': '/imagens/biscoitos.png',
  'e9d54f02-1d4e-4911-bcec-db47c0fea05c': '/imagens/varinha.png',
  '2733c08c-5ec4-40b8-bae1-cb2aa03a8eae': '/imagens/cama.png',
  'c3853d95-15bf-4eda-8ea0-b0bc5e5140b7': '/imagens/comedouro.png',
};

export function migrarImagens(db) {
  for (const [id, local] of Object.entries(IMAGENS_FIGMA)) {
    const antigo = `%figma.com%${id}%`;
    db.prepare('UPDATE produtos SET imagem = ? WHERE imagem LIKE ?').run(local, antigo);
    db.prepare('UPDATE pedido_itens SET imagem = ? WHERE imagem LIKE ?').run(local, antigo);
  }
}

/** Executa fn dentro de uma transação (tudo ou nada). */
export function transacao(db, fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

export const agoraIso = () => new Date().toISOString();
