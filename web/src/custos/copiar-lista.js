/* =====================================================================
   12c. COPIAR LISTA DE OUTRO PROJETO
   ===================================================================== */
import { cur, db, touch } from './armazenamento.js';
import { catalogBest } from './catalogo-busca.js';
import { findMatDup, findSvcDup } from './classificacao.js';
import { closeModal, go, icon, openModal, toast } from './interface.js';
import { tipoLabel } from './tema.js';
import { $, esc, fmtBRL, fmtNum, parseBR, round2, uid } from './util.js';

function copyListForm(cat){
  const p = cur(); if (!p) return;
  const fontes = db.projects.filter(x=>x.id!==p.id && (x.materiais.length || x.servicos.length)).sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  if (!fontes.length) return toast('Nenhum outro projeto com materiais cadastrados.','err');
  const st = {src:fontes[0].id, obra:cat!=='ativacao', ativ:cat!=='obra', svc:false, fator:1, valores:'origem', dup:'ignorar'};
  const ov = openModal(`<div class="mh"><h3>Usar uma cópia da lista de outro projeto</h3><button class="btn icon" data-x>${icon('x')}</button></div>
  <div class="mb">
    <div class="form-grid">
      <div class="fld full"><label>Projeto de origem</label><select class="inp" id="clSrc">${fontes.map(x=>`<option value="${x.id}">${esc(x.info.nome||'(sem nome)')}${x.info.tipo?' · '+esc(tipoLabel(x.info.tipo)):''}${x.info.cliente?' · '+esc(x.info.cliente):''} — ${x.materiais.length} materiais, ${x.servicos.length} serviços${x.criadoPor?' · criado por '+esc(x.criadoPor.nome):''}</option>`).join('')}</select></div>
      <div class="fld"><label>Copiar</label><label style="font-weight:400"><input type="checkbox" id="clObra" ${st.obra?'checked':''}> Materiais de obra</label><label style="font-weight:400"><input type="checkbox" id="clAtiv" ${st.ativ?'checked':''}> Materiais de ativação</label><label style="font-weight:400"><input type="checkbox" id="clSvc"> Serviços e mão de obra</label></div>
      <div class="fld"><label>Quantidades</label><select class="inp" id="clQtdMode"><option value="1">Manter as quantidades</option><option value="f">Multiplicar por um fator</option></select><input class="inp num mt8" id="clFator" value="1" style="display:none" placeholder="Fator (ex.: 2 ou 0,5)"></div>
      <div class="fld"><label>Valores unitários</label><select class="inp" id="clVal"><option value="origem">Manter os do projeto de origem</option><option value="catalogo">Atualizar pelo catálogo (quando houver)</option></select>
        <label style="margin-top:8px">Itens já existentes neste projeto</label><select class="inp" id="clDup"><option value="ignorar">Ignorar</option><option value="somar">Somar a quantidade</option><option value="novo">Adicionar separado</option></select></div>
    </div>
    <div class="tbl-wrap mt8" style="max-height:42vh"><table class="tbl compact"><thead><tr><th><input type="checkbox" id="clAll" checked></th><th>Tipo</th><th>Descrição</th><th>Unid.</th><th class="num">Qtd.</th><th class="num">Valor unit.</th><th class="num">Total</th><th>Neste projeto</th></tr></thead><tbody id="clRows"></tbody></table></div>
    <div class="foot-sum" id="clSum"></div>
  </div>
  <div class="mf"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Copiar para este projeto</button></div>`, {size:'lg'});
  let rows = [];
  const build = ()=>{
    const src = db.projects.find(x=>x.id===$('#clSrc',ov).value);
    const fator = $('#clQtdMode',ov).value==='f' ? (parseBR($('#clFator',ov).value)||0) : 1;
    const useCat = $('#clVal',ov).value==='catalogo';
    const prev = new Map(rows.map(r=>[r.key, r.sel]));
    rows = [];
    src.materiais.forEach(m=>{ if ((m.categoria==='obra' && !$('#clObra',ov).checked) || (m.categoria==='ativacao' && !$('#clAtiv',ov).checked)) return;
      const bm = useCat ? catalogBest(m.nome) : null; const it = bm && bm.item.valor>0 ? bm.item : null; const key = 'm'+m.id;
      rows.push({key, tipo:m.categoria, codigo:m.codigo, nome:m.nome, empresa:m.empresa, unidade:m.unidade, quantidade: Math.round(m.quantidade*fator*10000)/10000, valorUnitario: it ? it.valor : m.valorUnitario, cat: !!it, ex: findMatDup(m, p.materiais), sel: prev.has(key)?prev.get(key):true}); });
    if ($('#clSvc',ov).checked) src.servicos.forEach(s=>{ const key='s'+s.id; rows.push({key, tipo:'servico', codigo:'', nome:s.descricao, empresa:s.empresa, prestadoraId:s.prestadoraId, unidade:s.unidade, quantidade: Math.round(s.quantidade*fator*10000)/10000, valorUnitario:s.valorUnitario, ex: findSvcDup({nome:s.descricao, empresa:s.empresa}, p.servicos), sel: prev.has(key)?prev.get(key):true}); });
    const lbl = {obra:'<span class="badge b-obra">Obra</span>', ativacao:'<span class="badge b-ativ">Ativação</span>', servico:'<span class="badge b-serv">Serviço</span>'};
    $('#clRows',ov).innerHTML = rows.map((r,i)=>`<tr data-i="${i}" class="${r.sel?'':'unsel'}"><td><input type="checkbox" data-k="sel" ${r.sel?'checked':''}></td><td>${lbl[r.tipo]}</td><td>${esc(r.nome)}</td><td>${esc(r.unidade)}</td>
      <td class="num">${fmtNum(r.quantidade)}</td><td class="num">${fmtBRL(r.valorUnitario)}${r.cat?' <span class="badge b-tipo" title="Valor do catálogo">cat.</span>':''}</td><td class="num">${fmtBRL(round2(r.quantidade*r.valorUnitario))}</td><td>${r.ex?`<span class="badge b-warn">Já existe (${fmtNum(r.ex.quantidade)})</span>`:'<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nada para copiar com as opções escolhidas.</td></tr>';
    const sel = rows.filter(r=>r.sel);
    $('#clSum',ov).innerHTML = `<span>${sel.length} de ${rows.length} item(ns) selecionado(s)</span><span>Total: <b>${fmtBRL(round2(sel.reduce((a,r)=>a+r.quantidade*r.valorUnitario,0)))}</b></span>`;
  };
  build();
  ['#clSrc','#clObra','#clAtiv','#clSvc','#clVal'].forEach(s=>$(s,ov).addEventListener('change', build));
  $('#clQtdMode',ov).addEventListener('change', e=>{ $('#clFator',ov).style.display = e.target.value==='f' ? '' : 'none'; build(); });
  $('#clFator',ov).addEventListener('input', build);
  $('#clAll',ov).addEventListener('change', e=>{ rows.forEach(r=>r.sel=e.target.checked); build(); });
  $('#clRows',ov).addEventListener('change', e=>{ const tr = e.target.closest('tr[data-i]'); if (!tr) return; rows[+tr.dataset.i].sel = e.target.checked; build(); });
  ov.addEventListener('click', e=>{
    if (e.target.closest('[data-x]')) return closeModal(ov);
    if (!e.target.closest('[data-ok]')) return;
    const src = db.projects.find(x=>x.id===$('#clSrc',ov).value); const dup = $('#clDup',ov).value;
    const sel = rows.filter(r=>r.sel && r.quantidade>0);
    if (!sel.length) return toast('Nenhum item selecionado (ou quantidade zero).','err');
    let nNew=0, nSum=0, nIgn=0; const origem = 'Copiado de '+(src.info.nome||'outro projeto');
    sel.forEach(r=>{
      if (r.ex && dup==='ignorar'){ nIgn++; return; }
      if (r.ex && dup==='somar'){ r.ex.quantidade = Math.round((r.ex.quantidade + r.quantidade)*10000)/10000; if (r.tipo!=='servico') r.ex.valorTotal = round2(r.ex.quantidade*r.ex.valorUnitario); nSum++; return; }
      if (r.tipo==='servico') p.servicos.push({id:uid(), origem, prestadoraId:r.prestadoraId||null, descricao:r.nome, empresa:r.empresa, unidade:r.unidade, quantidade:r.quantidade, valorUnitario:r.valorUnitario});
      else p.materiais.push({id:uid(), origem, empresa:'', codigo:'', nome:r.nome, categoria:r.tipo, unidade:r.unidade, quantidade:r.quantidade, valorUnitario:r.valorUnitario, valorTotal:round2(r.quantidade*r.valorUnitario)});
      nNew++;
    });
    touch(`Lista copiada de "${src.info.nome}": ${nNew} novo(s), ${nSum} somado(s)`); closeModal(ov); go();
    toast(`${nNew} item(ns) copiado(s)${nSum?`, ${nSum} quantidade(s) somada(s)`:''}${nIgn?`, ${nIgn} já existente(s) ignorado(s)`:''}.`,'ok',5500);
  });
}

export { copyListForm };
