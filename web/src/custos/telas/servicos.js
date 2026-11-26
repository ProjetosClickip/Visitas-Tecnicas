/* ---------- 7.5 Serviços ---------- */
import { cur, currentUser, db, touch } from '../armazenamento.js';
import { svcTotal, totals } from '../calculos.js';
import { findSvcDup } from '../classificacao.js';
import { closeModal, confirmDialog, go, icon, openModal, toast, ui } from '../interface.js';
import { afterRender } from '../registro.js';
import { noProject } from './identificacao.js';
import { datalists } from './materiais.js';
import { prestCompareCard } from './prestadoras.js';
import { $, $$, esc, fmtBRL, fmtInput, fmtNum, fmtPct, norm, parseBR, round2, uid } from '../util.js';

const SVC_BASE = ['Lançamento de fibra óptica','Lançamento de cabo drop','Instalação de splitter','Instalação de poste','Fusão de fibra óptica','Instalação de CTO','Instalação de caixa de emenda','Instalação de DIO','Instalação de equipamentos','Adequação de infraestrutura','Configuração e ativação','Ativação de cliente','Lançamento de cabos','Certificação de rede','Projeto executivo','Vistoria técnica','Deslocamento','Lançamento de cabo aéreo urbano','Lançamentos internos - rede óptica','Montagem de caixa de emenda após fusão','Fusões (por fibra)','Montagem e instalação de PTO','Serviço de infraestrutura','Ativação e teste'];
function myPrest(){ return currentUser ? (db.prestadoras||[]) : []; }
const prestById = id => id ? (myPrest().find(x=>x.id===id) || null) : null;
function tablePrice(pr, descricao){ if (!pr) return null; const n = norm(descricao); return (pr.precos||[]).find(r=>norm(r.servico)===n) || null; }
const prestOptions = sel => myPrest().slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(x=>`<option value="${x.id}" ${sel===x.id?'selected':''}>${esc(x.nome)}</option>`).join('');

