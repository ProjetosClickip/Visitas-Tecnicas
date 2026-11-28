import { api, msgErro } from '../../shared/api.js';
import { STATUS, avatarHTML, isSup, stPill } from '../ambientes.js';
import { S, TYPES } from '../estado.js';
import { go } from '../navegacao.js';
import { $, $$, confirmBox, download, dtBR, dtHrBR, esc, fmt, modal, safeName, toast, today, uid } from '../util.js';
import { calcCond, condSel } from './dimensionamento.js';
import { exportKMLList, exportKMZ } from './kml.js';
import { openReport } from './relatorio.js';
import { apSummary } from './resultados.js';

/* ================== VISITAS ================== */
function newVisit(type) {
  const v = {
    id: 'v_' + uid(), type,
    cli: { data: today(), tecnico: S.user.name }, loc: {}, infra: { entrada: '', passagem: [] }, photos: [], plan: null, obs: '',
    cond: { kind: 'vertical', reserva: 10, dropMedio: 25 },
    corp: { servico: '', velocidade: '', abordagem: 'simples', usaAP: '', area: { ambiente: 'escritorio', peDireito: 3 }, usuarios: '', mbpsDisp: 3, pontosCabeados: '' },
    evt: { publico: '', dias: 1, dispPorPessoa: 1, mbpsDisp: 2, serv: {}, suporte: '', area: { ambiente: 'salao', peDireito: 4 } },
    ap: { escolha: '', raio: {} }, rack: {}
  };
  api.post('/visitas', { visita: v })
    .then(r => { S.visits.unshift(r.visita); go(type, r.visita); })
    .catch(e => toast(msgErro(e), 4000));
}
function scheduleSave() {
  // assinatura deixa de valer quando o conteúdo muda (o servidor confirma ao salvar)
  if (S.cur && S.cur.assinatura && S.cur.assinatura.valida) S.cur.assinatura.valida = false;
  S.dirty = true; setSaveState('Alterações não salvas…'); clearTimeout(S.saveT); S.saveT = setTimeout(saveNow, 700);
}
/* campos controlados pelo servidor, copiados da resposta para a visita aberta */
const CAMPOS_SERVIDOR = ['versao', 'status', 'aprovacao', 'devolucao', 'enviadoEm', 'assinatura', 'updatedAt', 'createdAt', 'userId', 'userName'];
function aplicarDoServidor(local, srv) {
  CAMPOS_SERVIDOR.forEach(k => { if (k in srv) local[k] = srv[k]; else delete local[k]; });
  const i = S.visits.findIndex(x => x.id === srv.id); if (i >= 0) S.visits[i] = srv; else S.visits.unshift(srv);
}
let salvando = null;          // gravação em andamento (uma por vez, em ordem)
const pendentes = new Map();  // visitas que não foram gravadas por falta de conexão: id -> { v, doc }
/**
 * Grava a visita aberta no servidor. A visita e o conteúdo são capturados no momento da chamada,
 * então trocar de tela durante a gravação não perde nada. A versão evita sobrescrever a edição de outra pessoa.
 */
