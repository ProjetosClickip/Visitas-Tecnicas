/* ---------- Exportação Excel ---------- */
import { aprovTexto } from '../aprovacao.js';
import { ORG, cur, currentUser, db, saveDB } from '../armazenamento.js';
import { svcTotal, totals, unitValue } from '../calculos.js';
import { toast } from '../interface.js';
import { loadLib } from '../libs.js';
import { downloadBlob, fileSafe } from '../telas/projetos.js';
import { tipoLabel } from '../tema.js';
import { fmtDate, fmtDateTime, fmtInput, round2 } from '../util.js';

const XL_MONEY = '"R$" #,##0.00', XL_QTY = '#,##0.###', XL_PCT = '0.0%';
const xlCol = c => { let s=''; c++; while(c>0){ const m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=Math.floor((c-1)/26); } return s; };
function xlIdRows(p, titulo){
  return [[db.settings.empresaRelatorio||ORG.empresaResponsavel.nome||''],[titulo],['Projeto', p.info.nome||''],['Tipo de projeto', tipoLabel(p.info.tipo)||''],['Código', p.info.codigo||''],['Cliente / empreendimento', p.info.cliente||''],
    ['Responsável', p.info.responsavel||''],['Data de elaboração', fmtDate(p.info.data)],['Versão', p.info.versao||'1.0'],['Aprovação', aprovTexto(p)],['Última alteração', p.alteradoPor ? `${p.alteradoPor.nome} em ${fmtDateTime(p.atualizadoEm)}` : ''],['Gerado em', new Date().toLocaleString('pt-BR')+(currentUser?' por '+currentUser.nome:'')],[]];
}
/* Cada aba: {name, rows, widths, fmt:{c: formato} a partir de dataStart, formulas:[{r,c,f}]} */
async function downloadWorkbook(base, sheets){
  try {
    const X = await loadLib('xlsx');
    const wb = X.utils.book_new();
    for (const sh of sheets){
      const ws = X.utils.aoa_to_sheet(sh.rows);
      ws['!cols'] = (sh.widths||[]).map(w=>({wch:w}));
      const start = sh.dataStart||0;
      sh.rows.forEach((row, r)=>{ if (r<start || !row) return; row.forEach((v, c)=>{
        const cell = ws[X.utils.encode_cell({r, c})];
        if (cell && typeof v==='number' && sh.fmt && sh.fmt[c]) cell.z = sh.fmt[c];
      }); });
      (sh.formulas||[]).forEach(({r,c,f,z})=>{ const cell = ws[X.utils.encode_cell({r, c})]; if (cell){ cell.f = f; if (z) cell.z = z; } });
      X.utils.book_append_sheet(wb, ws, sh.name.slice(0,31));
    }
    X.writeFile(wb, base + '.xlsx');
    { const pp = cur(); if (pp){ pp.ultimoRelatorio = new Date().toISOString(); saveDB(); } }
    toast('Planilha baixada: '+base+'.xlsx','ok',4500);
  } catch(err){
    console.warn(err);
    const out = [];
    sheets.forEach((sh,i)=>{ if (sheets.length>1){ if (i) out.push([]); out.push(['### '+sh.name]); } out.push(...sh.rows); });
    const csv = '﻿' + out.map(r=>(r||[]).map(v=> typeof v==='number' ? fmtInput(v,4) : '"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    downloadBlob(csv, base + '.csv', 'text/csv;charset=utf-8');
    toast('Excel indisponível (sem internet). O arquivo foi baixado em CSV, que também abre no Excel.','',6500);
  }
}
const sortMat = list => list.slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR'));
function xlMatSheet(p, cat, titulo){
  const rows = [[titulo],[],['Descrição do material','Unidade','Quantidade','Valor unitário (R$)','Valor total (R$)']];
  const list = sortMat(p.materiais.filter(m=>m.categoria===cat));
  const first = rows.length;
  list.forEach(m=>rows.push([m.nome, m.unidade, m.quantidade, Math.round(unitValue(m)*10000)/10000, round2(m.valorTotal)]));
  const formulas = [];
  if (list.length){ rows.push(['Subtotal ('+list.length+' itens)','','','', round2(list.reduce((a,m)=>a+round2(m.valorTotal),0))]);
    formulas.push({r:rows.length-1, c:4, f:`SUM(E${first+1}:E${rows.length-1})`, z:XL_MONEY}); }
  else rows.push(['Nenhum item nesta categoria.']);
  return {name:titulo.replace(/^Relação de /i,'').replace(/^./,c=>c.toUpperCase()), rows, dataStart:first, widths:[60,12,12,18,18], fmt:{2:XL_QTY,3:XL_MONEY,4:XL_MONEY}, formulas};
}
function xlSvcSheet(p){
  const rows = [['Serviços e mão de obra'],[],['Descrição do serviço','Prestadora / equipe','Unidade','Quantidade','Valor unitário (R$)','Valor total (R$)']];
  const list = p.servicos.slice().sort((a,b)=>(a.empresa||'').localeCompare(b.empresa||'','pt-BR')||(a.descricao||'').localeCompare(b.descricao||'','pt-BR'));
  const first = rows.length; const formulas = [];
  list.forEach(s=>{ rows.push([s.descricao, s.empresa, s.unidade, s.quantidade, s.valorUnitario, svcTotal(s)]); const r = rows.length; formulas.push({r:r-1, c:5, f:`ROUND(D${r}*E${r},2)`, z:XL_MONEY}); });
  if (list.length){ rows.push(['Total de serviços ('+list.length+')','','','','', totals(p).serv]); formulas.push({r:rows.length-1, c:5, f:`SUM(F${first+1}:F${rows.length-1})`, z:XL_MONEY}); }
  else rows.push(['Nenhum serviço cadastrado.']);
  return {name:'Serviços', rows, dataStart:first, widths:[44,28,12,12,18,18], fmt:{3:XL_QTY,4:XL_MONEY,5:XL_MONEY}, formulas};
}
function xlResumoRows(t){
  const pc = (v,tot)=> tot>0 ? v/tot : 0;
  return [['RESUMO FINANCEIRO CONSOLIDADO'],['Descrição','Itens','Valor (R$)','% do total'],
    ['Subtotal de materiais de obra', t.nObra, t.obra, pc(t.obra,t.total)],
    ['Subtotal de materiais de ativação', t.nAtiv, t.ativ, pc(t.ativ,t.total)],
    ['Total geral de materiais', t.nMat, t.mat, pc(t.mat,t.total)],
    ['Subtotal de serviços e mão de obra', t.nServ, t.serv, pc(t.serv,t.total)],
    ['ESTIMATIVA TOTAL DE CUSTOS DO PROJETO', t.nMat+t.nServ, t.total, t.total>0?1:0]];
}
function xlEmpresaSheet(t){
  const rows = [['Custos de materiais por empresa de origem'],[],['Empresa de origem','Itens','Materiais de obra (R$)','Materiais de ativação (R$)','Subtotal (R$)','% dos materiais']];
  const first = rows.length; const ents = Object.entries(t.empresas).sort((a,b)=>b[1].total-a[1].total);
  ents.forEach(([k,E])=>rows.push([k, E.n, E.obra, E.ativ, E.total, t.mat>0?E.total/t.mat:0]));
  const formulas = [];
  if (ents.length){ rows.push(['Total', t.nMat, t.obra, t.ativ, t.mat, t.mat>0?1:0]); const r = rows.length-1;
    ['C','D','E'].forEach((L,i)=>formulas.push({r, c:2+i, f:`SUM(${L}${first+1}:${L}${r})`, z:XL_MONEY})); }
  else rows.push(['Nenhum material cadastrado.']);
  return {name:'Custos por empresa', rows, dataStart:first, widths:[32,8,22,24,18,16], fmt:{2:XL_MONEY,3:XL_MONEY,4:XL_MONEY,5:XL_PCT}, formulas};
}
function xlPrestSheet(t){
  const rows = [['Custos de serviços por prestadora / equipe'],[],['Prestadora / equipe','Serviços','Subtotal (R$)','% dos serviços']];
  const first = rows.length; const ents = Object.entries(t.servEmpresas).sort((a,b)=>b[1].total-a[1].total);
  ents.forEach(([k,E])=>rows.push([k, E.n, E.total, t.serv>0?E.total/t.serv:0]));
  const formulas = [];
  if (ents.length){ rows.push(['Total', t.nServ, t.serv, t.serv>0?1:0]); const r = rows.length-1; formulas.push({r, c:2, f:`SUM(C${first+1}:C${r})`, z:XL_MONEY}); }
  else rows.push(['Nenhum serviço cadastrado.']);
  return {name:'Custos por prestadora', rows, dataStart:first, widths:[34,10,18,16], fmt:{2:XL_MONEY,3:XL_PCT}, formulas};
}
const xlBase = (p, pref) => `${pref}${p.info.codigo?fileSafe(p.info.codigo)+'_':''}${fileSafe(p.info.nome)}`;
async function exportExcelCompleto(){
  const p = cur(); if (!p) return;
  const t = totals(p);
  const id = xlIdRows(p, 'RELATÓRIO DE MENSURAÇÃO DE CUSTOS');
  const resumo = {name:'Resumo', rows:id.concat(xlResumoRows(t)), dataStart:id.length+2, widths:[42,10,20,12], fmt:{2:XL_MONEY,3:XL_PCT}};
  if (p.info.descricao || p.info.observacoes) resumo.rows.push([], ['Descrição do projeto', p.info.descricao||''], ['Observações gerais', p.info.observacoes||'']);
  await downloadWorkbook(xlBase(p,'Relatorio_completo_'), [resumo, xlMatSheet(p,'obra','Materiais de obra'), xlMatSheet(p,'ativacao','Materiais de ativação'), xlSvcSheet(p), xlPrestSheet(t)]);
}
async function exportExcelCustos(){
  const p = cur(); if (!p) return;
  const t = totals(p);
  const id = xlIdRows(p, 'RESUMO DE CUSTOS DO PROJETO');
  const res = id.concat(xlResumoRows(t));
  const cat = [[], ['CUSTOS POR CATEGORIA E ORIGEM'], ['Categoria','Itens','Valor (R$)','% do total']];
  [['Materiais de obra', t.nObra, t.obra],['Materiais de ativação', t.nAtiv, t.ativ],['Serviços e mão de obra', t.nServ, t.serv]].forEach(r=>cat.push([r[0], r[1], r[2], t.total>0?r[2]/t.total:0]));
  await downloadWorkbook(xlBase(p,'Custos_'), [{name:'Resumo de custos', rows:res.concat(cat), dataStart:id.length+2, widths:[42,10,20,12], fmt:{2:XL_MONEY,3:XL_PCT}}, xlPrestSheet(t)]);
}
async function exportExcelSemCusto(){
  const p = cur(); if (!p) return;
  if (!p.materiais.length) return toast('O projeto não possui materiais cadastrados.','err');
  const rows = xlIdRows(p, 'LISTA DE MATERIAIS (SEM CUSTOS)');
  rows.push(['Nº','Categoria','Descrição do material','Unidade','Quantidade','Observação']);
  const start = rows.length; let n = 0;
  for (const [cat, lbl] of [['obra','MATERIAIS DE OBRA'],['ativacao','MATERIAIS DE ATIVAÇÃO']]){
    const list = sortMat(p.materiais.filter(m=>m.categoria===cat));
    if (!list.length) continue;
    rows.push([`${lbl} (${list.length} itens)`]);
    list.forEach(m=>rows.push([++n, cat==='obra'?'Obra':'Ativação', m.nome, m.unidade, m.quantidade, '']));
    rows.push([]);
  }
  rows.push([`Total de itens: ${n}`]);
  await downloadWorkbook(xlBase(p,'Lista_materiais_sem_custo_'), [{name:'Lista de materiais', rows, dataStart:start, widths:[6,11,60,12,12,28], fmt:{4:XL_QTY}}]);
}
async function exportMateriaisExcel(){
  const p = cur(); if (!p) return;
  if (!p.materiais.length) return toast('O projeto não possui materiais cadastrados.','err');
  const t = totals(p);
  const head = [['LISTA DE MATERIAIS'],['Projeto', p.info.nome||''],['Tipo de projeto', tipoLabel(p.info.tipo)||''],['Código', p.info.codigo||''],['Cliente / empreendimento', p.info.cliente||''],
    ['Responsável', p.info.responsavel||''],['Data de elaboração', fmtDate(p.info.data)],['Versão', p.info.versao||'1.0'],['Aprovação', aprovTexto(p)],['Última alteração', p.alteradoPor ? `${p.alteradoPor.nome} em ${fmtDateTime(p.atualizadoEm)}` : ''],['Gerado em', new Date().toLocaleString('pt-BR')+(currentUser?' por '+currentUser.nome:'')],[]];
  const rows = head.slice();
  rows.push(['Categoria','Descrição do material','Unidade','Quantidade','Valor unitário (R$)','Valor total (R$)']);
  const hdrRow = rows.length-1; const subRows = [];
  for (const [cat, lbl, sub] of [['obra','Obra',t.obra],['ativacao','Ativação',t.ativ]]){
    const list = sortMat(p.materiais.filter(m=>m.categoria===cat));
    if (!list.length) continue;
    list.forEach(m=>rows.push([lbl, m.nome, m.unidade, m.quantidade, Math.round(unitValue(m)*10000)/10000, round2(m.valorTotal)]));
    subRows.push(rows.length); rows.push(['Subtotal materiais de '+lbl.toLowerCase(),'','','','',sub]);
    rows.push([]);
  }
  subRows.push(rows.length); rows.push(['TOTAL GERAL DE MATERIAIS','','','','',t.mat]);
  const base = `Lista_materiais_${p.info.codigo?fileSafe(p.info.codigo)+'_':''}${fileSafe(p.info.nome)}`;
  try {
    const X = await loadLib('xlsx');
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:12},{wch:60},{wch:12},{wch:12},{wch:18},{wch:18}];
    if (ws['!ref']){
      const R = X.utils.decode_range(ws['!ref']);
      for (let r=hdrRow+1; r<=R.e.r; r++){
        const q = ws[X.utils.encode_cell({r, c:3})]; if (q && typeof q.v==='number') q.z = '#,##0.###';
        [4,5].forEach(c=>{ const cell = ws[X.utils.encode_cell({r, c})]; if (cell && typeof cell.v==='number') cell.z = '"R$" #,##0.00'; });
      }
    }
    const res = X.utils.aoa_to_sheet([['RESUMO DA LISTA DE MATERIAIS'],[],['Descrição','Itens','Valor (R$)'],['Materiais de obra',t.nObra,t.obra],['Materiais de ativação',t.nAtiv,t.ativ],['Total geral de materiais',t.nMat,t.mat]]);
    res['!cols'] = [{wch:30},{wch:10},{wch:18}];
    ['C4','C5','C6'].forEach(a=>{ if (res[a]) res[a].z = '"R$" #,##0.00'; });
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Materiais');
    X.utils.book_append_sheet(wb, res, 'Resumo');
    X.writeFile(wb, base + '.xlsx');
    toast('Lista de materiais baixada: '+base+'.xlsx','ok',4500);
  } catch(err){
    const csv = '﻿' + rows.map(r=>r.map(v=> typeof v==='number' ? fmtInput(v,4) : '"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    downloadBlob(csv, base + '.csv', 'text/csv;charset=utf-8');
    toast('Excel indisponível (sem internet). A lista foi baixada em CSV, que também abre no Excel.','',6500);
  }
}

export { exportExcelCompleto, exportExcelCustos, exportExcelSemCusto, exportMateriaisExcel };
