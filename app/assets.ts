// Imagens das telas, servidas pela API (backend/public/imagens).
// Antes eram links temporários do Figma, que expiram.
import { API_URL } from './api';

const base = API_URL.replace(/\/api\/?$/, '') + '/imagens/';
export const images = {
  avatar: base + 'avatar.png',
  banner: base + 'banner.png',
  biscuit: base + 'biscoitos.png',
  wand: base + 'varinha.png',
  bed: base + 'cama.png',
  bowl: base + 'comedouro.png',
  detail: base + 'detalhe-biscoitos.png',
};
