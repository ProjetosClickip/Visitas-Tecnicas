/* =====================================================================
   12. INICIALIZAÇÃO
   ===================================================================== */
import '../../css/custos.css';
import './acoes.js';   // registra o tratamento de cliques (delegação de eventos) de todas as telas
import { msgErro } from '../shared/api.js';
import { db, definirUsuario, haPendencias, loadDB, myProjects, saveDB, sincronizar } from './armazenamento.js';
import { go, icon, toast } from './interface.js';
import { loadLib } from './libs.js';
import { setLogos } from './logos.js';
import { EMBUTIDO, PARAMS, semSessao, startApp, usuarioLogado } from './sessao.js';
import { THEME_KEY, applyTheme } from './tema.js';
import { $$, esc } from './util.js';


async function iniciar(){
  const tema = PARAMS.get('tema');
  if (tema === 'dark' || tema === 'light'){ try { localStorage.setItem(THEME_KEY, tema); } catch(e){} }
  if (EMBUTIDO) document.documentElement.classList.add('embutido');
  applyTheme();
  setLogos();
  $$('[data-icon]').forEach(el=>{ el.outerHTML = icon(el.dataset.icon); });
  let u;
  try { u = await usuarioLogado(); }
  catch(e){ toast(msgErro(e), 'err', 8000); return; }
  if (!u) return semSessao();
  definirUsuario(u);
  try { await loadDB(); }
  catch(e){ document.body.innerHTML = `<div style="font-family:Segoe UI,Arial,sans-serif;padding:48px;text-align:center;color:#13294b"><h2>Não foi possível carregar os dados</h2><p>${esc(msgErro(e))}</p><p><a href="">Tentar novamente</a></p></div>`; return; }
  startApp(u);
  const pid = PARAMS.get('pid'), v = PARAMS.get('view');
  if (pid && myProjects().some(p=>p.id===pid)){ db.currentId = pid; saveDB(); }
  if (pid || v) go(v || 'dashboard');
  setTimeout(()=>{ loadLib('xlsx').catch(()=>{}); loadLib('autotable').catch(()=>{}); }, 1500);
}
window.addEventListener('beforeunload', e=>{ if (haPendencias()){ sincronizar(); e.preventDefault(); } });
iniciar();
