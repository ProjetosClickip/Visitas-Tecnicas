/* ================== RESULTADOS (cálculos ao vivo) ================== */
import { S } from '../estado.js';
import { $, $$, esc, fmt, pct } from '../util.js';
import { isDupla } from './campos.js';
import { CABO_RESERVA, ENV_LABEL, UTP_MAX, areaOf, caboEstimado, calcAP, calcCond, calcEvento, calcRack, condSel, iOr, nOr, velLabel } from './dimensionamento.js';
import { renderCorpLink } from './link-dedicado.js';
import { scheduleSave } from './lista.js';
import { bindRackEdit, evtRackHTML } from './rack.js';

function apInputs(v) {
  if (v.type === 'corp') return { area: v.corp.area || {}, dev: iOr(v.corp.usuarios), mbps: nOr(v.corp.mbpsDisp, 3), cab: iOr(v.corp.pontosCabeados) };
  const e = calcEvento(v.evt); return { area: v.evt.area || {}, dev: e.wifi, mbps: nOr(v.evt.mbpsDisp, 2), cab: e.cabeados, ev: e };
}
function apUsed(v) { return v.type === 'evt' || (v.type === 'corp' && (v.corp.usaAP === 'sim' || (v.corp.usaAP === undefined && iOr(v.corp.usuarios) > 0))); }
function apSummary(v, cfg) {
  if (v.type === 'cond' || !apUsed(v)) return null;
  const I = apInputs(v);
  const ap = calcAP(cfg || S.cfg, I.area, I.dev, I.mbps, v.ap && v.ap.raio);
  const id = (v.ap && v.ap.escolha && ap.res[v.ap.escolha] && ap.res[v.ap.escolha].N) ? v.ap.escolha : ap.rec;
  if (!id) return null;
  return Object.assign({}, ap.res[id], { id, all: ap, I });
}
function updateCalc() {
  const v = S.cur; if (!v) return;
  if (v.type === 'cond') { renderQtd(); renderCTO(); }
  else { renderArea(); if (v.type === 'evt') renderEvt(); if (v.type === 'corp') renderCorpLink(); renderAP(); renderRack(); }
  renderInfraRes();
}
function renderInfraRes() { renderInfraRes1('infra'); if (isDupla(S.cur)) renderInfraRes1('infra2'); }
function renderInfraRes1(p) {
  const el = $('#res-' + p); if (!el) return; const I = S.cur[p] || {}; const m = nOr(I.metragem);
  el.innerHTML = m ? `<div class="note">Cabo ${esc(I.cabo || '')}: <b>${fmt(m)} m</b> (OzMap) + 30% de reserva = <b>${fmt(Math.ceil(m * (1 + CABO_RESERVA) / 10) * 10)} m</b> a lançar.</div>` : '';
}
function renderQtd() {
  const v = S.cur, c = calcCond(v.cond), el = $('#res-qtd'); if (!el) return;
  if (!c.ok) { el.innerHTML = `<div class="note warn">Preencha a estrutura do condomínio para gerar o quantitativo.</div>`; return; }
  const o = condSel(v, c) || c.opts[0];
  el.innerHTML = `<div class="kpis">
    ${c.vertical ? `<div class="kpi"><div class="v">${c.T}</div><div class="l">${esc(v.cond.nomenclatura || 'Torre')}s</div></div>
    <div class="kpi"><div class="v">${c.F}</div><div class="l">Andares por ${(v.cond.nomenclatura || 'torre').toLowerCase()}</div></div>
    <div class="kpi"><div class="v">${c.A}</div><div class="l">Aptos por andar</div></div>
    <div class="kpi"><div class="v">${fmt(c.porTorre)}</div><div class="l">Unidades por ${(v.cond.nomenclatura || 'torre').toLowerCase()}</div></div>`
      : `<div class="kpi"><div class="v">${fmt(c.H)}</div><div class="l">Casas</div></div>${c.extra ? `<div class="kpi"><div class="v">${c.extra}</div><div class="l">Unidades extras</div></div>` : ''}`}
    <div class="kpi accent"><div class="v">${fmt(c.total)}</div><div class="l">Total de unidades (HP)</div></div>
    <div class="kpi teal"><div class="v">${o.totalCTO}</div><div class="l">CTOs (${o.P} portas)</div></div>
    <div class="kpi"><div class="v">${fmt(o.portas)}</div><div class="l">Portas disponíveis · ocupação ${pct(o.ocup)}</div></div>
    <div class="kpi"><div class="v">${o.splitPri}</div><div class="l">Splitters 1:${o.S} primários (CEO)</div></div>
    <div class="kpi"><div class="v">${o.splitSec}</div><div class="l">CTOs 1:${o.P} (splitter secundário)</div></div>
    <div class="kpi"><div class="v">${fmt(c.dropTotal)} m</div><div class="l">Cabo drop estimado (${c.dropMed} m/un.)</div></div>
    <div class="kpi"><div class="v">${o.fusoes}</div><div class="l">Fusões estimadas (rede de acesso)</div></div>
  </div>`;
}
function renderCTO() {
  const v = S.cur, c = calcCond(v.cond), el = $('#res-cto'); if (!el) return;
  if (!c.ok) { el.innerHTML = ''; return; }
  const sel = v.cond.ctoEscolha && c.opts.some(o => o.id === v.cond.ctoEscolha) ? v.cond.ctoEscolha : c.rec;
  el.innerHTML = `<div class="tbl-wrap"><p class="small muted" style="margin:0 0 8px">Marque em <b>Adotar</b> a opção que será usada no relatório – o PDF exibe apenas a solução adotada.</p><table class="t"><tr><th>Adotar</th><th>Opção</th><th>CTOs / ${c.vertical ? 'torre' : 'total'}</th><th>Total CTOs</th><th>Portas</th><th>Ocupação</th><th>Localização</th>${c.vertical ? '<th>Cabo riser</th>' : ''}</tr>
  ${c.opts.map(o => `<tr class="${o.id === sel ? 'sel' : ''} ${o.id === c.rec ? 'rec' : ''}"><td><input type="radio" name="ctoOpt" value="${o.id}" ${o.id === sel ? 'checked' : ''}></td>
    <td><b>${esc(o.titulo)}</b>${o.id === c.rec ? ' <span class="pill evt">Recomendada</span>' : ''}<div class="small muted">${esc(o.desc)}</div></td>
    <td>${c.vertical ? o.porTorre : o.totalCTO}</td><td><b>${o.totalCTO}</b></td><td>${fmt(o.portas)} <span class="small muted">(${fmt(o.portas - c.total)} livres)</span></td><td>${pct(o.ocup)}</td><td class="small">${esc(o.locais)}</td>${c.vertical ? `<td class="small">${o.fibrasTorre}FO por torre</td>` : ''}</tr>`).join('')}
  </table></div>
  ${(() => { const o = c.opts.find(x => x.id === sel); return o ? `<div class="note"><b>Opção adotada no relatório:</b> ${esc(o.titulo)} – ${o.totalCTO} CTOs${v.cond.ctoEscolha === sel ? '' : ' (recomendação automática – marque outra opção para alterar)'}.</div>` : ''; })()}
  ${c.vertical ? `<div style="margin-top:12px"><b class="small">Diagrama vertical (opção adotada)</b><div id="riser" style="overflow-x:auto">${riserSVG(v, c, c.opts.find(o => o.id === sel))}</div></div>` : ''}
  ${(() => { const o = c.opts.find(x => x.id === sel); return o ? `<div class="note ${o.perda > 25 ? 'warn' : ''}">Divisão óptica total <b>1:${o.razao}</b> (splitter 1:${o.S} na CEO × CTO 1:${o.P}) – perda estimada dos splitters <b>${fmt(o.perda, 1)} dB</b>.${o.perda > 25 ? ' Verifique o orçamento óptico da PON (classe B+ 28 dB / C+ 32 dB) incluindo cabo, fusões e conectores.' : ''}</div>` : ''; })()}
  ${c.vertical && v.cond.andarInicial && !c.opts.some(o => o.tipo === 'grupo') ? `<div class="note warn">Nenhuma configuração intercalada a partir do ${esc(v.cond.andarInicial)}º andar atende a capacidade da CTO escolhida – aumente a CTO ou altere o andar inicial.</div>` : ''}
  <div class="note">Topologia FTTA/GPON: splitter primário 1:${c.S} na CEO de entrada e splitter secundário na CTO. CTOs instaladas nos shafts de telecomunicações respeitando um padrão entre torres; ligação CTO → apartamento com cabo drop <i>low friction indoor</i>. Reserva técnica aplicada: ${c.reserva}% das portas.</div>`;
}
function riserSVG(v, c, o) {
  if (!o) return '';
  const nT = Math.min(c.T, 6), F = c.F, fh = Math.max(14, Math.min(26, 360 / F)), tw = 120, gap = 40, H = F * fh + 70, W = nT * (tw + gap) + 40 + (c.T > 6 ? 90 : 0);
  const nome = v.cond.nomenclatura || 'Torre';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="font-family:Segoe UI,Arial;font-size:11px">`;
  for (let t = 0; t < nT; t++) {
    const x = 30 + t * (tw + gap), y0 = 20;
    s += `<text x="${x + tw / 2}" y="14" text-anchor="middle" font-weight="700" fill="#13294b">${nome} ${t + 1}</text>`;
    for (let f = F; f >= 1; f--) {
      const y = y0 + (F - f) * fh, has = o.andares.includes(f);
      s += `<rect x="${x}" y="${y}" width="${tw}" height="${fh}" fill="${has ? '#fff3ec' : '#f4f6fa'}" stroke="#c5cfdd"/>`;
      s += `<text x="${x + 4}" y="${y + fh / 2 + 4}" fill="#5d6b82">${f}º</text>`;
      if (has) { for (let k = 0; k < (o.porAndarCTO || 1); k++) s += `<rect x="${x + tw - 44 - k * 6}" y="${y + 3}" width="38" height="${fh - 6}" rx="3" fill="#f26a21"/><text x="${x + tw - 25 - k * 6}" y="${y + fh / 2 + 4}" text-anchor="middle" fill="#fff" font-weight="700">CTO</text>`; }
    }
    const yb = y0 + F * fh;
    s += `<rect x="${x}" y="${yb}" width="${tw}" height="16" fill="#13294b"/><text x="${x + tw / 2}" y="${yb + 12}" text-anchor="middle" fill="#fff">Térreo / shaft</text>`;
    s += `<line x1="${x + tw - 8}" y1="${y0}" x2="${x + tw - 8}" y2="${yb}" stroke="#159c98" stroke-width="2" stroke-dasharray="4 3"/>`;
    s += `<line x1="${x + tw / 2}" y1="${yb + 16}" x2="${x + tw / 2}" y2="${yb + 34}" stroke="#159c98" stroke-width="2"/>`;
  }
  const yl = 20 + F * fh + 34;
  s += `<line x1="${30 + tw / 2}" y1="${yl}" x2="${30 + (nT - 1) * (tw + gap) + tw / 2}" y2="${yl}" stroke="#159c98" stroke-width="2"/>`;
  if (c.T > 6) s += `<text x="${30 + nT * (tw + gap)}" y="${H / 2}" fill="#13294b">+ ${c.T - 6} ${nome.toLowerCase()}s</text>`;
  s += `<text x="30" y="${H - 6}" fill="#13294b" font-weight="700">CEO / splitter primário · cabo ${o.fibrasTorre}FO por ${nome.toLowerCase()} · ${o.porTorre} CTO(s) por ${nome.toLowerCase()}</text></svg>`;
  return s;
}
function renderArea() {
  const el = $('#res-area'); if (!el) return; const p = S.cur.type === 'corp' ? S.cur.corp : S.cur.evt;
  const a = areaOf(p.area); el.textContent = a.area ? `Área considerada no dimensionamento: ${fmt(a.area)} m²${a.W && a.L ? ` (${fmt(a.W, 1)} × ${fmt(a.L, 1)} m)` : ''}.` : 'Informe as dimensões ou a área total para dimensionar os access points.';
}
function renderEvt() {
  const el = $('#res-evt'); if (!el) return; const e = calcEvento(S.cur.evt);
  el.innerHTML = `<div class="tbl-wrap"><table class="t"><tr><th>Demanda Wi-Fi</th><th>Dispositivos</th><th>Base de cálculo</th></tr>
  ${e.linhas.map(l => `<tr><td>${esc(l[0])}</td><td><b>${fmt(l[1])}</b></td><td class="small muted">${esc(l[2])}</td></tr>`).join('')}
  <tr><td><b>Total de dispositivos Wi-Fi</b></td><td><b>${fmt(e.wifi)}</b></td><td></td></tr></table></div>
  <div class="kpis" style="margin-top:10px"><div class="kpi"><div class="v">${e.cabeados}</div><div class="l">Pontos cabeados</div></div>
  <div class="kpi"><div class="v">${fmt(e.stream * e.up)} Mbps</div><div class="l">Upload exclusivo p/ transmissões</div></div>
  <div class="kpi"><div class="v">${fmt(e.down)} Mbps</div><div class="l">Demanda estimada de download</div></div>
  <div class="kpi accent"><div class="v">${velLabel(e.link)}</div><div class="l">${e.manual ? 'Link adotado (escolha manual)' : 'Link recomendado'}</div></div></div>
  <div style="margin-top:12px"><div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Padrão de link adotado</div>
    <div class="seg">${e.tiers.map(t => `<button type="button" data-lk="${t}" class="${t === e.link ? 'on' : ''}">${velLabel(t)}${t === e.linkRec ? ' ★' : ''}</button>`).join('')}</div>
    <span class="small muted" style="margin-left:8px">★ recomendado para a demanda de ${fmt(e.need)} Mbps${e.manual ? ' · <a href="#" id="lkAuto">voltar ao recomendado</a>' : ''}</span></div>
  ${e.excede ? `<div class="note warn">A demanda estimada (${fmt(e.need)} Mbps) excede o maior padrão disponível (${velLabel(e.tiers[e.tiers.length - 1])}) – avalie links adicionais ou revise a demanda por dispositivo.</div>` : ''}
  ${!e.excede && e.link < e.need ? `<div class="note warn">O link escolhido (${velLabel(e.link)}) está abaixo da demanda estimada de ${fmt(e.need)} Mbps.</div>` : ''}`;
  $$('[data-lk]', el).forEach(b => b.onclick = ev => { ev.stopPropagation(); S.cur.evt.linkEscolhido = +b.dataset.lk === e.linkRec ? '' : +b.dataset.lk; scheduleSave(); renderEvt(); });
  const la = $('#lkAuto'); if (la) la.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); S.cur.evt.linkEscolhido = ''; scheduleSave(); renderEvt(); };
}
const AP_SPEC = [['padrao', 'Padrão de Wi-Fi'], ['mimo', 'MIMO'], ['portaOptica', 'Porta óptica'], ['portaEletrica', 'Porta elétrica'], ['raioMax', 'Alcance típico'], ['clientesMax', 'Dispositivos simultâneos'], ['aplicacao', 'Aplicação']];
function renderAP() {
  const v = S.cur, el = $('#res-ap'); if (!el) return;
  if (!apUsed(v)) { el.innerHTML = ''; return; }
  const I = apInputs(v); const ap = calcAP(S.cfg, I.area, I.dev, I.mbps, v.ap.raio);
  const sum = apSummary(v);
  const ids = Object.keys(ap.res);
  if (!areaOf(I.area).area && !I.dev) { el.innerHTML = `<div class="note warn">Informe a área/dimensões ${v.type === 'corp' ? 'e o número de dispositivos' : 'e o público'} para dimensionar os access points.</div>`; return; }
  el.innerHTML = `<div class="tbl-wrap"><table class="t"><tr><th>Parâmetro</th>${ids.map(id => `<th><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="radio" name="apOpt" value="${id}" ${sum && sum.id === id ? 'checked' : ''}>Adotar ${ap.models[id].nome}</label></th>`).join('')}</tr>
    ${AP_SPEC.map(([k, l]) => `<tr><td>${l}</td>${ids.map(id => `<td class="small">${esc(ap.models[id][k])}${k === 'raioMax' ? ' m' : ''}</td>`).join('')}</tr>`).join('')}
    <tr><td>Raio de atendimento de projeto</td>${ids.map(id => `<td><b>${ap.res[id].r} m</b> <span class="small muted">${(v.ap.raio || {})[id] ? '(manual)' : '(padrão do ambiente)'}</span></td>`).join('')}</tr>
    <tr><td>Cálculo por dispositivos simultâneos</td>${ids.map(id => `<td>${I.dev ? `${fmt(I.dev)} ÷ ${ap.models[id].clientesMax} = <b>${fmt(ap.res[id].razao, 2)}</b> → ${ap.res[id].capMin} AP(s) no mínimo, <b>${ap.res[id].cap}</b> arredondando` : '-'}</td>`).join('')}</tr>
    <tr><td>APs por cobertura da área</td>${ids.map(id => `<td>${ap.res[id].cov}</td>`).join('')}</tr>
    <tr class="sel"><td><b>Quantidade necessária</b></td>${ids.map(id => `<td><b style="font-size:18px">${ap.res[id].N}</b> <span class="small muted">limitado por ${ap.res[id].fator}</span>${id === ap.rec ? ' <span class="pill evt">Recomendado</span>' : ''}</td>`).join('')}</tr>
    <tr><td>Dispositivos por AP</td>${ids.map(id => `<td>${ap.res[id].devPorAP}</td>`).join('')}</tr>
    <tr><td>Consumo PoE total</td>${ids.map(id => `<td>${fmt(ap.res[id].poeTotal, 1)} W · ${ap.models[id].poe}</td>`).join('')}</tr>
  </table></div>
  ${sum ? `<div class="note"><b>Solução ${v.ap.escolha ? 'escolhida' : 'recomendada'}:</b> ${sum.N} × ${esc(sum.model.nome)} com raio de projeto de ${sum.r} m (${esc(ENV_LABEL[I.area.ambiente || 'salao'])}). ${sum.pos.length ? `Posições sugeridas em grade uniforme (m, a partir do canto superior esquerdo): ${sum.pos.map((p, i) => `AP${String(i + 1).padStart(2, '0')} (${fmt(p.x, 1)}; ${fmt(p.y, 1)})`).join(', ')}. Use <b>“Posicionar APs”</b> no croqui para aplicar na planta.` : 'Informe largura e comprimento para obter as posições sugeridas.'}</div>` : ''}
  `;
}
function velMbps(s) { const m = String(s || '').match(/([\d.,]+)\s*(G|M)/i); return m ? nOr(m[1]) * (m[2].toUpperCase() === 'G' ? 1000 : 1) : 0; }
function linkCheck(v, I) {
  const vel = velMbps(v.corp.velocidade === 'Outra' ? v.corp.velOutra : v.corp.velocidade); if (!vel || !I.dev) return '';
  const dem = Math.ceil(I.dev * I.mbps * 0.5);
  return `<div class="note ${dem > vel ? 'warn' : ''}">Demanda estimada de ${fmt(dem)} Mbps (${fmt(I.dev)} disp. × ${I.mbps} Mbps × 50% de simultaneidade) frente à velocidade solicitada de ${velLabel(vel)}${dem > vel ? ' – <b>considere um plano superior</b>.' : ' – atendido.'}</div>`;
}
function rackCables(v, sum) {
  const p = v.plan; if (!p || !p.scale || !p.elements) return null;
  const rack = p.elements.find(e => e.type === 'rack'); const aps = p.elements.filter(e => e.type === 'ap7660' || e.type === 'ap7664');
  if (!rack || !aps.length) return null;
  const pd = (v.type === 'corp' ? v.corp : v.evt).area.peDireito;
  return aps.map(a => { const L = caboEstimado((a.x - rack.x) * p.scale, (a.y - rack.y) * p.scale, pd); return { label: a.label, L, fibra: L > UTP_MAX }; });
}
function renderRack() {
  const v = S.cur, el = $('#res-rack'); if (!el) return; const sum = apSummary(v);
  if (v.type === 'corp') { const cab = sum ? rackCables(v, sum) : null; el.innerHTML = evtRackHTML(v, sum, cab); bindRackEdit(); return; }
  if (!sum) { el.innerHTML = `<div class="note warn">O rack será dimensionado após o cálculo dos access points.</div>`; return; }
  const cab = rackCables(v, sum);
  if (v.type === 'evt') { el.innerHTML = evtRackHTML(v, sum, cab); bindRackEdit(); return; }
  el.innerHTML = corpRackHTML(v, sum, cab);
}
function corpRackHTML(v, sum, cab) {
  const nAP = sum ? sum.N : 0, pts = iOr(v.corp.pontosCabeados);
  const r = calcRack(nAP, sum ? sum.model : null, pts);
  return `<div class="kpis"><div class="kpi accent"><div class="v">${r.rack}U</div><div class="l">Rack 19" de parede sugerido (${r.U}U ocupados + reserva)</div></div>
    <div class="kpi"><div class="v">${r.sw}p</div><div class="l">Switch PoE (${r.portas} portas necessárias)</div></div>
    <div class="kpi"><div class="v">${fmt(r.poe, 0)} W</div><div class="l">Orçamento PoE mínimo</div></div>
    <div class="kpi"><div class="v">${nAP + pts}</div><div class="l">Cabos UTP a lançar (${sum ? 'APs + pontos' : 'pontos cabeados'})</div></div></div>
    <div class="tbl-wrap" style="margin-top:10px"><table class="t"><tr><th>Item do rack</th><th>Qtd.</th></tr>${r.itens.map(i => `<tr><td>${i[0]}</td><td>${i[1]}</td></tr>`).join('')}</table></div>
    ${cab ? `<div class="tbl-wrap" style="margin-top:10px"><table class="t"><tr><th>Enlace rack → AP</th><th>Cabo estimado</th><th>Meio</th></tr>${cab.map(c => `<tr><td>${esc(c.label)}</td><td>${fmt(c.L)} m</td><td>${c.fibra ? '<b style="color:var(--bad)">Excede 90 m – usar cabo drop óptico</b>' : 'UTP CAT.5E/6'}</td></tr>`).join('')}</table></div>`
      : sum ? `<div class="note">Posicione o rack e os APs no croqui (com a escala calibrada) para calcular a metragem de cada enlace. Use <b>“Sugerir rack”</b> para posicioná-lo no ponto que minimiza o total de cabo.</div>` : ''}
    <div class="note">Equipamentos acondicionados em rack metálico de parede padrão 19", homologado para telecomunicações. Enlaces UTP limitados a ${UTP_MAX} m (TIA-568); acima disso o AP deve ser interligado por cabo drop de fibra óptica.</div>`;
}

export { AP_SPEC, apSummary, apUsed, rackCables, renderRack, riserSVG, updateCalc, velMbps };
