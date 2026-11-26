/* ---------- Estado e telas do assistente de importação ---------- */
import { cur, db, myProjects, saveDB, touch } from '../armazenamento.js';
import { svcTotal, totals } from '../calculos.js';
import { applyCatalogRow, catCell, setCatalogChoice } from '../catalogo-busca.js';
import { findMatDup, findSvcDup } from '../classificacao.js';
import { alignByHeader, autoMapRow, decodeText, detectHeader, extractPdf, fieldsFor, ocrSources, parseCSV, parseLinesHeuristic, rowsFromMapping } from './leitura.js';
import { confirmDialog, go, icon, toast, ui } from '../interface.js';
import { libGet, loadLib } from '../libs.js';
import { afterRender } from '../registro.js';
import { projHeader } from '../telas/comum.js';
import { noProject } from '../telas/identificacao.js';
import { datalists } from '../telas/materiais.js';
import { myPrest } from '../telas/servicos.js';
import { $, $$, deepClone, esc, fmtBRL, fmtDateTime, fmtInput, fmtNum, norm, normKey, parseBR, round2, uid } from '../util.js';

let imp = null;
const descartarImportacao = () => { imp = null; };
const histTipo = t => t==='servicos' ? 'Serviços' : t==='misto' ? 'Materiais e serviços' : 'Materiais';
function histItems(p, h){
  if (h.itens) return {mats:p.materiais.filter(m=>m.importId===h.id), svcs:p.servicos.filter(s=>s.importId===h.id), legacy:false};
  return {mats:p.materiais.filter(m=>!m.importId && m.origem===h.arquivo), svcs:p.servicos.filter(s=>!s.importId && s.origem===h.arquivo), legacy:true};
}
function vImportar(){
  const p = cur(); if(!p) return noProject();
  const hist = p.importacoes.slice().reverse();
  const pre = (imp && imp.preset) || (!imp && ui.importPreset) || null;
  return projHeader(pre ? `Importar lista de ${pre.categoria==='ativacao'?'materiais de ativação':'materiais de obra'}` : 'Importar documentos', pre ? 'O sistema extrai a descrição e a quantidade de cada material do arquivo, procura cada item no catálogo e preenche o valor unitário. Confira e confirme — nada é adicionado antes disso.' : 'Aproveite planilhas e PDFs existentes. Nada é adicionado ao projeto antes da sua confirmação, e cada importação pode ser excluída depois.') + `
  <div class="card" id="impStart" ${imp?'style="display:none"':''}>
    <div class="drop" id="drop">
      <div class="big">${pre ? `Arraste a lista de ${pre.categoria==='ativacao'?'materiais de ativação':'materiais de obra'} aqui ou selecione` : 'Arraste arquivos aqui ou selecione'}</div>
      <div class="muted mt8">Formatos aceitos: Excel (.xlsx, .xls), CSV (.csv), PDF (.pdf, inclusive digitalizados via OCR) e imagens (.png, .jpg)</div>
      <div class="btns mt16" style="justify-content:center">
        <button class="btn primary" id="btnOne">${icon('importar')}Selecionar arquivo</button>
        <button class="btn navy" id="btnMany">${icon('copy')}IMPORTAR E CONSOLIDAR MENSURAÇÃO</button>
      </div>
      <div class="muted mt8" style="font-size:12px">Consolidação: selecione vários arquivos (ex.: planilha de obra, planilha de ativação, PDF de mão de obra, planilha de outra empresa). Cada arquivo — e cada aba de planilha — é conferido individualmente e tudo é somado no mesmo projeto.<br>
      O sistema reconhece cabeçalhos em uma ou duas linhas, títulos de seção (ex.: "MATERIAIS DE ATIVAÇÃO", "SERVIÇOS"), descrições quebradas em mais de uma linha no PDF e arquivos com materiais e serviços juntos.</div>
    </div>
    <input type="file" id="fOne" class="hidden" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg">
    <input type="file" id="fMany" class="hidden" multiple accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg">
  </div>
  <div class="card ${imp?'':'hidden'}" id="impWizard"></div>
  <div class="card"><h2>Histórico de importações <span class="hint">${esc(p.info.nome)}</span></h2>
    ${hist.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Arquivo</th><th>Formato</th><th>Conteúdo</th><th>Data</th><th class="num" title="Identificados / importados / ainda no projeto">Itens<br><span style="font-weight:400">ident. / import. / no proj.</span></th><th>Status</th><th>Ações</th><th>Detalhes</th></tr></thead><tbody>
    ${hist.map(h=>{ const it = histItems(p,h); const noProj = h.desfeita ? 0 : it.mats.length + it.svcs.length; const can = !h.desfeita && (noProj>0 || (h.atualizados||[]).length>0);
      return `<tr><td style="min-width:150px"><b>${esc(h.arquivo)}</b></td><td style="white-space:nowrap">${esc(h.formato)}</td><td>${histTipo(h.tipo)}</td><td style="white-space:nowrap">${fmtDateTime(h.data)}</td><td class="num">${h.identificados} / ${h.importados} / ${h.importados>0?noProj:'—'}</td>
      <td><span class="badge ${h.desfeita?'b-gray':/Conclu/.test(h.status)?'b-ok':/Cancel/.test(h.status)?'b-gray':/Erro/.test(h.status)?'b-err':'b-warn'}">${esc(h.status)}</span></td><td class="act" style="text-align:left">${can?`<button class="btn sm danger" data-action="imp-undo" data-id="${h.id}" title="Excluir do projeto os itens adicionados por esta importação">${icon('trash')}Excluir</button>`:''}<button class="btn sm icon" data-action="imp-hist-del" data-id="${h.id}" title="Remover apenas o registro do histórico">${icon('x')}</button></td><td class="muted" style="font-size:12px;min-width:240px;max-width:380px">${esc(h.detalhes||'')}</td></tr>`; }).join('')}
    </tbody></table></div>`:'<div class="muted">Nenhuma importação realizada neste projeto.</div>'}
  </div>`;
}
afterRender.importar = ()=>{
  if (!$('#drop')) return;
  if (!imp && ui.importPreset && !ui.importPresetKeep) { ui.importPresetKeep = true; } else if (!imp) { ui.importPreset = null; ui.importPresetKeep = false; }
  $('#btnOne').onclick = ()=>$('#fOne').click();
  $('#btnMany').onclick = ()=>$('#fMany').click();
  $('#fOne').onchange = e=>{ const f=[...e.target.files]; e.target.value=''; startImport(f); };
  $('#fMany').onchange = e=>{ const f=[...e.target.files]; e.target.value=''; startImport(f); };
  const d = $('#drop');
  d.addEventListener('dragover', e=>{ e.preventDefault(); d.classList.add('over'); });
  d.addEventListener('dragleave', ()=>d.classList.remove('over'));
  d.addEventListener('drop', e=>{ e.preventDefault(); d.classList.remove('over'); startImport([...e.dataTransfer.files]); });
  if (imp) renderWizard();
};
const extOf = n => (String(n).split('.').pop()||'').toLowerCase();
function hintsFromName(name){
  const nn = norm(name); const h = {};
  if (/servic|mao de obra|mao-de-obra|mao_de_obra|\bm\.?o\b/.test(nn)) h.tipo = 'servicos';
  else if (/ativa/.test(nn)) { h.categoria = 'ativacao'; h.tipo = 'materiais'; }
  else if (/\bobra/.test(nn)) { h.categoria = 'obra'; h.tipo = 'materiais'; }
  return h;
}
function startImport(files){
  files = files.filter(f=>['xlsx','xls','csv','pdf','png','jpg','jpeg'].includes(extOf(f.name)));
  if (!files.length) return toast('Nenhum arquivo em formato suportado.','err');
  imp = { queue:files.map(f=>({file:f})), idx:0, resumo:[], preset: ui.importPreset || null };
  $('#impStart').style.display='none'; $('#impWizard').classList.remove('hidden');
  beginFile();
}
function beginFile(){
  const item = imp.queue[imp.idx]; const f = item.file;
  const h = hintsFromName(item.sheet ? f.name+' '+item.sheet : f.name);
  const cfg = item.cfg ? Object.assign({}, item.cfg) : {tipo:'auto', empresa:db.settings.empresaPadrao||'', categoria:db.settings.categoriaPadrao||'auto', forceOcr:false};
  if (h.tipo && (!item.cfg || item.cfg.tipo==='auto')) cfg.tipo = h.tipo;
  if (h.categoria && (!item.cfg || item.cfg.categoria==='auto')) cfg.categoria = h.categoria;
  if (imp.preset){ cfg.tipo = 'materiais'; cfg.categoria = imp.preset.categoria; cfg.forcar = true; }
  if (cfg.catalogo==null) cfg.catalogo = true; if (cfg.catNome==null) cfg.catNome = true;
  Object.assign(imp, { item, file:f, ext:extOf(f.name), step:'config', cfg,
    wb:item.wb||null, sheet:item.sheet||null, table:null, headerRow:0, mapping:{}, rows:null, source:'', lines:null, struct:null, msg:'', prog:0, error:'', pvFilter:'todos', mode:null, ocrPages:null, mapRemembered:false });
  renderWizard();
}
const STEP_NAMES = [['config','Configuração'],['sheet','Abas'],['mapping','Colunas'],['preview','Conferência']];
function wizHeader(){
  const steps = STEP_NAMES.filter(s=> s[0]!=='sheet' || (['xlsx','xls'].includes(imp.ext) && !imp.item.sheet));
  const order = steps.map(s=>s[0]); const ci = order.indexOf(imp.step==='loading'?'config':imp.step);
  return `<div class="wiz-head"><div><h2 style="margin:0">Arquivo ${imp.idx+1} de ${imp.queue.length}: ${esc(imp.file.name)}${imp.sheet?` <span class="badge b-tipo">aba: ${esc(imp.sheet)}</span>`:''}</h2>
    <div class="muted" style="font-size:12px">${(imp.file.size/1024).toFixed(1)} KB · ${imp.ext.toUpperCase()}${imp.queue.length>1?' · Consolidação de '+imp.queue.length+' arquivos/abas':''}</div></div>
    <button class="btn danger sm" data-imp="abort">${icon('x')}Cancelar ${imp.queue.length>1?'todas as importações restantes':'importação'}</button></div>
    <div class="steps">${steps.map(([k,l],i)=>`<span class="${i===ci?'on':i<ci?'done':''}">${i+1}. ${l}</span>`).join('')}</div>`;
}
function renderWizard(){
  const W = $('#impWizard'); if (!W || !imp) return;
  if (imp.step==='done'){ W.innerHTML = wizDone(); bindWizard(); return; }
  let body = '';
  if (imp.step==='config') body = wizConfig();
  else if (imp.step==='loading') body = `<div class="alert info" id="impMsg">${esc(imp.msg||'Processando…')}</div><div class="progress"><div id="impBar" style="width:${Math.round((imp.prog||0)*100)}%"></div></div>`;
  else if (imp.step==='error') body = `<div class="alert err"><b>Não foi possível ler o arquivo.</b><br>${esc(imp.error)}</div><div class="btns"><button class="btn" data-imp="back-config">Voltar</button><button class="btn primary" data-imp="skip">${imp.idx+1<imp.queue.length?'Ir para o próximo arquivo':'Concluir'}</button></div>`;
  else if (imp.step==='sheet') body = wizSheets();
  else if (imp.step==='mapping') body = wizMapping();
  else if (imp.step==='preview'){ if (imp.rows && imp.rows.length) imp.rows.forEach(r=>applyCatalogRow(r, imp.cfg)); body = wizPreview(); }
  W.innerHTML = wizHeader() + body;
  bindWizard();
}
function wizConfig(){
  const c = imp.cfg; const isPdf = imp.ext==='pdf';
  return `<div class="form-grid">
    <div class="fld"><label>Conteúdo do arquivo</label><select class="inp" id="cTipo">
      <option value="auto" ${c.tipo==='auto'?'selected':''}>Detectar automaticamente (materiais e serviços)</option>
      <option value="materiais" ${c.tipo==='materiais'?'selected':''}>Somente materiais</option>
      <option value="servicos" ${c.tipo==='servicos'?'selected':''}>Somente serviços e mão de obra</option></select></div>
    <div class="fld" id="cEmpWrap" ${c.tipo==='materiais'?'style="display:none"':''}><label>Prestadora padrão dos serviços <span class="muted">(quando não houver no arquivo)</span></label><input class="inp" id="cEmp" list="dlEmpPrest" value="${esc(c.empresa)}" placeholder="Ex.: Equipe Externa A"></div>
    <div class="fld" id="cCatWrap" ${c.tipo==='servicos'?'style="visibility:hidden"':''}><label>Categoria dos materiais <span class="muted">(quando não houver no arquivo)</span></label><select class="inp" id="cCat">
      <option value="auto" ${c.categoria==='auto'?'selected':''}>Detectar (seções e palavras-chave)</option><option value="obra" ${c.categoria==='obra'?'selected':''}>Material de obra</option><option value="ativacao" ${c.categoria==='ativacao'?'selected':''}>Material de ativação</option></select></div>
    <div class="fld full" id="cCatOpts" ${c.tipo==='servicos'?'style="display:none"':''}><label style="font-weight:400"><input type="checkbox" id="cCatalogo" ${c.catalogo!==false?'checked':''}> <b>Buscar os valores unitários no catálogo de materiais</b> (pela descrição de cada item; códigos e empresa do arquivo são ignorados)</label>
      <label style="font-weight:400"><input type="checkbox" id="cCatNome" ${c.catNome!==false?'checked':''}> Padronizar a descrição pelo catálogo quando a correspondência for alta</label></div>
    ${isPdf?`<div class="fld full"><label><input type="checkbox" id="cOcr" ${c.forceOcr?'checked':''}> Forçar OCR em todas as páginas (PDF digitalizado com camada de texto ruim). Páginas sem texto selecionável já usam OCR automaticamente.</label></div>`:''}
    ${['png','jpg','jpeg'].includes(imp.ext)?'<div class="full alert info">Imagem: o texto será extraído por OCR. Use imagens nítidas, retas e com boa resolução.</div>':''}
  </div>${datalists()}<datalist id="dlEmpPrest">${[...new Set([...myPrest().map(x=>x.nome), ...myProjects().flatMap(pj=>pj.materiais.map(m=>m.empresa))].filter(Boolean))].map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
  <div class="btns mt16">${imp.queue.length>1?'<button class="btn" data-imp="skip">Pular este arquivo</button>':''}<button class="btn primary" data-imp="read">${imp.item.wb?'Ler aba':'Ler arquivo'}</button></div>`;
}
function sheetRows(ws){ const X = libGet('xlsx'); return X ? X.utils.sheet_to_json(ws, {header:1, raw:true, defval:'', blankrows:false}) : []; }
function wizSheets(){
  const names = imp.wb.SheetNames;
  const info = names.map(n=>{ const rows = sheetRows(imp.wb.Sheets[n]); const det = rows.length ? detectHeader(rows, imp.cfg.tipo) : null; const h = hintsFromName(n);
    return {n, rows:rows.length, det:!!det, hint: h.tipo==='servicos'?'serviços':h.categoria==='ativacao'?'ativação':h.categoria==='obra'?'obra':''}; });
  if (!info.some(x=>x.det)) { const big = info.reduce((a,b)=>b.rows>a.rows?b:a, info[0]); big.det = true; }
  return `<div class="alert info">A planilha possui <b>${names.length} abas</b>. Marque as que devem ser importadas — cada aba será conferida separadamente e somada ao projeto.</div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:40px"><input type="checkbox" id="shAll"></th><th>Aba</th><th class="num">Linhas</th><th>Tabela reconhecida</th><th>Conteúdo sugerido pelo nome</th></tr></thead><tbody>
  ${info.map((x,i)=>`<tr><td><input type="checkbox" class="sheet-cb" value="${i}" ${x.det?'checked':''}></td><td><b>${esc(x.n)}</b></td><td class="num">${x.rows}</td><td>${x.det?'<span class="badge b-ok">Sim</span>':'<span class="muted">Não identificada</span>'}</td><td>${x.hint?`<span class="badge b-tipo">${x.hint}</span>`:'<span class="muted">—</span>'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="btns mt16"><button class="btn" data-imp="back-config">Voltar</button><button class="btn primary" data-imp="sheet-ok">Importar abas selecionadas</button></div>`;
}
function setProg(msg, p){
  if (msg!=null) imp.msg = msg; if (p!=null) imp.prog = p;
  const m = $('#impMsg'), b = $('#impBar');
  if (m && msg!=null) m.textContent = msg; if (b && p!=null) b.style.width = Math.round(p*100)+'%';
}
async function readCurrentFile(){
  imp.step='loading'; imp.msg='Lendo arquivo…'; imp.prog=0; renderWizard();
  const f = imp.file, ext = imp.ext;
  try {
    if (imp.item.wb && imp.item.sheet){ return goTabular(sheetRows(imp.item.wb.Sheets[imp.item.sheet]), 'planilha'); }
    if (ext==='csv'){
      goTabular(parseCSV(decodeText(await f.arrayBuffer())), 'csv');
    } else if (ext==='xlsx' || ext==='xls'){
      setProg('Carregando leitor de planilhas…', .2);
      const X = await loadLib('xlsx');
      const wb = X.read(new Uint8Array(await f.arrayBuffer()), {type:'array', cellDates:true});
      imp.wb = wb;
      const nonEmpty = wb.SheetNames.filter(n=>sheetRows(wb.Sheets[n]).length);
      if (nonEmpty.length>1){ imp.step='sheet'; renderWizard(); }
      else { imp.sheet = nonEmpty[0] || wb.SheetNames[0]; goTabular(sheetRows(wb.Sheets[imp.sheet]), 'planilha'); }
    } else if (ext==='pdf'){
      setProg('Carregando leitor de PDF…', .05);
      const r = await extractPdf(f, imp.cfg, setProg);
      imp.ocrPages = r.ocrPages;
      goText(r.lines, r.ocrPages.length ? 'pdf-ocr' : 'pdf', r.struct);
    } else {
      const lines = await ocrSources([async()=>f], setProg);
      goText(lines, 'imagem-ocr', null);
    }
  } catch(err){ console.error(err); imp.step='error'; imp.error = err.message || String(err); renderWizard(); }
}
const headerSig = row => (row||[]).map(c=>normKey(c)).filter(Boolean).join('|');
function rememberedMapping(row, ncol){
  const mem = (db.settings.mapMemory||{})[headerSig(row)];
  if (!mem) return null;
  const m = {}; for (const k in mem) if (mem[k]!=null && mem[k] < ncol) m[k] = mem[k];
  return Object.keys(m).length ? m : null;
}
function applyDetection(det){
  if (det.span===2){ imp.table = imp.table.slice(0, det.row).concat([det.comb], imp.table.slice(det.row+2)); }
  imp.headerRow = det.row; imp.headerSpan = det.span;
  const mem = rememberedMapping(imp.table[det.row], imp.table[det.row].length + 5);
  imp.mapping = mem || det.mapping; imp.mapRemembered = !!mem; imp.autoDetected = true;
}
function goText(lines, source, struct){
  imp.lines = lines.map(l=>String(l)).filter(l=>l.trim());
  if (!imp.lines.length){ imp.step='error'; imp.error='Nenhum texto foi encontrado no documento.'; return renderWizard(); }
  imp.source = source; imp.struct = struct;
  const table = struct ? struct.map(l=>l.cells.map(c=>c.t)) : imp.lines.map(l=>l.trim().split(/\s{2,}|\t|\s\|\s/).map(c=>c.trim()));
  const det = detectHeader(table, imp.cfg.tipo);
  if (det){
    if (struct && det.span===1){
      imp.table = alignByHeader(struct, det.row); imp.continuation = true; imp.aligned = true;
      applyDetection(Object.assign({}, det)); imp.step='mapping'; return renderWizard();
    }
    const hdrLen = (det.span===2 ? det.comb : table[det.row]).length;
    const data = table.slice(det.row+det.span).filter(r=>r.some(c=>/\d/.test(c)));
    const consistent = data.length && data.filter(r=>r.length===hdrLen).length/data.length >= .6;
    if (consistent){ imp.table = table; imp.continuation = true; applyDetection(det); imp.step='mapping'; return renderWizard(); }
  }
  imp.table = table; imp.headerRow = 0; imp.mapping = {}; imp.autoDetected = false;
  useHeuristic();
}
function useHeuristic(){
  imp.rows = parseLinesHeuristic(imp.lines, imp.cfg); imp.mode='linhas'; imp.stats = imp.rows.stats;
  markDups(); imp.step='preview'; renderWizard();
}
function goTabular(table, source){
  imp.table = table.map(r=>r.map(c=> c instanceof Date ? c.toLocaleDateString('pt-BR') : c));
  imp.source = source; imp.continuation = false; imp.aligned = false;
  if (!imp.table.length){ imp.step='error'; imp.error='A planilha/aba está vazia.'; return renderWizard(); }
  const det = detectHeader(imp.table, imp.cfg.tipo);
  if (det) applyDetection(det); else { imp.headerRow = 0; imp.mapping = {}; imp.autoDetected = false; }
  imp.step='mapping'; renderWizard();
}
function wizMapping(){
  const t = imp.table, hr = imp.headerRow, hdr = t[hr]||[];
  const ncol = Math.max(1, ...t.slice(hr, hr+60).map(r=>r.length), hdr.length);
  const sample = ci => { for (let i=hr+1;i<Math.min(t.length,hr+30);i++){ const v=t[i]&&t[i][ci]; if (v!==undefined && String(v).trim()!=='') return String(v); } return ''; };
  const colLabel = ci => `Coluna ${ci+1}${hdr[ci]!==undefined && String(hdr[ci]).trim()!==''?': '+String(hdr[ci]).slice(0,40):''}`;
  const flds = fieldsFor(imp.cfg.tipo).filter(([k])=>k!=='codigo' && !(k==='empresa' && imp.cfg.tipo==='materiais'));
  const mappedCols = flds.filter(([k])=>imp.mapping[k]!=null);
  const prevRows = t.slice(hr+1).filter(r=>r && r.some(c=>String(c).trim()!=='')).slice(0,8);
  const msg = imp.autoDetected===false ? '<div class="alert warn">Não foi possível identificar automaticamente o cabeçalho. Indique a linha de cabeçalho e associe as colunas manualmente.</div>'
    : imp.mapRemembered ? '<div class="alert ok">Este layout já foi importado antes: a associação de colunas usada da última vez foi aplicada. Confira e ajuste, se necessário.</div>'
    : `<div class="alert info">Colunas reconhecidas automaticamente${imp.headerSpan===2?' (cabeçalho em duas linhas combinado)':''}${imp.aligned?' — colunas do PDF alinhadas pela posição na página':''}. Confira e ajuste a associação, se necessário.</div>`;
  return `${msg}
  <div class="toolbar"><label class="fld" style="display:flex;align-items:center;gap:8px;margin:0"><span style="font-size:12px;font-weight:600">Linha do cabeçalho:</span>
    <input class="inp" id="mHr" type="number" min="1" max="${t.length}" value="${hr+1}" style="width:90px"></label>
    <button class="btn sm" data-imp="redetect">Detectar automaticamente</button>
    ${imp.lines?'<button class="btn sm" data-imp="heuristic">Usar leitura automática por linhas</button>':''}
    <span class="muted" style="font-size:12px">${t.length-hr-1} linha(s) abaixo do cabeçalho</span></div>
  <div class="tbl-wrap"><table class="tbl map-tbl"><thead><tr><th>Campo do sistema</th><th>Coluna do arquivo</th><th>Exemplo de valor</th></tr></thead><tbody>
  ${flds.map(([k,l])=>{ const ci = imp.mapping[k]; return `<tr><td><b>${l}</b>${(k==='nome' || (k==='quantidade' && imp.cfg.tipo!=='materiais'))?' <span style="color:var(--danger)">*</span>':''}</td>
    <td><select class="inp" data-map="${k}"><option value="">— não importar —</option>${Array.from({length:ncol},(_,i)=>`<option value="${i}" ${ci===i?'selected':''}>${esc(colLabel(i))}</option>`).join('')}</select></td>
    <td class="muted">${ci!=null?esc(sample(ci).slice(0,60)):''}</td></tr>`; }).join('')}
  </tbody></table></div>
  ${prevRows.length && mappedCols.length ? `<h2 class="mt16" style="font-size:13.5px">Prévia das primeiras linhas com esta associação</h2>
  <div class="tbl-wrap"><table class="tbl compact"><thead><tr>${mappedCols.map(([k,l])=>`<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
  ${prevRows.map(r=>`<tr>${mappedCols.map(([k])=>`<td>${esc(String(r[imp.mapping[k]]==null?'':r[imp.mapping[k]]).slice(0,60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}
  <p class="muted" style="font-size:12px">Valores no padrão brasileiro (ex.: R$ 1.250,50) são reconhecidos. No sistema o valor total é sempre Quantidade × Valor unitário. Se o arquivo trouxer apenas o valor total, o unitário é obtido a partir dele. Linhas de título/seção sem valores são ignoradas e usadas para classificar os itens seguintes.</p>
  <div class="btns"><button class="btn" data-imp="back-config">Voltar</button><button class="btn primary" data-imp="map-ok">Pré-visualizar itens</button></div>`;
}
function markDups(){
  const p = cur();
  imp.rows.forEach(r=>{
    const d = r.categoria==='servico' ? findSvcDup(r, p.servicos) : findMatDup(r, p.materiais);
    r.dup = d ? d.id : null;
    if (!d) r.dupAction = 'ignorar';
  });
}
function rowErrors(r){
  const e = [];
  if (!String(r.nome).trim()) e.push('descrição');
  if (r.quantidade==null || !(r.quantidade>0)) e.push('quantidade > 0');
  if (r.valorTotal<0 || r.valorUnitario<0) e.push('valor negativo');
  if (r.categoria==='servico' && !String(r.empresa).trim()) e.push('prestadora');
  return e;
}
const pvFilters = [['todos','Todos'],['pend','Pendências'],['dup','Duplicados'],['mat','Materiais'],['svc','Serviços']];
function pvVisible(r, f){
  return f==='todos' || (f==='pend' && (rowErrors(r).length || r.aviso)) || (f==='dup' && r.dup) || (f==='mat' && r.categoria!=='servico') || (f==='svc' && r.categoria==='servico');
}
function wizPreview(){
  const rows = imp.rows; const f = imp.pvFilter||'todos'; const st = imp.stats || rows.stats || {};
  const info = imp.mode==='linhas' ? `<div class="alert warn">Itens identificados por leitura automática de linhas${String(imp.source).includes('ocr')?' (OCR)':''}. Confira com atenção descrições, quantidades e valores antes de confirmar.</div>` : '';
  const ocr = imp.ocrPages && imp.ocrPages.length ? `<div class="alert info">OCR aplicado nas páginas: ${imp.ocrPages.join(', ')}.</div>` : '';
  const notes = [];
  if (st.secoes) notes.push(`${st.secoes} título(s) de seção usados para classificar os itens`);
  if (st.continuacoes) notes.push(`${st.continuacoes} linha(s) de descrição quebrada unidas ao item anterior`);
  if (st.cabecalhos) notes.push(`${st.cabecalhos} cabeçalho(s) repetido(s) ignorado(s)`);
  if (st.titulos) notes.push(`${st.titulos} linha(s) sem quantidade/valores ignoradas (títulos ou observações)`);
  const stInfo = notes.length ? `<div class="alert info" style="font-size:12.5px">${notes.join(' · ')}.</div>` : '';
  if (!rows.length) return info+ocr+stInfo+`<div class="alert err">Nenhum item foi identificado neste arquivo.</div><div class="btns">${imp.table?'<button class="btn" data-imp="to-mapping">Associar colunas manualmente</button>':''}<button class="btn" data-imp="back-config">Voltar</button><button class="btn primary" data-imp="skip">${imp.idx+1<imp.queue.length?'Próximo arquivo':'Concluir'}</button></div>`;
  const cnt = k => rows.filter(r=>pvVisible(r,k)).length;
  const vis = rows.map((r,i)=>[r,i]).filter(([r])=>pvVisible(r,f));
  return info + ocr + stInfo + `
  <div class="toolbar"><div class="tabs" style="margin:0">${pvFilters.map(([k,l])=>`<button type="button" class="${f===k?'on':''}" data-imp="pvf" data-f="${k}">${l} (${cnt(k)})</button>`).join('')}</div></div>
  <div class="bulk">
    <button class="btn sm" data-imp="sel-all">Selecionar exibidos</button><button class="btn sm" data-imp="sel-none">Desmarcar exibidos</button>
    <span class="muted">|</span>
    ${imp.cfg.tipo!=='materiais'?`<input class="inp" id="bEmp" list="dlEmpPrest" placeholder="Prestadora (serviços)" style="width:190px"><button class="btn sm" data-imp="bulk-emp">Aplicar aos serviços selecionados</button>`:''}
    <select class="inp" id="bCat" style="width:auto"><option value="obra">Material de obra</option><option value="ativacao">Material de ativação</option><option value="servico">Serviço / mão de obra</option></select><button class="btn sm" data-imp="bulk-cat">Classificar selecionados</button>
    <select class="inp" id="bDup" style="width:auto"><option value="ignorar">Duplicados: ignorar</option><option value="atualizar">Duplicados: atualizar existente</option><option value="novo">Duplicados: importar como novo</option></select><button class="btn sm" data-imp="bulk-dup">Aplicar</button>
  </div>${datalists()}<datalist id="dlEmpPrest">${[...new Set([...myPrest().map(x=>x.nome), ...myProjects().flatMap(pj=>pj.materiais.map(m=>m.empresa))].filter(Boolean))].map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
  <div class="tbl-wrap" style="max-height:60vh"><table class="tbl compact" id="pvTbl"><thead><tr><th><input type="checkbox" id="pvAll" ${vis.every(([r])=>r.sel)?'checked':''}></th><th>#</th>
    <th>Classificação</th>${imp.cfg.tipo!=='materiais'?'<th>Prestadora (serviços)</th>':''}<th>Descrição</th><th>Item do catálogo (valor)</th><th>Unid.</th><th class="num">Qtd.</th><th class="num">Valor unit.</th><th class="num">Valor total</th><th>Duplicidade</th><th>Situação</th></tr></thead>
  <tbody>${vis.length ? vis.map(([r,i])=>pvRow(r,i)).join('') : '<tr><td colspan="12" class="empty">Nenhum item neste filtro.</td></tr>'}</tbody></table></div>
  <div class="foot-sum" id="pvSum"></div>
  <div class="btns mt16">${imp.table ? `<button class="btn" data-imp="to-mapping">${imp.mode==='colunas'?'Voltar ao mapeamento':'Associar colunas manualmente'}</button>`:''}${imp.lines && imp.mode!=='linhas'?'<button class="btn" data-imp="heuristic">Tentar leitura por linhas</button>':''}<button class="btn" data-imp="cancel-file">Cancelar este arquivo</button><button class="btn ok" data-imp="confirm">Confirmar importação</button></div>`;
}
function pvRow(r, i){
  const errs = rowErrors(r); const svc = r.categoria==='servico';
  const p = cur();
  const dupItem = r.dup ? (svc ? p.servicos.find(s=>s.id===r.dup) : p.materiais.find(m=>m.id===r.dup)) : null;
  const dupLbl = dupItem ? (svc ? `${dupItem.descricao} · ${fmtNum(dupItem.quantidade)} ${dupItem.unidade} · ${fmtBRL(svcTotal(dupItem))}` : `${dupItem.nome} · ${fmtNum(dupItem.quantidade)} ${dupItem.unidade} · ${fmtBRL(dupItem.valorTotal)}`) : '';
  const inp = (k,v,cls,w)=>`<input class="inp ${cls||''}" data-k="${k}" value="${esc(v)}" ${w?`style="min-width:${w}px"`:''} ${k==='empresa'?'list="dlEmpPrest"':''}>`;
  return `<tr data-i="${i}" class="${r.sel?'':'unsel'} ${r.sel&&errs.length?'invalid':''}"><td><input type="checkbox" data-k="sel" ${r.sel?'checked':''}></td><td class="muted">${i+1}</td>
    <td><select class="inp" data-k="categoria" style="min-width:105px"><option value="obra" ${r.categoria==='obra'?'selected':''}>Obra</option><option value="ativacao" ${r.categoria==='ativacao'?'selected':''}>Ativação</option><option value="servico" ${svc?'selected':''}>Serviço</option></select></td>
    ${imp.cfg.tipo!=='materiais'?`<td>${svc?inp('empresa',r.empresa,'',120):'<span class="muted">—</span>'}</td>`:''}<td>${inp('nome',r.nome,'',240)}</td><td>${catCell(r)}</td>
    <td>${inp('unidade',r.unidade,'',80)}</td><td>${inp('quantidade',r.quantidade==null?'':fmtInput(r.quantidade,4),'num',70)}</td>
    <td>${inp('valorUnitario',fmtInput(r.valorUnitario,4),'num',85)}</td><td class="num" style="white-space:nowrap;min-width:95px" title="Quantidade × Valor unitário"><b>${fmtBRL(round2((r.quantidade||0)*r.valorUnitario))}</b></td>
    <td class="dup-cell">${dupItem?`<span class="lbl" title="${esc(dupLbl)}">Possível duplicado: ${esc(dupLbl)}</span><select class="inp" data-k="dupAction"><option value="ignorar" ${r.dupAction==='ignorar'?'selected':''}>Ignorar item</option><option value="atualizar" ${r.dupAction==='atualizar'?'selected':''}>Atualizar existente</option><option value="novo" ${r.dupAction==='novo'?'selected':''}>Importar como novo</option></select>`:'<span class="muted">—</span>'}</td>
    <td>${errs.length?`<span class="badge b-err" title="Corrija: ${esc(errs.join(', '))}">Corrigir: ${esc(errs.join(', '))}</span>`:r.aviso?`<span class="badge b-warn" title="${esc(r.aviso)}">Verificar</span>`:'<span class="badge b-ok">OK</span>'}</td></tr>`;
}
function pvSummary(){
  const rows = imp.rows, sel = rows.filter(r=>r.sel);
  const inval = sel.filter(r=>rowErrors(r).length).length;
  const dups = sel.filter(r=>r.dup).length;
  const go_ = sel.filter(r=>!(r.dup&&r.dupAction==='ignorar'));
  const vm = round2(go_.filter(r=>r.categoria!=='servico').reduce((a,r)=>a+round2((r.quantidade||0)*r.valorUnitario),0));
  const vs = round2(go_.filter(r=>r.categoria==='servico').reduce((a,r)=>a+round2((r.quantidade||0)*r.valorUnitario),0));
  const el = $('#pvSum'); if (!el) return;
  el.innerHTML = `<span>Identificados: <b>${rows.length}</b> · Selecionados: <b>${sel.length}</b> · Com pendência: <b style="color:${inval?'var(--danger)':'inherit'}">${inval}</b> · Possíveis duplicados: <b>${dups}</b></span><span>Materiais: <b>${fmtBRL(vm)}</b> · Serviços: <b>${fmtBRL(vs)}</b> · Total a importar: <b>${fmtBRL(round2(vm+vs))}</b></span>`;
}
function bindWizard(){
  const W = $('#impWizard');
  if (imp.step==='config'){
    $('#cTipo').onchange = e=>{ imp.cfg.tipo=e.target.value; $('#cCatWrap').style.visibility = e.target.value==='servicos'?'hidden':'visible'; $('#cEmpWrap').style.display = e.target.value==='materiais'?'none':''; $('#cCatOpts').style.display = e.target.value==='servicos'?'none':''; };
  }
  if (imp.step==='sheet'){
    $('#shAll').onchange = e=>$$('.sheet-cb',W).forEach(c=>c.checked=e.target.checked);
  }
  if (imp.step==='mapping'){
    $('#mHr').onchange = e=>{ const v = Math.max(1, Math.min(imp.table.length, parseInt(e.target.value)||1)); imp.headerRow=v-1; imp.mapping=autoMapRow(imp.table[v-1], imp.cfg.tipo); imp.mapRemembered=false; renderWizard(); };
    $$('[data-map]',W).forEach(s=>s.onchange=()=>{ imp.mapping[s.dataset.map] = s.value===''?null:parseInt(s.value); renderWizard(); });
  }
  if (imp.step==='preview' && imp.rows.length){
    pvSummary();
    const all = $('#pvAll'); if (all) all.onchange = e=>{ imp.rows.forEach(r=>{ if (pvVisible(r, imp.pvFilter)) r.sel=e.target.checked; }); renderWizard(); };
    const tb = $('#pvTbl tbody');
    tb.addEventListener('change', e=>{
      const el = e.target, tr = el.closest('tr[data-i]'); if(!tr) return;
      const i = +tr.dataset.i, r = imp.rows[i], k = el.dataset.k, svc = r.categoria==='servico';
      if (k==='sel') r.sel = el.checked;
      else if (k==='catSel'){ r.catSel = +el.value; setCatalogChoice(r, imp.cfg); markDups(); }
      else if (k==='nome' && !svc && r.catOpts){ r.nomeArquivo = el.value; r.nome = el.value; applyCatalogRow(r, imp.cfg, true); }
      else if (k==='quantidade'){ r.quantidade = parseBR(el.value); r.valorTotal = round2((r.quantidade||0)*r.valorUnitario); }
      else if (k==='valorUnitario'){ r.valorUnitario = parseBR(el.value)??0; r.valorTotal = round2((r.quantidade||0)*r.valorUnitario); }
      else if (k==='valorTotal'){ r.valorTotal = round2(parseBR(el.value)??0); r.valorUnitario = r.quantidade>0 ? r.valorTotal/r.quantidade : 0; }
      else r[k] = el.value;
      if (['quantidade','valorUnitario','valorTotal'].includes(k)) r.aviso = '';
      if (k==='categoria' && el.value!=='servico'){ r._catDone = false; applyCatalogRow(r, imp.cfg); }
      if (['empresa','codigo','nome','categoria'].includes(k)) markDups();
      if (k!=='dupAction') { const tmp = document.createElement('tbody'); tmp.innerHTML = pvRow(r, i); tr.replaceWith(tmp.firstElementChild); }
      pvSummary();
    });
  }
  W.onclick = async e=>{
    const b = e.target.closest('[data-imp]'); if(!b) return;
    const a = b.dataset.imp;
    if (a==='read'){
      imp.cfg.tipo = $('#cTipo').value; imp.cfg.empresa = $('#cEmp').value.trim(); imp.cfg.categoria = $('#cCat').value; imp.cfg.forceOcr = !!($('#cOcr')&&$('#cOcr').checked);
      imp.cfg.catalogo = $('#cCatalogo').checked; imp.cfg.catNome = $('#cCatNome').checked;
      if (imp.preset && imp.cfg.tipo==='materiais' && imp.cfg.categoria===imp.preset.categoria) imp.cfg.forcar = true; else imp.cfg.forcar = false;
      readCurrentFile();
    }
    else if (a==='sheet-ok'){
      const chosen = $$('.sheet-cb',W).filter(c=>c.checked).map(c=>imp.wb.SheetNames[+c.value]);
      if (!chosen.length) return toast('Marque pelo menos uma aba.','err');
      imp.sheet = chosen[0];
      const h = hintsFromName(imp.sheet);
      if (h.tipo && imp.cfg.tipo==='auto') imp.cfg.tipo = h.tipo;
      if (h.categoria && imp.cfg.categoria==='auto') imp.cfg.categoria = h.categoria;
      const cfgRest = Object.assign({}, imp.cfg); if (hintsFromName(imp.sheet).tipo) cfgRest.tipo = 'auto'; if (hintsFromName(imp.sheet).categoria) cfgRest.categoria = 'auto';
      imp.queue.splice(imp.idx+1, 0, ...chosen.slice(1).map(sh=>({file:imp.file, wb:imp.wb, sheet:sh, cfg:Object.assign({}, cfgRest)})));
      imp.item.sheet = imp.sheet; imp.item.wb = imp.wb;
      goTabular(sheetRows(imp.wb.Sheets[imp.sheet]), 'planilha');
    }
    else if (a==='back-config'){ imp.step='config'; imp.mode=null; renderWizard(); }
    else if (a==='redetect'){ const d = detectHeader(imp.table, imp.cfg.tipo); if (d){ applyDetection(d); } else { toast('Cabeçalho não identificado automaticamente.','err'); } renderWizard(); }
    else if (a==='heuristic'){ useHeuristic(); }
    else if (a==='to-mapping'){ if(!imp.table) return; imp.mode=null; imp.step='mapping'; renderWizard(); }
    else if (a==='map-ok'){
      if (imp.mapping.nome==null) return toast('Associe pelo menos a coluna de descrição.','err');
      if (imp.mapping.quantidade==null && imp.cfg.tipo!=='materiais') return toast('Associe pelo menos as colunas de descrição e quantidade.','err');
      if (imp.mapping.quantidade==null) toast('O arquivo não tem coluna de quantidade: os itens entram com quantidade 1 para você ajustar na conferência.','',6500);
      const sig = headerSig(imp.table[imp.headerRow]);
      if (sig){ db.settings.mapMemory = db.settings.mapMemory || {}; db.settings.mapMemory[sig] = Object.assign({}, imp.mapping);
        const keys = Object.keys(db.settings.mapMemory); if (keys.length>60) delete db.settings.mapMemory[keys[0]]; saveDB(); }
      imp.rows = rowsFromMapping(imp.table, imp.headerRow, imp.mapping, imp.cfg, {continuation:imp.continuation}); imp.stats = imp.rows.stats; imp.mode='colunas';
      markDups(); imp.step='preview'; renderWizard();
    }
    else if (a==='pvf'){ imp.pvFilter = b.dataset.f; renderWizard(); }
    else if (a==='sel-all'||a==='sel-none'){ imp.rows.forEach(r=>{ if (pvVisible(r, imp.pvFilter)) r.sel = a==='sel-all'; }); renderWizard(); }
    else if (a==='bulk-emp'){ const v=$('#bEmp').value.trim(); if(!v) return toast('Informe a prestadora.','err'); imp.rows.forEach(r=>{ if(r.sel && r.categoria==='servico') r.empresa=v; }); markDups(); renderWizard(); }
    else if (a==='bulk-cat'){ const v=$('#bCat').value; imp.rows.forEach(r=>{ if(r.sel){ r.categoria=v; if (v==='servico' && r.unidade==='Unidade') r.unidade='Serviço'; } }); markDups(); renderWizard(); }
    else if (a==='bulk-dup'){ const v=$('#bDup').value; imp.rows.forEach(r=>{ if(r.sel && r.dup) r.dupAction=v; }); renderWizard(); }
    else if (a==='confirm'){ confirmImport(); }
    else if (a==='cancel-file'){
      if (!(await confirmDialog({title:'Cancelar importação deste arquivo', message:'Nenhum item deste arquivo será adicionado. Os dados existentes no projeto não serão alterados.', okText:'Cancelar arquivo', danger:true}))) return;
      logImport('Cancelada', 0, 'Cancelada pelo usuário na conferência'); nextFile();
    }
    else if (a==='skip'){ logImport(imp.step==='error'?'Erro':'Cancelada', 0, imp.step==='error'?imp.error:'Arquivo ignorado'); nextFile(); }
    else if (a==='abort'){
      if (!(await confirmDialog({title:'Cancelar importação', message:`Os arquivos ainda não confirmados não serão importados. ${imp.resumo.length?'Arquivos já confirmados permanecem no projeto (podem ser excluídos pelo histórico).':'Nenhum dado do projeto será alterado.'}`, okText:'Cancelar importação', danger:true}))) return;
      if (imp.step!=='done') logImport('Cancelada', 0, 'Importação cancelada');
      for (let k=imp.idx+1;k<imp.queue.length;k++){ const q=imp.queue[k]; cur().importacoes.push({id:uid(), arquivo:q.file.name, formato:extOf(q.file.name).toUpperCase()+(q.sheet?' (aba: '+q.sheet+')':''), tipo:'materiais', data:new Date().toISOString(), identificados:0, importados:0, status:'Cancelada', detalhes:'Não processado'}); }
      touch(); imp=null; go('importar');
    }
    else if (a==='undo-session'){
      const ids = imp.resumo.filter(r=>r.histId && r.importados>0).map(r=>r.histId);
      if (!ids.length) return;
      if (!(await confirmDialog({title:'Desfazer importações', message:`Excluir do projeto todos os itens importados nesta sessão (${ids.length} arquivo(s)/aba(s)) e restaurar os registros que foram atualizados?`, okText:'Desfazer tudo', danger:true}))) return;
      let nm=0, ns=0; ids.slice().reverse().forEach(id=>{ const r = undoImport(id, true); nm+=r.mats; ns+=r.svcs; });
      touch(); imp=null; go('importar'); toast(`Importações desfeitas: ${nm} material(is) e ${ns} serviço(s) removidos.`,'ok',5000);
    }
    else if (a==='close'){ const pre = imp.preset; imp=null; ui.importPreset = null; ui.importPresetKeep = false; go(pre ? pre.categoria : 'importar'); }
  };
}
function logImport(status, importados, detalhes, extra){
  const p = cur(); extra = extra || {};
  const h = { id:extra.id||uid(), arquivo:imp.file.name, formato:imp.ext.toUpperCase()+(imp.sheet?' (aba: '+imp.sheet+')':''), tipo:extra.tipo||imp.cfg.tipo,
    data:new Date().toISOString(), identificados: imp.rows ? imp.rows.length : 0, importados, status, detalhes };
  if (extra.itens) { h.itens = extra.itens; h.atualizados = extra.atualizados||[]; h.valor = extra.valor||0; }
  p.importacoes.push(h);
  imp.resumo.push({arquivo:imp.file.name + (imp.sheet?' (aba: '+imp.sheet+')':''), status, importados, detalhes, histId: extra.itens ? h.id : null});
  touch();
}
function nextFile(){
  imp.idx++;
  if (imp.idx < imp.queue.length) beginFile();
  else { imp.step='done'; renderWizard(); }
}
async function confirmImport(){
  const p = cur();
  const sel = imp.rows.filter(r=>r.sel);
  if (!sel.length) return toast('Nenhum item selecionado.','err');
  const bad = sel.filter(r=>rowErrors(r).length);
  if (bad.length){ imp.pvFilter='pend'; renderWizard(); toast(`${bad.length} item(ns) selecionado(s) com pendência (exibidos agora). Corrija ou desmarque antes de confirmar.`,'err',6000); return; }
  const ign = sel.filter(r=>r.dup && r.dupAction==='ignorar').length;
  const upd = sel.filter(r=>r.dup && r.dupAction==='atualizar').length;
  const nS = sel.filter(r=>r.categoria==='servico' && !(r.dup && r.dupAction==='ignorar')).length;
  const nM = sel.filter(r=>r.categoria!=='servico' && !(r.dup && r.dupAction==='ignorar')).length;
  const ok = await confirmDialog({title:'Confirmar importação', message:`<b>${esc(imp.file.name)}</b>${imp.sheet?' — aba '+esc(imp.sheet):''}<br><br>Materiais: <b>${nM}</b> · Serviços: <b>${nS}</b><br>Novos registros: <b>${sel.length-ign-upd}</b><br>Registros existentes atualizados: <b>${upd}</b><br>Duplicados ignorados: <b>${ign}</b><br>Não selecionados: <b>${imp.rows.length-sel.length}</b><br><br><span class="muted">Você poderá excluir esta importação depois pelo histórico.</span>`, okText:'Importar'});
  if (!ok) return;
  const origem = imp.file.name + (imp.sheet ? ' / '+imp.sheet : '');
  const histId = uid(); const itens = {materiais:[], servicos:[]}; const atualizados = [];
  let added=0, updated=0, valor=0;
  for (const r of sel){
    if (r.dup && r.dupAction==='ignorar') continue;
    if (r.categoria==='servico'){
      const prl = myPrest().find(x=>norm(x.nome)===norm(r.empresa));
      const d = {descricao:r.nome.trim(), empresa:prl?prl.nome:r.empresa.trim(), prestadoraId:prl?prl.id:null, unidade:r.unidade||'Serviço', quantidade:r.quantidade, valorUnitario:r.valorUnitario};
      valor += round2(d.quantidade*d.valorUnitario);
      if (r.dup && r.dupAction==='atualizar'){ const ex = p.servicos.find(s=>s.id===r.dup); if (ex){ atualizados.push({tipo:'servico', id:ex.id, antes:deepClone(ex)}); Object.assign(ex, d, {origem}); updated++; continue; } }
      const id = uid(); p.servicos.push(Object.assign({id, origem, importId:histId}, d)); itens.servicos.push(id); added++;
    } else {
      const d = {empresa:'', codigo:'', nome:r.nome.trim(), categoria:r.categoria==='ativacao'?'ativacao':'obra', unidade:r.unidade||'Unidade', quantidade:r.quantidade, valorUnitario:r.valorUnitario, valorTotal:round2(r.quantidade*r.valorUnitario)};
      valor += d.valorTotal;
      if (r.dup && r.dupAction==='atualizar'){ const ex = p.materiais.find(m=>m.id===r.dup); if (ex){ atualizados.push({tipo:'material', id:ex.id, antes:deepClone(ex)}); Object.assign(ex, d, {origem}); updated++; continue; } }
      const id = uid(); p.materiais.push(Object.assign({id, origem, importId:histId}, d)); itens.materiais.push(id); added++;
    }
  }
  const status = (added+updated)===imp.rows.length ? 'Concluída' : (added+updated)>0 ? 'Concluída (parcial)' : 'Concluída sem itens';
  const tipo = nM && nS ? 'misto' : nS ? 'servicos' : 'materiais';
  const det = [`${added} novo(s)`, updated?`${updated} atualizado(s)`:'', ign?`${ign} duplicado(s) ignorado(s)`:'', (imp.rows.length-sel.length)?`${imp.rows.length-sel.length} não selecionado(s)`:''].filter(Boolean).join(', ') + ' · ' + fmtBRL(valor);
  logImport(status, added+updated, det, {id:histId, itens, atualizados, tipo, valor:round2(valor)});
  toast(`${added+updated} item(ns) importado(s) de ${imp.file.name}${imp.sheet?' ('+imp.sheet+')':''}.`,'ok');
  nextFile();
}
/* Exclui do projeto os itens adicionados por uma importação e restaura os registros atualizados por ela */
function undoImport(id, silent, restore){
  const p = cur(); const h = p.importacoes.find(x=>x.id===id); if (!h) return {mats:0, svcs:0, rest:0};
  const it = histItems(p, h);
  const mIds = new Set(it.mats.map(m=>m.id)), sIds = new Set(it.svcs.map(s=>s.id));
  p.materiais = p.materiais.filter(m=>!mIds.has(m.id));
  p.servicos = p.servicos.filter(s=>!sIds.has(s.id));
  let rest = 0;
  if (restore!==false) (h.atualizados||[]).forEach(u=>{
    const list = u.tipo==='servico' ? p.servicos : p.materiais;
    const ex = list.find(x=>x.id===u.id);
    const antes = deepClone(u.antes);
    if (u.tipo!=='servico'){ const q = Number(antes.quantidade)||0; if (antes.valorUnitario==null) antes.valorUnitario = q>0 ? (Number(antes.valorTotal)||0)/q : 0; antes.valorTotal = round2(q*antes.valorUnitario); }
    if (ex) Object.assign(ex, antes); else list.push(antes);
    rest++;
  });
  h.desfeita = new Date().toISOString(); h.status = 'Excluída';
  h.detalhes = (h.detalhes||'') + ` · Excluída em ${fmtDateTime(h.desfeita)} (${[mIds.size?mIds.size+' mat.':'', sIds.size?sIds.size+' serv.':''].filter(Boolean).join(' e ')||'nenhum item'} removido(s)${rest?`, ${rest} restaurado(s)`:''})`;
  return {mats:mIds.size, svcs:sIds.size, rest};
}
async function askUndoImport(id){
  const p = cur(); const h = p.importacoes.find(x=>x.id===id); if (!h) return;
  const it = histItems(p, h);
  const val = round2(it.mats.reduce((a,m)=>a+round2(m.valorTotal),0) + it.svcs.reduce((a,s)=>a+svcTotal(s),0));
  const nu = (h.atualizados||[]).length;
  const ok = await confirmDialog({title:'Excluir importação', message:`<b>${esc(h.arquivo)}</b> <span class="muted">(${esc(h.formato)}, importado em ${fmtDateTime(h.data)})</span><br><br>
    Serão excluídos do projeto: <b>${it.mats.length}</b> material(is) e <b>${it.svcs.length}</b> serviço(s), somando <b>${fmtBRL(val)}</b>.
    ${it.mats.length+it.svcs.length ? '<br><span class="muted" style="font-size:12px">Itens editados depois da importação também serão excluídos.</span>':''}
    ${nu?`<br><br><label><input type="checkbox" id="undoRestore" checked> Restaurar os ${nu} registro(s) existentes que esta importação atualizou para os valores anteriores</label>`:''}
    ${it.legacy?'<div class="alert warn mt8" style="margin-bottom:0">Importação feita em versão anterior do sistema: serão excluídos os itens cuja origem é este arquivo.</div>':''}`, okText:'Excluir importação', danger:true});
  if (!ok) return;
  const restore = nu ? !!(confirmDialog.checks||{}).undoRestore : false;
  const r = undoImport(id, false, restore);
  touch(); go('importar');
  toast(`Importação excluída: ${r.mats} material(is) e ${r.svcs} serviço(s) removidos${r.rest?`, ${r.rest} restaurado(s)`:''}.`,'ok',5000);
}
function wizDone(){
  const t = totals(cur());
  const tot = imp.resumo.reduce((a,r)=>a+r.importados,0);
  const canUndo = imp.resumo.some(r=>r.histId && r.importados>0);
  return `<h2>${imp.queue.length>1?'Consolidação concluída':'Importação concluída'}</h2>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Arquivo</th><th>Status</th><th class="num">Itens importados</th><th>Detalhes</th></tr></thead><tbody>
  ${imp.resumo.map(r=>`<tr><td>${esc(r.arquivo)}</td><td>${esc(r.status)}</td><td class="num">${r.importados}</td><td class="muted">${esc(r.detalhes||'')}</td></tr>`).join('')}</tbody></table></div>
  <div class="alert ok mt16">Total de itens incorporados à mensuração: <b>${tot}</b>. Estimativa total atualizada do projeto: <b>${fmtBRL(t.total)}</b> (materiais de obra ${fmtBRL(t.obra)} · ativação ${fmtBRL(t.ativ)} · serviços ${fmtBRL(t.serv)}).</div>
  <div class="btns"><button class="btn primary" data-imp="close">${imp.preset ? `Ver ${imp.preset.categoria==='ativacao'?'materiais de ativação':'materiais de obra'}` : 'Importar outros arquivos'}</button><button class="btn" data-view="resumo">Ver resumo financeiro</button><button class="btn" data-view="dashboard">Ir para o dashboard</button>${canUndo?'<button class="btn danger" data-imp="undo-session">Desfazer importações desta sessão</button>':''}</div>`;
}

export { askUndoImport, descartarImportacao, extOf, histItems, imp, sheetRows, vImportar };
