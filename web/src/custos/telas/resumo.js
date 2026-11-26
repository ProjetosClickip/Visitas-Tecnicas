/* ---------- 7.8 Resumo financeiro ---------- */
import { cur } from '../armazenamento.js';
import { totals } from '../calculos.js';
import { dlCards } from '../relatorios/downloads.js';
import { kpiCards, projHeader } from './comum.js';
import { noProject } from './identificacao.js';
import { esc, fmtBRL, fmtNum, fmtPct, round2 } from '../util.js';

function vResumo(){
  const p = cur(); if(!p) return noProject();
  const t = totals(p);
  const top = p.materiais.slice().sort((a,b)=>b.valorTotal-a.valorTotal).slice(0,10);
  const se = Object.entries(t.servEmpresas).sort((a,b)=>b[1].total-a[1].total);
  const units = {}; p.materiais.forEach(m=>{ (units[m.unidade]=units[m.unidade]||{n:0,v:0}); units[m.unidade].n++; units[m.unidade].v+=round2(m.valorTotal); });
  return projHeader('Etapa 5 · Resumo financeiro') + kpiCards(t) + `
  <div class="card"><h2>Resumo financeiro consolidado</h2>
    <table class="tbl sum-tbl"><thead><tr><th>Item</th><th class="num">Qtd. de itens</th><th class="num">Valor</th><th class="num">% do total</th></tr></thead><tbody>
    <tr><td>Subtotal de materiais de obra</td><td class="num">${t.nObra}</td><td class="num">${fmtBRL(t.obra)}</td><td class="num">${fmtPct(t.obra,t.total)}</td></tr>
    <tr><td>Subtotal de materiais de ativação</td><td class="num">${t.nAtiv}</td><td class="num">${fmtBRL(t.ativ)}</td><td class="num">${fmtPct(t.ativ,t.total)}</td></tr>
    <tr class="sub"><td>Total geral de materiais</td><td class="num">${t.nMat}</td><td class="num">${fmtBRL(t.mat)}</td><td class="num">${fmtPct(t.mat,t.total)}</td></tr>
    <tr><td>Subtotal de serviços e mão de obra</td><td class="num">${t.nServ}</td><td class="num">${fmtBRL(t.serv)}</td><td class="num">${fmtPct(t.serv,t.total)}</td></tr>
    <tr class="tot"><td>ESTIMATIVA TOTAL DE CUSTOS DO PROJETO</td><td class="num">${t.nMat+t.nServ}</td><td class="num">${fmtBRL(t.total)}</td><td class="num">100%</td></tr>
    </tbody></table></div>
  <div class="grid2">
    <div class="card"><h2>Materiais de maior custo</h2>${top.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Material</th><th class="num">Qtd.</th><th class="num">Total</th><th class="num">% dos materiais</th></tr></thead><tbody>
      ${top.map(m=>`<tr><td>${esc(m.nome)}</td><td class="num">${fmtNum(m.quantidade)} ${esc(m.unidade)}</td><td class="num"><b>${fmtBRL(m.valorTotal)}</b></td><td class="num">${fmtPct(m.valorTotal,t.mat)}</td></tr>`).join('')}
      </tbody></table></div>`:'<div class="muted">Nenhum material.</div>'}</div>
    <div class="card"><h2>Serviços por empresa / equipe</h2>${se.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa / equipe</th><th class="num">Serviços</th><th class="num">Subtotal</th><th class="num">%</th></tr></thead><tbody>
      ${se.map(([k,E])=>`<tr><td>${esc(k)}</td><td class="num">${E.n}</td><td class="num"><b>${fmtBRL(E.total)}</b></td><td class="num">${fmtPct(E.total,t.serv)}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total</td><td class="num">${t.nServ}</td><td class="num">${fmtBRL(t.serv)}</td><td class="num">100%</td></tr></tfoot></table></div>`:'<div class="muted">Nenhum serviço.</div>'}</div>
  </div>
  <div class="card"><h2>Materiais por unidade de medida</h2>${Object.keys(units).length?`<table class="tbl"><thead><tr><th>Unidade</th><th class="num">Itens</th><th class="num">Subtotal</th></tr></thead><tbody>${Object.entries(units).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${fmtBRL(v.v)}</td></tr>`).join('')}</tbody></table>`:'<div class="muted">—</div>'}</div>
  <div class="card"><h2>Baixar</h2>${dlCards()}</div>`;
}

export { vResumo };
