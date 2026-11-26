/* =====================================================================
   6. INTERFACE BASE: ícones, toasts, modais, navegação
   ===================================================================== */
import { aprovInfo, vAprovacao } from './aprovacao.js';
import { cur, currentUser, db, myProjects } from './armazenamento.js';
import { totals } from './calculos.js';
import { vCatalogo } from './catalogo.js';
import { lastChangeHtml } from './historico.js';
import { vImportar } from './importacao/assistente.js';
import { afterRender } from './registro.js';
import { hubIsSup } from './sessao.js';
import { vConfig } from './telas/configuracoes.js';
import { vDashboard } from './telas/dashboard.js';
import { vIdent } from './telas/identificacao.js';
import { vMateriais } from './telas/materiais.js';
import { vPrestadoras } from './telas/prestadoras.js';
import { vProjetos } from './telas/projetos.js';
import { vRelatorios } from './telas/relatorios.js';
import { vResumo } from './telas/resumo.js';
import { vServicos } from './telas/servicos.js';
import { tipoLabel } from './tema.js';
import { $, $$, esc, fmtBRL, fmtDate } from './util.js';

const ICONS = {
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  projetos:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  ident:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  obra:'<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 13 10 5 10-5"/>',
  ativacao:'<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>',
  servicos:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  importar:'<path d="M12 15V3m0 0-4 4m4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  resumo:'<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.4A9 9 0 0 1 20.6 9H15z"/>',
  relatorios:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6m0 0-3-3m3 3 3-3"/>',
  config:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  trash:'<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6"/>',
  download:'<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  open:'<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  pdf:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6m0 0-3-3m3 3 3-3"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  prestadoras:'<path d="M3 21h18M5 21V8l7-4 7 4v13"/><path d="M9 21v-5h6v5M9 11h.01M15 11h.01"/>',
  xls:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 12l5 6M13 12l-5 6"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  t_rede:'<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v5M12 12 5 17M12 12l7 5"/>',
  t_backbone:'<path d="M3 12h18M3 6h18M3 18h18"/><circle cx="7" cy="6" r="1.5"/><circle cx="17" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/>',
  t_cliente:'<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  t_evento:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  t_condominio:'<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 10h5a1 1 0 0 1 1 1v10M2 21h20M7 8h3M7 12h3M7 16h3"/>', sort:'<path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3"/>',
  aprovacao:'<path d="M9 12l2 2 4-4"/><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>',
  catalogo:'<path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  calc:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>'
};
const icon = (k, sz) => `<svg viewBox="0 0 24 24" width="${sz||16}" height="${sz||16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]||''}</svg>`;

function toast(msg, type, ms){
  const el = document.createElement('div');
  el.className = 'toast ' + (type||''); el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(()=>el.remove(), ms||3200);
}
function openModal(html, opts){
  opts = opts||{};
  const root = $('#modalRoot');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${opts.size||''}" role="dialog" aria-modal="true">${html}</div>`;
  ov.addEventListener('mousedown', e=>{ if(e.target===ov && !opts.static) closeModal(ov); });
  // botões com data-fechar fecham o modal (sem handlers inline: a CSP bloqueia onclick="…")
  ov.addEventListener('click', e=>{ if (e.target.closest('[data-fechar]')) closeModal(ov); });
  root.appendChild(ov);
  const first = ov.querySelector('input:not([readonly]),select,textarea,button.primary');
  if (first) setTimeout(()=>first.focus(), 30);
  return ov;
}
function closeModal(ov){ (ov || $('#modalRoot .overlay:last-child'))?.remove(); }
function confirmDialog({title, message, okText, danger}){
  return new Promise(resolve=>{
    const ov = openModal(`<div class="mh"><h3>${esc(title||'Confirmação')}</h3></div>
      <div class="mb">${message}</div>
      <div class="mf"><button class="btn" data-r="0">Cancelar</button><button class="btn ${danger?'danger solid':'primary'}" data-r="1">${esc(okText||'Confirmar')}</button></div>`, {size:'sm', static:true});
    ov.addEventListener('click', e=>{ const b=e.target.closest('[data-r]'); if(!b) return; confirmDialog.checks = {}; ov.querySelectorAll('input[type=checkbox][id]').forEach(c=>{ confirmDialog.checks[c.id]=c.checked; }); confirmDialog.texts = {}; ov.querySelectorAll('textarea[id],input[id]:not([type=checkbox])').forEach(c=>{ confirmDialog.texts[c.id]=c.value.trim(); }); closeModal(ov); resolve(b.dataset.r==='1'); });
    ov.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(ov); resolve(false);} });
    setTimeout(()=>ov.querySelector('[data-r="1"]').focus(),30);
  });
}