function vServicos(){
  const p = cur(); if(!p) return noProject();
  const emps = [...new Set(p.servicos.map(s=>s.empresa).filter(Boolean))].sort();
  if (ui.svc.empresa && !emps.includes(ui.svc.empresa)) ui.svc.empresa='';
  const np = myPrest().length;
  const t = totals(p);
  return `<div class="pg-head"><div><h1 class="pg">Etapa 4 · Serviços e mão de obra</h1><p class="pg-sub">Custos de serviços e mão de obra <b>deste projeto</b> (${esc(p.info.nome||'')}), levantados após a mensuração dos materiais. Valor total = Quantidade × Valor unitário. Os valores ficam salvos só neste projeto; a tabela da prestadora serve apenas para preencher.</p></div>
    <div class="btns"><button class="btn primary" data-action="svc-add">${icon('plus')}Adicionar serviço</button><button class="btn" data-action="svc-suggest">${icon('list')}Sugerir a partir dos materiais</button><button class="btn" data-view="importar">${icon('importar')}Importar</button></div></div>
  <div class="card"><h2>Base: materiais já mensurados neste projeto</h2>
    ${t.nMat ? `<div class="base-mat">
      <div class="stat"><div class="l">Materiais de obra</div><div class="v">${fmtBRL(t.obra)}</div><div class="muted" style="font-size:11.5px">${t.nObra} item(ns)</div></div>
      <div class="stat"><div class="l">Materiais de ativação</div><div class="v">${fmtBRL(t.ativ)}</div><div class="muted" style="font-size:11.5px">${t.nAtiv} item(ns)</div></div>
      <div class="stat"><div class="l">Total de materiais</div><div class="v">${fmtBRL(t.mat)}</div><div class="muted" style="font-size:11.5px">${t.nMat} item(ns)</div></div>
      <div class="stat"><div class="l">Serviços e mão de obra</div><div class="v">${fmtBRL(t.serv)}</div><div class="muted" style="font-size:11.5px">${t.nServ} serviço(s) · ${fmtPct(t.serv, t.total)} do projeto</div></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin:10px 0 0">Use <b>Sugerir a partir dos materiais</b> para gerar os serviços com as quantidades da mensuração (metros de cabo → lançamento, CTOs → instalação, caixas de emenda, DIOs, splitters, ONUs → ativação de clientes).</p>`
    : `<div class="alert warn" style="margin:0">Este projeto ainda não tem materiais mensurados. Recomenda-se concluir as etapas <a href="#" data-view="obra">2 · Materiais de obra</a> e <a href="#" data-view="ativacao">3 · Materiais de ativação</a> antes de levantar os serviços.</div>`}
  </div>
  ${np ? '' : `<div class="alert info">Cadastre as prestadoras e suas tabelas de preços em <a href="#" data-view="prestadoras"><b>Prestadoras (cadastro)</b></a> para preencher os valores automaticamente e comparar o custo deste projeto entre prestadoras.</div>`}
  <div class="card"><div class="toolbar">
    <input class="inp search" id="sQ" placeholder="Pesquisar serviço…" value="${esc(ui.svc.q)}">
    <select class="inp" id="sEmp"><option value="">Todas as prestadoras/equipes</option>${emps.map(e=>`<option ${ui.svc.empresa===e?'selected':''}>${esc(e)}</option>`).join('')}</select>
    <select class="inp" id="sSort">${[['descricao','Descrição'],['empresa','Prestadora'],['quantidade','Quantidade'],['valorUnitario','Valor unitário'],['total','Valor total']].map(([k,l])=>`<option value="${k}" ${ui.svc.sort===k?'selected':''}>Ordenar: ${l}</option>`).join('')}</select>
    <button class="btn icon" id="sDir">${icon('sort')}<span id="sDirL">${ui.svc.dir>0?'Crescente':'Decrescente'}</span></button>
  </div>
  ${np ? `<div class="bulk"><b>Serviços exibidos:</b>
    <select class="inp" id="bPrest" style="width:auto"><option value="">Escolher prestadora…</option>${prestOptions()}</select>
    <label><input type="checkbox" id="bPrice" checked> aplicar valores da tabela</label>
    <button class="btn sm" id="bPrestApply">Atribuir prestadora</button>
    <span class="muted">|</span>
    <button class="btn sm" id="bPriceApply">Atualizar valores pela tabela de cada prestadora</button></div>` : ''}
  <div id="svcTable"></div></div>
  <div class="card" id="svcByPrest"></div>
  ${np ? prestCompareCard(p) : ''}`;
}
afterRender.servicos = ()=>{
  const upd = ()=>{ ui.svc.q=$('#sQ').value; ui.svc.empresa=$('#sEmp').value; ui.svc.sort=$('#sSort').value; renderSvcTable(); };
  $('#sQ').addEventListener('input',upd); $('#sEmp').addEventListener('change',upd); $('#sSort').addEventListener('change',upd);
  $('#sDir').addEventListener('click',()=>{ ui.svc.dir*=-1; $('#sDirL').textContent=ui.svc.dir>0?'Crescente':'Decrescente'; renderSvcTable(); });
  $('#svcTable').addEventListener('change', e=>{
    const el = e.target, tr = el.closest('tr[data-id]'); if (!tr || !el.dataset.f) return;
    const s = cur().servicos.find(x=>x.id===tr.dataset.id); if (!s) return;
    const k = el.dataset.f;
    if (k==='quantidade' || k==='valorUnitario'){
      const v = parseBR(el.value);
      if (v==null || v<0 || (k==='quantidade' && v===0)){
        toast(k==='quantidade' ? 'A quantidade deve ser maior que zero.' : 'Valor inválido (não pode ser negativo).','err');
        el.value = fmtInput(s[k],4); return;
      }
      s[k] = v; touch(); renderSvcTable();
    } else if (k==='prestadoraId'){
      const pr = prestById(el.value);
      if (!pr){ s.prestadoraId = null; touch(); renderSvcTable(); return; }
      s.prestadoraId = pr.id; s.empresa = pr.nome;
      const tp = tablePrice(pr, s.descricao);
      if (tp){ s.valorUnitario = tp.valor; if (tp.unidade) s.unidade = tp.unidade; toast(`Valor ajustado pela tabela de ${pr.nome}: ${fmtBRL(tp.valor)}`,'ok'); }
      else toast(`"${s.descricao}" não está na tabela de ${pr.nome} — valor mantido. Edite o valor ou cadastre-o na tabela da prestadora.`,'',5500);
      touch(); renderSvcTable();
    }
  });
  const bp = $('#bPrestApply');
  if (bp) bp.addEventListener('click', async ()=>{
    const pr = prestById($('#bPrest').value); if (!pr) return toast('Escolha a prestadora.','err');
    const list = filteredSvcs(); if (!list.length) return toast('Nenhum serviço exibido.','err');
    const usePrice = $('#bPrice').checked;
    if (!(await confirmDialog({title:'Atribuir prestadora', message:`Atribuir <b>${esc(pr.nome)}</b> a <b>${list.length}</b> serviço(s) exibido(s)${usePrice?' e aplicar os valores da tabela de preços dela (quando houver)':''}?`, okText:'Atribuir'}))) return;
    let n=0, miss=0;
    list.forEach(s=>{ s.prestadoraId = pr.id; s.empresa = pr.nome; if (usePrice){ const tp = tablePrice(pr, s.descricao); if (tp){ s.valorUnitario = tp.valor; if (tp.unidade) s.unidade = tp.unidade; n++; } else miss++; } });
    touch(); go('servicos');
    toast(`${list.length} serviço(s) atribuídos a ${pr.nome}.${usePrice?` ${n} valor(es) da tabela aplicados${miss?`, ${miss} sem preço na tabela (valor mantido)`:''}.`:''}`,'ok',6000);
  });
  const bv = $('#bPriceApply');
  if (bv) bv.addEventListener('click', async ()=>{
    const list = filteredSvcs().filter(s=>prestById(s.prestadoraId));
    if (!list.length) return toast('Nenhum serviço exibido possui prestadora cadastrada.','err');
    if (!(await confirmDialog({title:'Atualizar valores', message:`Substituir o valor unitário de ${list.length} serviço(s) pelo valor da tabela de preços da respectiva prestadora? Serviços sem preço na tabela não serão alterados.`, okText:'Atualizar valores'}))) return;
    let n=0; list.forEach(s=>{ const tp = tablePrice(prestById(s.prestadoraId), s.descricao); if (tp){ s.valorUnitario = tp.valor; if (tp.unidade) s.unidade = tp.unidade; n++; } });
    touch(); go('servicos'); toast(`${n} valor(es) atualizado(s) pela tabela.`,'ok');
  });
  renderSvcTable();
};
function filteredSvcs(){
  const p = cur(); const q = norm(ui.svc.q);
  const list = p.servicos.filter(s=>(!q||norm(s.descricao).includes(q)) && (!ui.svc.empresa||s.empresa===ui.svc.empresa));
  const val = s => ui.svc.sort==='total' ? svcTotal(s) : s[ui.svc.sort];
  list.sort((a,b)=>{ const va=val(a), vb=val(b); return ((typeof va==='number')? va-vb : String(va).localeCompare(String(vb),'pt-BR',{numeric:true,sensitivity:'base'})) * ui.svc.dir; });
  return list;
}
function priceTag(s){
  const pr = prestById(s.prestadoraId);
  if (!pr) return '<span class="muted" title="Sem prestadora cadastrada">—</span>';
  const tp = tablePrice(pr, s.descricao);
  if (!tp) return '<span class="badge b-warn" title="Serviço não consta na tabela de preços da prestadora">Sem preço na tabela</span>';
  if (Math.abs(tp.valor - s.valorUnitario) < 0.005) return '<span class="badge b-ok">Conforme tabela</span>';
  return `<span class="badge b-gray" title="Valor editado manualmente">Tabela: ${fmtBRL(tp.valor)}</span>`;
}
function renderSvcTable(){
  const p = cur(); const list = filteredSvcs(); const np = myPrest().length;
  const sum = round2(list.reduce((a,s)=>a+svcTotal(s),0));
  $('#svcTable').innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Descrição do serviço</th><th>Prestadora / equipe</th><th>Unidade</th><th class="num">Quantidade</th><th class="num">Valor unitário (R$)</th><th class="num">Valor total</th><th>Tabela de preços</th><th></th></tr></thead><tbody>
    ${list.map(s=>`<tr data-id="${s.id}"><td>${esc(s.descricao)}${s.origem&&s.origem!=='Manual'?`<div class="muted" style="font-size:11px">${s.origem==='Sugerido pelos materiais'?'Sugerido a partir dos materiais':'Importado: '+esc(s.origem)}</div>`:''}</td>
    <td>${np ? `<select class="inp cell" data-f="prestadoraId" style="min-width:160px"><option value="">${s.prestadoraId ? '— Outra / equipe própria —' : esc(s.empresa||'— Outra / equipe própria —')}</option>${prestOptions(s.prestadoraId)}</select>` : esc(s.empresa)}</td>
    <td>${esc(s.unidade)}</td>
    <td class="num"><input class="inp cell num" data-f="quantidade" value="${esc(fmtInput(s.quantidade,4))}" style="width:90px" title="Editar quantidade"></td>
    <td class="num"><input class="inp cell num" data-f="valorUnitario" value="${esc(fmtInput(s.valorUnitario,4))}" style="width:110px" title="Editar valor unitário"></td>
    <td class="num"><b>${fmtBRL(svcTotal(s))}</b></td><td>${priceTag(s)}</td>
    <td class="act"><button class="btn sm icon" data-action="svc-edit" data-id="${s.id}" title="Editar">${icon('edit')}</button><button class="btn sm icon" data-action="svc-dup" data-id="${s.id}" title="Duplicar">${icon('copy')}</button><button class="btn sm icon danger" data-action="svc-del" data-id="${s.id}" title="Excluir">${icon('trash')}</button></td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="5">Total de serviços e mão de obra (${list.length} exibido(s))</td><td class="num">${fmtBRL(sum)}</td><td colspan="2"></td></tr></tfoot></table></div>`
    : `<div class="empty">${p.servicos.length?'Nenhum serviço corresponde aos filtros.':'Nenhum serviço cadastrado.'}<div class="btns mt8" style="justify-content:center"><button class="btn primary" data-action="svc-add">${icon('plus')}Adicionar serviço</button></div></div>`;
  const by = {}; p.servicos.forEach(s=>{ const k = s.empresa||'(sem prestadora)'; (by[k]=by[k]||{n:0,v:0}); by[k].n++; by[k].v += svcTotal(s); });
  const tot = totals(p).serv;
  const box = $('#svcByPrest');
  if (box) box.innerHTML = `<h2>Subtotais por prestadora / equipe</h2>${Object.keys(by).length ? `<table class="tbl"><thead><tr><th>Prestadora / equipe</th><th class="num">Serviços</th><th class="num">Subtotal</th><th class="num">%</th></tr></thead><tbody>
    ${Object.entries(by).sort((a,b)=>b[1].v-a[1].v).map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${fmtBRL(round2(v.v))}</td><td class="num">${fmtPct(v.v,tot)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${p.servicos.length}</td><td class="num">${fmtBRL(tot)}</td><td class="num">100%</td></tr></tfoot></table>` : '<div class="muted">—</div>'}`;
}
function svcForm(s){
  const isNew = !s;
  s = s || {descricao:'', empresa:'', prestadoraId:null, unidade:'Serviço', quantidade:'', valorUnitario:''};
  const np = myPrest().length;
  const ov = openModal(`<div class="mh"><h3>${isNew?'Adicionar serviço':'Editar serviço'}</h3><button class="btn icon" data-x>${icon('x')}</button></div>
  <div class="mb">${datalists()}<datalist id="dlSvcF"></datalist>
  <div class="form-grid">
    <div class="fld full"><label>Prestadora que irá realizar o serviço <span class="req">*</span></label>
      <select class="inp" name="prestadoraId"><option value="">— Outra empresa / equipe própria —</option>${prestOptions(s.prestadoraId)}</select>
      <input class="inp mt8" name="empresa" list="dlEmp" placeholder="Nome da empresa ou equipe responsável" value="${esc(s.prestadoraId?'':s.empresa)}" ${s.prestadoraId?'style="display:none"':''}>
      <div class="msg"></div>
      ${np?'':'<div class="muted" style="font-size:11.5px;margin-top:3px">Nenhuma prestadora cadastrada. <a href="#" data-view="prestadoras" data-x>Cadastrar prestadoras e tabelas de preços</a></div>'}</div>
    <div class="fld full"><label>Descrição do serviço <span class="req">*</span></label><input class="inp" name="descricao" list="dlSvcF" value="${esc(s.descricao)}" placeholder="Escolha da lista ou digite"><div class="msg"></div></div>
    <div class="fld"><label>Unidade de medição <span class="req">*</span></label><input class="inp" name="unidade" list="dlUn" value="${esc(s.unidade)}"><div class="msg"></div></div>
    <div class="fld"><label>Quantidade <span class="req">*</span></label><input class="inp num" name="quantidade" inputmode="decimal" value="${esc(fmtInput(s.quantidade,4))}"><div class="msg"></div></div>
    <div class="fld"><label>Valor unitário (R$) <span class="req">*</span> <span class="muted">editável</span></label><input class="inp num" name="valorUnitario" inputmode="decimal" value="${esc(fmtInput(s.valorUnitario,4))}"><div class="msg"></div></div>
    <div class="fld full" id="priceHint"></div>
    <div class="fld full"><div class="calc-box"><span>Valor total = Quantidade × Valor unitário</span><b id="calcSvc">—</b></div></div>
  </div></div>
  <div class="mf">${isNew?'<button class="btn" data-save="again">Salvar e adicionar outro</button>':''}<button class="btn" data-x>Cancelar</button><button class="btn primary" data-save="1">Salvar serviço</button></div>`);
  const F = n => ov.querySelector(`[name="${n}"]`);
  const recalc = ()=>{ const q=parseBR(F('quantidade').value), v=parseBR(F('valorUnitario').value); $('#calcSvc',ov).textContent = (q>0 && v!=null && v>=0) ? fmtBRL(round2(q*v)) : '—'; };
  const fillDl = ()=>{ const pr = prestById(F('prestadoraId').value); const names = pr ? pr.precos.map(r=>r.servico) : [];
    $('#dlSvcF',ov).innerHTML = [...new Set([...names, ...SVC_BASE])].map(x=>`<option value="${esc(x)}">`).join(''); };
  const hint = ()=>{
    const box = $('#priceHint',ov); const pr = prestById(F('prestadoraId').value);
    if (!pr){ box.innerHTML = ''; return; }
    const desc = F('descricao').value.trim(); const v = parseBR(F('valorUnitario').value);
    if (!desc){ box.innerHTML = `<div class="muted" style="font-size:12px">${pr.precos.length} serviço(s) na tabela de preços de ${esc(pr.nome)}. Escolha a descrição para preencher o valor automaticamente.</div>`; return; }
    const tp = tablePrice(pr, desc);
    if (tp){
      const diff = v!=null && Math.abs(v-tp.valor) >= 0.005;
      box.innerHTML = `<div class="alert ${diff?'warn':'info'}" style="margin:0">Valor na tabela de <b>${esc(pr.nome)}</b>: <b>${fmtBRL(tp.valor)}</b>${tp.unidade?' / '+esc(tp.unidade):''}${diff?`<br>Valor informado diferente da tabela (${fmtBRL(v)}). <label><input type="checkbox" id="updTable"> Atualizar também a tabela de preços de ${esc(pr.nome)}</label>`:''}</div>`;
    } else {
      box.innerHTML = `<div class="alert warn" style="margin:0">"${esc(desc)}" não consta na tabela de preços de <b>${esc(pr.nome)}</b>. Informe o valor cobrado por ela.<br><label><input type="checkbox" id="addTable" checked> Adicionar este serviço e valor à tabela de preços de ${esc(pr.nome)}</label></div>`;
    }
  };
  const applyTable = ()=>{ const tp = tablePrice(prestById(F('prestadoraId').value), F('descricao').value); if (tp){ F('valorUnitario').value = fmtInput(tp.valor,4); if (tp.unidade) F('unidade').value = tp.unidade; } recalc(); hint(); };
  F('prestadoraId').addEventListener('change', ()=>{ F('empresa').style.display = F('prestadoraId').value ? 'none' : ''; fillDl(); applyTable(); });
  F('descricao').addEventListener('change', applyTable);
  ['quantidade','valorUnitario'].forEach(n=>F(n).addEventListener('input', ()=>{ recalc(); hint(); }));
  fillDl(); recalc(); hint();
  ov.addEventListener('click', async e=>{
    if (e.target.closest('[data-x]')) return closeModal(ov);
    const sv = e.target.closest('[data-save]'); if(!sv) return;
    const pr = prestById(F('prestadoraId').value);
    const d = {prestadoraId: pr?pr.id:null, descricao:F('descricao').value.trim(), empresa: pr ? pr.nome : F('empresa').value.trim(), unidade:F('unidade').value.trim(), quantidade:parseBR(F('quantidade').value), valorUnitario:parseBR(F('valorUnitario').value)};
    const errs = {};
    if (!d.descricao) errs.descricao='Informe a descrição.';
    if (!d.empresa) errs.prestadoraId='Selecione a prestadora ou informe a empresa/equipe.';
    if (!d.unidade) errs.unidade='Informe a unidade.';
    if (d.quantidade==null) errs.quantidade='Informe a quantidade.'; else if (d.quantidade<=0) errs.quantidade = d.quantidade===0?'A quantidade não pode ser zero.':'Quantidade negativa não permitida.';
    if (d.valorUnitario==null) errs.valorUnitario='Informe o valor (pode ser 0,00).'; else if (d.valorUnitario<0) errs.valorUnitario='Valor negativo não permitido.';
    $$('.fld',ov).forEach(fl=>{ const i=fl.querySelector('[name]'); if(!i) return; const msg=errs[i.name]||''; i.classList.toggle('err',!!msg); const mm=fl.querySelector('.msg'); if(mm) mm.textContent=msg; });
    if (Object.keys(errs).length) return;
    const p = cur();
    const dup = findSvcDup(d, p.servicos, isNew?null:s.id);
    if (dup && !(await confirmDialog({title:'Possível duplicidade', message:`Já existe o serviço <b>${esc(dup.descricao)}</b> para <b>${esc(dup.empresa)}</b> (${fmtNum(dup.quantidade)} ${esc(dup.unidade)} · ${fmtBRL(svcTotal(dup))}).<br><br>Salvar mesmo assim?`, okText:'Salvar mesmo assim'}))) return;
    if (pr){
      const tp = tablePrice(pr, d.descricao);
      if (tp && $('#updTable',ov) && $('#updTable',ov).checked){ tp.valor = d.valorUnitario; tp.unidade = d.unidade; toast(`Tabela de ${pr.nome} atualizada.`,'ok'); }
      if (!tp && $('#addTable',ov) && $('#addTable',ov).checked){ pr.precos.push({id:uid(), servico:d.descricao, unidade:d.unidade, valor:d.valorUnitario}); toast(`Serviço adicionado à tabela de ${pr.nome}.`,'ok'); }
    }
    if (isNew) p.servicos.push(Object.assign({id:uid(), origem:'Manual'}, d)); else Object.assign(p.servicos.find(x=>x.id===s.id), d);
    touch(); toast(isNew?'Serviço adicionado.':'Serviço atualizado.','ok'); closeModal(ov); go('servicos');
    if (sv.dataset.save==='again') svcForm(null);
  });
}

export { SVC_BASE, myPrest, prestById, prestOptions, renderSvcTable, svcForm, tablePrice, vServicos };
