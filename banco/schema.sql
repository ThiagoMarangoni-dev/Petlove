-- Banco de dados do PetLove (SQLite)
-- Este arquivo é lido pela API ao iniciar: as tabelas são criadas se ainda não existirem.
CREATE TABLE IF NOT EXISTS produtos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT    NOT NULL,
  categoria      TEXT    NOT NULL,
  descricao      TEXT    NOT NULL DEFAULT '',
  preco          REAL    NOT NULL CHECK (preco > 0),
  avaliacao      REAL    NOT NULL DEFAULT 0 CHECK (avaliacao BETWEEN 0 AND 5),
  num_avaliacoes INTEGER NOT NULL DEFAULT 0,
  imagem         TEXT    NOT NULL DEFAULT '',
  estoque        INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT    NOT NULL,
  atualizado_em  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo        TEXT    NOT NULL UNIQUE,
  id_local      TEXT    UNIQUE,
  cliente       TEXT    NOT NULL,
  cep           TEXT    NOT NULL DEFAULT '',
  endereco      TEXT    NOT NULL DEFAULT '',
  cidade        TEXT    NOT NULL DEFAULT '',
  uf            TEXT    NOT NULL DEFAULT '',
  subtotal      REAL    NOT NULL,
  entrega       REAL    NOT NULL,
  total         REAL    NOT NULL,
  status        TEXT    NOT NULL,
  criado_em     TEXT    NOT NULL,
  atualizado_em TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id      INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id     INTEGER NOT NULL REFERENCES produtos(id),
  nome           TEXT    NOT NULL,
  categoria      TEXT    NOT NULL,
  imagem         TEXT    NOT NULL DEFAULT '',
  preco_unitario REAL    NOT NULL,
  quantidade     INTEGER NOT NULL CHECK (quantidade > 0)
);

CREATE TABLE IF NOT EXISTS favoritos (
  produto_id INTEGER PRIMARY KEY REFERENCES produtos(id) ON DELETE CASCADE,
  criado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carrinho (
  produto_id    INTEGER PRIMARY KEY REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade    INTEGER NOT NULL CHECK (quantidade > 0),
  atualizado_em TEXT NOT NULL
);

-- Registros apagados, para a sincronização avisar o app do que sumiu.
CREATE TABLE IF NOT EXISTS exclusoes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela     TEXT NOT NULL,
  registro   INTEGER NOT NULL,
  excluido_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_produtos_atualizado ON produtos(atualizado_em);
CREATE INDEX IF NOT EXISTS idx_pedidos_atualizado  ON pedidos(atualizado_em);
CREATE INDEX IF NOT EXISTS idx_itens_pedido        ON pedido_itens(pedido_id);
