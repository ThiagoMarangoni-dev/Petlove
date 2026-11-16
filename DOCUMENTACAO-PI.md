# Sprint 2: itens 2.1, 2.2 e 2.6

Texto para o documento final (PDF). Os prints citados estão em `app/e2e/telas/`. As imagens dos produtos vêm de URLs do Figma; se elas expirarem, os cartões aparecem sem foto.

---

## 2.1 CRUD e integração com API / sincronização de dados

### Arquitetura

```
App React Native (Expo)  ──HTTP/JSON──►  API REST Node.js (Express)  ──►  Banco SQLite
        │                                        │
        └─ fila offline (api.ts)                 └──HTTP──►  ViaCEP (base de CEPs dos Correios)
```

- **Back-end:** Node.js com Express 5. O banco é SQLite, pelo módulo `node:sqlite` que já vem no Node 22, então não é preciso instalar servidor de banco.
- **Banco:** o arquivo fica em `banco/petlove.db`, e as tabelas estão em `banco/schema.sql`.
- **Tabelas:** `produtos`, `pedidos`, `pedido_itens`, `favoritos`, `carrinho` e `exclusoes` (registra o que foi apagado, para a sincronização avisar o app).
- **App:** o arquivo `app/api.ts` concentra todas as chamadas à API. O `App.tsx` deixou de usar dados fixos: produtos, carrinho, favoritos e pedidos agora vêm do servidor.

### Operações CRUD

| Recurso | Criar | Ler | Atualizar | Deletar |
|---|---|---|---|---|
| Produtos | `POST /api/produtos` | `GET /api/produtos?busca=`, `GET /api/produtos/:id` | `PUT /api/produtos/:id` | `DELETE /api/produtos/:id` |
| Pedidos | `POST /api/pedidos` | `GET /api/pedidos`, `GET /api/pedidos/:id` | `PATCH /api/pedidos/:id/status` | `DELETE /api/pedidos/:id` |
| Favoritos | `POST /api/favoritos/:id` | `GET /api/favoritos` | n/a | `DELETE /api/favoritos/:id` |
| Carrinho | n/a | `GET /api/carrinho` | `PUT /api/carrinho` | (PUT com quantidade 0) |

No app:
- **Gerenciar produtos** (Perfil → Gerenciar produtos) cadastra, edita e exclui produtos. Os erros de validação da API aparecem embaixo de cada campo (print `10-produto-validacao.png`).
- **Checkout** cria o pedido. **Detalhes do pedido** permite cancelar e, depois de cancelado ou entregue, apagar.
- Favoritar e mudar a quantidade no carrinho grava no servidor.

Regras de negócio no servidor:
- O preço vem sempre do banco. O app só manda produto e quantidade.
- O estoque é verificado. Se faltar algum item, a API responde 409 e nada é gravado (transação).
- Cancelar um pedido devolve os itens ao estoque.
- O status segue Confirmado → Em preparo → A caminho → Entregue. Só dá para cancelar antes de sair para entrega.
- Produto excluído some do catálogo, mas continua aparecendo nos pedidos antigos (exclusão lógica).

### Consumo de serviço RESTful externo (Correios)

No checkout, o usuário digita o CEP e o app consulta `GET /api/cep/:cep`. A API chama o **ViaCEP** (base dos Correios), trata erros (CEP inválido 400, não encontrado 404, sem conexão 503) e guarda o resultado em cache. O endereço vai junto com o pedido (cidade e UF entram no dashboard). Código: `backend/src/integracao/viacep.js`.

### Sincronização

1. **Ao abrir o app e a cada 30 s**, ele chama `GET /api/sincronizacao?desde=<data da última sincronização>`. O servidor devolve só os produtos e pedidos que mudaram, o que foi apagado, o carrinho e os favoritos. Na primeira vez (sem `desde`) vem tudo.
2. **Sem internet**, o que o usuário faz (carrinho, favoritos, pedidos) entra numa **fila offline** e é reenviado na ordem certa quando a conexão volta. O pedido aparece como "Aguardando envio".
3. **Sem pedido duplicado:** cada pedido tem um `idLocal` gerado no celular. Se a rede cair depois de o servidor gravar e o app reenviar, a API devolve o pedido que já existe (HTTP 200) em vez de criar outro.
4. Na tela **Perfil** aparece a situação ("Sincronizado às 14:32" ou "Sem conexão · 2 alterações aguardando envio") e um botão **Sincronizar** (print `12-perfil-sincronizado.png`).

---

## 2.2 Gerar dados em formato JSON

