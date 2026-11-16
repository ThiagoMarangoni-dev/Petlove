// Consulta o banco SQLite pelo terminal, sem instalar nada.
//   npm run sql                                  -> lista as tabelas e quantos registros cada uma tem
//   npm run sql -- "SELECT nome, preco FROM produtos"
import { abrirBanco, BANCO_PADRAO } from '../src/db.js';

const db = abrirBanco(process.env.PETLOVE_DB ?? BANCO_PADRAO);
const consulta = process.argv.slice(2).join(' ').trim();

if (!consulta) {
  const tabelas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  console.table(
    tabelas.map(({ name }) => ({ tabela: name, registros: db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n })),
  );
} else if (/^\s*(select|pragma|with)\b/i.test(consulta)) {
  console.table(db.prepare(consulta).all());
} else {
  const r = db.prepare(consulta).run();
  console.log(`${r.changes} registro(s) alterado(s).`);
}
