// Erro de regra de negócio com status HTTP. O middleware de erros transforma em JSON.
export class ErroApi extends Error {
  constructor(status, mensagem, campos) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
  }
}

export const naoEncontrado = (o) => new ErroApi(404, `${o} não encontrado.`);
export const invalido = (campos) =>
  new ErroApi(400, 'Dados inválidos. Confira os campos destacados.', campos);
