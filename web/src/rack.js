/* ================== RACK PADRÃO DE EVENTOS ================== */
import { S } from '../estado.js';
import { $, $$, confirmBox, esc, fmt } from '../util.js';
import { isDupla } from './campos.js';
import { RACK_EVENTO, calcRackEvento, iOr, nOr } from './dimensionamento.js';
import { scheduleSave } from './lista.js';
import { renderRack } from './resultados.js';

function evtRack(v, sum, cab) {
  const corp = v.type === 'corp', dupla = isDupla(v);
  const caboRows = corp ? [[v.infra, 1], ...(dupla ? [[v.infra2, 2]] : [])].filter(([i]) => i && nOr(i.metragem)).map(([i, ab]) => [(i.cabo || 'CABO ÓPTICO DE ABORDAGEM').toUpperCase(), nOr(i.metragem), ab]) : [];
  return calcRackEvento({ nAP: sum ? sum.N : 0, model: sum ? sum.model : null, cabeados: corp ? iOr(v.corp.pontosCabeados) : sum.I.cab, racks: v.rack.qtd || 1, cab: cab || [],
    dias: corp ? 0 : v.evt.dias, suporte: corp ? '' : v.evt.suporte, modo: corp ? 'corp' : 'evt', abordagens: dupla ? 2 : 1, caboRows });
}
function rackItensTable(title, rows, cls) {
  return `<table class="${cls || 't'}" style="margin-top:10px"><tr><th>${title}</th><th>Qtd.</th><th>Un.</th>${rows[0] && rows[0][3] !== undefined ? '<th>Base</th>' : ''}</tr>${rows.map(r => `<tr><td>${esc(r[0])}</td><td><b>${fmt(r[1])}</b></td><td>${esc(r[2])}</td>${r[3] !== undefined ? `<td class="small">${esc(r[3])}</td>` : ''}</tr>`).join('')}</table>`;
}
function evtRackHTML(v, sum, cab) {
  const r = evtRack(v, sum, cab);
  return `<div class="kpis"><div class="kpi accent"><div class="v">${r.racks}× 6U</div><div class="l">${esc(RACK_EVENTO.modelo)}</div></div>
    <div class="kpi"><div class="v">${r.sw}</div><div class="l">Switch DM-S100 8GP2GX (${r.portas} portas necessárias)</div></div>
    <div class="kpi"><div class="v">${fmt(r.poe, 0)} W</div><div class="l">Orçamento PoE mínimo</div></div>
    <div class="kpi"><div class="v">${r.fibraAPs}</div><div class="l">APs interligados por fibra</div></div></div>
    <div class="row" style="justify-content:space-between;margin-top:12px"><span class="small muted">Quantidades estimadas automaticamente – altere, remova ou acrescente itens conforme necessário. Itens não alterados continuam sendo recalculados.</span>${rackHasAdj(v) ? '<button class="btn sm" id="rkReset">↺ Restaurar lista automática</button>' : ''}</div><div class="tbl-wrap">${rackEditTable(v, 'solucao', 'Solução (itens do rack)', r.solucao)}${rackEditTable(v, 'materiais', 'Materiais', r.materiais)}${rackEditTable(v, 'servicos', 'Mão de obra', r.servicos)}</div>
    ${cab ? `<div class="tbl-wrap" style="margin-top:10px"><table class="t"><tr><th>Enlace rack → AP</th><th>Cabo estimado</th><th>Meio</th></tr>${cab.map(c => `<tr><td>${esc(c.label)}</td><td>${fmt(c.L)} m</td><td>${c.fibra ? '<b style="color:var(--bad)">Excede 90 m – cabo drop óptico + injetor PoE</b>' : 'UTP CAT.5E'}</td></tr>`).join('')}</table></div>`
      : sum ? `<div class="note">Posicione o rack e os APs no croqui (com escala calibrada) para calcular as metragens de UTP/drop e identificar APs que precisam de fibra. Sem isso, o UTP é estimado em ~50 m por ponto.</div>` : ''}
    <div class="note">Quantidades sugeridas com base nas listas de materiais do Drive (SENAC Capacitar e Zona Food). Revise antes de orçar.</div>`;
}

