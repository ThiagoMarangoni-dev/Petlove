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
  return db;
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
