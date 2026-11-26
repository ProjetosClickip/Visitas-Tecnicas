import { api, msgErro } from '../shared/api.js';
import { aprovar } from './aprovacao.js';
import { aplicarCatalogo, cur, currentUser, db, haPendencias, myProjects, newProject, saveDB, sincronizar, touch } from './armazenamento.js';
import { calcForm } from './calculadora-alca.js';
import { m_vu, svcTotal } from './calculos.js';
import { CAT_OK, catalogBest, pctTxt } from './catalogo-busca.js';
import { catItemForm, catalogo } from './catalogo.js';
import { copyListForm } from './copiar-lista.js';
import { histModal } from './historico.js';
import { askUndoImport, descartarImportacao, histItems, imp } from './importacao/assistente.js';
import { closeModal, confirmDialog, go, toast, ui, view } from './interface.js';
import { LIBS, loadLib } from './libs.js';
import { reportChooser } from './relatorios/downloads.js';
import { exportExcelCompleto, exportExcelCustos, exportExcelSemCusto, exportMateriaisExcel } from './relatorios/excel.js';
import { gerarRelatorio } from './relatorios/pdf.js';
import { hubIsSup, logout, profileForm } from './sessao.js';
import { matForm, renderMatTable } from './telas/materiais.js';
import { downloadBlob, fileSafe } from './telas/projetos.js';
import { myPrest, prestById, renderSvcTable, svcForm, tablePrice } from './telas/servicos.js';
import { ensureSamplePrest, prestForm, suggestForm } from './telas/sugestao-servicos.js';
import { THEME_KEY, applyTheme, resolvedTheme, setTheme } from './tema.js';
import { $, deepClone, esc, fmtBRL, fmtNum, round2, todayISO, uid } from './util.js';

/* =====================================================================
   10. AÇÕES GERAIS (delegação de eventos)
   ===================================================================== */
