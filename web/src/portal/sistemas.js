/* ---------- menu de sistemas (Ambiente do colaborador) ---------- */
import { S } from './estado.js';
import { renderInicio } from './inicio.js';
import { go } from './navegacao.js';
import { $, $$ } from './util.js';
import { saveNow } from './visitas/lista.js';

let SYS = 'inicio';
function setSysbar(id) { SYS = id; $$('.sysbar-in [data-sys]').forEach(b => b.classList.toggle('on', b.dataset.sys === id)); }
function showPane(p) {   // p: 'visitas' | 'main' | 'custos'
  $('nav.tabs').classList.toggle('hidden', p !== 'visitas');
  $('#main').classList.toggle('hidden', p === 'custos');
  $('#custosWrap').classList.toggle('hidden', p !== 'custos');
  if (p !== 'custos') { const f = $('#custosFrame'); if (f) f.remove(); }
}
function openSystem(id, opts) {
  if (S.cur && S.dirty) saveNow();
  opts = opts || {};
  if (id === 'inicio') { setSysbar('inicio'); showPane('main'); S.cur = null; return renderInicio(); }
  if (id === 'visitas') { showPane('visitas'); return go(opts.tab || 'hist', opts.visit); }
  if (id === 'perfil') { showPane('main'); return go('cfg'); }
  if (id === 'fiber') { setSysbar('fiber'); showPane('main'); S.cur = null; $('#main').innerHTML = `<div class="split-card"><div class="split-l" style="background:linear-gradient(135deg,#13294b,#f26a21 160%)"><span class="kicker">SUBSISTEMA</span><h2>ClickIP FiberControl</h2><p>Plataforma de controle da rede óptica, já desenvolvida separadamente. A integração a esta plataforma será a próxima etapa.</p></div><div class="split-r"><h3>Em integração</h3><p class="muted">Assim que integrado, o FiberControl aparecerá aqui com o mesmo login, os mesmos ambientes (público, colaborador e supervisão) e os indicadores nos painéis.</p><button class="btn" id="fbVoltar">← Voltar ao início</button></div></div>`; $('#fbVoltar').onclick = () => openSystem('inicio'); return; }
  if (id === 'custos') {
    setSysbar('custos'); showPane('custos'); S.cur = null;
    // mesmo servidor e mesma sessão (cookie): o subsistema de custos não tem login próprio
    const q = new URLSearchParams({ embutido: '1', tema: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' });
    if (opts.pid) q.set('pid', opts.pid);
    if (opts.view) q.set('view', opts.view);
    const w = $('#custosWrap'); w.innerHTML = '';
    const f = document.createElement('iframe'); f.id = 'custosFrame'; f.title = 'Mensuração de Custos'; f.src = '/custos.html?' + q; w.appendChild(f);
    window.scrollTo(0, 0);
  }
}

/** Sistema aberto agora (telas que carregam dados conferem antes de se desenhar). */
const sistemaAtual = () => SYS;

export { openSystem, setSysbar, showPane, sistemaAtual };
