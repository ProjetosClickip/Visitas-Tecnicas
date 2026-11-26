/* =====================================================================
   12a. CATÁLOGO DE MATERIAIS (tabela de valores unitários da empresa)
   ===================================================================== */
import { db, saveDB } from './armazenamento.js';
import { catTabLabel } from './catalogo-busca.js';
import { normalizeUnit } from './classificacao.js';
import { extOf, sheetRows } from './importacao/assistente.js';
import { TOTAL_LINE, decodeText, detectHeader, parseCSV } from './importacao/leitura.js';
import { closeModal, confirmDialog, go, icon, openModal, toast, ui } from './interface.js';
import { loadLib } from './libs.js';
import { afterRender } from './registro.js';
import { datalists } from './telas/materiais.js';
import { $, esc, fmtBRL, fmtDateTime, fmtInput, norm, parseBR } from './util.js';

/* Itens iniciais extraídos das planilhas "VALORES UNITÁRIOS - MATERIAIS" e "LISTA DE CUSTO" (Drive, 2026).
   Use Ferramentas > Catálogo de materiais > Importar para carregar a tabela completa e atualizada. */
/* O catálogo (tabela de valores unitários) fica no servidor; o inicial é carregado de
   data/catalogo-inicial.json na primeira execução (arquivo fora do git). */
