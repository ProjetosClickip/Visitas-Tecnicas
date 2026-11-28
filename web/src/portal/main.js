/* ================== BOOT ================== */
import '../../css/portal.css';
import { api, msgErro } from '../shared/api.js';
import { ENV, definirAmbiente, refreshWho, setEnv } from './ambientes.js';
import { S } from './estado.js';
import { renderTrocarSenha } from './login.js';
import { go } from './navegacao.js';
import { limparSessaoLocal, startSession } from './sessao.js';
import { openSystem } from './sistemas.js';
import { applyTheme } from './tema.js';
import { iniciarMenuLateral } from './menu-lateral.js';
import { $, $$, toast } from './util.js';
import { haAlteracoesPendentes, saveNow } from './visitas/lista.js';


function netState() { const n = $('#net'); if (!n) return; const on = navigator.onLine; n.className = 'net ' + (on ? 'on' : 'off'); n.textContent = on ? '● Online' : '● Offline'; }
window.addEventListener('online', netState); window.addEventListener('offline', netState);
// avisa antes de fechar a página se ainda há alteração não gravada no servidor
window.addEventListener('beforeunload', e => { if (haAlteracoesPendentes()) { saveNow(); e.preventDefault(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('cip:sessao-expirada', () => {
  if (!S.user) return;
  limparSessaoLocal(); toast('Sua sessão expirou. Entre novamente.', 4000); setEnv(ENV);
});
window.addEventListener('cip:trocar-senha', () => { if (S.user) renderTrocarSenha(); });

const envDe = x => x === 'colaborador' ? 'col' : x === 'supervisao' ? 'sup' : x === 'publico' ? 'pub' : null;

async function iniciar() {
  netState(); iniciarMenuLateral();
  $$('.tabs-in button').forEach(b => b.onclick = () => go(b.dataset.tab));
  $$('.envs-in [data-env]').forEach(b => b.onclick = () => setEnv(b.dataset.env));
  $$('.sysbar-in [data-sys]').forEach(b => b.onclick = () => openSystem(b.dataset.sys));
  applyTheme(); refreshWho();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
  const h = (location.hash || '').replace('#', '');
  let u = null;
  try { u = (await api.get('/auth/eu')).usuario; } catch (e) { if (e.status !== 401) toast(msgErro(e), 5000); }
  // quem já tem sessão abre direto no ambiente do colaborador (a não ser que o endereço peça outro)
  definirAmbiente(envDe(h) || (u ? 'col' : 'pub'));
  if (u) {
    try { await startSession(u, { boot: true, semHash: !h }); }
    catch (e) { toast(msgErro(e), 5000); setEnv(ENV, !h); }
  } else setEnv(ENV, !h);
  window.addEventListener('hashchange', () => { const e = envDe(location.hash.replace('#', '')); if (e && e !== ENV) setEnv(e, true); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
