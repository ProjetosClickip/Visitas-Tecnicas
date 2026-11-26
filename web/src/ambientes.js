/* ================== PORTAL: ambientes público / colaborador / supervisão ================== */
import { S } from './estado.js';
import { renderLogin, renderTrocarSenha } from './login.js';
import { renderPublico } from './painel/publico.js';
import { renderSup } from './painel/supervisao.js';
import { logout } from './sessao.js';
import { openSystem } from './sistemas.js';
import { $, $$, esc, initials } from './util.js';

/* O papel vem do servidor (atribuído pela supervisão). Esta checagem só decide o que mostrar na tela;
   quem impede ações não autorizadas é o servidor. */
const isSup = u => !!(u && u.papel === 'supervisor');
const STATUS = {
  draft: { l: 'Em andamento', pill: 'draft', cor: '#5d6b82' },
  pending: { l: 'Aguardando aprovação', pill: 'pend', cor: '#d98a00' },
  done: { l: 'Concluído', pill: 'done', cor: '#1f9d55' }
};
const stLabel = s => (STATUS[s] || STATUS.draft).l;
const stPill = s => `<span class="pill ${(STATUS[s] || STATUS.draft).pill}">${stLabel(s)}</span>`;
const normResp = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

let ENV = 'pub';
const definirAmbiente = e => { ENV = e; };
function avatarHTML(u, size = 32) {
  if (u && u.avatar) return `<img class="avatar" src="${esc(u.avatar)}" alt="" style="width:${size}px;height:${size}px;object-fit:cover;padding:0">`;
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px">${esc(initials(u && u.name))}</div>`;
}
function setEnv(e, noHash) {
  ENV = e;
  $$('.envs-in [data-env]').forEach(b => b.classList.toggle('on', b.dataset.env === e));
  $('#envPub').classList.toggle('hidden', e !== 'pub'); $('#envCol').classList.toggle('hidden', e !== 'col'); $('#envSup').classList.toggle('hidden', e !== 'sup');
  if (!noHash) history.replaceState(null, '', '#' + ({ pub: 'publico', col: 'colaborador', sup: 'supervisao' }[e]));
  window.scrollTo(0, 0);
  const logado = S.user && !S.user.trocarSenha;
  if (e === 'pub') renderPublico();
  else if (e === 'col') {
    if (logado) { $('#colLogin').classList.add('hidden'); $('#app').classList.remove('hidden'); if (!$('#main').innerHTML && !$('#custosFrame')) openSystem('inicio'); }
    else { $('#app').classList.add('hidden'); $('#colLogin').classList.remove('hidden'); S.user ? renderTrocarSenha($('#colLogin')) : renderLogin($('#colLogin'), 'col'); }
  }
  else if (e === 'sup') { if (logado) renderSup(); else if (S.user) renderTrocarSenha($('#supMain')); else renderLogin($('#supMain'), 'sup'); }
}
function refreshWho() {
  const u = S.user, w = $('#whoBox');
  if (!u) { w.innerHTML = `<button class="btn sm" id="hdrEntrar">Entrar</button>`; $('#hdrEntrar').onclick = () => setEnv('col'); return; }
  w.innerHTML = `${avatarHTML(u, 34)}<div class="who-t"><b>${esc(u.name)}</b><span>${isSup(u) ? '🛡️ Supervisão' : esc(u.role || 'Colaborador')}</span></div><button class="btn sm" id="btnLogout">Sair</button>`;
  $('#btnLogout').onclick = logout;
}

export { ENV, STATUS, avatarHTML, definirAmbiente, isSup, normResp, refreshWho, setEnv, stLabel, stPill };
