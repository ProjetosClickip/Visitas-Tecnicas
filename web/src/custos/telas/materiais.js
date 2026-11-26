/* ---------- 7.4 Materiais (obra / ativação) ---------- */
import { DEFAULT_UNITS, cur, db, myProjects, touch } from '../armazenamento.js';
import { unitValue } from '../calculos.js';
import { CAT_OK, catTabLabel, catalogBest, pctTxt } from '../catalogo-busca.js';
import { catalogDatalist, catalogo } from '../catalogo.js';
import { autoCategory, findMatDup } from '../classificacao.js';
import { closeModal, confirmDialog, go, icon, openModal, toast, ui, view } from '../interface.js';
import { afterRender } from '../registro.js';
import { noProject } from './identificacao.js';
import { $, $$, esc, fmtBRL, fmtInput, fmtNum, norm, parseBR, round2, uid } from '../util.js';

function vMateriais(cat){
  const p = cur(); if(!p) return noProject();
  ui.mat.categoria = cat;
  const units = [...new Set(p.materiais.map(m=>m.unidade).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if (ui.mat.unidade && !units.includes(ui.mat.unidade)) ui.mat.unidade='';
  const title = cat==='obra' ? 'Etapa 2 · Materiais de obra' : 'Etapa 3 · Materiais de ativação';
  const sub = cat==='obra' ? 'Construção, expansão, adequação e manutenção da infraestrutura (cabos, caixas de emenda, CTOs, DIOs, splitters, ferragens…).' : 'Instalação, ativação e disponibilização dos serviços aos clientes (ONUs, roteadores, fontes, patch cords, conectores…).';
  return `<div class="pg-head"><div><h1 class="pg">${title}</h1><p class="pg-sub">${sub}</p></div>
    <div class="btns"><button class="btn primary" data-action="mat-add" data-cat="${cat}">${icon('plus')}Adicionar material</button><button class="btn navy" data-action="mat-import" data-cat="${cat}" title="Subir uma lista em Excel, PDF ou imagem: o sistema extrai descrições e quantidades e busca os valores no catálogo">${icon('importar')}Importar lista (Excel, PDF ou imagem)</button><button class="btn" data-action="mat-copy" title="Copiar a lista de materiais de um projeto já mensurado">${icon('copy')}Usar lista de outro projeto</button>${cat==='obra'?`<button class="btn" data-action="calc-alca" title="Calcular BAP, SUPA, alças e laços pelo nº de postes">${icon('calc')}Calculadora alça e laço</button>`:''}<button class="btn" data-action="mat-catalog" data-cat="${cat}" title="Atualizar os valores unitários buscando cada descrição no catálogo">${icon('catalogo')}Aplicar valores do catálogo</button>
      <button class="btn" data-action="report-mat" title="Baixar somente a lista de materiais em PDF">${icon('pdf')}Lista de materiais (PDF)</button><button class="btn" data-action="report-semcusto" title="Baixar a lista de materiais sem valores em PDF">${icon('pdf')}Lista sem custo (PDF)</button><button class="btn" data-action="xls-semcusto" title="Baixar a lista de materiais sem valores em Excel">${icon('xls')}Lista sem custo (Excel)</button></div></div>
  <div class="card">
    <div class="toolbar">
      <input class="inp search" id="fQ" placeholder="Pesquisar pela descrição…" value="${esc(ui.mat.q)}">
      <select class="inp" id="fCat"><option value="">Todas as categorias</option><option value="obra" ${ui.mat.categoria==='obra'?'selected':''}>Obra</option><option value="ativacao" ${ui.mat.categoria==='ativacao'?'selected':''}>Ativação</option></select>
      <select class="inp" id="fUn"><option value="">Todas as unidades</option>${units.map(u=>`<option ${ui.mat.unidade===u?'selected':''}>${esc(u)}</option>`).join('')}</select>
      <select class="inp" id="fSort" title="Ordenar por">
        ${[['nome','Descrição'],['quantidade','Quantidade'],['unit','Valor unitário'],['valorTotal','Valor total']].map(([k,l])=>`<option value="${k}" ${ui.mat.sort===k?'selected':''}>Ordenar: ${l}</option>`).join('')}
      </select>
      <button class="btn icon" id="fDir" title="Inverter ordem">${icon('sort')}<span id="fDirL">${ui.mat.dir>0?'Crescente':'Decrescente'}</span></button>
      <button class="btn" id="fClear">Limpar filtros</button>
    </div>
    <div id="matTable"></div>
  </div>
  <div class="subt" id="matSub"></div>`;
}
afterRender.obra = afterRender.ativacao = ()=>{
  const upd = ()=>{ ui.mat.q=$('#fQ').value; ui.mat.empresa=''; ui.mat.categoria=$('#fCat').value; ui.mat.unidade=$('#fUn').value; ui.mat.sort=$('#fSort').value; renderMatTable(); };
  $('#fQ').addEventListener('input', upd);
  ['#fCat','#fUn','#fSort'].forEach(s=>$(s).addEventListener('change', upd));
  $('#fDir').addEventListener('click', ()=>{ ui.mat.dir*=-1; $('#fDirL').textContent = ui.mat.dir>0?'Crescente':'Decrescente'; renderMatTable(); });
  $('#fClear').addEventListener('click', ()=>{ ui.mat.q=''; ui.mat.empresa=''; ui.mat.unidade=''; ui.mat.sort='nome'; ui.mat.dir=1; ui.mat.categoria=''; go(); });
  renderMatTable();
};
function filteredMats(){
  const p = cur(); const f = ui.mat; const q = norm(f.q);
  let list = p.materiais.filter(m=>
    (!q || norm(m.nome).includes(q)) &&
    (!f.categoria || m.categoria===f.categoria) && (!f.unidade || m.unidade===f.unidade));
  const key = f.sort;
  const val = m => key==='unit' ? unitValue(m) : m[key];
  list.sort((a,b)=>{
    const va=val(a), vb=val(b);
    const r = (typeof va==='number' && typeof vb==='number') ? va-vb : String(va||'').localeCompare(String(vb||''),'pt-BR',{numeric:true,sensitivity:'base'});
    return r * f.dir;
  });
  return list;
}
function renderMatTable(){
  const p = cur(); const list = filteredMats();
  const sortTh = (k,l,cls)=>`<th class="sortable ${cls||''}" data-sort="${k}">${l}${ui.mat.sort===k?(ui.mat.dir>0?' ▲':' ▼'):''}</th>`;
  const sumT = round2(list.reduce((a,m)=>a+round2(m.valorTotal),0));
  $('#matTable').innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      ${sortTh('nome','Descrição do material')}<th>Categoria</th><th>Unidade</th>
      ${sortTh('quantidade','Quantidade','num')}${sortTh('unit','Valor unitário','num')}${sortTh('valorTotal','Valor total','num')}<th></th></tr></thead><tbody>
    ${list.map(m=>`<tr><td>${esc(m.nome)}${m.origem&&m.origem!=='Manual'?`<div class="muted" style="font-size:11px">${m.importId?'Importado: ':''}${esc(m.origem)}</div>`:''}</td>
      <td><span class="badge ${m.categoria==='ativacao'?'b-ativ':'b-obra'}">${m.categoria==='ativacao'?'Ativação':'Obra'}</span></td><td>${esc(m.unidade)}</td>
      <td class="num">${fmtNum(m.quantidade)}</td><td class="num">${fmtBRL(unitValue(m))}</td><td class="num"><b>${fmtBRL(m.valorTotal)}</b>${m.valorUnitario>0?'':'<div><span class="badge b-warn">sem valor</span></div>'}</td>
      <td class="act"><button class="btn sm icon" title="Editar" data-action="mat-edit" data-id="${m.id}">${icon('edit')}</button><button class="btn sm icon" title="Duplicar" data-action="mat-dup" data-id="${m.id}">${icon('copy')}</button><button class="btn sm icon danger" title="Excluir" data-action="mat-del" data-id="${m.id}">${icon('trash')}</button></td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="3">Subtotal dos itens exibidos (${list.length})</td><td></td><td></td><td class="num">${fmtBRL(sumT)}</td><td></td></tr></tfoot></table></div>`
    : `<div class="empty">${p.materiais.length ? 'Nenhum material corresponde aos filtros.' : `Nenhum material cadastrado neste projeto.<div class="btns mt8" style="justify-content:center"><button class="btn navy" data-action="mat-import" data-cat="${view==='ativacao'?'ativacao':'obra'}">${icon('importar')}Importar lista (Excel, PDF ou imagem)</button><button class="btn" data-action="mat-add" data-cat="${view==='ativacao'?'ativacao':'obra'}">${icon('plus')}Adicionar material</button></div>`}</div>`;
  $$('#matTable th[data-sort]').forEach(th=>th.addEventListener('click', ()=>{
    if (ui.mat.sort===th.dataset.sort) ui.mat.dir*=-1; else { ui.mat.sort=th.dataset.sort; ui.mat.dir=1; }
    $('#fSort').value = ui.mat.sort; $('#fDirL').textContent = ui.mat.dir>0?'Crescente':'Decrescente'; renderMatTable();
  }));
  // Subtotais por empresa e categoria (dos itens filtrados)
  const byC = {obra:{n:0,v:0}, ativacao:{n:0,v:0}};
  list.forEach(m=>{ byC[m.categoria].n++; byC[m.categoria].v+=round2(m.valorTotal); });
  $('#matSub').innerHTML = `
    <div class="card"><h2>Subtotais por categoria <span class="hint">itens exibidos</span></h2>
    <table class="tbl"><thead><tr><th>Categoria</th><th class="num">Itens</th><th class="num">Subtotal</th></tr></thead><tbody>
    <tr><td><span class="badge b-obra">Obra</span></td><td class="num">${byC.obra.n}</td><td class="num">${fmtBRL(byC.obra.v)}</td></tr>
    <tr><td><span class="badge b-ativ">Ativação</span></td><td class="num">${byC.ativacao.n}</td><td class="num">${fmtBRL(byC.ativacao.v)}</td></tr></tbody>
    <tfoot><tr><td>Total</td><td class="num">${byC.obra.n+byC.ativacao.n}</td><td class="num">${fmtBRL(byC.obra.v+byC.ativacao.v)}</td></tr></tfoot></table></div>`;
}

function datalists(){
  const p = cur();
  const emps = new Set(); myProjects().forEach(pr=>{ pr.materiais.forEach(m=>m.empresa&&emps.add(m.empresa)); pr.servicos.forEach(s=>s.empresa&&emps.add(s.empresa)); });
  if (db.settings.empresaPadrao) emps.add(db.settings.empresaPadrao);
  const units = new Set(db.settings.unidades||DEFAULT_UNITS); if(p) p.materiais.forEach(m=>units.add(m.unidade));
  return `<datalist id="dlEmp">${[...emps].sort().map(e=>`<option value="${esc(e)}">`).join('')}</datalist><datalist id="dlUn">${[...units].map(u=>`<option value="${esc(u)}">`).join('')}</datalist>`;
}

function matForm(m, cat){
  const isNew = !m;
  m = m || {empresa:'', codigo:'', nome:'', categoria:cat||'obra', unidade:'Unidade', quantidade:'', valorUnitario:''};
  const ov = openModal(`<div class="mh"><h3>${isNew?'Adicionar material':'Editar material'}</h3><button class="btn icon" data-x>${icon('x')}</button></div>
  <div class="mb">${datalists()}${catalogDatalist()}<div class="form-grid">
    <div class="fld full"><label>Descrição do material <span class="req">*</span></label><input class="inp" name="nome" list="dlCatDesc" value="${esc(m.nome)}" placeholder="Digite a descrição (ex.: cabo óptico 12FO) ou escolha do catálogo"><div class="msg"></div><div class="muted" id="catHint" style="font-size:12px;margin-top:3px">Ao informar a descrição, o sistema busca o material no catálogo e preenche unidade e valor unitário.</div></div>
    <div class="fld"><label>Categoria <span class="req">*</span></label><select class="inp" name="categoria"><option value="obra" ${m.categoria!=='ativacao'?'selected':''}>Material de obra</option><option value="ativacao" ${m.categoria==='ativacao'?'selected':''}>Material de ativação</option></select><div class="msg"></div></div>
    <div class="fld"><label>Unidade de medida <span class="req">*</span></label><input class="inp" name="unidade" list="dlUn" value="${esc(m.unidade)}"><div class="msg"></div></div>
    <div class="fld"><label>Quantidade <span class="req">*</span></label><input class="inp num" name="quantidade" inputmode="decimal" value="${esc(fmtInput(m.quantidade,4))}" placeholder="0"><div class="msg"></div></div>
    <div class="fld"><label>Valor unitário (R$) <span class="req">*</span></label><input class="inp num" name="valorUnitario" inputmode="decimal" value="${esc(fmtInput(m.valorUnitario,4))}" placeholder="0,00"><div class="msg"></div></div>
    <div class="fld span2"><label>Valor total do item (calculado automaticamente)</label><div class="calc-box"><span>Quantidade × Valor unitário</span><b id="calcTotal">—</b></div></div>
  </div></div>
  <div class="mf">${isNew?'<button class="btn" data-save="again">Salvar e adicionar outro</button>':''}<button class="btn" data-x>Cancelar</button><button class="btn primary" data-save="1">Salvar material</button></div>`);
  const F = n => ov.querySelector(`[name="${n}"]`);
  const recalc = ()=>{ const q=parseBR(F('quantidade').value), v=parseBR(F('valorUnitario').value);
    $('#calcTotal', ov).textContent = (q>0 && v!=null && v>=0) ? fmtBRL(round2(q*v)) : (q===0 ? 'Quantidade não pode ser zero' : '—'); };
  ['quantidade','valorUnitario'].forEach(n=>F(n).addEventListener('input', recalc)); recalc();
  F('nome').addEventListener('change', ()=>{ if(isNew && cat==null){ F('categoria').value = autoCategory(F('nome').value, F('categoria').value); } });
  let catIt = null;
  const showCat = ()=>{
    const nome = F('nome').value.trim(); catIt = null;
    if (!nome){ $('#catHint',ov).textContent = 'Ao informar a descrição, o sistema busca o material no catálogo e preenche unidade e valor unitário.'; return; }
    const exact = catalogo().find(x=>norm(x.descricao)===norm(nome));
    const mt = exact ? {item:exact, s:1} : catalogBest(nome);
    if (!mt){ $('#catHint',ov).innerHTML = '<span class="badge b-warn">Não encontrado no catálogo</span> informe unidade e valor unitário.'; return; }
    catIt = mt.item;
    const vazio = parseBR(F('valorUnitario').value)==null;
    if (isNew || vazio){ if (catIt.valor>0) F('valorUnitario').value = fmtInput(catIt.valor,4); if (catIt.unidade && (isNew || !F('unidade').value.trim())) F('unidade').value = catIt.unidade; recalc(); }
    $('#catHint',ov).innerHTML = `<span class="badge ${mt.s>=CAT_OK?'b-ok':'b-warn'}">Catálogo ${pctTxt(mt.s)}</span> ${esc(catIt.descricao)} · ${esc(catIt.unidade)} · <b>${fmtBRL(catIt.valor)}</b>${catIt.tabela?' (tabela '+esc(catTabLabel(catIt.tabela))+')':''}
      <button type="button" class="btn sm" data-catuse style="margin-left:6px">Usar descrição e valor do catálogo</button>`;
  };
  F('nome').addEventListener('change', showCat);
  ov.addEventListener('click', e=>{ if (!e.target.closest('[data-catuse]') || !catIt) return; F('nome').value = catIt.descricao; if (catIt.valor>0) F('valorUnitario').value = fmtInput(catIt.valor,4); if (catIt.unidade) F('unidade').value = catIt.unidade; recalc(); showCat(); });
  if (!isNew && m.nome) showCat();
  ov.addEventListener('click', async e=>{
    if (e.target.closest('[data-x]')) return closeModal(ov);
    const sv = e.target.closest('[data-save]'); if(!sv) return;
    const data = {empresa:'', codigo:'', nome:F('nome').value.trim(), categoria:F('categoria').value, unidade:F('unidade').value.trim(), quantidade:parseBR(F('quantidade').value), valorUnitario:parseBR(F('valorUnitario').value)};
    const errs = validateMat(data);
    $$('.fld', ov).forEach(fl=>{ const i=fl.querySelector('[name]'); if(!i) return; const msg=errs[i.name]||''; i.classList.toggle('err',!!msg); const mm=fl.querySelector('.msg'); if(mm) mm.textContent=msg; });
    if (Object.keys(errs).length) return;
    const p = cur();
    const dup = findMatDup(data, p.materiais, isNew?null:m.id);
    if (dup){
      const ok = await confirmDialog({title:'Possível duplicidade', message:`Já existe um material com a mesma descrição neste projeto:<br><br>${esc(dup.nome)} — ${fmtNum(dup.quantidade)} ${esc(dup.unidade)} · ${fmtBRL(dup.valorTotal)}<br><br>Deseja salvar mesmo assim como um registro separado?`, okText:'Salvar mesmo assim'});
      if (!ok) return;
    }
    data.valorTotal = round2(data.quantidade * data.valorUnitario);
    if (isNew){ p.materiais.push(Object.assign({id:uid(), origem:'Manual'}, data)); }
    else { Object.assign(p.materiais.find(x=>x.id===m.id), data); }
    touch(); toast(isNew?'Material adicionado.':'Material atualizado.','ok');
    closeModal(ov);
    go(data.categoria==='ativacao' && (view==='obra'||view==='ativacao') ? 'ativacao' : (view==='obra'||view==='ativacao' ? 'obra' : view));
    if (sv.dataset.save==='again') matForm(null, data.categoria);
  });
}
function validateMat(d){
  const e = {};
  if (!d.nome) e.nome = 'Informe a descrição do material.';
  if (!d.unidade) e.unidade = 'Informe a unidade.';
  if (d.categoria!=='obra' && d.categoria!=='ativacao') e.categoria = 'Selecione a categoria.';
  if (d.quantidade==null) e.quantidade = 'Informe uma quantidade numérica.';
  else if (d.quantidade<=0) e.quantidade = d.quantidade===0 ? 'A quantidade não pode ser zero.' : 'A quantidade não pode ser negativa.';
  if (d.valorUnitario==null) e.valorUnitario = 'Informe o valor unitário (pode ser 0,00).';
  else if (d.valorUnitario<0) e.valorUnitario = 'O valor não pode ser negativo.';
  return e;
}

export { datalists, matForm, renderMatTable, vMateriais };
