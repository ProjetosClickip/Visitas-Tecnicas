/* ================== SESSÃO ==================
 * A autenticação é feita no servidor (cookie HttpOnly). Aqui só carregamos os dados do usuário logado.
 */
import { api, msgErro } from '../shared/api.js';
import { ENV, definirAmbiente, refreshWho, setEnv } from './ambientes.js';
import { S } from './estado.js';
import { applyTheme } from './tema.js';
import { $, toast } from './util.js';
import { saveNow } from './visitas/lista.js';


/** Converte o usuário da API para o formato usado pela interface. */
function usuarioDaApi(u, perfil) {
  return {
    id: u.id, name: u.nome, email: u.email || '', role: u.cargo || '', papel: u.papel, supervisor: !!u.supervisor,
    avatar: (perfil ? perfil.avatar : u.avatar) || '', banner: (perfil && perfil.banner) || '',
    assinatura: (perfil && perfil.assinatura) || null, prefs: (perfil && perfil.prefs) || {},
    trocarSenha: !!u.trocarSenha, lastLogin: u.ultimoAcesso
  };
}
const cfgPadrao = () => ({
  empresaPrestadora: 'A definir',
  responsavelObra: (S.org && S.org.empresaResponsavel && S.org.empresaResponsavel.nome) || '',
  cnpj: (S.org && S.org.empresaResponsavel && S.org.empresaResponsavel.cnpj) || '',
  setor: (S.org && S.org.setor) || 'Engenharia / Projetos',
  cidade: String((S.org && S.org.cidade) || '').split('/')[0].trim(),
  ap: {}
});
/**
 * Inicia a sessão do usuário já autenticado pelo servidor.
 * boot = true: chamada ao abrir a página (mantém o ambiente pedido no endereço, inclusive o público).
 */
async function startSession(uApi, { boot = false, semHash = false } = {}) {
  if (!boot && ENV === 'pub') definirAmbiente('col');
  if (uApi.trocarSenha) { S.user = usuarioDaApi(uApi); refreshWho(); if (ENV === 'pub') definirAmbiente('col'); return setEnv(ENV, semHash); }
  const [p, o, c, v] = await Promise.all([api.get('/eu/perfil'), api.get('/organizacao'), api.get('/eu/preferencias/visitas.config'), api.get('/visitas')]);
  S.org = o.organizacao;
  S.user = usuarioDaApi(p.usuario, p.perfil);
  S.cfg = Object.assign(cfgPadrao(), (c && c.dados) || {});
  S.visits = v.visitas;
  applyTheme(S.user.prefs || {}); refreshWho(); $('#main').innerHTML = '';
  setEnv(ENV, semHash);
}
/** Recarrega a lista resumida de visitas do usuário. */
async function recarregarVisitas() { S.visits = (await api.get('/visitas')).visitas; }
let cfgT = null;
function salvarConfig() {
  clearTimeout(cfgT);
  cfgT = setTimeout(() => api.put('/eu/preferencias/visitas.config', { dados: S.cfg }).catch(e => toast('Configurações não salvas: ' + msgErro(e), 4000)), 600);
}
/** Grava campos do perfil (nome, cargo, avatar, banner, assinatura, prefs) no servidor. */
async function salvarPerfil(campos) {
  const r = await api.patch('/eu/perfil', campos);
  Object.assign(S.user, usuarioDaApi(r.usuario, r.perfil));
  return S.user;
}
function limparSessaoLocal() {
  const f = $('#custosFrame'); if (f) f.remove();
  S.user = null; S.org = null; S.cur = null; S.visits = []; S.cfg = {}; S.dirty = false;
  $('#main').innerHTML = ''; refreshWho();
}
async function logout() {
  await saveNow();
  try { await api.post('/auth/sair'); } catch (e) { }
  limparSessaoLocal(); setEnv(ENV);
}

export { limparSessaoLocal, logout, recarregarVisitas, salvarConfig, salvarPerfil, startSession };
