/* ---------- Sugestão de serviços a partir dos materiais mensurados ---------- */
import { cur, currentUser, db, myProjects, saveDB, touch } from '../armazenamento.js';
import { normalizeUnit } from '../classificacao.js';
import { closeModal, go, icon, openModal, toast } from '../interface.js';
import { datalists } from './materiais.js';
import { SVC_BASE, myPrest, prestById, prestOptions, tablePrice } from './servicos.js';
import { $, $$, deepClone, esc, fmtBRL, fmtInput, fmtNum, norm, normKey, parseBR, round2, uid } from '../util.js';

function suggestServices(p){
  const sug = {}; const ord = [];
  const add = (descricao, unidade, q, from)=>{ const k = norm(descricao); if (!sug[k]){ sug[k] = {descricao, unidade, quantidade:0, origem:[]}; ord.push(k); } sug[k].quantidade += q; if (!sug[k].origem.includes(from)) sug[k].origem.push(from); };
  for (const m of p.materiais){
    const n = ' '+normKey(m.nome+' '+(m.codigo||''))+' '; const u = normalizeUnit(m.unidade); const q = Number(m.quantidade)||0;
    const metros = u==='Metro' ? q : u==='Quilômetro' ? q*1000 : null;
    if (/ (cabo|fibra|fo|cordoalha) /.test(n) && metros!=null){ add(/ drop /.test(n) ? 'Lançamento de cabo drop' : 'Lançamento de fibra óptica', 'Metro', metros, m.nome); continue; }
    if (/ cto /.test(n) || n.includes('caixa de terminacao')){ add('Instalação de CTO','Unidade',q,m.nome); continue; }
    if (/ ceo /.test(n) || n.includes('caixa de emenda')){ add('Instalação de caixa de emenda','Unidade',q,m.nome); continue; }
    if (/ dio /.test(n) || n.includes('distribuidor interno')){ add('Instalação de DIO','Unidade',q,m.nome); continue; }
    if (/ splitter /.test(n)){ add('Instalação de splitter','Unidade',q,m.nome); continue; }
    if (/ (onu|ont) /.test(n)){ add('Ativação de cliente','Unidade',q,m.nome); continue; }
    if (/ (roteador|router) /.test(n)){ add('Configuração e ativação','Unidade',q,m.nome); continue; }
    if (/ poste /.test(n)){ add('Instalação de poste','Unidade',q,m.nome); continue; }
  }
  return ord.map(k=>sug[k]).filter(x=>x.quantidade>0);
}
function suggestForm(){
  const p = cur(); if (!p) return;
  if (!p.materiais.length) return toast('Mensure os materiais do projeto (etapas 2 e 3) antes de sugerir os serviços.','err',5000);
  const sugs = suggestServices(p);
  if (!sugs.length) return toast('Não foi possível identificar serviços a partir dos materiais deste projeto. Adicione os serviços manualmente.','',5500);
  const rows = sugs.map(sg=>{ const ex = p.servicos.find(s=>norm(s.descricao)===norm(sg.descricao)); return Object.assign(sg, {sel:true, ex, acao: ex ? 'atualizar' : 'novo', valor: ex ? ex.valorUnitario : null}); });
  const ov = openModal(`<div class="mh"><h3>Sugerir serviços a partir dos materiais</h3><button class="btn icon" data-x>${icon('x')}</button></div>
  <div class="mb">
    <p class="muted" style="margin-top:0;font-size:12.5px">Quantidades calculadas a partir da mensuração de materiais de <b>${esc(p.info.nome||'')}</b>. Ajuste o que for necessário antes de adicionar. Serviços como fusões e vistorias devem ser incluídos manualmente.</p>
    <div class="bulk"><b>Prestadora:</b><select class="inp" id="sgPrest" style="width:auto"><option value="">— definir depois —</option>${prestOptions()}</select>
      <span class="muted">os valores unitários são preenchidos pela tabela da prestadora (quando houver) e podem ser editados</span></div>
    <div class="tbl-wrap" style="max-height:50vh"><table class="tbl compact" id="sgTbl"><thead><tr><th></th><th>Serviço</th><th>Unid.</th><th class="num">Qtd.</th><th class="num">Valor unit. (R$)</th><th class="num">Total</th><th>Calculado a partir de</th><th>No projeto</th></tr></thead><tbody></tbody></table></div>
    <div class="foot-sum" id="sgSum"></div>
  </div>
  <div class="mf"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-sg="ok">Adicionar ao projeto</button></div>`, {size:'lg'});
  const prSel = $('#sgPrest', ov);
  const fill = ()=>{ const pr = prestById(prSel.value); rows.forEach(r=>{ const tp = tablePrice(pr, r.descricao); if (tp) r.valor = tp.valor; else if (r.valor==null) r.valor = r.ex ? r.ex.valorUnitario : 0; }); };
  const draw = ()=>{
    $('#sgTbl tbody', ov).innerHTML = rows.map((r,i)=>`<tr data-i="${i}" class="${r.sel?'':'unsel'}"><td><input type="checkbox" data-k="sel" ${r.sel?'checked':''}></td>
      <td><input class="inp" data-k="descricao" value="${esc(r.descricao)}" style="min-width:210px"></td><td>${esc(r.unidade)}</td>
      <td><input class="inp num" data-k="quantidade" value="${esc(fmtInput(r.quantidade,4))}" style="width:90px"></td>
      <td><input class="inp num" data-k="valor" value="${esc(fmtInput(r.valor||0,4))}" style="width:100px"></td>
      <td class="num"><b>${fmtBRL(round2(r.quantidade*(r.valor||0)))}</b></td>
      <td class="muted" style="font-size:11.5px;max-width:260px">${esc(r.origem.join(', ').slice(0,140))}</td>
      <td>${r.ex ? `<select class="inp" data-k="acao" style="width:auto"><option value="atualizar" ${r.acao==='atualizar'?'selected':''}>Já existe (${fmtNum(r.ex.quantidade)}): atualizar</option><option value="novo" ${r.acao==='novo'?'selected':''}>Adicionar como novo</option></select>` : '<span class="badge b-ok">Novo</span>'}</td></tr>`).join('');
    const sel = rows.filter(r=>r.sel);
    $('#sgSum', ov).innerHTML = `<span>${sel.length} de ${rows.length} serviço(s) selecionado(s)</span><span>Total sugerido: <b>${fmtBRL(round2(sel.reduce((a,r)=>a+r.quantidade*(r.valor||0),0)))}</b></span>`;
  };
  fill(); draw();
  prSel.addEventListener('change', ()=>{ fill(); draw(); });
  $('#sgTbl tbody', ov).addEventListener('change', e=>{
    const tr = e.target.closest('tr[data-i]'); if (!tr) return; const r = rows[+tr.dataset.i]; const k = e.target.dataset.k;
    if (k==='sel') r.sel = e.target.checked;
    else if (k==='quantidade'){ const v = parseBR(e.target.value); if (v==null || v<=0) return toast('Quantidade deve ser maior que zero.','err'); r.quantidade = v; }
    else if (k==='valor'){ const v = parseBR(e.target.value); if (v==null || v<0) return toast('Valor inválido.','err'); r.valor = v; }
    else r[k] = e.target.value;
    draw();
  });
  ov.addEventListener('click', e=>{
    if (e.target.closest('[data-x]')) return closeModal(ov);
    if (!e.target.closest('[data-sg]')) return;
    const pr = prestById(prSel.value); const sel = rows.filter(r=>r.sel && String(r.descricao).trim());
    if (!sel.length) return toast('Nenhum serviço selecionado.','err');
    let nNew = 0, nUpd = 0;
    sel.forEach(r=>{
      if (r.ex && r.acao==='atualizar'){ r.ex.quantidade = r.quantidade; r.ex.valorUnitario = r.valor||0; if (pr){ r.ex.prestadoraId = pr.id; r.ex.empresa = pr.nome; } nUpd++; }
      else { p.servicos.push({id:uid(), origem:'Sugerido pelos materiais', prestadoraId: pr?pr.id:null, descricao:r.descricao.trim(), empresa: pr ? pr.nome : (db.settings.empresaPadrao||'A definir'), unidade:r.unidade, quantidade:r.quantidade, valorUnitario:r.valor||0}); nNew++; }
    });
    touch(); closeModal(ov); go('servicos');
    const zero = sel.filter(r=>!(r.valor>0)).length;
    toast(`${nNew} serviço(s) adicionado(s) e ${nUpd} atualizado(s).${zero?` ${zero} sem valor unitário — preencha na lista.`:''}`,'ok',6000);
  });
}
function prestForm(pr){
  const isNew = !pr;
  const data = pr ? deepClone(pr) : {nome:'', cnpj:'', contato:'', telefone:'', email:'', observacoes:'', precos:[]};
  if (!data.precos.length) data.precos.push({id:uid(), servico:'', unidade:'Serviço', valor:''});
  const ov = openModal(`<div class="mh"><h3>${isNew?'Nova prestadora':'Editar prestadora e tabela de preços'}</h3><button class="btn icon" data-x>${icon('x')}</button></div>
  <div class="mb">${datalists()}<datalist id="dlSvcBase">${[...new Set([...SVC_BASE, ...(cur()?cur().servicos.map(s=>s.descricao):[])])].map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
    <div class="form-grid">
      <div class="fld span2"><label>Nome da prestadora <span class="req">*</span></label><input class="inp" name="nome" value="${esc(data.nome)}" placeholder="Ex.: Prestadora Alfa Telecom"></div>
      <div class="fld"><label>CNPJ</label><input class="inp" name="cnpj" value="${esc(data.cnpj)}"></div>
      <div class="fld"><label>Contato</label><input class="inp" name="contato" value="${esc(data.contato)}"></div>
      <div class="fld"><label>Telefone</label><input class="inp" name="telefone" value="${esc(data.telefone)}"></div>
      <div class="fld"><label>E-mail</label><input class="inp" name="email" value="${esc(data.email)}"></div>
      <div class="fld full"><label>Observações</label><input class="inp" name="observacoes" value="${esc(data.observacoes)}" placeholder="Condições, região de atuação, validade da tabela…"></div>
    </div>
    <h2 style="font-size:14px;margin:18px 0 8px;color:var(--heading)">Tabela de preços por serviço</h2>
    <div class="btns" style="margin-bottom:8px"><button class="btn sm" data-pp="add">${icon('plus')}Adicionar serviço</button>${cur()&&cur().servicos.length?`<button class="btn sm" data-pp="from-proj">${icon('list')}Adicionar serviços do projeto ativo</button>`:''}</div>
    <div class="tbl-wrap" style="max-height:45vh"><table class="tbl"><thead><tr><th>Serviço</th><th>Unidade</th><th class="num">Valor unitário (R$)</th><th></th></tr></thead><tbody id="ppRows"></tbody></table></div>
    <div class="auth-err" id="ppErr"></div>
  </div>
  <div class="mf"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-pp="save">Salvar prestadora</button></div>`, {size:'lg'});
  const rows = ()=>{ $('#ppRows',ov).innerHTML = data.precos.map((r,i)=>`<tr data-i="${i}"><td><input class="inp cell" data-k="servico" list="dlSvcBase" value="${esc(r.servico)}" style="min-width:260px"></td><td><input class="inp cell" data-k="unidade" list="dlUn" value="${esc(r.unidade)}" style="width:120px"></td><td class="num"><input class="inp cell num" data-k="valor" value="${esc(typeof r.valor==='number'?fmtInput(r.valor,4):r.valor)}" style="width:130px" inputmode="decimal"></td><td class="act"><button class="btn sm icon danger" data-pp="rm" title="Remover">${icon('trash')}</button></td></tr>`).join(''); };
  rows();
  $('#ppRows',ov).addEventListener('input', e=>{ const tr = e.target.closest('tr[data-i]'); if (!tr) return; data.precos[+tr.dataset.i][e.target.dataset.k] = e.target.value; });
  ov.addEventListener('click', e=>{
    if (e.target.closest('[data-x]')) return closeModal(ov);
    const b = e.target.closest('[data-pp]'); if (!b) return;
    const a = b.dataset.pp;
    if (a==='add'){ data.precos.push({id:uid(), servico:'', unidade:'Serviço', valor:''}); rows(); const ins = $$('#ppRows input[data-k="servico"]',ov); ins[ins.length-1].focus(); }
    else if (a==='rm'){ data.precos.splice(+b.closest('tr').dataset.i, 1); rows(); }
    else if (a==='from-proj'){
      let n = 0;
      data.precos = data.precos.filter(r=>String(r.servico).trim() || String(r.valor).trim());
      cur().servicos.forEach(s=>{ if (!data.precos.some(r=>norm(r.servico)===norm(s.descricao))){ data.precos.push({id:uid(), servico:s.descricao, unidade:s.unidade, valor:s.valorUnitario}); n++; } });
      rows(); toast(n ? `${n} serviço(s) adicionados com os valores atuais do projeto — ajuste para os valores desta prestadora.` : 'Todos os serviços do projeto já estão na tabela.', n?'ok':'');
    }
    else if (a==='save'){
      const err = m => { $('#ppErr',ov).textContent = m; };
      const g = n => ov.querySelector(`[name="${n}"]`).value.trim();
      const nome = g('nome').replace(/\s+/g,' ');
      if (!nome) return err('Informe o nome da prestadora.');
      if (myPrest().some(x=>x.id!==(pr&&pr.id) && norm(x.nome)===norm(nome))) return err('Já existe uma prestadora com este nome.');
      const precos = []; const seen = new Set();
      for (const r of data.precos){
        const sv = String(r.servico||'').trim(); const vs = String(r.valor==null?'':r.valor).trim();
        if (!sv && !vs) continue;
        if (!sv) return err('Há uma linha com valor mas sem descrição do serviço.');
        const v = typeof r.valor==='number' ? r.valor : parseBR(vs);
        if (v==null || v<0) return err(`Valor inválido para "${sv}".`);
        if (seen.has(norm(sv))) return err(`O serviço "${sv}" está repetido na tabela.`);
        seen.add(norm(sv)); precos.push({id:r.id||uid(), servico:sv, unidade:String(r.unidade||'').trim()||'Serviço', valor:v});
      }
      const info = {nome, cnpj:g('cnpj'), contato:g('contato'), telefone:g('telefone'), email:g('email'), observacoes:g('observacoes'), precos};
      if (isNew) db.prestadoras.push(Object.assign({id:uid(), ownerId:currentUser.id, criadoEm:new Date().toISOString(), atualizadoEm:new Date().toISOString(), alteradoPor:currentUser.nome}, info));
      else {
        Object.assign(pr, info, {atualizadoEm:new Date().toISOString(), alteradoPor:currentUser.nome});
        myProjects().forEach(pj=>pj.servicos.forEach(s=>{ if (s.prestadoraId===pr.id) s.empresa = nome; }));
      }
      saveDB(); closeModal(ov); go(); toast(isNew?'Prestadora cadastrada.':'Prestadora atualizada.','ok');
    }
  });
}
function ensureSamplePrest(){
  let alfa = myPrest().find(x=>x.nome==='Prestadora Alfa (exemplo)');
  if (!alfa){
    const mk = (nome, vals)=>{ const x = {id:uid(), ownerId:currentUser.id, criadoEm:new Date().toISOString(), nome, cnpj:'', contato:'', telefone:'', email:'', observacoes:'Tabela ilustrativa',
      precos:[['Lançamento de fibra óptica','Metro'],['Fusão de fibra óptica','Ponto'],['Instalação de CTO','Unidade'],['Configuração e ativação','Unidade']].map(([sv,u],i)=>({id:uid(), servico:sv, unidade:u, valor:vals[i]}))};
      db.prestadoras.push(x); return x; };
    alfa = mk('Prestadora Alfa (exemplo)', [2.2, 18, 45, 35]);
    mk('Prestadora Beta (exemplo)', [2.0, 20, 40, 38]);
  }
  return alfa;
}

export { ensureSamplePrest, prestForm, suggestForm };