/* ---------- lista de itens do rack editável (ajustes por visita) ---------- */
const RK_GRUPOS = { solucao: 'Solução', materiais: 'Materiais', servicos: 'Mão de obra' };
function rackAdj(v) { v.rack = v.rack || {}; v.rack.ajustes = v.rack.ajustes || {}; v.rack.extras = v.rack.extras || {}; return v.rack; }
function rackHasAdj(v) { const r = v.rack || {}; return Object.values(r.ajustes || {}).some(g => Object.keys(g || {}).length) || Object.values(r.extras || {}).some(g => (g || []).length); }
/* lista final: automáticos (com ajustes) + itens adicionados */
function rackFinal(v, grp, rows) {
  const a = ((v.rack || {}).ajustes || {})[grp] || {}, ex = ((v.rack || {}).extras || {})[grp] || [];
  const out = rows.map(r => { const j = a[r[0]] || {}; const ed = j.q !== undefined && j.q !== ''; return { nome: r[0], auto: r[1], q: ed ? nOr(j.q) : r[1], un: r[2], base: r[3] || '', edit: ed, rm: !!j.rm }; });
  ex.forEach((x, i) => out.push({ nome: x.nome || '', auto: null, q: nOr(x.q), un: x.un || 'un', base: 'item adicionado', extra: true, i }));
  return out;
}
function rackEditTable(v, grp, title, rows) {
  const L = rackFinal(v, grp, rows);
  return `<table class="t" style="margin-top:10px"><tr><th>${title}</th><th style="width:130px">Qtd.</th><th style="width:90px">Un.</th><th>Base</th><th style="width:110px"></th></tr>
  ${L.map(x => x.extra
    ? `<tr><td><input type="text" data-rx="${grp}|${x.i}|nome" value="${esc(x.nome)}" placeholder="Descrição do item"></td><td><input type="number" min="0" step="any" data-rx="${grp}|${x.i}|q" value="${x.q}"></td><td><input type="text" data-rx="${grp}|${x.i}|un" value="${esc(x.un)}"></td><td class="small muted">item adicionado</td><td><button class="btn sm danger" data-rxd="${grp}|${x.i}">Remover</button></td></tr>`
    : x.rm
      ? `<tr style="opacity:.5"><td><s>${esc(x.nome)}</s></td><td>—</td><td>${esc(x.un)}</td><td class="small muted">removido da lista</td><td><button class="btn sm" data-rrs="${grp}|${esc(x.nome)}">Restaurar</button></td></tr>`
      : `<tr${x.edit ? ' class="sel"' : ''}><td>${esc(x.nome)}</td><td><input type="number" min="0" step="any" data-ri="${grp}|${esc(x.nome)}" value="${x.q}">${x.edit ? `<div class="small muted">automático: ${fmt(x.auto)}</div>` : ''}</td><td>${esc(x.un)}</td><td class="small">${esc(x.base)}</td><td><button class="btn sm danger" data-rrm="${grp}|${esc(x.nome)}">Remover</button></td></tr>`).join('')}
  <tr><td colspan="5"><button class="btn sm" data-rxa="${grp}">+ Adicionar item em ${RK_GRUPOS[grp]}</button></td></tr></table>`;
}
function bindRackEdit() {
  const el = $('#res-rack'); if (!el) return; const v = S.cur; const R = rackAdj(v);
  const sp = s => { const i = s.indexOf('|'); return [s.slice(0, i), s.slice(i + 1)]; };
  const redraw = () => { scheduleSave(); const y = window.scrollY; renderRack(); window.scrollTo(0, y); };
  $$('[data-ri]', el).forEach(inp => {
    inp.oninput = e => { e.stopPropagation(); const [g, n] = sp(inp.dataset.ri); R.ajustes[g] = R.ajustes[g] || {}; const j = R.ajustes[g][n] = R.ajustes[g][n] || {}; j.q = inp.value; scheduleSave(); };
    inp.onchange = e => { e.stopPropagation(); const [g, n] = sp(inp.dataset.ri); const j = (R.ajustes[g] || {})[n]; if (j && (j.q === '' )) delete j.q; if (j && !j.rm && j.q === undefined) delete R.ajustes[g][n]; redraw(); };
  });
  $$('[data-rx]', el).forEach(inp => {
    inp.oninput = e => { e.stopPropagation(); const [g, i, k] = inp.dataset.rx.split('|'); R.extras[g][+i][k] = inp.value; scheduleSave(); };
    inp.onchange = e => e.stopPropagation();
  });
  $$('[data-rrm]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const [g, n] = sp(b.dataset.rrm); R.ajustes[g] = R.ajustes[g] || {}; R.ajustes[g][n] = Object.assign(R.ajustes[g][n] || {}, { rm: true }); redraw(); });
  $$('[data-rrs]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const [g, n] = sp(b.dataset.rrs); const j = (R.ajustes[g] || {})[n]; if (j) { delete j.rm; if (j.q === undefined || j.q === '') delete R.ajustes[g][n]; } redraw(); });
  $$('[data-rxa]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const g = b.dataset.rxa; (R.extras[g] = R.extras[g] || []).push({ nome: '', q: 1, un: g === 'materiais' ? 'm' : 'un' }); redraw(); setTimeout(() => { const ins = $$(`[data-rx^="${g}|"][data-rx$="|nome"]`); ins.length && ins[ins.length - 1].focus(); }, 30); });
  $$('[data-rxd]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const [g, i] = b.dataset.rxd.split('|'); R.extras[g].splice(+i, 1); redraw(); });
  const rs = $('#rkReset'); if (rs) rs.onclick = async e => { e.stopPropagation(); if (await confirmBox('Descartar todas as alterações manuais e voltar à lista calculada automaticamente?')) { R.ajustes = {}; R.extras = {}; redraw(); } };
}
/* lista final para o relatório (sem removidos e sem quantidade zero) */
function rackFinalRows(v, grp, rows) { return rackFinal(v, grp, rows).filter(x => !x.rm && x.q > 0 && x.nome).map(x => [x.nome, x.q, x.un]); }

export { bindRackEdit, evtRack, evtRackHTML, rackFinalRows, rackItensTable };