function sampleProject(){
  const p = newProject({nome:'Projeto exemplo - Condomínio Residencial', cliente:'Residencial Exemplo', codigo:'PRJ-0001', responsavel:'Equipe de Planejamento', descricao:'Projeto de cabeamento óptico FTTH com 3 torres, CTOs nos shafts de telecom.', observacoes:'Valores ilustrativos para demonstração.'});
  const M = (empresa,codigo,nome,categoria,unidade,quantidade,valorUnitario)=>({id:uid(), origem:'Manual', empresa,codigo,nome,categoria,unidade,quantidade,valorUnitario,valorTotal:round2(quantidade*valorUnitario)});
  p.materiais.push(
    M('CLICK IP','CAB-001','Cabo de fibra óptica 06FO','obra','Metro',500,1.5),
    M('CLICK IP','CEO-024','Caixa de emenda óptica 24F','obra','Unidade',3,420),
    M('CLICK IP','CTO-016','CTO 16 portas','obra','Unidade',30,210),
    M('CLICK IP','SPL-116','Splitter 1:16 conectorizado','obra','Unidade',1,95.5),
    M('I MAIS','ALC-010','Alça preformada para cabo óptico','obra','Peça',40,4.6),
    M('CLICK IP','ONU-GP1','ONU GPON 1 porta','ativacao','Unidade',30,145),
    M('CLICK IP','ROT-AX3','Roteador Wi-Fi 6 AX3000','ativacao','Unidade',30,299),
    M('I MAIS','PTC-SCA','Patch cord SC/APC 3 m','ativacao','Unidade',30,8.5)
  );
  const alfa = ensureSamplePrest();
  const S = (descricao,empresa,unidade,quantidade,valorUnitario)=>({id:uid(), origem:'Manual', prestadoraId: empresa==='Equipe Externa A'?alfa.id:null, descricao, empresa: empresa==='Equipe Externa A'?alfa.nome:empresa, unidade, quantidade, valorUnitario});
  p.servicos.push(S('Lançamento de fibra óptica','Equipe Externa A','Metro',500,2.2), S('Fusão de fibra óptica','Equipe Externa A','Ponto',96,18), S('Instalação de CTO','Equipe Externa A','Unidade',30,45), S('Configuração e ativação','Equipe Técnica','Unidade',30,35));
  return p;
}
document.addEventListener('click', async e=>{
  const nv = e.target.closest('[data-view]');
  if (nv){ e.preventDefault(); if (imp && imp.step!=='done' && view==='importar' && nv.dataset.view!=='importar'){ toast('Importação em andamento — conclua ou cancele antes de sair.','err'); return; } return go(nv.dataset.view); }
  const b = e.target.closest('[data-action]'); if (!b) return;
  const a = b.dataset.action, id = b.dataset.id; const p = cur();
  switch(a){
    case 'menu-toggle': $('#sidebar').classList.toggle('open'); break;
    case 'theme': setTheme(resolvedTheme()==='dark' ? 'light' : 'dark'); break;
    case 'profile': profileForm(); break;
    case 'logout': {
      if (imp && imp.step!=='done' && !(await confirmDialog({title:'Sair', message:'Há uma importação em andamento que será cancelada. Deseja sair?', okText:'Sair', danger:true}))) return;
      logout(); break; }
    case 'report': reportChooser(); break;
    case 'report-full': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); gerarRelatorio('completo'); break; }
    case 'report-mat': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); gerarRelatorio('materiais'); break; }
    case 'report-semcusto': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); gerarRelatorio('semcusto'); break; }
    case 'report-resumo': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); gerarRelatorio('resumo'); break; }
    case 'export-mat-xlsx': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); exportMateriaisExcel(); break; }
    case 'xls-full': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); exportExcelCompleto(); break; }
    case 'xls-custos': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); exportExcelCustos(); break; }
    case 'xls-semcusto': { const ov=b.closest('.overlay'); if(ov) closeModal(ov); exportExcelSemCusto(); break; }
    case 'imp-undo': askUndoImport(id); break;
    case 'imp-hist-del': { const h = p.importacoes.find(x=>x.id===id); if (!h) break;
      const it = histItems(p, h); const n = h.desfeita ? 0 : it.mats.length + it.svcs.length;
      if (!(await confirmDialog({title:'Remover do histórico', message:`Remover o registro de <b>${esc(h.arquivo)}</b> do histórico?${n?`<br><br><b>Atenção:</b> os ${n} item(ns) importados continuarão no projeto. Para retirá-los, use "Excluir importação".`:''}`, okText:'Remover registro', danger:!!n}))) return;
      if (n){ p.materiais.forEach(m=>{ if (m.importId===h.id) m.importId=null; }); p.servicos.forEach(s=>{ if (s.importId===h.id) s.importId=null; }); }
      p.importacoes = p.importacoes.filter(x=>x.id!==id); touch(); go('importar'); break; }
    case 'prest-add': prestForm(null); break;
    case 'prest-edit': prestForm(prestById(id)); break;
    case 'prest-dup': { const src = prestById(id); const c = deepClone(src); c.id = uid(); c.nome = src.nome+' (cópia)'; c.precos.forEach(r=>r.id=uid()); db.prestadoras.push(c); saveDB(); go(); toast('Prestadora duplicada — ajuste o nome e os valores.','ok'); break; }
    case 'prest-del': { const src = prestById(id);
      const used = myProjects().reduce((a,pj)=>a+pj.servicos.filter(s=>s.prestadoraId===id).length,0);
      if (!(await confirmDialog({title:'Excluir prestadora', message:`Excluir <b>${esc(src.nome)}</b> e sua tabela de ${src.precos.length} preço(s)?${used?`<br><br>${used} serviço(s) em seus projetos usam esta prestadora: eles serão mantidos com o nome e os valores atuais, sem vínculo com a tabela.`:''}`, okText:'Excluir', danger:true}))) return;
      myProjects().forEach(pj=>pj.servicos.forEach(s=>{ if (s.prestadoraId===id) s.prestadoraId = null; }));
      db.prestadoras = db.prestadoras.filter(x=>x.id!==id); saveDB(); go(); toast('Prestadora excluída.'); break; }
    case 'prest-apply-all': { const pr = prestById(id); const pj = cur();
      const miss = pj.servicos.filter(s=>!tablePrice(pr, s.descricao)).length;
      if (!(await confirmDialog({title:'Atribuir prestadora a todos os serviços', message:`Todos os ${pj.servicos.length} serviço(s) do projeto passarão para <b>${esc(pr.nome)}</b>, com os valores da tabela dela.${miss?`<br><br>${miss} serviço(s) não constam na tabela e manterão o valor atual.`:''}`, okText:'Atribuir'}))) return;
      pj.servicos.forEach(s=>{ s.prestadoraId = pr.id; s.empresa = pr.nome; const tp = tablePrice(pr, s.descricao); if (tp){ s.valorUnitario = tp.valor; if (tp.unidade) s.unidade = tp.unidade; } });
      touch(); go(); toast(`Serviços atribuídos a ${pr.nome}.`,'ok'); break; }
    case 'proj-new': { const np = newProject(); db.projects.push(np); db.currentId = np.id; saveDB(); go('ident'); toast('Novo projeto criado.','ok'); break; }
    case 'proj-sample': { const np = sampleProject(); db.projects.push(np); db.currentId=np.id; saveDB(); go('dashboard'); toast('Projeto de exemplo criado.','ok'); break; }
    case 'proj-open': db.currentId = id; saveDB(); go('dashboard'); break;
    case 'proj-edit': db.currentId = id; saveDB(); go('ident'); break;
    case 'proj-dup': { const src = db.projects.find(x=>x.id===id); const c = deepClone(src); c.id=uid(); c.info.nome=(c.info.nome||'Projeto')+' (cópia)'; c.criadoEm=c.atualizadoEm=new Date().toISOString();
      c.materiais.forEach(m=>m.id=uid()); c.servicos.forEach(s=>s.id=uid()); c.importacoes.forEach(h=>{ const nid=uid(); c.materiais.forEach(m=>{ if(m.importId===h.id) m.importId=nid; }); c.servicos.forEach(s=>{ if(s.importId===h.id) s.importId=nid; }); h.id=nid; if (h.itens) h.itens={materiais:c.materiais.filter(m=>m.importId===nid).map(m=>m.id), servicos:c.servicos.filter(s=>s.importId===nid).map(s=>s.id)}; h.atualizados=[]; });
      c.ownerId = currentUser.id; c.criadoPor = {uid:currentUser.id, nome:currentUser.nome}; c.aprovacoes = {}; c.alteradoPor = null; c.conteudoAlteradoEm = null;
      c.historico = [{em:c.criadoEm, uid:currentUser.id, nome:currentUser.nome, acao:`Projeto criado como cópia de "${src.info.nome}"`}];
      db.projects.push(c); saveDB(); go('projetos'); toast('Mensuração duplicada.','ok'); break; }
    case 'proj-json': { const src = db.projects.find(x=>x.id===id); downloadBlob(JSON.stringify({app:'mensuracao-custos', version:3, exportadoEm:new Date().toISOString(), project:src, prestadoras:myPrest().filter(pr=>src.servicos.some(s=>s.prestadoraId===pr.id))}, null, 2), `mensuracao_${fileSafe(src.info.codigo||src.info.nome)}.json`, 'application/json'); break; }
    case 'proj-import-json': $('#jsonFile').click(); break;
    case 'backup-export': downloadBlob(JSON.stringify({app:'mensuracao-custos', version:1, exportadoEm:new Date().toISOString(), projects:myProjects(), prestadoras:myPrest()}, null, 2), `backup_mensuracoes_${fileSafe(currentUser.nome)}_${todayISO()}.json`, 'application/json'); break;
    case 'proj-del': { const src = db.projects.find(x=>x.id===id);
      if (!(await confirmDialog({title:'Excluir projeto', message:`Excluir definitivamente o projeto <b>${esc(src.info.nome||'(sem nome)')}</b> com ${src.materiais.length} material(is) e ${src.servicos.length} serviço(s)?<br><br>Esta ação não pode ser desfeita. Recomenda-se exportar o JSON antes.`, okText:'Excluir projeto', danger:true}))) return;
      db.projects = db.projects.filter(x=>x.id!==id);
      if (db.currentId===id){ if(!myProjects().length) db.projects.push(newProject()); db.currentId = myProjects()[0].id; }
      saveDB(); go('projetos'); toast('Projeto excluído.'); break; }
    case 'mat-add': matForm(null, b.dataset.cat || (view==='ativacao'?'ativacao':'obra')); break;
    case 'mat-import': { if (imp && imp.step!=='done'){ go('importar'); toast('Há uma importação em andamento — conclua ou cancele antes.','err'); break; }
      descartarImportacao(); ui.importPreset = {tipo:'materiais', categoria: b.dataset.cat || (view==='ativacao'?'ativacao':'obra')}; go('importar'); const fi = $('#fOne'); if (fi) fi.click(); break; }
    case 'mat-copy': copyListForm(view==='ativacao'?'ativacao':'obra'); break;
    case 'calc-alca': calcForm(); break;
    case 'mat-catalog': { const cat = b.dataset.cat || (view==='ativacao'?'ativacao':'obra');
      const ch = p.materiais.filter(m=>m.categoria===cat).map(m=>{ const b = catalogBest(m.nome); return {m, it:b&&b.item, s:b?b.s:0}; }).filter(x=>x.it && x.it.valor>0 && Math.abs(x.it.valor - m_vu(x.m))>0.00001);
      if (!ch.length) return toast('Nenhum valor a atualizar: as descrições não foram encontradas no catálogo ou os valores já são iguais.','',5000);
      if (!(await confirmDialog({title:'Aplicar valores do catálogo', message:`${ch.length} material(is) terão o valor unitário atualizado pelo catálogo:<div class="tbl-wrap mt8" style="max-height:40vh"><table class="tbl compact"><thead><tr><th>Material</th><th>Item do catálogo</th><th class="num">Atual</th><th class="num">Catálogo</th></tr></thead><tbody>${ch.map(x=>`<tr><td>${esc(x.m.nome)}</td><td style="font-size:12px">${esc(x.it.descricao)} <span class="badge ${x.s>=CAT_OK?'b-ok':'b-warn'}">${pctTxt(x.s)}</span></td><td class="num">${fmtBRL(m_vu(x.m))}</td><td class="num"><b>${fmtBRL(x.it.valor)}</b></td></tr>`).join('')}</tbody></table></div>`, okText:'Atualizar valores'}))) return;
      ch.forEach(x=>{ x.m.valorUnitario = x.it.valor; x.m.valorTotal = round2(x.m.quantidade*x.it.valor); });
      touch(`Valores unitários atualizados pelo catálogo (${ch.length} item(ns))`); go(); toast(`${ch.length} valor(es) atualizado(s).`,'ok'); break; }
    case 'cat-import': $('#catFile').click(); break;
    case 'cat-add': catItemForm(null); break;
    case 'cat-edit': catItemForm(+b.dataset.i); break;
    case 'cat-del': { const cat = catalogo(); const x = cat[+b.dataset.i]; if (!x) break;
      if (!(await confirmDialog({title:'Excluir item do catálogo', message:`Excluir <b>${esc(x.codigo)} - ${esc(x.descricao)}</b> (tabela ${esc(x.tabela||'-')})? Os projetos não são alterados.`, okText:'Excluir', danger:true}))) return;
      cat.splice(+b.dataset.i,1); db.catalogoAtualizadoEm = new Date().toISOString(); saveDB(); go('catalogo'); break; }
    case 'cat-reset': {
      if (!hubIsSup(currentUser)) return toast('Somente a supervisão pode restaurar o catálogo inicial.','err');
      if (!(await confirmDialog({title:'Restaurar catálogo inicial', message:'Substituir o catálogo atual pela tabela inicial cadastrada no servidor? Itens incluídos ou alterados manualmente serão perdidos.', okText:'Restaurar', danger:true}))) return;
      try { if (haPendencias()) await sincronizar(); const r = await api.post('/custos/catalogo/restaurar'); aplicarCatalogo(r.catalogo); go('catalogo'); toast('Catálogo restaurado.','ok'); }
      catch(er){ toast(msgErro(er),'err',6000); }
      break; }
    case 'aprov-aprovar': aprovar(id); break;
    case 'aprov-revogar': aprovar(id, true); break;
    case 'hist-show': e.preventDefault(); histModal(); break;
    case 'mat-edit': matForm(p.materiais.find(m=>m.id===id)); break;
    case 'mat-dup': { const i = p.materiais.findIndex(m=>m.id===id); const c = Object.assign({}, p.materiais[i], {id:uid()}); p.materiais.splice(i+1,0,c); touch(); renderMatTable(); toast('Material duplicado — edite a cópia se necessário.','ok'); break; }
    case 'mat-del': { const m = p.materiais.find(x=>x.id===id);
      if (!(await confirmDialog({title:'Excluir material', message:`Excluir <b>${esc(m.nome)}</b> (${fmtNum(m.quantidade)} ${esc(m.unidade)} · ${fmtBRL(m.valorTotal)})?`, okText:'Excluir', danger:true}))) return;
      p.materiais = p.materiais.filter(x=>x.id!==id); touch(); renderMatTable(); toast('Material excluído.'); break; }
    case 'svc-add': svcForm(null); break;
    case 'svc-suggest': suggestForm(); break;
    case 'svc-edit': svcForm(p.servicos.find(s=>s.id===id)); break;
    case 'svc-dup': { const i = p.servicos.findIndex(s=>s.id===id); p.servicos.splice(i+1,0,Object.assign({}, p.servicos[i], {id:uid()})); touch(); renderSvcTable(); toast('Serviço duplicado.','ok'); break; }
    case 'svc-del': { const s = p.servicos.find(x=>x.id===id);
      if (!(await confirmDialog({title:'Excluir serviço', message:`Excluir <b>${esc(s.descricao)}</b> (${fmtBRL(svcTotal(s))})?`, okText:'Excluir', danger:true}))) return;
      p.servicos = p.servicos.filter(x=>x.id!==id); touch(); renderSvcTable(); toast('Serviço excluído.'); break; }
    case 'lib-test': for (const k of Object.keys(LIBS)){ const cell = $('#lib-'+k); if(cell) cell.innerHTML='<span class="badge b-gray">Carregando…</span>';
        loadLib(k).then(()=>{ const c=$('#lib-'+k); if(c) c.innerHTML='<span class="badge b-ok">Carregada</span>'; }).catch(()=>{ const c=$('#lib-'+k); if(c) c.innerHTML='<span class="badge b-err">Indisponível (sem internet?)</span>'; }); } break;
    case 'data-wipe': {
      if (!(await confirmDialog({title:'Apagar os projetos criados por mim', message:`Todos os projetos criados pelo perfil <b>${esc(currentUser.nome)}</b> (materiais, serviços e históricos) serão apagados deste navegador. Projetos de outros perfis não são afetados. <b>Exporte um backup antes.</b>`, okText:'Continuar', danger:true}))) return;
      if (!(await confirmDialog({title:'Confirmação final', message:'Tem certeza? Esta ação é irreversível.', okText:'Apagar meus projetos', danger:true}))) return;
      db.projects = db.projects.filter(x=>x.ownerId!==currentUser.id); const np = newProject(); db.projects.push(np); db.currentId = np.id; saveDB(); go('dashboard'); toast('Projetos apagados.'); break; }
  }
});
$('#projSel').addEventListener('change', e=>{
  if (imp && imp.step!=='done'){ toast('Conclua ou cancele a importação em andamento antes de trocar de projeto.','err'); e.target.value = db.currentId; return; }
  db.currentId = e.target.value; saveDB(); go();
});
window.addEventListener('beforeunload', e=>{ if (imp && imp.step!=='done'){ e.preventDefault(); e.returnValue=''; } });
window.addEventListener('storage', e=>{ if (e.key===THEME_KEY) applyTheme(); });
