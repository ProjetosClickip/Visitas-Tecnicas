/**
 * Camada de dados da plataforma (usada pelo portal e pela Mensuração de Custos).
 *
 * As telas continuam chamando api.get('/visitas'), api.put('/custos/projetos/…') etc.
 * Este módulo traduz cada chamada para o Supabase:
 *  - funções do banco (RPC), que aplicam todas as regras de permissão;
 *  - Supabase Auth, para entrar, sair e trocar a senha;
 *  - a Edge Function admin-usuarios, para a supervisão criar contas e redefinir senhas.
 * As respostas mantêm o mesmo formato de antes; erros viram ErroApi(status, mensagem, dados).
 */
import { supabase } from './supabase.js';

export class ErroApi extends Error {
  constructor(status, mensagem, dados = null) {
    super(mensagem);
    this.status = status;
    this.dados = dados;
    this.codigo = dados?.codigo || null;
  }
}

/** Erros do banco usam SQLSTATE 'PTnnn' (nnn = status) e a dica (hint) como código. */
function erroDoSupabase(e) {
  if (e instanceof ErroApi) return e;
  const msg = (e && e.message) || String(e);
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) {
    return new ErroApi(0, 'Sem conexão com o servidor. Verifique a rede e tente novamente.');
  }
  const m = /^PT(\d{3})$/.exec(e?.code || '');
  const status = m ? Number(m[1]) : (e?.status || 400);
  return new ErroApi(status, msg, { codigo: e?.hint || null });
}

function avisar(e) {
  if (e.status === 401) window.dispatchEvent(new CustomEvent('cip:sessao-expirada'));
  if (e.codigo === 'TROCAR_SENHA') window.dispatchEvent(new CustomEvent('cip:trocar-senha'));
  return e;
}

async function rpc(nome, args = {}) {
  let r;
  try {
    r = await supabase.rpc(nome, args);
  } catch (e) {
    throw erroDoSupabase(e);
  }
  if (r.error) throw erroDoSupabase(r.error);
  return r.data;
}

/** Gravação com controle de versão: o banco devolve { conflito, atual } em vez de gravar. */
function semConflito(r, mensagem) {
  if (r && r.conflito) throw new ErroApi(409, mensagem, { codigo: 'CONFLITO', atual: r.atual });
  return r;
}

async function funcaoAdmin(corpo) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: corpo });
  if (error) {
    let status = error.context?.status || 400;
    let mensagem = error.message;
    try {
      const j = await error.context.json();
      if (j?.erro) mensagem = j.erro;
    } catch { /* corpo não-JSON */ }
    if (/Failed to send|fetch/i.test(error.message) && !error.context) status = 0;
    throw new ErroApi(status, mensagem);
  }
  return data;
}

/** Confirma a senha de quem está logado (entra de novo com e-mail + senha). */
async function confirmarSenha(senha, mensagemErro) {
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (!email) throw new ErroApi(401, 'Sessão expirada. Entre novamente.');
  const { error } = await supabase.auth.signInWithPassword({ email, password: String(senha || '') });
  if (error) throw new ErroApi(400, mensagemErro);
}

function validarSenhaNova(s, email = '', nome = '') {
  s = String(s || '');
  if (s.length < 8) return 'A senha precisa ter no mínimo 8 caracteres.';
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
  const local = String(email).split('@')[0].toLowerCase();
  if ((local && s.toLowerCase().includes(local)) || (nome && s.toLowerCase() === String(nome).toLowerCase().replace(/\s+/g, ''))) {
    return 'A senha não pode conter o seu e-mail ou nome.';
  }
  return null;
}

const id = (m, i = 1) => decodeURIComponent(m[i]);

