// Testes UNITÁRIOS do cliente do serviço externo (ViaCEP/Correios), com fetch falso.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarBuscaCep } from '../../src/integracao/viacep.js';

const respostaJson = (corpo, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

describe('criarBuscaCep', () => {
  it('converte a resposta do ViaCEP para o formato do app', async () => {
    let urlChamada;
    const buscar = criarBuscaCep({
      fetch: async (url) => {
        urlChamada = url;
        return respostaJson({ logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' });
      },
    });
    const r = await buscar('01310-100');
    assert.equal(urlChamada, 'https://viacep.com.br/ws/01310100/json/');
    assert.deepEqual(r, {
      cep: '01310-100',
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
    });
  });

  it('guarda em cache e não consulta o mesmo CEP duas vezes', async () => {
    let chamadas = 0;
    const buscar = criarBuscaCep({
      fetch: async () => {
        chamadas++;
        return respostaJson({ localidade: 'Campinas', uf: 'SP' });
      },
    });
    await buscar('13010111');
    await buscar('13010-111');
    assert.equal(chamadas, 1);
  });

  it('devolve 404 quando o ViaCEP responde {"erro": true}', async () => {
    const buscar = criarBuscaCep({ fetch: async () => respostaJson({ erro: true }) });
    await assert.rejects(buscar('99999999'), { status: 404 });
  });

  it('devolve 400 para CEP inválido sem chamar a internet', async () => {
    const buscar = criarBuscaCep({
      fetch: async () => assert.fail('não deveria chamar o fetch'),
    });
    await assert.rejects(buscar('12'), { status: 400 });
  });

  it('devolve 503 quando não há conexão', async () => {
    const buscar = criarBuscaCep({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await assert.rejects(buscar('01310100'), { status: 503 });
  });

  it('devolve 502 quando o ViaCEP responde erro HTTP', async () => {
    const buscar = criarBuscaCep({ fetch: async () => respostaJson({}, 500) });
    await assert.rejects(buscar('01310100'), { status: 502 });
  });
});