**Botão:** Perfil → **Gerar dados em JSON**. O app chama `GET /api/exportar`, mostra um resumo (pedidos, faturamento, ticket médio, itens vendidos) e uma prévia do arquivo. O botão **Compartilhar arquivo JSON** abre o menu de compartilhar do celular (e-mail, WhatsApp, Drive). No navegador o botão vira **Baixar arquivo JSON** (print `13-exportar-json.png`).

Também dá para gerar o arquivo sem abrir o app: `npm run exportar` no `backend` cria `backend/exportacoes/petlove-dados.json`.

**Formato do arquivo** (pensado para virar DataFrame no pandas):

```json
{
  "metadados": { "app": "Petlove", "geradoEm": "2026-11-15T00:38:49Z", "versao": 1, "moeda": "BRL" },
  "resumo": { "totalPedidos": 80, "pedidosValidos": 75, "pedidosCancelados": 5,
              "faturamento": 7390.83, "ticketMedio": 98.54, "itensVendidos": 311,
              "produtosAtivos": 4, "favoritos": 2 },
  "produtos":      [ { "id": 1, "nome": "...", "categoria": "...", "preco": 12.99, "avaliacao": 4.9, "estoque": 233, "favorito": true } ],
  "pedidos":       [ { "id": 60, "codigo": "PL-1060", "status": "A caminho", "cidade": "Rio de Janeiro", "uf": "RJ",
                       "subtotal": 22, "entrega": 5.9, "total": 27.9, "criadoEm": "..." } ],
  "itensVendidos": [ { "pedidoId": 60, "data": "...", "status": "A caminho", "uf": "RJ", "produto": "...",
                       "categoria": "Alimentação", "quantidade": 1, "precoUnitario": 22, "totalItem": 22 } ]
}
```

Leitura no Python (para o dashboard do item 2.5):

```python
import json, pandas as pd
dados = json.load(open("petlove-dados.json", encoding="utf-8"))
itens = pd.DataFrame(dados["itensVendidos"])
pedidos = pd.DataFrame(dados["pedidos"])
```

O banco de exemplo tem 80 pedidos dos últimos 90 dias, em 6 cidades e com alguns cancelados. Dá para fazer gráficos de vendas por dia, por categoria, por UF e de status.

> As telas e o código do **dashboard** em si são do item 2.5 (Tiphany).

---

## 2.6 Testes

61 testes automatizados no back-end, com o executor de testes que já vem no Node (`node:test`) e o Supertest. Mais um teste E2E da interface com Playwright.

| Tipo | Arquivo | Qtde | O que cobre |
|---|---|---|---|
| **Unitário** | `backend/test/unit/regras.test.js` | 19 | Cálculo de total e frete, arredondamento de centavos, transições de status, validação de CEP, produto e pedido |
| **Unitário** | `backend/test/unit/viacep.test.js` | 6 | Cliente ViaCEP com `fetch` falso: conversão, cache, CEP inexistente, sem conexão, erro HTTP |
| **Integração** | `backend/test/integracao/api.test.js` | 26 | Rotas HTTP + serviços + banco SQLite real em memória: CRUD completo, validação 400, 404, transação com estoque insuficiente (rollback), pedido idempotente, cancelamento devolvendo estoque, sincronização incremental com exclusões, exportação JSON |
| **E2E (API)** | `backend/test/e2e/jornada.test.js` | 10 | Sobe o servidor de verdade (processo separado, banco em arquivo) e percorre a jornada do app: sincronizar, buscar, favoritar, carrinho, CEP, pedido com reenvio, listar, CRUD de produto, sincronização em outro aparelho, exportar JSON |
| **E2E (interface)** | `app/e2e/app.e2e.mjs` | 8 passos | Playwright abre o app (versão web do Expo) e clica como um usuário: busca, produto, carrinho, CEP, confirmar pedido, Meus pedidos, cadastrar produto (com erro de validação), gerar e baixar o JSON. Tira print de cada tela |

Nos testes, o ViaCEP é substituído por uma versão falsa, para não depender da internet e sempre dar o mesmo resultado.

**Resultado da execução (15/11/2026):**

```
npm test
# tests 61
# pass 61
# fail 0
```

Cobertura (`npm run test:cobertura`): **97% das linhas e 94% dos desvios** do código da API.

E2E da interface:

```
ok - carrega o catálogo vindo da API
ok - busca filtra os produtos
ok - abre o produto, favorita e adiciona ao carrinho
ok - consulta o CEP (Correios/ViaCEP) no checkout
ok - confirma o pedido e o servidor devolve o código
ok - Meus pedidos lista o pedido gravado no banco
ok - cadastra um produto (CRUD) pelo app
ok - botão "Gerar dados em JSON" mostra o resumo e baixa o arquivo
```