function saveNow() {
  clearTimeout(S.saveT);
  const v = S.cur;
  if (!v || !S.dirty) return salvando || Promise.resolve();
  S.dirty = false;
  return gravarVisita(v, JSON.parse(JSON.stringify(v)));
}
function gravarVisita(v, doc) {
  const anterior = salvando;
  const p = (async () => {
    if (anterior) await anterior;
    try {
      const r = await api.put('/visitas/' + encodeURIComponent(v.id), { visita: doc, versao: v.versao });
      pendentes.delete(v.id);
      aplicarDoServidor(v, r.visita);
      if (r.statusAlterado) { const s = $('#stSel'); if (s && S.cur === v) s.value = 'draft'; toast('Relatório aprovado foi alterado – status voltou para “Em andamento”', 4000); }
      if (S.cur === v) setSaveState('Salvo ' + new Date().toLocaleTimeString('pt-BR'));
    } catch (e) {
      if (e.codigo === 'CONFLITO') { pendentes.delete(v.id); if (S.cur === v) S.dirty = true; conflitoVisita(v, e.dados.atual); return; }
      if (e.status === 0) {
        pendentes.set(v.id, { v, doc });
        if (S.cur === v) setSaveState('Sem conexão – alterações pendentes (não feche esta página)');
        return;
      }
      if (S.cur === v) { S.dirty = true; setSaveState('Erro ao salvar: ' + msgErro(e)); }
      toast('Erro ao salvar: ' + msgErro(e), 5000);
    }
  })();
  salvando = p;
  p.finally(() => { if (salvando === p) salvando = null; });
  return p;
}
/** Reenvia o que ficou pendente por falta de conexão (a cada 15 s e quando a rede volta). */
function reenviarPendentes() {
  for (const [id, { v }] of pendentes) {
    pendentes.delete(id);
    gravarVisita(v, JSON.parse(JSON.stringify(v)));
  }
}
const haAlteracoesPendentes = () => S.dirty || !!salvando || pendentes.size > 0;
setInterval(() => { if (pendentes.size) reenviarPendentes(); }, 15000);
window.addEventListener('online', () => { reenviarPendentes(); if (S.dirty) saveNow(); });
/** Outra pessoa salvou a visita depois que ela foi aberta: o usuário escolhe qual versão fica. */
function conflitoVisita(v, atual) {
  modal(`<h3>Visita alterada por outra pessoa</h3>
    <p><b>${esc(visitTitle(atual))}</b> foi salva em ${dtHrBR(atual.updatedAt)} depois que você a abriu. Escolha o que fazer com as suas alterações:</p>
    <div class="row" style="justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
      <button class="btn" id="cfBaixar">Baixar minha versão (.json)</button>
      <button class="btn" id="cfRecarregar">Descartar as minhas e abrir a versão salva</button>
      <button class="btn danger" id="cfManter">Manter a minha (sobrescreve a outra)</button></div>`, (m, close) => {
    $('#cfBaixar', m).onclick = () => download(`visita_${safeName(visitTitle(v))}_minha_versao.json`, JSON.stringify(v), 'application/json');
    $('#cfRecarregar', m).onclick = () => { close(); S.dirty = false; aplicarDoServidor(atual, atual); go(atual.type, atual); toast('Versão salva carregada'); };
    $('#cfManter', m).onclick = () => { close(); v.versao = atual.versao; S.dirty = true; saveNow(); };
  });
}
function setSaveState(t) { const el = $('#saveState'); if (el) el.textContent = t; }
async function deleteVisit(id) {
  if (!(await confirmBox('Excluir esta visita definitivamente?'))) return;
  try { await api.del('/visitas/' + encodeURIComponent(id)); }
  catch (e) { return toast(msgErro(e), 4000); }
  S.visits = S.visits.filter(v => v.id !== id); if (S.cur && S.cur.id === id) { S.cur = null; S.dirty = false; }
  toast('Visita excluída'); go(S.tab === 'cfg' ? 'hist' : S.tab);
}
async function duplicateVisit(id) {
  try { const r = await api.post(`/visitas/${encodeURIComponent(id)}/duplicar`); S.visits.unshift(r.visita); toast('Visita duplicada'); go(S.tab); }
  catch (e) { toast(msgErro(e), 4000); }
}
function visitTitle(v) { return v.cli && v.cli.nome ? v.cli.nome : '(sem nome)'; }

