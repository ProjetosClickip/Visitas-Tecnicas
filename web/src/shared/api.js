/**
 * Cliente da API (usado pelo portal e pela Mensuração de Custos).
 * - Envia o cabeçalho X-CIP-Requisicao exigido pelo servidor (proteção CSRF).
 * - O cookie de sessão é HttpOnly: o JavaScript nunca vê o token.
 * - Erros viram ErroApi com status, mensagem e dados (ex.: código CONFLITO com a versão atual).
 */
export class ErroApi extends Error {
  constructor(status, mensagem, dados = null) {
    super(mensagem);
    this.status = status;
    this.dados = dados;
    this.codigo = dados?.codigo || null;
  }
}

async function chamar(metodo, url, corpo) {
  const headers = { 'X-CIP-Requisicao': '1' };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch('/api' + url, {
      method: metodo,
      headers,
      credentials: 'same-origin',
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique a rede e tente novamente.');
  }
  let dados = null;
  const txt = await r.text();
  if (txt) {
    try {
      dados = JSON.parse(txt);
    } catch {
      dados = null;
    }
  }
  if (!r.ok) {
    const e = new ErroApi(r.status, dados?.erro || `Erro ${r.status}`, dados);
    if (r.status === 401) window.dispatchEvent(new CustomEvent('cip:sessao-expirada'));
    if (e.codigo === 'TROCAR_SENHA') window.dispatchEvent(new CustomEvent('cip:trocar-senha'));
    throw e;
  }
  return dados;
}

export const api = {
  get: (url) => chamar('GET', url),
  post: (url, corpo = {}) => chamar('POST', url, corpo),
  put: (url, corpo) => chamar('PUT', url, corpo),
  patch: (url, corpo) => chamar('PATCH', url, corpo),
  del: (url) => chamar('DELETE', url),
};

/** Mensagem amigável para exibir ao usuário. */
export const msgErro = (e) => (e instanceof ErroApi ? e.message : 'Erro inesperado: ' + (e && e.message ? e.message : e));
