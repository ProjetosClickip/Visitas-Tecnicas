/* ---------- 7.6 Prestadoras e tabelas de preços ---------- */
import { cur } from '../armazenamento.js';
import { svcTotal, totals } from '../calculos.js';
import { icon } from '../interface.js';
import { myPrest, tablePrice } from './servicos.js';
import { esc, fmtBRL, round2 } from '../util.js';

function prestCompare(p){
  return myPrest().map(pr=>{
    let tot = 0, ok = 0; const miss = [];
    (p?p.servicos:[]).forEach(s=>{ const tp = tablePrice(pr, s.descricao); if (tp){ tot += round2(s.quantidade*tp.valor); ok++; } else miss.push(s.descricao); });
    return {pr, tot:round2(tot), ok, miss};
  });
}
function vPrestadoras(){
  const p = cur();
  const list = myPrest().slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const nSvc = p ? p.servicos.length : 0;
  const comp = prestCompare(p).filter(c=>c.ok>0).sort((a,b)=>(b.ok-a.ok)||(a.tot-b.tot));
  const full = comp.filter(c=>c.ok===nSvc); const best = full.length ? full.reduce((a,b)=>a.tot<=b.tot?a:b) : null;
  const atual = totals(p).serv;
  return `<div class="pg-head"><div><h1 class="pg">Prestadoras e tabelas de preços</h1><p class="pg-sub">Cada prestadora possui sua própria tabela de valores por serviço. Ao escolher a prestadora de um serviço, o valor unitário é preenchido pela tabela dela (e pode ser editado).</p></div>
    <div class="btns"><button class="btn primary" data-action="prest-add">${icon('plus')}Nova prestadora</button><button class="btn" data-view="servicos">${icon('servicos')}Serviços do projeto</button></div></div>
  <div class="card"><h2>Prestadoras cadastradas <span class="hint">disponíveis em todos os seus projetos</span></h2>
  ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Prestadora</th><th>CNPJ</th><th>Contato</th><th class="num">Serviços na tabela</th><th class="num">Serviços no projeto ativo</th><th class="num">Subtotal no projeto</th><th></th></tr></thead><tbody>
    ${list.map(pr=>{ const used = p ? p.servicos.filter(s=>s.prestadoraId===pr.id) : []; return `<tr><td><b>${esc(pr.nome)}</b>${pr.observacoes?`<div class="muted" style="font-size:11.5px">${esc(pr.observacoes.slice(0,90))}</div>`:''}</td><td>${esc(pr.cnpj||'—')}</td><td>${esc([pr.contato,pr.telefone,pr.email].filter(Boolean).join(' · ')||'—')}</td>
      <td class="num">${pr.precos.length}</td><td class="num">${used.length}</td><td class="num">${fmtBRL(round2(used.reduce((a,s)=>a+svcTotal(s),0)))}</td>
      <td class="act"><button class="btn sm" data-action="prest-edit" data-id="${pr.id}">${icon('edit')}Editar tabela</button><button class="btn sm icon" title="Duplicar" data-action="prest-dup" data-id="${pr.id}">${icon('copy')}</button><button class="btn sm icon danger" title="Excluir" data-action="prest-del" data-id="${pr.id}">${icon('trash')}</button></td></tr>`; }).join('')}
  </tbody></table></div>` : `<div class="empty">Nenhuma prestadora cadastrada.<div class="btns mt8" style="justify-content:center"><button class="btn primary" data-action="prest-add">${icon('plus')}Cadastrar prestadora</button></div></div>`}
  </div>
  <div class="alert info">O comparativo de custo entre prestadoras fica dentro de cada projeto, na <a href="#" data-view="servicos"><b>etapa 4 · Serviços e mão de obra</b></a>. Os valores usados em cada projeto são próprios do projeto; as tabelas abaixo servem de referência para preenchê-los.</div>`;
}
function prestCompareCard(p){
  const nSvc = p ? p.servicos.length : 0;
  const comp = prestCompare(p).filter(c=>c.ok>0).sort((a,b)=>(b.ok-a.ok)||(a.tot-b.tot));
  const full = comp.filter(c=>c.ok===nSvc); const best = full.length ? full.reduce((a,b)=>a.tot<=b.tot?a:b) : null;
  const atual = totals(p).serv;
  return `<div class="card"><h2>Comparativo de prestadoras para este projeto <span class="hint">${esc(p?p.info.nome:'')}</span></h2>
  ${!nSvc ? '<div class="muted">Cadastre ou sugira os serviços deste projeto para comparar as prestadoras.</div>' : !comp.length ? '<div class="muted">Nenhuma prestadora possui na tabela de preços os serviços deste projeto. Cadastre os valores em Prestadoras (use "Adicionar serviços do projeto ativo" ao editar a tabela).</div>' : `
    <p class="muted" style="margin-top:0;font-size:12.5px">Simulação: custo se cada prestadora executasse todos os ${nSvc} serviço(s) deste projeto, com as quantidades atuais e os valores da tabela dela. Custo atual dos serviços do projeto: <b>${fmtBRL(atual)}</b>.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Prestadora</th><th class="num">Serviços com preço</th><th class="num">Custo estimado</th><th class="num">Diferença x atual</th><th>Serviços sem preço na tabela</th><th></th></tr></thead><tbody>
    ${comp.map(c=>{ const dif = round2(c.tot - atual); const complete = c.ok===nSvc; return `<tr><td><b>${esc(c.pr.nome)}</b> ${best && best.pr.id===c.pr.id ? '<span class="badge b-ok">Menor custo</span>' : ''}</td>
      <td class="num">${c.ok} de ${nSvc}</td><td class="num"><b>${fmtBRL(c.tot)}</b>${complete?'':'<div class="muted" style="font-size:11px">parcial</div>'}</td>
      <td class="num" style="color:${dif<0?'var(--ok)':dif>0?'var(--danger)':'inherit'}">${complete ? (dif>0?'+':'')+fmtBRL(dif) : '—'}</td>
      <td class="muted" style="font-size:12px">${c.miss.length ? esc(c.miss.join(', ')) : '—'}</td>
      <td class="act"><button class="btn sm" data-action="prest-apply-all" data-id="${c.pr.id}">Atribuir a todos os serviços</button></td></tr>`; }).join('')}
    </tbody></table></div>`}
  </div>`;
}

export { prestCompareCard, vPrestadoras };