function renderList(type) {
  const f = S.filter;
  let list = S.visits.filter(v => (!type || v.type === type) && (!f.type || type || v.type === f.type) && (!f.status || v.status === f.status));
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(v => [v.cli.nome, v.cli.contato, v.loc.endereco, v.loc.cidade, v.obs].join(' ').toLowerCase().includes(q)); }
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const all = S.visits.filter(v => !type || v.type === type);
  const cnt = t => S.visits.filter(v => v.type === t).length;
  const title = type ? 'Visitas – ' + TYPES[type].plural : 'Histórico de visitas';
  $('#main').innerHTML = `
    <div class="page-h"><h2>${title}</h2><div class="spacer"></div>
      ${type ? `<button class="btn primary" id="btnNew">+ Nova visita ${TYPES[type].nome.toLowerCase()}</button>` :
      `<button class="btn primary" data-new="cond">+ Condomínio</button><button class="btn teal" data-new="corp">+ Link Dedicado</button><button class="btn navy" data-new="evt">+ Evento</button>`}
    </div>
    ${!type ? `<div class="pf-hero" style="${S.user.banner ? `background-image:url(${S.user.banner})` : ''}"><div class="pf-hero-in">${avatarHTML(S.user, 64)}<div><h3>Olá, ${esc(S.user.name.split(' ')[0])}!</h3><span>${esc(S.user.role || 'Colaborador')}${isSup(S.user) ? ' · Supervisão' : ''}</span></div></div></div>` : ''}
    ${!type ? `<div class="stats">
      <div class="kpi"><div class="v">${S.visits.length}</div><div class="l">Visitas registradas</div></div>
      <div class="kpi"><div class="v">${cnt('cond')}</div><div class="l">Condomínios</div></div>
      <div class="kpi teal"><div class="v">${cnt('corp')}</div><div class="l">Links dedicados</div></div>
      <div class="kpi accent"><div class="v">${cnt('evt')}</div><div class="l">Eventos</div></div>
      <div class="kpi"><div class="v">${S.visits.filter(v => v.status === 'pending').length}</div><div class="l">Aguardando aprovação</div></div>
      <div class="kpi"><div class="v">${S.visits.filter(v => v.status === 'done').length}</div><div class="l">Concluídas</div></div>
    </div>` : ''}
    <div class="hist-tools">
      <input type="text" id="fQ" placeholder="Buscar cliente, endereço, observação…" value="${esc(f.q)}">
      ${!type ? `<select id="fT"><option value="">Todos os tipos</option>${Object.keys(TYPES).map(t => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPES[t].nome}</option>`).join('')}</select>` : ''}
      <select id="fS"><option value="">Todos os status</option>${Object.keys(STATUS).map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${STATUS[s].l}</option>`).join('')}</select>
      <div class="spacer" style="flex:1"></div>
      <button class="btn sm" id="kmlAll" ${list.some(v => v.loc.lat) ? '' : 'disabled'}>Exportar KML (lista)</button>
    </div>
    ${list.length ? `<div class="hist-grid">${list.map(v => `
      <div class="hcard ${v.type}">
        <div class="row"><span class="pill ${TYPES[v.type].pill}">${TYPES[v.type].nome}</span>${stPill(v.status)}</div>${v.devolucao && v.status === 'draft' ? `<div class="note warn" style="margin:0;padding:6px 8px"><svg class="ic" aria-hidden="true"><use href="#i-undo"/></svg> Devolvido por ${esc(v.devolucao.por)}: ${esc(v.devolucao.motivo)}</div>` : ''}${v.aprovacao && v.status === 'done' ? `<div class="small" style="color:var(--ok)"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> Aprovado por ${esc(v.aprovacao.por)} em ${dtBR(v.aprovacao.em.slice(0, 10))}</div>` : ''}
        <h4>${esc(visitTitle(v))}</h4>
        <div class="meta"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg> ${esc(v.loc.endereco || 'Endereço não informado')}${v.loc.cidade ? ' – ' + esc(v.loc.cidade) : ''}</div>
        <div class="meta"><svg class="ic" aria-hidden="true"><use href="#i-calendar"/></svg> Visita ${dtBR(v.cli.data)} · atualizado ${dtHrBR(v.updatedAt)}</div>
        <div class="meta">${summaryLine(v)}</div>
        <div class="acts"><button class="btn sm navy" data-open="${v.id}">Abrir</button><button class="btn sm" data-pdf="${v.id}">PDF</button><button class="btn sm" data-kmz="${v.id}">KMZ</button><button class="btn sm" data-dup="${v.id}">Duplicar</button><button class="btn sm danger" data-del="${v.id}">Excluir</button></div>
      </div>`).join('')}</div>`
      : `<div class="empty"><h3>${all.length ? 'Nenhuma visita encontrada com esses filtros' : 'Nenhuma visita registrada ainda'}</h3><p>Use os botões acima para iniciar uma nova visita técnica.</p></div>`}`;
  const btnNew = $('#btnNew'); if (btnNew) btnNew.onclick = () => newVisit(type);
  $$('[data-new]').forEach(b => b.onclick = () => newVisit(b.dataset.new));
  $('#fQ').oninput = e => { f.q = e.target.value; clearTimeout(S.fT); S.fT = setTimeout(() => { renderList(type); const i = $('#fQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  if ($('#fT')) $('#fT').onchange = e => { f.type = e.target.value; renderList(type); };
  $('#fS').onchange = e => { f.status = e.target.value; renderList(type); };
  $('#kmlAll').onclick = () => exportKMLList(list);
  const find = id => S.visits.find(v => v.id === id);
  $$('[data-open]').forEach(b => b.onclick = () => { const v = find(b.dataset.open); go(v.type, v); });
  $$('[data-pdf]').forEach(b => b.onclick = () => openReport(find(b.dataset.pdf)));
  $$('[data-kmz]').forEach(b => b.onclick = () => exportKMZ(find(b.dataset.kmz)));
  $$('[data-dup]').forEach(b => b.onclick = () => duplicateVisit(b.dataset.dup));
  $$('[data-del]').forEach(b => b.onclick = () => deleteVisit(b.dataset.del));
}
function summaryLine(v) {
  try {
    if (v.type === 'cond') { const c = calcCond(v.cond); if (!c.ok) return 'Estrutura não preenchida'; const o = condSel(v, c); return `${fmt(c.total)} unidades · ${o ? o.totalCTO + ' CTOs' : ''}`; }
    const ap = apSummary(v); return ap ? `${ap.N}× ${ap.model.curto}` + (v.type === 'corp' && v.corp.velocidade ? ` · ${v.corp.velocidade}` : '') : 'Dimensionamento pendente';
  } catch (e) { return ''; }
}

export { aplicarDoServidor, deleteVisit, haAlteracoesPendentes, renderList, saveNow, scheduleSave, summaryLine, visitTitle };
