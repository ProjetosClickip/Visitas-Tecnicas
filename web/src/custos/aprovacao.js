import { api, msgErro } from '../shared/api.js';
import { aplicarServidor, conteudoProjeto, cur, currentUser, db, gravado, haPendencias, sincronizar } from './armazenamento.js';
import { totals } from './calculos.js';
import { confirmDialog, go, toast } from './interface.js';
import { hubIsSup } from './sessao.js';
import { projHeader } from './telas/comum.js';
import { noProject } from './telas/identificacao.js';
import { esc, fmtBRL, fmtDateTime } from './util.js';

/* =====================================================================
   12d. APROVAÇÃO DO PROJETO
   ===================================================================== */
/* Aprovadores = supervisores ativos cadastrados no servidor (não há mais lista fixa de e-mails).
   A aprovação é registrada pelo servidor em nome de quem está logado. */
function aprovadoresLista(p){
  const base = (db.aprovadores || []).map(a => Object.assign({}, a));
  const ap = (p && p.aprovacoes) || {};
  Object.keys(ap).forEach(id => { if (!base.some(a => a.id === id)) base.push({ id, nome: ap[id].porNome || 'Aprovador', cargo: '' }); });
  return base;
}
const isAprovador = (u, a) => !!u && u.id === a.id && hubIsSup(u);
function aprovInfo(p){
  const ap = (p && p.aprovacoes) || {}; const list = aprovadoresLista(p).map(a=>Object.assign({}, a, {reg: ap[a.id] && ap[a.id].status==='aprovado' ? ap[a.id] : null}));
  const n = list.filter(a=>a.reg).length;
  const alterado = !!(n && p.conteudoAlteradoEm && p.conteudoAlteradoEm > list.filter(a=>a.reg).map(a=>a.reg.em).sort()[0]);
  return {list, n, alterado};
}
function vAprovacao(){
  const p = cur(); if (!p) return noProject();
  const ai = aprovInfo(p); const t = totals(p);
  return projHeader('Etapa 7 · Aprovação do projeto','Os aprovadores acessam o projeto com o próprio perfil e registram a aprovação. Cada registro guarda quem aprovou e quando.') + `
  ${ai.alterado ? `<div class="alert warn"><b>Atenção:</b> o projeto foi alterado depois de ter sido aprovado (última alteração por ${esc(p.alteradoPor?p.alteradoPor.nome:'—')} em ${fmtDateTime(p.conteudoAlteradoEm)}). Verifique o histórico e, se necessário, solicite nova aprovação.</div>` : ''}
  <div class="card"><h2>Situação: ${ai.n ? `<span class="badge b-ok">Aprovado por ${ai.n} de ${ai.list.length}</span>` : '<span class="badge b-gray">Aguardando aprovação</span>'} <span class="hint">Estimativa total aprovada: ${fmtBRL(t.total)}</span></h2>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Aprovador</th><th>Cargo</th><th>Situação</th><th>Registrado em</th><th>Observação</th><th></th></tr></thead><tbody>
  ${ai.list.map(a=>{ const pode = isAprovador(currentUser, a); return `<tr><td><b>${esc(a.nome)}</b></td><td>${esc(a.cargo)}</td>
    <td>${a.reg ? '<span class="badge b-ok">Aprovado</span>' : '<span class="badge b-gray">Pendente</span>'}</td>
    <td>${a.reg ? `${fmtDateTime(a.reg.em)}<div class="muted" style="font-size:11.5px">perfil: ${esc(a.reg.porNome)}</div>` : '—'}</td>
    <td class="muted" style="font-size:12.5px">${a.reg && a.reg.obs ? esc(a.reg.obs) : '—'}</td>
    <td class="act">${pode ? (a.reg ? `<button class="btn sm danger" data-action="aprov-revogar" data-id="${a.id}">Revogar</button>` : `<button class="btn sm ok" data-action="aprov-aprovar" data-id="${a.id}">Aprovar</button>`) : `<span class="muted" style="font-size:11.5px">Somente ${esc(a.nome.split(' ')[0])}</span>`}</td></tr>`; }).join('')}
  </tbody></table></div>
  <p class="muted" style="font-size:12px;margin-bottom:0">A aprovação é feita pela supervisão, cada pessoa com a própria conta, e registrada pelo servidor. Conta conectada agora: <b>${esc(currentUser?currentUser.nome:'')}</b>.</p></div>
  <div class="card"><h2>Histórico de aprovações</h2>${(p.historico||[]).filter(h=>/aprova|revoga/i.test(h.acao)).slice().reverse().map(h=>`<div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--line)">${fmtDateTime(h.em)} — <b>${esc(h.nome)}</b>: ${esc(h.acao)}</div>`).join('') || '<div class="muted">Nenhum registro.</div>'}</div>`;
}
async function aprovar(id, revogar){
  const p = cur(); const a = aprovadoresLista(p).find(x=>x.id===id); if (!p || !a) return;
  if (!isAprovador(currentUser, a)) return toast(`Somente ${a.nome} pode registrar esta aprovação.`,'err');
  if (haPendencias()) await sincronizar();
  if (revogar){
    if (!(await confirmDialog({title:'Revogar aprovação', message:`Revogar a sua aprovação para o projeto <b>${esc(p.info.nome)}</b>?`, okText:'Revogar', danger:true}))) return;
  } else {
    const ok = await confirmDialog({title:'Aprovar projeto', message:`Registrar a aprovação de <b>${esc(a.nome)}</b>${a.cargo?` (${esc(a.cargo)})`:''} para o projeto <b>${esc(p.info.nome)}</b>, com estimativa total de <b>${fmtBRL(totals(p).total)}</b>?<br><br><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Observação (opcional)</label><textarea class="inp" id="aprovObs" rows="3"></textarea>`, okText:'Aprovar'});
    if (!ok) return;
  }
  try {
    const url = '/custos/projetos/' + encodeURIComponent(p.id) + '/aprovacao';
    const r = revogar ? await api.del(url) : await api.post(url, { obs: (confirmDialog.texts||{}).aprovObs || '' });
    aplicarServidor(p, r.projeto); gravado.projetos.set(p.id, conteudoProjeto(p));
    go(); toast(revogar ? 'Aprovação revogada.' : 'Aprovação registrada.', 'ok');
  } catch(e){ toast(msgErro(e), 'err', 6000); }
}
function aprovTexto(p){ const ai = aprovInfo(p); return ai.n ? ai.list.filter(a=>a.reg).map(a=>`${a.nome} (${a.cargo}) em ${fmtDateTime(a.reg.em)}`).join('; ') + (ai.alterado?' — projeto alterado após a aprovação':'') : 'Pendente'; }

export { aprovInfo, aprovTexto, aprovar, vAprovacao };