/* ---------------------------------------------------------------- rotas */
const ROTAS = [
  /* ----- sessão */
  ['GET', /^\/auth\/eu$/, async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { usuario: null };
    const r = await rpc('sessao_eu');
    if (!r.usuario) await supabase.auth.signOut();
    return r;
  }],
  ['POST', /^\/auth\/entrar$/, async (m, b) => {
    const { error } = await supabase.auth.signInWithPassword({ email: String(b.email || '').trim().toLowerCase(), password: String(b.senha || '') });
    if (error) {
      if (error.status === 429) throw new ErroApi(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      if (/fetch/i.test(error.message)) throw erroDoSupabase(error);
      throw new ErroApi(401, 'E-mail ou senha incorretos.');
    }
    const r = await rpc('sessao_eu');
    if (!r.usuario) {
      await supabase.auth.signOut();
      throw new ErroApi(403, 'Esta conta não tem acesso à plataforma. Fale com a supervisão.');
    }
    return r;
  }],
  ['POST', /^\/auth\/sair$/, async () => { await supabase.auth.signOut(); return { ok: true }; }],
  ['POST', /^\/auth\/senha$/, async (m, b) => {
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email || '';
    if (String(b.nova) === String(b.atual)) throw new ErroApi(400, 'A nova senha precisa ser diferente da atual.');
    const msg = validarSenhaNova(b.nova, email);
    if (msg) throw new ErroApi(400, msg);
    await confirmarSenha(b.atual, 'Senha atual incorreta.');
    const { error } = await supabase.auth.updateUser({ password: String(b.nova) });
    if (error) throw new ErroApi(400, 'Não foi possível trocar a senha: ' + error.message);
    const r = await rpc('sessao_concluir_troca_senha');
    await supabase.auth.signOut({ scope: 'others' });   // encerra as outras sessões abertas
    return r;
  }],

  /* ----- perfil, preferências, organização, equipe */
  ['GET', /^\/organizacao$/, () => rpc('organizacao_obter')],
  ['GET', /^\/eu\/perfil$/, () => rpc('perfil_obter')],
  ['PATCH', /^\/eu\/perfil$/, (m, b) => rpc('perfil_atualizar', { p_campos: b })],
  ['GET', /^\/eu\/preferencias\/([^/]+)$/, (m) => rpc('preferencias_obter', { p_chave: id(m) })],
  ['PUT', /^\/eu\/preferencias\/([^/]+)$/, (m, b) => rpc('preferencias_salvar', { p_chave: id(m), p_dados: b.dados ?? null })],
  ['GET', /^\/usuarios$/, () => rpc('usuarios_listar')],
  ['POST', /^\/usuarios$/, (m, b) => funcaoAdmin({ acao: 'criar', ...b })],
  ['PATCH', /^\/usuarios\/([^/]+)$/, (m, b) => funcaoAdmin({ acao: 'alterar', id: id(m), ...b })],
  ['POST', /^\/usuarios\/([^/]+)\/redefinir-senha$/, (m) => funcaoAdmin({ acao: 'redefinir_senha', id: id(m) })],

  /* ----- painéis */
  ['GET', /^\/publico\/painel$/, () => rpc('painel_publico')],
  ['GET', /^\/painel$/, (m, b, q) => rpc('painel', { p_escopo: q.get('escopo') || 'meu' })],

  /* ----- visitas */
  ['GET', /^\/visitas$/, async (m, b, q) => ({ visitas: await rpc('visitas_listar', { p_escopo: q.get('escopo') || 'minhas' }) })],
  ['GET', /^\/visitas\/exportar$/, (m, b, q) => rpc('visitas_exportar', { p_escopo: q.get('escopo') || 'minhas' })],
  ['POST', /^\/visitas\/importar$/, (m, b) => rpc('visitas_importar', { p_backup: b })],
  ['POST', /^\/visitas$/, async (m, b) => ({ visita: await rpc('visitas_criar', { p_doc: b.visita }) })],
  ['GET', /^\/visitas\/([^/]+)$/, async (m) => ({ visita: await rpc('visitas_obter', { p_id: id(m) }) })],
  ['PUT', /^\/visitas\/([^/]+)$/, async (m, b) =>
    semConflito(await rpc('visitas_salvar', { p_id: id(m), p_doc: b.visita, p_versao: b.versao }),
      'Esta visita foi alterada por outra pessoa depois que você a abriu.')],
  ['DELETE', /^\/visitas\/([^/]+)$/, (m) => rpc('visitas_excluir', { p_id: id(m) })],
  ['POST', /^\/visitas\/([^/]+)\/duplicar$/, async (m) => ({ visita: await rpc('visitas_duplicar', { p_id: id(m) }) })],
  ['POST', /^\/visitas\/([^/]+)\/status$/, async (m, b) => ({ visita: await rpc('visitas_status', { p_id: id(m), p_status: b.status }) })],
  ['POST', /^\/visitas\/([^/]+)\/aprovar$/, async (m, b) => ({ visita: await rpc('visitas_aprovar', { p_id: id(m), p_obs: b.obs || '' }) })],
  ['POST', /^\/visitas\/([^/]+)\/devolver$/, async (m, b) => ({ visita: await rpc('visitas_devolver', { p_id: id(m), p_motivo: b.motivo || '' }) })],
  ['POST', /^\/visitas\/([^/]+)\/assinar$/, async (m, b) => {
    await confirmarSenha(b.senha, 'Senha incorreta.');   // o banco exige senha digitada há menos de 5 minutos
    return { visita: await rpc('visitas_assinar', { p_id: id(m), p_versao: b.versao }) };
  }],
  ['DELETE', /^\/visitas\/([^/]+)\/assinatura$/, async (m) => ({ visita: await rpc('visitas_remover_assinatura', { p_id: id(m) }) })],

  /* ----- mensuração de custos */
  ['GET', /^\/custos\/inicial$/, () => rpc('custos_inicial')],
  ['POST', /^\/custos\/projetos$/, (m, b) => rpc('custos_criar_projeto', { p_projeto: b.projeto, p_acoes: b.acoes || [] })],
  ['PUT', /^\/custos\/projetos\/([^/]+)$/, async (m, b) =>
    semConflito(await rpc('custos_salvar_projeto', { p_id: id(m), p_projeto: b.projeto, p_versao: b.versao, p_acoes: b.acoes || [] }),
      'Este projeto foi alterado por outra pessoa depois que você o abriu.')],
  ['DELETE', /^\/custos\/projetos\/([^/]+)$/, (m) => rpc('custos_excluir_projeto', { p_id: id(m) })],
  ['POST', /^\/custos\/projetos\/([^/]+)\/aprovacao$/, (m, b) => rpc('custos_aprovar', { p_id: id(m), p_obs: b.obs || '' })],
  ['DELETE', /^\/custos\/projetos\/([^/]+)\/aprovacao$/, (m) => rpc('custos_revogar', { p_id: id(m) })],
  ['PUT', /^\/custos\/prestadoras\/([^/]+)$/, (m, b) => rpc('custos_salvar_prestadora', { p_id: id(m), p_prestadora: b.prestadora, p_versao: b.versao || 0 })],
  ['DELETE', /^\/custos\/prestadoras\/([^/]+)$/, (m) => rpc('custos_excluir_prestadora', { p_id: id(m) })],
  ['PUT', /^\/custos\/catalogo$/, async (m, b) => ({
    catalogo: await rpc('custos_salvar_documento', { p_chave: 'custos.catalogo', p_dados: { itens: b.itens || [], fonte: b.fonte || '' }, p_versao: b.versao || 0 }),
  })],
  ['PUT', /^\/custos\/config$/, async (m, b) => ({
    config: await rpc('custos_salvar_documento', { p_chave: 'custos.config', p_dados: b.dados, p_versao: b.versao || 0 }),
  })],
  ['POST', /^\/custos\/catalogo\/restaurar$/, async () => ({ catalogo: await rpc('custos_restaurar_catalogo') })],
];

async function chamar(metodo, url, corpo) {
  const [caminho, busca = ''] = url.split('?');
  const q = new URLSearchParams(busca);
  for (const [m, re, fn] of ROTAS) {
    if (m !== metodo) continue;
    const r = re.exec(caminho);
    if (!r) continue;
    try {
      return await fn(r, corpo || {}, q);
    } catch (e) {
      throw avisar(erroDoSupabase(e));
    }
  }
  throw new ErroApi(404, `Operação desconhecida: ${metodo} ${caminho}`);
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
