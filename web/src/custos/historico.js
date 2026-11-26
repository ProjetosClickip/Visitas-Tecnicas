/* =====================================================================
   12e. HISTÓRICO DE ALTERAÇÕES (quem e quando)
   ===================================================================== */
import { acoesPendentes, cur, currentUser } from './armazenamento.js';
import { icon, openModal } from './interface.js';
import { esc, fmtDateTime } from './util.js';

const ACAO_VIEW = {ident:'Identificação do projeto alterada', obra:'Materiais de obra alterados', ativacao:'Materiais de ativação alterados', servicos:'Serviços e mão de obra alterados', importar:'Importação de documentos', prestadoras:'Prestadoras alteradas', aprovacao:'Aprovação', resumo:'Projeto alterado', relatorios:'Projeto alterado'};
function logAlteracao(p, acao){
  if (!p || !currentUser) return;
  const now = new Date().toISOString(); p.historico = p.historico || [];
  const last = p.historico[p.historico.length-1];
  if (last && last.uid===currentUser.id && last.acao===acao && (Date.parse(now) - Date.parse(last.em)) < 180000){ last.em = now; last.n = (last.n||1)+1; }
  else p.historico.push({em:now, uid:currentUser.id, nome:currentUser.nome, acao});
  if (p.historico.length>500) p.historico.splice(0, p.historico.length-500);
  // o servidor grava o histórico oficial (autor = usuário da sessão, horário do servidor)
  const pend = acoesPendentes.get(p.id) || new Set(); pend.add(acao); acoesPendentes.set(p.id, pend);
  p.alteradoPor = {uid:currentUser.id, nome:currentUser.nome};
}
function lastChangeHtml(){
  const p = cur(); if (!p) return '';
  const h = (p.historico||[])[ (p.historico||[]).length-1 ];
  return `<div class="last-change">${p.criadoPor?`Criado por <b>${esc(p.criadoPor.nome)}</b> em ${fmtDateTime(p.criadoEm)} · `:''}${h ? `Última alteração por <b>${esc(h.nome)}</b> em <b>${fmtDateTime(h.em)}</b> (${esc(h.acao)})` : 'Sem alterações registradas'} · <a href="#" data-action="hist-show">ver histórico</a></div>`;
}
function histModal(){
  const p = cur(); if (!p) return;
  const h = (p.historico||[]).slice().reverse();
  openModal(`<div class="mh"><h3>Histórico de alterações — ${esc(p.info.nome)}</h3><button class="btn icon" data-fechar>${icon('x')}</button></div>
  <div class="mb"><div class="tbl-wrap" style="max-height:60vh"><table class="tbl compact"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Alteração</th></tr></thead><tbody>
  ${h.map(x=>`<tr><td style="white-space:nowrap">${fmtDateTime(x.em)}</td><td><b>${esc(x.nome)}</b></td><td>${esc(x.acao)}${x.n>1?` <span class="muted">(${x.n} alterações seguidas)</span>`:''}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Nenhuma alteração registrada.</td></tr>'}
  </tbody></table></div></div>`);
}

export { ACAO_VIEW, histModal, lastChangeHtml, logAlteracao };
