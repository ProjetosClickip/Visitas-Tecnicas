/* =====================================================================
   9. RELATÓRIO EM PDF (jsPDF + AutoTable)
   ===================================================================== */
import { aprovInfo } from '../aprovacao.js';
import { ORG, cur, currentUser, db, saveDB } from '../armazenamento.js';
import { svcTotal, totals, unitValue } from '../calculos.js';
import { go, toast } from '../interface.js';
import { loadLib } from '../libs.js';
import { LOGOS, TIMBRE } from '../logos.js';
import { fileSafe } from '../telas/projetos.js';
import { tipoLabel } from '../tema.js';
import { fmtBRL, fmtDate, fmtDateTime, fmtNum, fmtPct } from '../util.js';

const PDF_MODES = {
  completo: {titulo:'Relatório de Mensuração de Custos', banda:'MENSURAÇÃO DE CUSTOS DE PROJETO', arquivo:'Relatorio_completo_', msg:'Gerando relatório completo…'},
  materiais:{titulo:'Lista de Materiais', banda:'LISTA DE MATERIAIS', arquivo:'Lista_materiais_', msg:'Gerando lista de materiais…'},
  semcusto: {titulo:'Lista de Materiais (sem custos)', banda:'LISTA DE MATERIAIS', arquivo:'Lista_materiais_sem_custo_', msg:'Gerando lista de materiais sem custos…'},
  resumo:   {titulo:'Resumo Financeiro Consolidado', banda:'RESUMO FINANCEIRO CONSOLIDADO', arquivo:'Resumo_financeiro_', msg:'Gerando resumo financeiro…'}
};
async function gerarRelatorio(mode){
  mode = PDF_MODES[mode] ? mode : 'completo';
  const MD = PDF_MODES[mode];
  const soMat = mode==='materiais', semCusto = mode==='semcusto', soResumo = mode==='resumo';
  const p = cur(); if (!p) return toast('Nenhum projeto ativo.','err');
  if ((soMat || semCusto) && !p.materiais.length) return toast('O projeto não possui materiais cadastrados.','err');
  if (!p.info.nome.trim()){ toast('Informe o nome do projeto antes de gerar o relatório.','err'); return go('ident'); }
  toast(MD.msg);
  let jsPDF;
  try { jsPDF = await loadLib('jspdf'); await loadLib('autotable'); }
  catch(err){ return toast(err.message,'err',7000); }
  try {
    const o = db.settings.reportOpts || {descricao:true, empresas:true, vazias:true};
    const t = totals(p);
    const doc = new jsPDF({unit:'mm', format:'a4', orientation:'portrait'});
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 16, TOP = 27, BOT = 38;
    /* Padrão do timbrado I_MAIS / CLICKIP (memoriais descritivos): azul-marinho, verde-azulado e laranja */
    const NAVY = [0,24,129], GRAY = [100,110,125], TEAL = [19,163,160], ORANGE = [255,115,0];
    let secN = 0;
    const money = n => fmtBRL(n);
    let y = TOP;
    const ensure = need => { if (y + need > H - BOT){ doc.addPage(); y = TOP; } };
    const section = (title) => { ensure(22); doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.setTextColor(...NAVY); doc.text(`${++secN}. ${title.toUpperCase()}`, M, y); doc.setDrawColor(...ORANGE); doc.setLineWidth(.6); doc.line(M, y+1.8, M+45, y+1.8); y += 5.5; doc.setTextColor(30,30,30); };
    const tableOpts = (extra)=> Object.assign({
      startY:y, margin:{left:M, right:M, top:TOP, bottom:BOT}, theme:'grid', showHead:'everyPage', showFoot:'lastPage', rowPageBreak:'avoid',
      styles:{font:'helvetica', fontSize:8, cellPadding:1.6, lineColor:[210,215,224], lineWidth:.15, textColor:[30,36,50], overflow:'linebreak', valign:'middle'},
      headStyles:{fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:8},
      footStyles:{fillColor:[232,238,250], textColor:NAVY, fontStyle:'bold', fontSize:8.5},
      alternateRowStyles:{fillColor:[247,249,252]}
    }, extra);

    // Identificação
    doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.setTextColor(...NAVY);
    doc.text(MD.titulo.toUpperCase(), M, y+2); y += 8;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(...TEAL);
    doc.text(`${p.info.tipo?tipoLabel(p.info.tipo)+' – ':''}${p.info.nome||''}`.slice(0,95), M, y); y += 3.5;
    doc.setFillColor(...ORANGE); doc.rect(M, y, 34, 1.2, 'F'); y += 6;
    doc.autoTable(tableOpts({ startY:y, theme:'plain', showHead:false, showFoot:false,
      styles:{fontSize:9, cellPadding:1.5, textColor:[30,36,50]},
      columnStyles:{0:{fontStyle:'bold', textColor:GRAY, cellWidth:40}, 2:{fontStyle:'bold', textColor:GRAY, cellWidth:34}},
      body:[
        ['Projeto', p.info.nome||'-', 'Código', p.info.codigo||'-'],
        ['Cliente / empreendimento', p.info.cliente||'-', 'Data de elaboração', fmtDate(p.info.data)],
        ['Tipo de projeto', tipoLabel(p.info.tipo)||'-', 'Data de geração', new Date().toLocaleDateString('pt-BR')],
        ['Responsável', p.info.responsavel||'-', 'Elaborado por', currentUser ? currentUser.nome : '-'],
        ['Versão', p.info.versao||'1.0', 'Aprovação', (()=>{ const ai = aprovInfo(p); return ai.n ? `${ai.n} de ${ai.list.length}${ai.alterado?' (alterado após)':''}` : 'Pendente'; })()],
        ['Última alteração', p.alteradoPor ? `${p.alteradoPor.nome} em ${fmtDateTime(p.atualizadoEm)}` : '-', '', '']
      ]}));
    y = doc.lastAutoTable.finalY + 4;
    if (o.descricao && (mode==='completo' || soMat) && (p.info.descricao||p.info.observacoes)){
      const block = (lbl, txt)=>{ if(!txt) return; doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...GRAY); ensure(12); doc.text(lbl, M, y); y += 4.2;
        doc.setFont('helvetica','normal'); doc.setTextColor(30,36,50); const lines = doc.splitTextToSize(String(txt), W-2*M);
        lines.forEach(l=>{ ensure(5); doc.text(l, M, y); y += 4.2; }); y += 2; };
      block('Descrição do projeto', p.info.descricao); block('Observações gerais', p.info.observacoes);
    }
    y += 3;

    // Materiais
    const matTable = (cat, title, subtotal) => {
      const list = p.materiais.filter(m=>m.categoria===cat).sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR'));
      if (!list.length && !o.vazias) return;
      section(title);
      if (!list.length){ doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.setTextColor(...GRAY); doc.text('Nenhum item cadastrado nesta categoria.', M, y+3); y += 12; return; }
      if (semCusto){
        doc.autoTable(tableOpts({
          head:[['Nº','Descrição do material','Unid.','Qtd.']],
          body:list.map(m=>[String(++itemN), m.nome, m.unidade, fmtNum(m.quantidade)]),
          foot:[[{content:`Total de itens - ${title}: ${list.length}`, colSpan:4, styles:{halign:'right'}}]],
          columnStyles:{0:{cellWidth:10,halign:'right'},1:{cellWidth:'auto'},2:{cellWidth:20},3:{cellWidth:22,halign:'right'}}
        }));
        y = doc.lastAutoTable.finalY + 9; return;
      }
      doc.autoTable(tableOpts({
        head:[['Descrição do material','Unid.','Qtd.','Valor unitário','Valor total']],
        body:list.map(m=>[m.nome, m.unidade, fmtNum(m.quantidade), money(unitValue(m)), money(m.valorTotal)]),
        foot:[[{content:`Subtotal - ${title} (${list.length} itens)`, colSpan:4, styles:{halign:'right'}}, {content:money(subtotal), styles:{halign:'right'}}]],
        columnStyles:{0:{cellWidth:'auto'},1:{cellWidth:17},2:{cellWidth:18,halign:'right'},3:{cellWidth:27,halign:'right'},4:{cellWidth:29,halign:'right'}}
      }));
      y = doc.lastAutoTable.finalY + 9;
    };
    let itemN = 0;
    if (!soResumo){
      matTable('obra','Relação de materiais de obra', t.obra);
      matTable('ativacao','Relação de materiais de ativação', t.ativ);
    }

    // Serviços
    const sv = p.servicos.slice().sort((a,b)=>(a.empresa||'').localeCompare(b.empresa||'','pt-BR')||(a.descricao||'').localeCompare(b.descricao||'','pt-BR'));
    if (mode==='completo' && (sv.length || o.vazias)){
      section('Relação de serviços e mão de obra');
      if (!sv.length){ doc.setFont('helvetica','italic'); doc.setFontSize(9); doc.setTextColor(...GRAY); doc.text('Nenhum serviço cadastrado.', M, y+3); y += 12; }
      else {
        doc.autoTable(tableOpts({
          head:[['Descrição do serviço','Prestadora / equipe','Unid.','Qtd.','Valor unitário','Valor total']],
          body:sv.map(s=>[s.descricao, s.empresa, s.unidade, fmtNum(s.quantidade), money(s.valorUnitario), money(svcTotal(s))]),
          foot:[[{content:`Subtotal - Serviços e mão de obra (${sv.length} itens)`, colSpan:5, styles:{halign:'right'}}, {content:money(t.serv), styles:{halign:'right'}}]],
          columnStyles:{0:{cellWidth:'auto'},1:{cellWidth:38},2:{cellWidth:16},3:{cellWidth:15,halign:'right'},4:{cellWidth:25,halign:'right'},5:{cellWidth:26,halign:'right'}}
        }));
        y = doc.lastAutoTable.finalY + 9;
      }
    }

    // Subtotais por empresa
    if (false){ // subtotais por empresa de origem removidos (materiais não usam mais empresa)
      section('Subtotais de materiais por empresa de origem');
      doc.autoTable(tableOpts({
        head:[['Empresa de origem','Itens','Materiais de obra','Materiais de ativação','Subtotal']],
        body:Object.entries(t.empresas).sort((a,b)=>b[1].total-a[1].total).map(([k,E])=>[k, String(E.n), money(E.obra), money(E.ativ), money(E.total)]),
        foot:[['Total', String(t.nMat), money(t.obra), money(t.ativ), money(t.mat)]],
        columnStyles:{1:{halign:'right',cellWidth:16},2:{halign:'right',cellWidth:34},3:{halign:'right',cellWidth:36},4:{halign:'right',cellWidth:32}},
        didParseCell:d=>{ if(d.section==='foot' && d.column.index>0) d.cell.styles.halign='right'; }
      }));
      y = doc.lastAutoTable.finalY + 9;
    }

    // Subtotais de serviços por prestadora
    if (mode==='completo' && o.empresas && Object.keys(t.servEmpresas).length){
      section('Subtotais de serviços por prestadora / equipe');
      doc.autoTable(tableOpts({
        head:[['Prestadora / equipe','Serviços','Subtotal','% dos serviços']],
        body:Object.entries(t.servEmpresas).sort((a,b)=>b[1].total-a[1].total).map(([k,E])=>[k, String(E.n), money(E.total), fmtPct(E.total,t.serv)]),
        foot:[['Total', String(t.nServ), money(t.serv), '100%']],
        columnStyles:{1:{halign:'right',cellWidth:20},2:{halign:'right',cellWidth:36},3:{halign:'right',cellWidth:30}},
        didParseCell:d=>{ if(d.section==='foot' && d.column.index>0) d.cell.styles.halign='right'; }
      }));
      y = doc.lastAutoTable.finalY + 9;
    }

    // Resumo financeiro consolidado
    if (semCusto){
      ensure(40);
      section('Resumo da lista de materiais');
      doc.autoTable(tableOpts({
        head:[['Categoria','Itens']],
        body:[['Materiais de obra', String(t.nObra)], ['Materiais de ativação', String(t.nAtiv)]],
        foot:[['TOTAL DE ITENS', String(t.nMat)]],
        footStyles:{fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:9.5}, pageBreak:'avoid',
        styles:{fontSize:9, cellPadding:2.2, lineColor:[210,215,224], lineWidth:.15},
        columnStyles:{1:{halign:'right',cellWidth:30}},
        didParseCell:d=>{ if(d.section==='foot' && d.column.index>0) d.cell.styles.halign='right'; }
      }));
      y = doc.lastAutoTable.finalY + 10;
    } else {
    ensure(60);
    section(soMat ? 'Resumo da lista de materiais' : 'Resumo financeiro consolidado');
    doc.autoTable(tableOpts({
      head:[['Descrição','Itens', 'Valor (R$)', soMat ? '% dos materiais' : '% do total']],
      body: soMat ? [
        ['Subtotal de materiais de obra', String(t.nObra), money(t.obra), fmtPct(t.obra,t.mat)],
        ['Subtotal de materiais de ativação', String(t.nAtiv), money(t.ativ), fmtPct(t.ativ,t.mat)]
      ] : [
        ['Subtotal de materiais de obra', String(t.nObra), money(t.obra), fmtPct(t.obra,t.total)],
        ['Subtotal de materiais de ativação', String(t.nAtiv), money(t.ativ), fmtPct(t.ativ,t.total)],
        ['Total geral de materiais', String(t.nMat), money(t.mat), fmtPct(t.mat,t.total)],
        ['Subtotal de serviços e mão de obra', String(t.nServ), money(t.serv), fmtPct(t.serv,t.total)]
      ],
      foot: soMat ? [['TOTAL GERAL DE MATERIAIS', String(t.nMat), money(t.mat), '100%']] : [['ESTIMATIVA TOTAL DE CUSTOS DO PROJETO', String(t.nMat+t.nServ), money(t.total), '100%']],
      footStyles:{fillColor:NAVY, textColor:255, fontStyle:'bold', fontSize:9.5},
      rowPageBreak:'avoid', pageBreak:'avoid',
      styles:{fontSize:9, cellPadding:2.2, lineColor:[210,215,224], lineWidth:.15},
      columnStyles:{1:{halign:'right',cellWidth:18},2:{halign:'right',cellWidth:42},3:{halign:'right',cellWidth:26}},
      didParseCell:d=>{ if(d.section==='foot' && d.column.index>0) d.cell.styles.halign='right'; if(!soMat && d.section==='body' && d.row.index===2) d.cell.styles.fontStyle='bold'; }
    }));
    y = doc.lastAutoTable.finalY + 10;
    }

    // Aprovação do projeto (registro no sistema — sem campo de assinatura)
    if (mode==='completo' || soResumo){
      const ai = aprovInfo(p);
      ensure(40); section('Aprovação do projeto');
      doc.autoTable(tableOpts({
        head:[['Aprovador','Cargo','Situação','Data e hora','Observação']],
        body: ai.list.map(a=>[a.nome, a.cargo, a.reg?'Aprovado':'Pendente', a.reg?fmtDateTime(a.reg.em):'-', a.reg&&a.reg.obs?a.reg.obs:'-']),
        columnStyles:{0:{cellWidth:34,fontStyle:'bold'},1:{cellWidth:40},2:{cellWidth:22},3:{cellWidth:30}},
        didParseCell:d=>{ if (d.section==='body' && d.column.index===2) d.cell.styles.textColor = d.cell.raw==='Aprovado' ? [21,128,61] : GRAY; }
      }));
      y = doc.lastAutoTable.finalY + 4;
      if (ai.alterado){ doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(180,83,9); ensure(8); doc.text(`Atenção: o projeto foi alterado após a aprovação (${p.alteradoPor?p.alteradoPor.nome:''} em ${fmtDateTime(p.conteudoAlteradoEm)}).`, M, y+2); y += 8; }
      y += 6;
    }

    // Cabeçalho e rodapé em todas as páginas (timbrado)
    const n = doc.getNumberOfPages(); const gen = new Date().toLocaleString('pt-BR');
    const empresaRel = db.settings.empresaRelatorio || ORG.empresaResponsavel.nome || '', depto = db.settings.departamento || 'Engenharia / Projetos', cidade = db.settings.cidade || 'Manaus';
    const dataExt = (()=>{ const d = p.info.data ? new Date(p.info.data+'T12:00:00') : new Date(); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR',{day:'2-digit', month:'long', year:'numeric'}); })();
    for (let i=1;i<=n;i++){
      doc.setPage(i);
      // Papel timbrado: faixa laranja/azul no topo e rodapé Grupo ClickIP (telefones e site) em todas as páginas
      try { doc.addImage(LOGOS.timbreTopo, 'PNG', 0, 0, W, TIMBRE.topoH); doc.addImage(LOGOS.timbreRodape, 'PNG', 0, TIMBRE.rodapeY, W, TIMBRE.rodapeH); } catch(e){ console.warn('timbrado', e); }
      doc.setTextColor(...GRAY); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
      doc.text(MD.banda, W-M, 15, {align:'right'});
      doc.setFont('helvetica','normal'); doc.setFontSize(7.8);
      doc.text(`${p.info.tipo?tipoLabel(p.info.tipo).toUpperCase()+' – ':''}${String(p.info.nome||'').toUpperCase()}`.slice(0,70), W-M, 19, {align:'right'});
      doc.setTextColor(...NAVY); doc.setFont('helvetica','bold'); doc.setFontSize(8);
      doc.text(empresaRel.slice(0,60), M, 15);
      doc.setFont('helvetica','normal'); doc.setTextColor(...GRAY); doc.setFontSize(7.5);
      doc.text(depto, M, 19);
      doc.setDrawColor(...NAVY); doc.setLineWidth(.4); doc.line(M, 22, W-M, 22);
      const fy = TIMBRE.rodapeY - 7;
      doc.setDrawColor(210,215,224); doc.setLineWidth(.2); doc.line(M, fy-3.5, W-M, fy-3.5);
      doc.setFontSize(7.2); doc.setTextColor(...GRAY);
      doc.text(`Versão ${p.info.versao||'1.0'} – ${cidade}, ${dataExt}`, M, fy);
      doc.text(`Gerado em ${gen}${currentUser?' por '+currentUser.nome.slice(0,40):''}`, W/2, fy, {align:'center'});
      doc.text(`Página ${i} de ${n}`, W-M, fy, {align:'right'});
    }
    const fname = `${MD.arquivo}${p.info.codigo?fileSafe(p.info.codigo)+'_':''}${fileSafe(p.info.nome)}.pdf`;
    doc.save(fname);
    p.ultimoRelatorio = new Date().toISOString(); saveDB();
    toast('PDF gerado: '+fname,'ok',4500);
  } catch(err){ console.error(err); toast('Erro ao gerar o PDF: '+err.message,'err',7000); }
}

export { gerarRelatorio };