function catalogo(){
  if (!Array.isArray(db.catalogo)) db.catalogo = [];
  if (!db.settings.catalogoTabela) db.settings.catalogoTabela = '01';
  return db.catalogo;
}
function catalogFind(codigo, descricao){
  const cat = catalogo(); const pref = db.settings.catalogoTabela || '';
  const c = String(codigo||'').trim();
  let list = c ? cat.filter(x=>String(x.codigo).trim()===c) : [];
  if (!list.length && descricao){ const n = norm(descricao); list = cat.filter(x=>norm(x.descricao)===n); }
  if (!list.length) return null;
  return list.find(x=>x.tabela===pref) || list[list.length-1]; // sem tabela preferencial: a mais recente importada
}
function vCatalogo(){
  const cat = catalogo(); const q = norm(ui.catQ||''); const tabs = [...new Set(cat.map(x=>x.tabela).filter(Boolean))].sort();
  const list = cat.filter(x=>(!q || norm(x.codigo).includes(q) || norm(x.descricao).includes(q)) && (!ui.catTab || x.tabela===ui.catTab)).slice(0,400);
  return `<div class="pg-head"><div><h1 class="pg">Catálogo de materiais</h1><p class="pg-sub">Tabela de valores unitários da empresa (planilhas do Drive), compartilhada por todos os usuários. Ao cadastrar ou importar materiais, o sistema procura a descrição aqui e preenche unidade e valor unitário. A tabela preferencial (01 · ClickIP) é usada primeiro.</p></div>
    <div class="btns"><button class="btn primary" data-action="cat-import">${icon('importar')}Importar planilha de valores</button><button class="btn" data-action="cat-add">${icon('plus')}Adicionar item</button><button class="btn" data-action="cat-reset">Restaurar itens iniciais</button></div></div>
  <div class="card"><div class="toolbar">
    <input class="inp search" id="catQ" placeholder="Pesquisar por código ou descrição…" value="${esc(ui.catQ||'')}">
    <select class="inp" id="catTab"><option value="">Todas as tabelas</option>${tabs.map(t=>`<option value="${esc(t)}" ${ui.catTab===t?'selected':''}>${esc(catTabLabel(t))}</option>`).join('')}</select>
    <label style="font-size:12.5px">Tabela preferencial: <select class="inp" id="catPref" style="width:auto"><option value="">Qualquer</option>${tabs.map(t=>`<option value="${esc(t)}" ${db.settings.catalogoTabela===t?'selected':''}>${esc(catTabLabel(t))}</option>`).join('')}</select></label>
    <span class="muted" style="font-size:12px">${cat.length} item(ns) · atualizado em ${fmtDateTime(db.catalogoAtualizadoEm)}</span></div>
  <div class="tbl-wrap" style="max-height:62vh"><table class="tbl compact"><thead><tr><th>Código</th><th>Descrição</th><th>Unidade</th><th class="num">Valor unitário</th><th>Tabela</th><th>Fonte</th><th></th></tr></thead><tbody>
  ${list.map(x=>{ const i = cat.indexOf(x); return `<tr><td><b>${esc(x.codigo)}</b></td><td>${esc(x.descricao)}</td><td>${esc(x.unidade)}</td><td class="num">${fmtBRL(x.valor)}</td><td style="white-space:nowrap">${esc(catTabLabel(x.tabela||''))}</td><td class="muted" style="font-size:11.5px">${esc(x.fonte||'')}</td>
    <td class="act"><button class="btn sm icon" data-action="cat-edit" data-i="${i}" title="Editar">${icon('edit')}</button><button class="btn sm icon danger" data-action="cat-del" data-i="${i}" title="Excluir">${icon('trash')}</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Nenhum item encontrado.</td></tr>'}
  </tbody></table></div>
  ${cat.filter(x=>(!q || norm(x.codigo).includes(q) || norm(x.descricao).includes(q))).length>400?'<p class="muted" style="font-size:12px">Exibindo os primeiros 400 itens — refine a pesquisa.</p>':''}
  <p class="muted" style="font-size:12px">Para atualizar: exporte do Drive a planilha "VALORES UNITÁRIOS - MATERIAIS" (ou "PADRÃO - LISTA DE MATERIAIS", aba de estoque) em .xlsx e importe aqui. Cada aba vira uma tabela (01, 02, 03…).</p></div>
  <input type="file" id="catFile" class="hidden" accept=".xlsx,.xls,.csv">`;
}
afterRender.catalogo = ()=>{
  $('#catQ').addEventListener('input', debounce(e=>{ ui.catQ = $('#catQ').value; const pos = $('#catQ').selectionStart; go('catalogo'); const i=$('#catQ'); i.focus(); try{ i.setSelectionRange(pos,pos);}catch(e){} }, 300));
  $('#catTab').addEventListener('change', e=>{ ui.catTab = e.target.value; go('catalogo'); });
  $('#catPref').addEventListener('change', e=>{ db.settings.catalogoTabela = e.target.value; saveDB(); toast('Tabela preferencial definida.','ok'); });
  $('#catFile').addEventListener('change', async e=>{ const f = e.target.files[0]; e.target.value=''; if (f) importCatalog(f); });
};
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
async function importCatalog(file){
  try {
    const ext = extOf(file.name); let sheets = [];
    if (ext==='csv') sheets = [{name: file.name.replace(/\.[^.]+$/,''), rows: parseCSV(decodeText(await file.arrayBuffer()))}];
    else { const X = await loadLib('xlsx'); const wb = X.read(new Uint8Array(await file.arrayBuffer()), {type:'array'}); sheets = wb.SheetNames.map(n=>({name:n, rows:sheetRows(wb.Sheets[n])})); }
    const res = [];
    for (const sh of sheets){
      const det = detectHeader(sh.rows, 'materiais'); if (!det || det.mapping.codigo==null || det.mapping.nome==null) continue;
      const m = det.mapping; const vcol = m.valorUnitario!=null ? m.valorUnitario : m.valorTotal;
      const itens = [];
      for (let i=det.row+1;i<sh.rows.length;i++){ const r = sh.rows[i]||[]; const cod = String(r[m.codigo]==null?'':r[m.codigo]).trim(); const desc = String(r[m.nome]==null?'':r[m.nome]).replace(/\s+/g,' ').trim();
        if (!cod || !desc || TOTAL_LINE.test(norm(desc))) continue;
        const v = vcol!=null ? parseBR(r[vcol]) : null;
        itens.push({codigo:cod, descricao:desc, unidade: m.unidade!=null ? (normalizeUnit(r[m.unidade])||'Unidade') : (/^cabo /i.test(desc)?'Metro':'Unidade'), valor: v==null?0:Math.max(0,v), tabela: sh.name, fonte: file.name}); }
      if (itens.length) res.push({tabela:sh.name, itens});
    }
    if (!res.length) return toast('Nenhuma aba com colunas de código e descrição foi reconhecida.','err',6000);
    const ok = await confirmDialog({title:'Importar catálogo', message:`<b>${esc(file.name)}</b><br><br>${res.map(r=>`Aba <b>${esc(r.tabela)}</b>: ${r.itens.length} item(ns)`).join('<br>')}<br><br><label><input type="checkbox" id="catReplace" checked> Substituir os itens existentes das tabelas com o mesmo nome</label>`, okText:'Importar'});
    if (!ok) return;
    const replace = !!(confirmDialog.checks||{}).catReplace;
    let cat = catalogo();
    if (replace){ const tabs = new Set(res.map(r=>r.tabela)); cat = cat.filter(x=>!tabs.has(x.tabela)); }
    let n=0; res.forEach(r=>r.itens.forEach(it=>{ const ex = cat.find(x=>x.tabela===it.tabela && String(x.codigo)===String(it.codigo)); if (ex) Object.assign(ex, it); else cat.push(it); n++; }));
    db.catalogo = cat; db.catalogoAtualizadoEm = new Date().toISOString(); saveDB(); go('catalogo'); toast(`${n} item(ns) importado(s) para o catálogo.`,'ok',5000);
  } catch(err){ toast('Erro ao importar o catálogo: '+err.message,'err',7000); }
}
function catItemForm(i){
  const cat = catalogo(); const x = i!=null ? cat[i] : {codigo:'',descricao:'',unidade:'Unidade',valor:0,tabela:db.settings.catalogoTabela||'01',fonte:'Manual'};
  const ov = openModal(`<div class="mh"><h3>${i!=null?'Editar':'Adicionar'} item do catálogo</h3><button class="btn icon" data-x>${icon('x')}</button></div><div class="mb">${datalists()}<div class="form-grid">
    <div class="fld"><label>Código *</label><input class="inp" name="codigo" value="${esc(x.codigo)}"></div><div class="fld span2"><label>Descrição *</label><input class="inp" name="descricao" value="${esc(x.descricao)}"></div>
    <div class="fld"><label>Unidade</label><input class="inp" name="unidade" list="dlUn" value="${esc(x.unidade)}"></div><div class="fld"><label>Valor unitário (R$)</label><input class="inp num" name="valor" value="${esc(fmtInput(x.valor,4))}"></div><div class="fld"><label>Tabela</label><input class="inp" name="tabela" value="${esc(x.tabela||'')}"></div>
  </div><div class="auth-err" id="ciErr"></div></div><div class="mf"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar</button></div>`, {size:'sm'});
  const F = n => ov.querySelector(`[name="${n}"]`).value.trim();
  ov.addEventListener('click', e=>{ if (e.target.closest('[data-x]')) return closeModal(ov); if (!e.target.closest('[data-ok]')) return;
    const v = parseBR(F('valor')); if (!F('codigo') || !F('descricao')) return $('#ciErr',ov).textContent='Informe código e descrição.'; if (v==null || v<0) return $('#ciErr',ov).textContent='Valor inválido.';
    const it = {codigo:F('codigo'), descricao:F('descricao'), unidade:F('unidade')||'Unidade', valor:v, tabela:F('tabela'), fonte: i!=null ? (x.fonte||'Manual') : 'Manual'};
    if (i!=null) Object.assign(cat[i], it); else cat.push(it);
    db.catalogoAtualizadoEm = new Date().toISOString(); saveDB(); closeModal(ov); go('catalogo'); });
}
function catalogDatalist(){
  const cat = catalogo();
  return `<datalist id="dlCatDesc">${cat.slice(0,3000).map(x=>`<option value="${esc(x.descricao)}">${esc(x.codigo)} · ${fmtBRL(x.valor)}</option>`).join('')}</datalist><datalist id="dlCatCod">${cat.slice(0,3000).map(x=>`<option value="${esc(x.codigo)}">${esc(x.descricao)}</option>`).join('')}</datalist>`;
}

export { catItemForm, catalogDatalist, catalogFind, catalogo, vCatalogo };
