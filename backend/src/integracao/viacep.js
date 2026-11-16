// Consumo de serviço RESTful externo: ViaCEP (base de CEPs dos Correios).
// Documentação: https://viacep.com.br
import { ErroApi } from '../erros.js';
import { normalizarCep } from '../regras.js';

/**
 * Cria a função de busca de CEP. O fetch é injetável para os testes não dependerem da internet.
 */
export function criarBuscaCep({ fetch: f = globalThis.fetch, baseUrl = 'https://viacep.com.br/ws', timeoutMs = 5000 } = {}) {
  const cache = new Map();

  return async function buscarCep(cepInformado) {
    const cep = normalizarCep(cepInformado);
    if (!cep) throw new ErroApi(400, 'CEP inválido. Use 8 dígitos.');
    if (cache.has(cep)) return cache.get(cep);

    let resposta;
    try {
      resposta = await f(`${baseUrl}/${cep}/json/`, { signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new ErroApi(503, 'Não foi possível consultar os Correios agora. Tente de novo.');
    }
    if (!resposta.ok) throw new ErroApi(502, `ViaCEP respondeu com erro ${resposta.status}.`);

    const dados = await resposta.json();
    if (dados.erro) throw new ErroApi(404, 'CEP não encontrado.');

    const endereco = {
      cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
      logradouro: dados.logradouro ?? '',
      bairro: dados.bairro ?? '',
      cidade: dados.localidade ?? '',
      uf: dados.uf ?? '',
    };
    cache.set(cep, endereco);
    return endereco;
  };
}
