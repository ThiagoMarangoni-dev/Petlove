# PetLove

App de pet shop do Projeto Integrador IV (Senac). O projeto inteiro fica numa pasta só:

```
petlove/
├── app/        FRONT-END: app React Native (Expo) com as telas
├── backend/    BACK-END: API REST em Node.js (Express)
├── banco/      BANCO DE DADOS: SQLite
│   ├── schema.sql    tabelas (a API cria a partir deste arquivo)
│   └── petlove.db    banco já preenchido com dados de exemplo
└── package.json      comandos para instalar e rodar tudo junto
```

```
App (celular)  ──HTTP/JSON──►  API Node.js  ──►  banco/petlove.db (SQLite)
                                    └──────►  ViaCEP (CEPs dos Correios)
```

## Pré-requisito

**Node.js 22.5 ou mais novo** ([nodejs.org](https://nodejs.org), versão LTS). O SQLite já vem dentro do Node, então não é preciso instalar banco nem servidor de banco.

## Instalar (uma vez)

Na pasta `petlove`:

```bash
npm run instalar
```

## Rodar

```bash
npm start
```

Esse comando sobe a API e o app juntos. Os logs aparecem como `[API]` e `[APP]`. Depois:

- **Celular com Expo Go:** escaneie o QR code. O celular e o computador precisam estar no mesmo Wi-Fi, e o app precisa saber o IP do computador (veja abaixo).
- **Emulador Android:** aperte `a`.
- **Navegador:** use `npm run web` em vez de `npm start`.

### Celular físico: apontar para o IP do computador

Descubra o IP com `ipconfig` (Windows) ou `ifconfig` (Mac/Linux) e rode:

Windows (PowerShell):

```powershell
$env:EXPO_PUBLIC_API_URL="http://192.168.0.10:3333/api"; npm start
```

Mac/Linux:

```bash
EXPO_PUBLIC_API_URL=http://192.168.0.10:3333/api npm start
```

Se o celular não conectar, libere a porta 3333 no firewall do Windows.

## Banco de dados (SQLite)

- **Arquivo:** `banco/petlove.db`. Dá para abrir no [DB Browser for SQLite](https://sqlitebrowser.org) ou na extensão "SQLite Viewer" do VS Code.
- **Tabelas:** `banco/schema.sql`. São `produtos`, `pedidos`, `pedido_itens`, `favoritos`, `carrinho` e `exclusoes`.
- **Dados de exemplo:** 4 produtos e 80 pedidos dos últimos 90 dias.

| Comando | O que faz |
|---|---|
| `npm run banco:ver` | Mostra as tabelas e quantos registros cada uma tem |
| `npm run banco:ver -- "SELECT codigo, status, total FROM pedidos LIMIT 5"` | Roda uma consulta SQL |
| `npm run banco:recriar` | Apaga o banco e cria de novo com os dados de exemplo |
| `npm run exportar` | Gera o JSON do dashboard em `backend/exportacoes/petlove-dados.json` |

Tudo o que for feito no app (pedidos, produtos, favoritos, carrinho) é gravado nesse arquivo.

## Testes

```bash
npm test          # 61 testes da API: unitários, integração e E2E
npm run test:e2e  # E2E da interface (precisa do "npm run web" rodando em outro terminal)
```

Para o E2E da interface, rode antes, só uma vez:

```bash
npx --prefix app playwright install chromium
```

## Outros comandos

| Comando | O que faz |
|---|---|
| `npm run api` | Sobe só a API (porta 3333) |
| `npm run app` | Sobe só o app |
| `npm run typecheck` | Confere os tipos do TypeScript do app |

## Documentação

- `PetLove_Sprint2_itens_2.1_2.2_2.6_Thiago_Carol.pdf`: itens 2.1, 2.2 e 2.6 para o documento final.
- `DOCUMENTACAO-PI.md`: o mesmo texto, em Markdown.
