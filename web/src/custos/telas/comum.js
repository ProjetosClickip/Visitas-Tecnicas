/* =====================================================================
   7. TELAS
   ===================================================================== */
import { cur } from '../armazenamento.js';
import { tipoLabel } from '../tema.js';
import { esc, fmtBRL, fmtPct } from '../util.js';

function projHeader(title, sub){
  const p = cur();
  return `<div class="pg-head"><div><h1 class="pg">${title}</h1><p class="pg-sub">${sub || (p ? (p.info.tipo?`<span class="badge b-tipo">${esc(tipoLabel(p.info.tipo))}</span> `:'') + esc(p.info.nome||'(sem nome)') + (p.info.cliente?' · '+esc(p.info.cliente):'') + (p.info.codigo?' · Código '+esc(p.info.codigo):'') : '')}</p></div></div>`;
}
function kpiCards(t){
  return `<div class="kpis">
    <div class="kpi obra"><div class="l">Materiais de obra</div><div class="v" title="${fmtBRL(t.obra)}">${fmtBRL(t.obra)}</div><div class="s">${t.nObra} item(ns) · ${fmtPct(t.obra,t.total)} do total</div></div>
    <div class="kpi ativ"><div class="l">Materiais de ativação</div><div class="v" title="${fmtBRL(t.ativ)}">${fmtBRL(t.ativ)}</div><div class="s">${t.nAtiv} item(ns) · ${fmtPct(t.ativ,t.total)} do total</div></div>
    <div class="kpi mat"><div class="l">Total geral de materiais</div><div class="v" title="${fmtBRL(t.mat)}">${fmtBRL(t.mat)}</div><div class="s">${t.nMat} material(is) · ${fmtPct(t.mat,t.total)}</div></div>
    <div class="kpi serv"><div class="l">Serviços e mão de obra</div><div class="v" title="${fmtBRL(t.serv)}">${fmtBRL(t.serv)}</div><div class="s">${t.nServ} serviço(s) · ${fmtPct(t.serv,t.total)}</div></div>
    <div class="kpi total"><div class="l">Estimativa total do projeto</div><div class="v" title="${fmtBRL(t.total)}">${fmtBRL(t.total)}</div><div class="s">Materiais + serviços</div></div>
  </div>`;
}

export { kpiCards, projHeader };
