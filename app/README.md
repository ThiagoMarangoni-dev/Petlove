# Petlove em React Native

App das 12 telas do Figma, feito com Expo, agora ligado à API Node da pasta `../backend`.

```bash
npm install
npm start
```

O jeito mais fácil é rodar `npm start` na pasta raiz do projeto, que sobe a API e o app juntos. No celular físico, aponte o app para o IP do computador:
`EXPO_PUBLIC_API_URL=http://SEU_IP:3333/api npx expo start`.

- `api.ts`: chamadas à API REST e fila offline de sincronização.
- `App.tsx`: telas. Novas: Gerenciar produtos (CRUD), Novo/Editar produto e Dados em JSON. O checkout ganhou consulta de CEP.
- `e2e/app.e2e.mjs`: teste E2E da interface com Playwright (`npm run test:e2e`). Os prints ficam em `e2e/telas/`.

As imagens usam URLs temporárias de exportação do Figma. Para distribuir, troque os endereços de `assets.ts` (e os do `backend/src/seed.js`) por arquivos locais.
