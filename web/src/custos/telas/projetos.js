/* ---------- 7.2 Projetos ---------- */
import { aprovInfo } from '../aprovacao.js';
import { currentUser, db, fixProject, myProjects, saveDB } from '../armazenamento.js';
import { totals } from '../calculos.js';
import { logAlteracao } from '../historico.js';
import { ETAPAS, etapaInfo, go, icon, toast, ui } from '../interface.js';
import { afterRender } from '../registro.js';
import { myPrest } from './servicos.js';
import { TIPOS, tipoLabel } from '../tema.js';
import { $, deepClone, esc, fmtBRL, fmtDate, fmtDateTime, norm, uid } from '../util.js';

function vProjetos(){
  const rows = myProjects().filter(p=>!ui.projTipo || p.info.tipo===ui.projTipo).sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
  return `<div class="pg-head"><div><h1 class="pg">Projetos</h1><p class="pg-sub">Todos os usuários têm acesso a todos os projetos e históricos. Cada alteração registra quem alterou e quando.</p></div>
    <div class="btns"><button class="btn primary" data-action="proj-new">${icon('plus')}Novo projeto</button>
    <button class="btn" data-action="proj-import-json">${icon('importar')}Importar JSON</button>
    <button class="btn" data-action="backup-export">${icon('download')}Backup de todos (JSON)</button>
    <button class="btn" data-action="proj-sample">Criar projeto de exemplo</button></div></div>
  <div class="card"><div class="toolbar"><select class="inp" id="pTipo"><option value="">Todos os tipos de projeto</option>${TIPOS.map(([k,l])=>`<option value="${k}" ${ui.projTipo===k?'selected':''}>${l}</option>`).join('')}</select><span class="muted" style="font-size:12px">Perfil: ${esc(currentUser?currentUser.nome:'')}</span></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Projeto</th><th>Tipo</th><th>Cliente / empreendimento</th><th>Código</th><th>Responsável</th><th>Data</th><th class="num">Materiais</th><th class="num">Serviços</th><th class="num">Estimativa total</th><th>Etapas</th><th>Aprovação</th><th>Criado por</th><th>Última alteração</th><th></th></tr></thead><tbody>
  ${rows.length? rows.map(p=>{ const t=totals(p); const isCur=p.id===db.currentId; return `<tr class="${isCur?'cur':''}">
    <td><b>${esc(p.info.nome||'(sem nome)')}</b> ${isCur?'<span class="badge b-ok">ativo</span>':''}</td><td>${p.info.tipo?`<span class="badge b-tipo">${esc(tipoLabel(p.info.tipo))}</span>`:'<span class="muted">—</span>'}</td><td>${esc(p.info.cliente)}</td><td>${esc(p.info.codigo)}</td><td>${esc(p.info.responsavel)}</td><td>${fmtDate(p.info.data)}</td>
    <td class="num">${p.materiais.length}</td><td class="num">${p.servicos.length}</td><td class="num"><b>${fmtBRL(t.total)}</b></td><td style="white-space:nowrap">${(()=>{ const n = ETAPAS.filter(([k])=>etapaInfo(p,k).ok).length; return `<span class="badge ${n===ETAPAS.length?'b-ok':'b-gray'}">${n}/${ETAPAS.length}</span>`; })()}</td>
    <td style="white-space:nowrap">${(()=>{ const ai = aprovInfo(p); return ai.n ? `<span class="badge ${ai.alterado?'b-warn':'b-ok'}" title="${esc(ai.list.filter(a=>a.reg).map(a=>a.nome+' em '+fmtDateTime(a.reg.em)).join('; '))}">${ai.n}/${ai.list.length} aprovado${ai.alterado?' · alterado após':''}</span>` : '<span class="badge b-gray">Pendente</span>'; })()}</td>
    <td style="font-size:12.5px">${esc(p.criadoPor?p.criadoPor.nome:((db.users.find(u=>u.id===p.ownerId)||{}).nome||'—'))}</td>
    <td class="muted" style="font-size:12.5px;white-space:nowrap">${fmtDateTime(p.atualizadoEm)}${p.alteradoPor?`<div>por <b>${esc(p.alteradoPor.nome)}</b></div>`:''}</td>
    <td class="act"><button class="btn sm" data-action="proj-open" data-id="${p.id}">${icon('open')}Abrir</button>
      <button class="btn sm icon" title="Editar identificação" data-action="proj-edit" data-id="${p.id}">${icon('edit')}</button>
      <button class="btn sm icon" title="Duplicar mensuração" data-action="proj-dup" data-id="${p.id}">${icon('copy')}</button>
      <button class="btn sm icon" title="Exportar JSON" data-action="proj-json" data-id="${p.id}">${icon('download')}</button>
      <button class="btn sm icon danger" title="Excluir projeto" data-action="proj-del" data-id="${p.id}">${icon('trash')}</button></td></tr>`; }).join('')
  : `<tr><td colspan="14" class="empty">${ui.projTipo?'Nenhum projeto deste tipo.':'Nenhum projeto salvo.'}</td></tr>`}
  </tbody></table></div></div>
  <input type="file" id="jsonFile" accept=".json,application/json" class="hidden">`;
}
afterRender.projetos = ()=>{
  $('#pTipo').addEventListener('change', e=>{ ui.projTipo = e.target.value; go('projetos'); });
  $('#jsonFile').addEventListener('change', async e=>{
    const f = e.target.files[0]; e.target.value=''; if(!f) return;
    try {
      const data = JSON.parse(await f.text());
      let list = [];
      if (data && Array.isArray(data.projects)) list = data.projects;
      else if (data && data.project) list = [data.project];
      else if (data && data.info && (data.materiais || data.servicos)) list = [data];
      else throw new Error('Arquivo JSON não reconhecido como mensuração.');
      let n=0;
      const pmap = {};
      (Array.isArray(data.prestadoras)?data.prestadoras:[]).forEach(pr=>{
        const ex = myPrest().find(x=>norm(x.nome)===norm(pr.nome));
        if (ex) pmap[pr.id] = ex.id;
        else { const c = deepClone(pr); c.id = uid(); c.ownerId = currentUser.id; c.precos = (c.precos||[]).map(r=>Object.assign(r,{id:uid()})); db.prestadoras.push(c); pmap[pr.id] = c.id; }
      });
      for (const raw of list){
        const p = fixProject(deepClone(raw));
        p.ownerId = currentUser.id; p.criadoPor = p.criadoPor || {uid:currentUser.id, nome:currentUser.nome};
        logAlteracao(p, 'Projeto importado de arquivo JSON'); p.atualizadoEm = new Date().toISOString();
        p.servicos.forEach(sv=>{ sv.prestadoraId = pmap[sv.prestadoraId] || ((myPrest().find(x=>norm(x.nome)===norm(sv.empresa))||{}).id) || null; });
        if (db.projects.some(x=>x.id===p.id)) { p.id = uid(); p.info.nome = (p.info.nome||'Projeto') + ' (importado)'; }
        db.projects.push(p); n++;
        db.currentId = p.id;
      }
      saveDB(); go('projetos'); toast(n+' projeto(s) importado(s). Nenhum projeto existente foi alterado.','ok');
    } catch(err){ toast('Erro ao importar JSON: '+err.message,'err',6000); }
  });
};
function downloadBlob(content, filename, type){
  const blob = content instanceof Blob ? content : new Blob([content], {type:type||'application/octet-stream'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const fileSafe = s => norm(s).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60) || 'projeto';

export { downloadBlob, fileSafe, vProjetos };