const VIEWS = [
  ['dashboard','Dashboard'],['projetos','Projetos'],['ident','Identificação do projeto'],['obra','Materiais de obra'],
  ['ativacao','Materiais de ativação'],['servicos','Serviços e mão de obra'],['resumo','Resumo financeiro'],['relatorios','Relatórios'],
  ['aprovacao','Aprovação'],['importar','Importar documentos'],['catalogo','Catálogo de materiais'],['prestadoras','Prestadoras (cadastro)'],['config','Configurações']
];
/* Etapas da mensuração de cada projeto (na ordem) */
const ETAPAS = [['ident','Identificação'],['obra','Materiais de obra'],['ativacao','Materiais de ativação'],['servicos','Serviços e mão de obra'],['resumo','Resumo financeiro'],['relatorios','Relatórios'],['aprovacao','Aprovação']];
function etapaInfo(p, k){
  if (!p) return {ok:false, txt:''};
  const t = totals(p);
  switch(k){
    case 'ident': return {ok: !!(p.info.nome && p.info.tipo), txt: p.info.tipo ? tipoLabel(p.info.tipo) : 'Preencher dados'};
    case 'obra': return {ok: t.nObra>0, txt: t.nObra ? `${t.nObra} itens · ${fmtBRL(t.obra)}` : 'Pendente'};
    case 'ativacao': return {ok: t.nAtiv>0, txt: t.nAtiv ? `${t.nAtiv} itens · ${fmtBRL(t.ativ)}` : 'Pendente'};
    case 'servicos': return {ok: t.nServ>0, txt: t.nServ ? `${t.nServ} serviços · ${fmtBRL(t.serv)}` : (t.nMat ? 'Próxima etapa' : 'Após os materiais')};
    case 'resumo': return {ok: t.nMat>0 && t.nServ>0, txt: t.total ? fmtBRL(t.total) : 'Pendente'};
    case 'aprovacao': { const ai = aprovInfo(p); return {ok: ai.n===ai.list.length && !ai.alterado, txt: ai.n ? `${ai.n}/${ai.list.length} aprovações${ai.alterado?' · alterado após':''}` : 'Aguardando'}; }
    case 'relatorios': return {ok: !!p.ultimoRelatorio, txt: p.ultimoRelatorio ? 'Gerado em '+fmtDate(p.ultimoRelatorio.slice(0,10)) : 'Pendente'};
  }
  return {ok:false, txt:''};
}
function stepperHtml(curView){
  const p = cur(); if (!p) return '';
  return `<div class="stepper">${ETAPAS.map(([k,l],i)=>{ const e = etapaInfo(p,k); return `<a data-view="${k}" class="${e.ok?'ok':''} ${curView===k?'cur':''}" title="Etapa ${i+1}: ${l}"><span class="n">${e.ok && curView!==k ? '✓' : i+1}</span><div>${l}<small>${esc(e.txt)}</small></div></a>`; }).join('')}</div>`;
}
function etapaNavHtml(k){
  const i = ETAPAS.findIndex(e=>e[0]===k); if (i<0) return '';
  const prev = ETAPAS[i-1], next = ETAPAS[i+1];
  return `<div class="etapa-nav"><div>${prev?`<button class="btn" data-view="${prev[0]}">← Etapa ${i}: ${prev[1]}</button>`:''}</div><div>${next?`<button class="btn primary" data-view="${next[0]}">Próxima etapa ${i+2}: ${next[1]} →</button>`:''}</div></div>`;
}
let view = 'dashboard';
const ui = {
  mat:{q:'', empresa:'', categoria:'', unidade:'', sort:'nome', dir:1},
  svc:{q:'', empresa:'', sort:'descricao', dir:1},
  projTipo:''
};
function renderNav(){
  const p = cur();
  const item = (k,l,st)=>`<a data-view="${k}" class="${view===k?'active':''}">${st||''}${icon(k,18)}<span>${l}</span></a>`;
  const lbl = k => VIEWS.find(v=>v[0]===k)[1];
  $('#nav').innerHTML = item('dashboard',lbl('dashboard')) + item('projetos',lbl('projetos')) +
    `<div class="grp">Mensuração do projeto<b title="${esc(p?p.info.nome:'')}">${esc(p?(p.info.nome||'(sem nome)'):'—')}</b></div>` +
    ETAPAS.map(([k],i)=>{ const e = etapaInfo(p,k); return item(k, lbl(k), `<span class="st ${e.ok?'ok':''}">${e.ok?'✓':i+1}</span>`); }).join('') +
    `<div class="grp">Ferramentas</div>` + ['importar','catalogo','prestadoras','config'].map(k=>item(k,lbl(k))).join('');
}
function renderProjSelect(){
  const sel = $('#projSel');
  sel.innerHTML = myProjects().map(p=>`<option value="${p.id}" ${p.id===db.currentId?'selected':''}>${esc(p.info.nome||'(sem nome)')}${p.info.codigo?' — '+esc(p.info.codigo):''}${p.info.tipo?' · '+esc(tipoLabel(p.info.tipo)):''}</option>`).join('');
  $('#sideFoot').innerHTML = `${currentUser?esc(currentUser.email)+'<br>':''}${myProjects().length} projeto(s) ${currentUser && hubIsSup(currentUser) ? 'da equipe' : 'seus'}<br>Dados no servidor da plataforma`;
}
const charts = [];
function go(v){
  if (v) view = v;
  charts.splice(0).forEach(c=>{ try{c.destroy();}catch(e){} });
  renderNav(); renderProjSelect();
  $('#sidebar').classList.remove('open');
  const fn = {dashboard:vDashboard, projetos:vProjetos, ident:vIdent, obra:()=>vMateriais('obra'), ativacao:()=>vMateriais('ativacao'),
    servicos:vServicos, prestadoras:vPrestadoras, importar:vImportar, resumo:vResumo, relatorios:vRelatorios, config:vConfig, aprovacao:vAprovacao, catalogo:vCatalogo}[view];
  const isEtapa = cur() && ETAPAS.some(e=>e[0]===view);
  $('#view').innerHTML = (isEtapa ? stepperHtml(view) + lastChangeHtml() : '') + fn() + (isEtapa ? etapaNavHtml(view) : '');
  $$('[data-icon]').forEach(el=>{ el.outerHTML = icon(el.dataset.icon); });
  afterRender[view] && afterRender[view]();
  window.scrollTo(0,0);
}

export { ETAPAS, charts, closeModal, confirmDialog, etapaInfo, go, icon, openModal, renderProjSelect, stepperHtml, toast, ui, view };
