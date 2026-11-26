/* =====================================================================
   11. SESSÃO (gerenciada pela Plataforma de Projetos)
   O login, a troca de senha e o perfil ficam no portal. Aqui só lemos quem está logado
   (cookie de sessão do mesmo servidor). Sem sessão, o usuário é mandado para o portal.
   ===================================================================== */
import { api } from '../shared/api.js';
import { cur, currentUser, db, definirUsuario, haPendencias, myProjects, newProject, saveDB, sincronizar } from './armazenamento.js';
import { go } from './interface.js';
import { applyTheme } from './tema.js';
import { $ } from './util.js';


const initials = n => String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const PARAMS = new URLSearchParams(location.search);
const EMBUTIDO = PARAMS.get('embutido') === '1';
/* Só decide o que mostrar; quem impede ações não autorizadas é o servidor. */
const hubIsSup = u => !!u && u.papel === 'supervisor';

async function usuarioLogado(){
  const r = await api.get('/auth/eu');
  const u = r.usuario;
  if (!u || u.trocarSenha) return null;
  return { id:u.id, nome:u.nome, email:u.email || '', cargo:u.cargo || '', papel:u.papel };
}
function semSessao(){
  const destino = '/#colaborador';
  if (EMBUTIDO && window.top !== window){ window.top.location.href = destino; return; }
  document.body.innerHTML = `<div style="font-family:Segoe UI,Arial,sans-serif;padding:48px;text-align:center;color:#13294b"><h2>Sessão não encontrada</h2><p>Entre pelo Ambiente do colaborador da Plataforma de Projetos.</p><p><a href="${destino}">Ir para a Plataforma de Projetos</a></p></div>`;
}
function startApp(u){
  definirUsuario(u);
  $('.app').classList.remove('hidden');
  if (!cur() && myProjects().length) db.currentId = myProjects()[0].id;
  if (!myProjects().length){ const np = newProject(); db.projects.push(np); db.currentId = np.id; saveDB(); }
  renderUser(); go('dashboard');
}
function renderUser(){
  if (!currentUser) return;
  $('#uAv').textContent = initials(currentUser.nome);
  $('#uName').textContent = currentUser.nome.split(' ')[0];
  applyTheme();
}
async function logout(){
  if (haPendencias()) await sincronizar();
  try { await api.post('/auth/sair'); } catch(e){}
  location.href = '/';
}
/* perfil, foto e senha são editados no portal */
function profileForm(){ location.href = '/#colaborador'; }
window.addEventListener('cip:sessao-expirada', semSessao);

export { EMBUTIDO, PARAMS, hubIsSup, initials, logout, profileForm, semSessao, startApp, usuarioLogado };
