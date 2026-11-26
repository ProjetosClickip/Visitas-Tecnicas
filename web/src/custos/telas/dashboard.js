/* ---------- 7.1 Dashboard ---------- */
import { cur } from '../armazenamento.js';
import { totals } from '../calculos.js';
import { charts, icon, stepperHtml, view } from '../interface.js';
import { libGet, loadLib } from '../libs.js';
import { afterRender } from '../registro.js';
import { kpiCards, projHeader } from './comum.js';
import { resolvedTheme } from '../tema.js';
import { $, esc, fmtBRL, fmtNum, fmtPct } from '../util.js';

function vDashboard(){
  const p = cur(); const t = totals(p);
  const top = p ? p.materiais.slice().sort((a,b)=>b.valorTotal-a.valorTotal).slice(0,8) : [];
  const semValor = p ? p.materiais.filter(m=>!(m.valorUnitario>0)).length : 0;
  return projHeader('Dashboard financeiro') + `<div class="card" style="padding:14px 16px 4px"><h2 style="margin-bottom:10px">Andamento da mensuração</h2>${stepperHtml(null)}</div>` + kpiCards(t) + `
  <div class="stats">
    <div class="stat"><div class="l">Materiais cadastrados</div><div class="v">${t.nMat}</div></div>
    <div class="stat"><div class="l">Itens de obra</div><div class="v">${t.nObra}</div></div>
    <div class="stat"><div class="l">Itens de ativação</div><div class="v">${t.nAtiv}</div></div>
    <div class="stat"><div class="l">Serviços cadastrados</div><div class="v">${t.nServ}</div></div>
    <div class="stat"><div class="l">Materiais sem valor</div><div class="v" style="${semValor?'color:var(--warn)':''}">${semValor}</div></div>
    <div class="stat"><div class="l">Arquivos importados</div><div class="v">${p?p.importacoes.filter(h=>h.importados>0).length:0}</div></div>
  </div>
  <div class="charts">
    <div class="card"><h2>Materiais: obra × ativação</h2><div class="chart-box"><canvas id="ch1"></canvas><div class="chart-msg hidden" id="ch1m"></div></div></div>
    <div class="card"><h2>Materiais × serviços</h2><div class="chart-box"><canvas id="ch2"></canvas><div class="chart-msg hidden" id="ch2m"></div></div></div>
    <div class="card"><h2>Participação no custo total</h2><div class="chart-box"><canvas id="ch3"></canvas><div class="chart-msg hidden" id="ch3m"></div></div></div>
  </div>
  <div class="grid2">
    <div class="card"><h2>Materiais de maior custo</h2>
      ${top.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Material</th><th>Categoria</th><th class="num">Qtd.</th><th class="num">Total</th></tr></thead><tbody>
      ${top.map(m=>`<tr><td>${esc(m.nome)}</td><td><span class="badge ${m.categoria==='ativacao'?'b-ativ':'b-obra'}">${m.categoria==='ativacao'?'Ativação':'Obra'}</span></td><td class="num">${fmtNum(m.quantidade)} ${esc(m.unidade)}</td><td class="num"><b>${fmtBRL(m.valorTotal)}</b></td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">Nenhum material cadastrado.<div class="btns mt8" style="justify-content:center"><button class="btn primary" data-action="mat-add" data-cat="obra">${icon('plus')}Adicionar material</button><button class="btn" data-action="mat-import" data-cat="obra">${icon('importar')}Importar lista</button></div></div>`}
    </div>
    <div class="card"><h2>Composição dos custos</h2>
      <table class="tbl sum-tbl"><tbody>
        <tr><td><span class="badge b-obra">Obra</span> Materiais de obra</td><td class="num">${fmtBRL(t.obra)}</td><td class="num muted">${fmtPct(t.obra,t.total)}</td></tr>
        <tr><td><span class="badge b-ativ">Ativação</span> Materiais de ativação</td><td class="num">${fmtBRL(t.ativ)}</td><td class="num muted">${fmtPct(t.ativ,t.total)}</td></tr>
        <tr class="sub"><td>Total geral de materiais</td><td class="num">${fmtBRL(t.mat)}</td><td class="num">${fmtPct(t.mat,t.total)}</td></tr>
        <tr><td><span class="badge b-serv">Serviços</span> Serviços e mão de obra</td><td class="num">${fmtBRL(t.serv)}</td><td class="num muted">${fmtPct(t.serv,t.total)}</td></tr>
        <tr class="tot"><td>Estimativa total de custos</td><td class="num">${fmtBRL(t.total)}</td><td class="num">100%</td></tr>
      </tbody></table>
    </div>
  </div>`;
}
afterRender.dashboard = ()=> drawCharts();
function drawCharts(){
  const t = totals(cur());
  const boxes = ['ch1','ch2','ch3'];
  const Chart = libGet('chart');
  if (!Chart){
    boxes.forEach(b=>{ const m=$('#'+b+'m'); if(m){ m.textContent='Carregando gráficos…'; m.classList.remove('hidden'); } });
    loadLib('chart').then(()=>{ if(view==='dashboard') drawCharts(); })
      .catch(err=>{ boxes.forEach(b=>{ const m=$('#'+b+'m'); if(m){ m.textContent='Gráficos indisponíveis: '+err.message; m.classList.remove('hidden'); } }); });
    return;
  }
  charts.splice(0).forEach(c=>{ try{c.destroy();}catch(e){} });
  const cs = getComputedStyle(document.documentElement);
  const dark = resolvedTheme()==='dark';
  if (Chart.defaults){ Chart.defaults.color = cs.getPropertyValue('--muted').trim() || '#667085'; Chart.defaults.borderColor = cs.getPropertyValue('--line').trim() || '#e2e6ee'; }
  const cardC = cs.getPropertyValue('--card').trim() || '#fff';
  const C = dark ? {obra:'#5b82f0', ativ:'#22a9c4', serv:'#e08d34', mat:'#8291ab'} : {obra:'#1e40af', ativ:'#0e7490', serv:'#b45309', mat:'#475569'};
  const moneyTip = tot => ({callbacks:{label:c=>`${c.label}: ${fmtBRL(c.raw)}${tot!=null?' ('+fmtPct(c.raw,tot)+')':''}`}});
  const empty = (id, cond)=>{ const m=$('#'+id+'m'); if(!m) return; m.classList.toggle('hidden', !cond); if(cond) m.textContent='Sem valores para exibir.'; };
  const base = {responsive:true, maintainAspectRatio:false, animation:{duration:300}};
  const c1=$('#ch1'), c2=$('#ch2'), c3=$('#ch3');
  if (!c1) return;
  charts.push(new Chart(c1,{type:'doughnut',data:{labels:['Materiais de obra','Materiais de ativação'],datasets:[{data:[t.obra,t.ativ],backgroundColor:[C.obra,C.ativ],borderColor:cardC,borderWidth:2}]},
    options:Object.assign({},base,{cutout:'58%',plugins:{legend:{position:'bottom'},tooltip:moneyTip(t.mat)}})}));
  empty('ch1', t.mat<=0);
  charts.push(new Chart(c2,{type:'bar',data:{labels:['Materiais de obra','Materiais de ativação','Total materiais','Serviços e mão de obra'],datasets:[{data:[t.obra,t.ativ,t.mat,t.serv],backgroundColor:[C.obra,C.ativ,C.mat,C.serv],borderRadius:5}]},
    options:Object.assign({},base,{plugins:{legend:{display:false},tooltip:moneyTip(null)},scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtBRL(v).replace(',00','')}},x:{ticks:{font:{size:11}}}}})}));
  empty('ch2', t.total<=0);
  charts.push(new Chart(c3,{type:'pie',data:{labels:[`Obra (${fmtPct(t.obra,t.total)})`,`Ativação (${fmtPct(t.ativ,t.total)})`,`Serviços (${fmtPct(t.serv,t.total)})`],datasets:[{data:[t.obra,t.ativ,t.serv],backgroundColor:[C.obra,C.ativ,C.serv],borderColor:cardC,borderWidth:2}]},
    options:Object.assign({},base,{plugins:{legend:{position:'bottom'},tooltip:moneyTip(t.total)}})}));
  empty('ch3', t.total<=0);
}

export { drawCharts, vDashboard };
