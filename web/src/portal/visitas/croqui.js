/* ================== CROQUI / PLANTA BAIXA ================== */
import { S, TYPES } from '../estado.js';
import { $, $$, IMG, confirmBox, download, dtBR, esc, fmt, pdfFirstPageNote, readImage, safeName, toast, uid } from '../util.js';
import { apModels, areaOf, calcCond, condSel, geoMedian, nOr, raioProj } from './dimensionamento.js';
import { scheduleSave, visitTitle } from './lista.js';
import { apSummary, renderRack } from './resultados.js';

const EL_TYPES = {
  rack: { l: 'Rack', c: '#13294b', s: 'sq', p: 'RACK' },
  ap7660: { l: 'AP GWN7660', c: '#159c98', s: 'ap', p: 'AP', model: 'gwn7660' },
  ap7664: { l: 'AP GWN7664ELR', c: '#f26a21', s: 'ap', p: 'AP', model: 'gwn7664elr' },
  entrada: { l: 'Entrada do cabo', c: '#d23c3c', s: 'tri', p: 'ENTRADA' },
  torre: { l: 'Torre / bloco', c: '#13294b', s: 'bld', p: 'TORRE' },
  casa: { l: 'Casa', c: '#1d3a66', s: 'house', p: 'CASA' },
  cto: { l: 'CTO', c: '#f26a21', s: 'sq', p: 'CTO' },
  ceo: { l: 'CEO (caixa de emenda)', c: '#7a3db8', s: 'circ', p: 'CEO' },
  poste: { l: 'Poste', c: '#555555', s: 'dot', p: 'P' },
  cxsub: { l: 'Caixa subterrânea', c: '#8a5a2b', s: 'sq', p: 'CX' },
  shaft: { l: 'Shaft', c: '#1d3a66', s: 'sq', p: 'SHAFT' },
  ponto: { l: 'Ponto cabeado', c: '#1f9d55', s: 'dot', p: 'PT' },
  stream: { l: 'Transmissão (live)', c: '#c2185b', s: 'dot', p: 'LIVE' },
  cred: { l: 'Credenciamento', c: '#d98a00', s: 'sq', p: 'CRED' },
  palco: { l: 'Palco / área especial', c: '#6b7a90', s: 'sq', p: 'PALCO' },
  texto: { l: 'Texto', c: '#13294b', s: 'text', p: '' },
  ref: { l: 'Âncora geográfica', c: '#000000', s: 'pin', p: 'REF' }
};
const RT_TYPES = {
  aerea: { l: 'Cabo aéreo', c: '#f26a21', d: [14, 8] },
  sub: { l: 'Subterrâneo', c: '#8a5a2b', d: [5, 5] },
  forro: { l: 'Pelo forro', c: '#13294b', d: [] },
  eletrocalha: { l: 'Eletrocalha', c: '#7a3db8', d: [] },
  eletroduto: { l: 'Eletroduto', c: '#555555', d: [10, 4, 2, 4] },
  utp: { l: 'Cabo UTP', c: '#159c98', d: [3, 5] },
  fibra: { l: 'Fibra / drop', c: '#d23c3c', d: [] }
};
const EL_BY_VISIT = {
  cond: ['torre', 'casa', 'shaft', 'cto', 'ceo', 'poste', 'cxsub', 'entrada', 'texto', 'ref'],
  corp: ['rack', 'ap7660', 'ap7664', 'entrada', 'ponto', 'texto', 'ref'],
  evt: ['rack', 'ap7660', 'ap7664', 'entrada', 'ponto', 'stream', 'cred', 'palco', 'texto', 'ref']
};
const RT_BY_VISIT = { cond: ['aerea', 'sub', 'fibra', 'eletroduto', 'forro', 'eletrocalha'], corp: ['aerea', 'sub', 'forro', 'eletrocalha', 'eletroduto', 'utp', 'fibra'], evt: ['aerea', 'sub', 'forro', 'eletrocalha', 'utp', 'fibra'] };

let LOGO_IMG = null;
function loadLogo() { if (LOGO_IMG) return; LOGO_IMG = new Image(); LOGO_IMG.src = IMG.logo; }
const imgCache = {};
function planImage(p) { if (!p || !p.img) return null; if (imgCache[p.img.length + p.img.slice(-40)]) return imgCache[p.img.length + p.img.slice(-40)]; const i = new Image(); i.src = p.img; imgCache[p.img.length + p.img.slice(-40)] = i; return i; }

function unitOf(p) { return Math.max(1, Math.max(p.w, p.h) / 900); }
function apRadiusM(v, type) {
  const m = apModels(S.cfg)[EL_TYPES[type].model]; const a = (v.type === 'corp' ? v.corp : v.evt) || {};
  return raioProj(m, (a.area || {}).ambiente, v.ap && v.ap.raio && v.ap.raio[m.id]);
}
function routeLen(r, p) { let L = 0; for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y); return p.scale ? L * p.scale : null; }

/* desenho compartilhado (tela e exportação) */
function drawPlan(ctx, v, st) {
  const p = v.plan, u = unitOf(p);
  ctx.save();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, p.w, p.h);
  const img = planImage(p);
  if (img && img.complete) ctx.drawImage(img, 0, 0, p.w, p.h);
  if (p.grid) drawGrid(ctx, p);
  if (p.area && p.area.w) { ctx.setLineDash([8 * u, 6 * u]); ctx.strokeStyle = 'rgba(19,41,75,.5)'; ctx.lineWidth = 1.5 * u; ctx.strokeRect(p.area.x, p.area.y, p.area.w, p.area.h); ctx.setLineDash([]); }
  // cobertura
  if (p.showCov !== false && p.scale) {
    for (const e of p.elements) if (EL_TYPES[e.type] && EL_TYPES[e.type].model) {
      const r = apRadiusM(v, e.type) / p.scale, c = EL_TYPES[e.type].c;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fillStyle = hexA(c, .13); ctx.fill();
      ctx.setLineDash([6 * u, 5 * u]); ctx.strokeStyle = hexA(c, .7); ctx.lineWidth = 1.5 * u; ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // rotas
  for (const r of p.routes) drawRoute(ctx, r, p, u, st && st.sel === r.id);
  if (st && st.draft && st.draft.pts.length) drawRoute(ctx, Object.assign({}, st.draft, { pts: st.hover ? [...st.draft.pts, st.hover] : st.draft.pts }), p, u, true);
  // escala
  if (p.scaleLine) { const [a, b] = p.scaleLine; ctx.strokeStyle = '#d23c3c'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); [a, b].forEach(q => { ctx.beginPath(); ctx.arc(q.x, q.y, 3 * u, 0, 7); ctx.fillStyle = '#d23c3c'; ctx.fill(); }); label(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8 * u, fmt(p.scaleLineM, 1) + ' m', u, '#d23c3c'); }
  if (st && st.scaleA) { ctx.beginPath(); ctx.arc(st.scaleA.x, st.scaleA.y, 5 * u, 0, 7); ctx.fillStyle = '#d23c3c'; ctx.fill(); if (st.hover) { ctx.strokeStyle = '#d23c3c'; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(st.scaleA.x, st.scaleA.y); ctx.lineTo(st.hover.x, st.hover.y); ctx.stroke(); } }
  // elementos
  const ctoTxt = condCTOtext(v);
  for (const e of p.elements) drawEl(ctx, e, u, st && st.sel === e.id, e.type === 'torre' ? ctoTxt : null);
  // norte + escala gráfica
  drawNorth(ctx, p, u);
  if (p.scale) drawScaleBar(ctx, p, u);
  ctx.restore();
}
function condCTOtext(v) {
  if (v.type !== 'cond') return null; const c = calcCond(v.cond); if (!c.ok || !c.vertical) return null;
  const o = condSel(v, c); return o ? (o.tipo === 'andar' ? `${o.porTorre} CTO · 1/andar` : `${o.porTorre} CTO · ${o.andares.map(a => a + 'º').join(',')}`) : null;
}
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function drawGrid(ctx, p) {
  if (!p.scale) return; const ppm = 1 / p.scale, step = ppm * (ppm > 25 ? 1 : ppm > 6 ? 5 : 10), big = step * 5;
  ctx.lineWidth = 1;
  for (let x = (p.area ? p.area.x % step : 0); x < p.w; x += step) { ctx.strokeStyle = Math.abs(((x - (p.area ? p.area.x : 0)) / big) % 1) < 0.01 ? '#cfd8e6' : '#eef2f7'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, p.h); ctx.stroke(); }
  for (let y = (p.area ? p.area.y % step : 0); y < p.h; y += step) { ctx.strokeStyle = Math.abs(((y - (p.area ? p.area.y : 0)) / big) % 1) < 0.01 ? '#cfd8e6' : '#eef2f7'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(p.w, y); ctx.stroke(); }
}
function drawRoute(ctx, r, p, u, sel) {
  const t = RT_TYPES[r.type] || RT_TYPES.fibra; if (r.pts.length < 1) return;
  ctx.beginPath(); r.pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
  if (sel) { ctx.strokeStyle = 'rgba(255,200,0,.6)'; ctx.lineWidth = 9 * u; ctx.setLineDash([]); ctx.stroke(); }
  ctx.strokeStyle = t.c; ctx.lineWidth = 3.2 * u; ctx.setLineDash(t.d.map(x => x * u)); ctx.lineJoin = 'round'; ctx.stroke(); ctx.setLineDash([]);
  r.pts.forEach(q => { ctx.beginPath(); ctx.arc(q.x, q.y, 2.6 * u, 0, 7); ctx.fillStyle = t.c; ctx.fill(); });
  const L = routeLen(r, p);
  if (r.pts.length > 1 && L != null) { const i = Math.floor((r.pts.length - 1) / 2), a = r.pts[i], b = r.pts[i + 1]; label(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2 - 8 * u, `${t.l}: ${fmt(L)} m`, u, t.c); }
}
function label(ctx, x, y, txt, u, col, bold) {
  ctx.font = `${bold ? '700 ' : '600 '}${11 * u}px Segoe UI, Arial`; const w = ctx.measureText(txt).width + 8 * u, h = 15 * u;
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x - w / 2, y - h / 2, w, h); ctx.strokeStyle = col; ctx.lineWidth = 1 * u; ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + 0.5 * u);
}
function drawEl(ctx, e, u, sel, extra) {
  const t = EL_TYPES[e.type]; if (!t) return; const s = 11 * u, c = t.c;
  ctx.save(); ctx.translate(e.x, e.y);
  if (sel) { ctx.beginPath(); ctx.arc(0, 0, s * 1.9, 0, 7); ctx.fillStyle = 'rgba(255,200,0,.45)'; ctx.fill(); }
  ctx.lineWidth = 1.6 * u; ctx.strokeStyle = '#fff'; ctx.fillStyle = c;
  switch (t.s) {
    case 'ap': ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u;
      for (const k of [0.35, 0.6]) { ctx.beginPath(); ctx.arc(0, s * 0.35, s * k * 1.2, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke(); } ctx.beginPath(); ctx.arc(0, s * 0.35, 1.6 * u, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); break;
    case 'sq': ctx.fillRect(-s, -s * 0.75, s * 2, s * 1.5); ctx.strokeRect(-s, -s * 0.75, s * 2, s * 1.5); ctx.fillStyle = '#fff'; ctx.font = `700 ${7 * u}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.p.slice(0, 5), 0, 0.5 * u); break;
    case 'circ': ctx.beginPath(); ctx.arc(0, 0, s * 0.9, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `700 ${7 * u}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.p, 0, 0.5 * u); break;
    case 'dot': ctx.beginPath(); ctx.arc(0, 0, s * 0.55, 0, 7); ctx.fill(); ctx.stroke(); break;
    case 'tri': ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = `700 ${9 * u}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('E', 0, 2 * u); break;
    case 'bld': ctx.fillRect(-s * 1.6, -s * 1.3, s * 3.2, s * 2.6); ctx.strokeRect(-s * 1.6, -s * 1.3, s * 3.2, s * 2.6); ctx.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-s * 1.2 + i * s * 0.9, -s * 0.9 + j * s * 1.0, s * 0.5, s * 0.55); break;
    case 'house': ctx.beginPath(); ctx.moveTo(-s, -s * 0.1); ctx.lineTo(0, -s); ctx.lineTo(s, -s * 0.1); ctx.lineTo(s * 0.75, -s * 0.1); ctx.lineTo(s * 0.75, s * 0.8); ctx.lineTo(-s * 0.75, s * 0.8); ctx.lineTo(-s * 0.75, -s * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'pin': ctx.beginPath(); ctx.arc(0, -s, s * 0.6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.7); ctx.lineTo(0, 0); ctx.lineTo(s * 0.5, -s * 0.7); ctx.fill(); break;
  }
  ctx.restore();
  if (t.s === 'text') { ctx.font = `700 ${(e.size || 14) * u}px Segoe UI, Arial`; ctx.fillStyle = e.color || c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e.label || 'Texto', e.x, e.y); if (sel) { const w = ctx.measureText(e.label || 'Texto').width; ctx.strokeStyle = '#f2b400'; ctx.strokeRect(e.x - w / 2 - 4, e.y - 10 * u, w + 8, 20 * u); } return; }
  const dy = t.s === 'bld' ? s * 1.3 + 10 * u : s + 10 * u;
  if (e.label) label(ctx, e.x, e.y + dy, e.label, u, c, true);
  if (extra) label(ctx, e.x, e.y + dy + 16 * u, extra, u, '#f26a21');
}
function drawNorth(ctx, p, u) {
  const x = p.w - 34 * u, y = 40 * u, r = (p.rot || 0) * Math.PI / 180;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-r);
  ctx.beginPath(); ctx.arc(0, 0, 18 * u, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.strokeStyle = '#13294b'; ctx.lineWidth = 1 * u; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -15 * u); ctx.lineTo(6 * u, 6 * u); ctx.lineTo(0, 2 * u); ctx.lineTo(-6 * u, 6 * u); ctx.closePath(); ctx.fillStyle = '#f26a21'; ctx.fill();
  ctx.fillStyle = '#13294b'; ctx.font = `700 ${9 * u}px Arial`; ctx.textAlign = 'center'; ctx.fillText('N', 0, 15 * u); ctx.restore();
}
function drawScaleBar(ctx, p, u) {
  const target = 140 * u * p.scale; const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(n => n >= target * 0.5) || 1000;
  const px = nice / p.scale, x = 16 * u, y = p.h - 18 * u;
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x - 6 * u, y - 18 * u, px + 60 * u, 26 * u);
  ctx.fillStyle = '#13294b'; ctx.fillRect(x, y - 4 * u, px / 2, 6 * u); ctx.strokeStyle = '#13294b'; ctx.lineWidth = 1 * u; ctx.strokeRect(x, y - 4 * u, px, 6 * u);
  ctx.font = `600 ${10 * u}px Arial`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(`0        ${nice} m`, x, y - 7 * u);
}

/* ---------- editor ---------- */
const CQ = window.CQ = {
  v: null, cv: null, ctx: null, tool: 'sel', st: {}, undo: [],
  get p() { return this.v.plan; },
  draw() { if (!this.cv || !this.v || !this.v.plan) return; drawPlan(this.ctx, this.v, this.st); this.side(); },
  snap() { this.undo.push(JSON.stringify({ e: this.p.elements, r: this.p.routes })); if (this.undo.length > 40) this.undo.shift(); },
  changed() { scheduleSave(); this.draw(); if (typeof renderRack === 'function') renderRack(); },
  pt(ev) { const r = this.cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * this.cv.width / r.width, y: (ev.clientY - r.top) * this.cv.height / r.height }; },
  tol() { const r = this.cv.getBoundingClientRect(); return 16 * this.cv.width / r.width; },
  hitEl(q) { const t = this.tol() * 1.2; let best = null, bd = 1e9; for (const e of this.p.elements) { const d = Math.hypot(e.x - q.x, e.y - q.y); if (d < t * (e.type === 'torre' ? 1.8 : 1) && d < bd) { bd = d; best = e; } } return best; },
  hitRoute(q) { const t = this.tol() * 0.7; for (const r of this.p.routes) { for (let i = 0; i < r.pts.length; i++) if (Math.hypot(r.pts[i].x - q.x, r.pts[i].y - q.y) < t) return { r, i }; for (let i = 1; i < r.pts.length; i++) if (segDist(q, r.pts[i - 1], r.pts[i]) < t / 1.5) return { r, i: -1 }; } return null; },
  nextLabel(type) {
    const t = EL_TYPES[type]; if (type === 'texto') return 'Texto';
    if (type === 'torre') { const n = this.p.elements.filter(e => e.type === 'torre').length + 1; return (this.v.cond.nomenclatura || 'Torre') + ' ' + n; }
    const pre = t.p === 'AP' ? 'AP' : t.p; const n = this.p.elements.filter(e => (EL_TYPES[e.type] || {}).p === t.p).length + 1;
    return t.p === 'ENTRADA' || t.p === 'REF' || t.p === 'RACK' && n === 1 ? (t.p === 'REF' ? 'Referência' : t.p === 'RACK' ? 'Rack' : 'Entrada') : pre + '-' + String(n).padStart(2, '0');
  },
  down(ev) {
    const q = this.pt(ev), tool = this.tool;
    if (tool === 'sel') {
      const e = this.hitEl(q); if (e) { this.snap(); this.st.sel = e.id; this.st.drag = { e, dx: e.x - q.x, dy: e.y - q.y }; this.cv.setPointerCapture(ev.pointerId); this.draw(); return; }
      const hr = this.hitRoute(q); if (hr) { this.st.sel = hr.r.id; if (hr.i >= 0) { this.snap(); this.st.dragV = hr; this.cv.setPointerCapture(ev.pointerId); } this.draw(); return; }
      this.st.sel = null; this.draw(); return;
    }
    if (tool === 'del') {
      const e = this.hitEl(q); if (e) { this.snap(); this.p.elements = this.p.elements.filter(x => x !== e); this.changed(); return; }
      const hr = this.hitRoute(q); if (hr) { this.snap(); this.p.routes = this.p.routes.filter(x => x !== hr.r); this.changed(); } return;
    }
    if (tool === 'scale') {
      if (!this.st.scaleA) { this.st.scaleA = q; this.status('Clique no segundo ponto da medida conhecida.'); this.draw(); return; }
      const a = this.st.scaleA, d = Math.hypot(q.x - a.x, q.y - a.y); this.st.scaleA = null;
      const m = nOr(prompt('Distância real entre os dois pontos (metros):', '10'));
      if (m > 0 && d > 2) { this.p.scale = m / d; this.p.scaleLine = [a, q]; this.p.scaleLineM = m; toast('Escala calibrada: 1 m = ' + fmt(d / m, 1) + ' px'); this.setTool('sel'); this.changed(); }
      else this.draw(); return;
    }
    if (tool.startsWith('rt:')) {
      if (!this.st.draft) this.st.draft = { id: uid(), type: tool.slice(3), pts: [] };
      this.st.draft.pts.push(q); this.status(`Rota: ${this.st.draft.pts.length} ponto(s). Duplo clique, Enter ou “Concluir rota” para finalizar.`); this.draw(); return;
    }
    if (tool.startsWith('el:')) {
      const type = tool.slice(3); this.snap();
      let lab = this.nextLabel(type);
      if (type === 'texto') { lab = prompt('Texto do rótulo:', ''); if (!lab) return; }
      if (type === 'ref') this.p.elements = this.p.elements.filter(e => e.type !== 'ref');
      const e = { id: uid(), type, x: q.x, y: q.y, label: lab }; this.p.elements.push(e); this.st.sel = e.id; this.changed();
    }
  },
  move(ev) {
    const q = this.pt(ev);
    if (this.st.drag) { this.st.drag.e.x = q.x + this.st.drag.dx; this.st.drag.e.y = q.y + this.st.drag.dy; this.draw(); return; }
    if (this.st.dragV) { this.st.dragV.r.pts[this.st.dragV.i] = q; this.draw(); return; }
    if (this.st.draft || this.st.scaleA) { this.st.hover = q; this.draw(); }
  },
  up() { if (this.st.drag || this.st.dragV) { this.st.drag = this.st.dragV = null; this.changed(); } },
  finishRoute() { const d = this.st.draft; this.st.draft = null; this.st.hover = null; if (d && d.pts.length > 1) { this.snap(); this.p.routes.push(d); this.changed(); this.status('Rota adicionada.'); } else this.draw(); },
  setTool(t) {
    if (this.st.draft && t !== this.tool) this.finishRoute();
    this.tool = t; this.st.scaleA = null;
    $$('#cqTools [data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    this.status(t === 'sel' ? 'Selecionar/mover: arraste elementos ou vértices das rotas.' : t === 'del' ? 'Clique em um elemento ou rota para excluir.' : t === 'scale' ? 'Calibrar escala: clique no 1º ponto de uma medida conhecida.' : t.startsWith('rt:') ? 'Clique para adicionar pontos da rota.' : 'Clique na planta para posicionar: ' + EL_TYPES[t.slice(3)].l);
  },
  status(m) { const s = $('#cqStatus'); if (s) s.textContent = m; },
  side() {
    const el = $('#cqSide'); if (!el) return; const p = this.p;
    const sel = p.elements.find(e => e.id === this.st.sel) || p.routes.find(r => r.id === this.st.sel);
    const counts = {}; p.elements.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
    const rl = {}; p.routes.forEach(r => { const L = routeLen(r, p); rl[r.type] = (rl[r.type] || 0) + (L || 0); });
    el.innerHTML = `
      <h4>Escala e orientação</h4>
      <div>${p.scale ? `1 px = ${fmt(p.scale * 100, 2)} cm · ${fmt(p.w * p.scale, 1)} × ${fmt(p.h * p.scale, 1)} m` : '<span style="color:var(--bad)">Escala não calibrada</span>'}</div>
      <div class="row" style="margin-top:6px"><span>Norte (°)</span><input type="number" id="cqRot" value="${p.rot || 0}" style="width:80px" title="Rotação da planta em relação ao norte (horário)"></div>
      <label class="row" style="margin-top:6px"><input type="checkbox" id="cqCov" ${p.showCov !== false ? 'checked' : ''}> Mostrar raio de cobertura</label>
      ${sel ? `<h4>Selecionado</h4>${sel.pts ? `<div><b>${RT_TYPES[sel.type].l}</b> · ${sel.pts.length} pontos${p.scale ? ' · ' + fmt(routeLen(sel, p)) + ' m' : ''}</div><select id="cqRtType">${Object.entries(RT_TYPES).map(([k, t]) => `<option value="${k}" ${k === sel.type ? 'selected' : ''}>${t.l}</option>`).join('')}</select>`
        : `<div><b>${EL_TYPES[sel.type].l}</b></div><input type="text" id="cqLbl" value="${esc(sel.label || '')}" placeholder="Rótulo" style="margin:4px 0"><input type="text" id="cqNote" value="${esc(sel.note || '')}" placeholder="Observação (andar, altura…)">`}
        <button class="btn sm danger" id="cqDelSel" style="margin-top:6px">Excluir selecionado</button>` : ''}
      <h4>Elementos</h4><div class="el-list">${Object.keys(counts).length ? Object.entries(counts).map(([k, n]) => `<div><span class="legend-i"><span class="sw" style="width:10px;height:10px;border-radius:2px;background:${EL_TYPES[k].c}"></span>${EL_TYPES[k].l}</span><b>${n}</b></div>`).join('') : '<span class="muted">Nenhum</span>'}</div>
      <h4>Rotas de cabo</h4><div class="el-list">${Object.keys(rl).length ? Object.entries(rl).map(([k, L]) => `<div><span class="legend-i"><span style="width:16px;height:3px;background:${RT_TYPES[k].c}"></span>${RT_TYPES[k].l}</span><b>${p.scale ? fmt(L) + ' m' : '—'}</b></div>`).join('') : '<span class="muted">Nenhuma</span>'}</div>`;
    $('#cqRot').onchange = e => { p.rot = nOr(e.target.value); this.changed(); };
    $('#cqCov').onchange = e => { p.showCov = e.target.checked; this.changed(); };
    if ($('#cqLbl')) { $('#cqLbl').onchange = e => { sel.label = e.target.value; this.changed(); }; $('#cqNote').onchange = e => { sel.note = e.target.value; scheduleSave(); }; }
    if ($('#cqRtType')) $('#cqRtType').onchange = e => { sel.type = e.target.value; this.changed(); };
    if ($('#cqDelSel')) $('#cqDelSel').onclick = () => { this.snap(); p.elements = p.elements.filter(x => x !== sel); p.routes = p.routes.filter(x => x !== sel); this.st.sel = null; this.changed(); };
  }
};
function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }

function initCroqui(v) {
  loadLogo();
  const box = $('#croqui'); if (!box) return;
  CQ.v = v; CQ.st = {}; CQ.undo = []; CQ.tool = 'sel';
  if (!v.plan) {
    const a = v.type === 'cond' ? {} : areaOf((v.type === 'corp' ? v.corp : v.evt).area);
    box.innerHTML = `<div class="empty" style="padding:28px"><h3>Nenhuma planta carregada</h3><p>Carregue a planta baixa (JPG/PNG – foto ou print do projeto) para desenhar o croqui com as informações levantadas, ou gere uma base quadriculada a partir das medidas.</p>
      <div class="row" style="justify-content:center"><label class="btn primary">📐 Carregar planta baixa<input type="file" id="cqUp" accept="image/*" hidden></label>
      <button class="btn navy" id="cqGrid">${a.W && a.L ? `Gerar base ${fmt(a.W, 0)} × ${fmt(a.L, 0)} m` : 'Gerar base quadriculada'}</button></div></div>`;
    $('#cqUp').onchange = e => loadPlanFile(e.target.files[0]);
    $('#cqGrid').onclick = () => {
      let W = a.W, L = a.L;
      if (!(W && L)) { const r = prompt('Dimensões da área (largura x comprimento, em metros):', '100 x 60'); if (!r) return; const m = r.match(/([\d.,]+)\D+([\d.,]+)/); if (!m) return; W = nOr(m[1]); L = nOr(m[2]); }
      const ppm = Math.min(40, 1500 / Math.max(W, L)), mg = 50;
      v.plan = { img: null, grid: true, w: Math.round(W * ppm + 2 * mg), h: Math.round(L * ppm + 2 * mg), scale: 1 / ppm, area: { x: mg, y: mg, w: W * ppm, h: L * ppm, W, L }, rot: 0, elements: [], routes: [], showCov: true };
      scheduleSave(); initCroqui(v);
    };
    return;
  }
  const p = v.plan; p.elements = p.elements || []; p.routes = p.routes || [];
  const els = EL_BY_VISIT[v.type].filter(t => t !== 'casa' || v.cond.kind === 'horizontal').filter(t => t !== 'torre' || v.type !== 'cond' || v.cond.kind !== 'horizontal');
  box.innerHTML = `
    <div class="cq-tools" id="cqTools">
      <button data-tool="sel" class="on">🖱️ Selecionar</button><button data-tool="del">🗑️ Apagar</button><button data-tool="scale">📏 Calibrar escala</button>
      ${els.map(t => `<button data-tool="el:${t}"><span class="sw" style="background:${EL_TYPES[t].c}"></span>${EL_TYPES[t].l}</button>`).join('')}
    </div>
    <div class="cq-tools">
      ${RT_BY_VISIT[v.type].map(t => `<button data-tool="rt:${t}" form-tool><span style="width:16px;height:3px;background:${RT_TYPES[t].c};display:inline-block"></span>${RT_TYPES[t].l}</button>`).join('')}
      <button id="cqFin" class="">✔ Concluir rota</button>
    </div>
    <div class="cq-tools">
      ${v.type === 'cond' ? `<button id="cqAutoT">🏢 Inserir ${v.cond.kind === 'horizontal' ? 'CTOs' : 'torres'} automaticamente</button>` : `<button id="cqAutoAP">📡 Posicionar APs</button><button id="cqRack">🗄️ Sugerir rack</button>`}
      <button id="cqUndo">↶ Desfazer</button><label class="btn sm" style="font-size:13px">🔄 Trocar planta<input type="file" id="cqUp2" accept="image/*" hidden></label>
      <button id="cqPng">⬇ PNG do croqui</button><button id="cqClr" style="color:var(--bad)">Remover planta</button>
    </div>
    <div class="cq-wrap"><div><div class="cq-canvas-box"><canvas id="cqCv"></canvas></div><div class="cq-status" id="cqStatus"></div></div><div class="cq-side" id="cqSide"></div></div>`;
  const cv = $('#cqCv'); cv.width = p.w; cv.height = p.h; CQ.cv = cv; CQ.ctx = cv.getContext('2d');
  const img = planImage(p); if (img && !img.complete) img.onload = () => CQ.draw();
  cv.onpointerdown = e => { e.preventDefault(); CQ.down(e); };
  cv.onpointermove = e => CQ.move(e);
  cv.onpointerup = () => CQ.up();
  cv.ondblclick = () => { if (CQ.st.draft) { CQ.st.draft.pts.pop(); CQ.finishRoute(); } };
  $$('#cqTools [data-tool], [form-tool]').forEach(b => b.onclick = () => CQ.setTool(b.dataset.tool));
  $('#cqFin').onclick = () => CQ.finishRoute();
  $('#cqUndo').onclick = () => { const s = CQ.undo.pop(); if (!s) return toast('Nada para desfazer'); const o = JSON.parse(s); p.elements = o.e; p.routes = o.r; CQ.changed(); };
  $('#cqUp2').onchange = e => loadPlanFile(e.target.files[0], true);
  $('#cqPng').onclick = () => download(`croqui_${safeName(visitTitle(v))}.png`, dataURLtoBlob(croquiDataURL(v)));
  $('#cqClr').onclick = async () => { if (await confirmBox('Remover a planta e todos os elementos do croqui?')) { v.plan = null; scheduleSave(); initCroqui(v); renderRack && v.type !== 'cond' && renderRack(); } };
  if ($('#cqAutoAP')) $('#cqAutoAP').onclick = autoAPs;
  if ($('#cqRack')) $('#cqRack').onclick = suggestRack;
  if ($('#cqAutoT')) $('#cqAutoT').onclick = autoTowers;
  if (!CQ._key) { CQ._key = true; document.addEventListener('keydown', e => { if (!CQ.cv || !document.body.contains(CQ.cv)) return; if (e.target.matches('input,textarea,select')) return; if (e.key === 'Enter') CQ.finishRoute(); if (e.key === 'Escape') { CQ.st.draft = null; CQ.st.scaleA = null; CQ.draw(); } if ((e.key === 'Delete' || e.key === 'Backspace') && CQ.st.sel) { CQ.snap(); CQ.p.elements = CQ.p.elements.filter(x => x.id !== CQ.st.sel); CQ.p.routes = CQ.p.routes.filter(x => x.id !== CQ.st.sel); CQ.st.sel = null; CQ.changed(); } }); }
  CQ.setTool('sel'); CQ.draw();
  if (!p.scale) CQ.status('Dica: calibre a escala (📏) clicando nas extremidades de uma medida conhecida da planta.');
}
async function loadPlanFile(f, keep) {
  if (!f) return; if (f.type === 'application/pdf') return pdfFirstPageNote();
  const v = S.cur; try {
    const r = await readImage(f, 2000, 0.85);
    const old = v.plan;
    v.plan = { img: r.data, w: r.w, h: r.h, scale: null, rot: 0, elements: [], routes: [], showCov: true };
    if (keep && old && old.elements) { const kx = r.w / old.w, ky = r.h / old.h; v.plan.elements = old.elements.map(e => Object.assign(e, { x: e.x * kx, y: e.y * ky })); v.plan.routes = old.routes.map(rt => Object.assign(rt, { pts: rt.pts.map(q => ({ x: q.x * kx, y: q.y * ky })) })); v.plan.rot = old.rot; }
    scheduleSave(); initCroqui(v); toast('Planta carregada');
  } catch (e) { toast('Não foi possível ler a imagem'); }
}
function dataURLtoBlob(d) { const [h, b] = d.split(','); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: h.match(/:(.*?);/)[1] }); }

async function autoAPs() {
  const v = S.cur, p = v.plan, sum = apSummary(v);
  if (!sum) return toast('Preencha área e demanda para dimensionar os APs');
  if (!(sum.W && sum.L)) return toast('Informe largura e comprimento da área');
  const existing = p.elements.filter(e => EL_TYPES[e.type].model);
  if (existing.length && !(await confirmBox(`Substituir os ${existing.length} APs existentes por ${sum.N} × ${sum.model.curto}?`))) return;
  CQ.snap();
  if (!p.scale) { p.scale = Math.max(sum.W / (p.w * 0.94), sum.L / (p.h * 0.94)); toast('Escala estimada a partir das medidas – calibre para maior precisão', 4000); }
  if (!p.area || !p.area.w || Math.abs(p.area.W - sum.W) > 0.01 || Math.abs(p.area.L - sum.L) > 0.01) { const w = sum.W / p.scale, h = sum.L / p.scale; p.area = { x: (p.w - w) / 2, y: (p.h - h) / 2, w, h, W: sum.W, L: sum.L }; }
  p.elements = p.elements.filter(e => !EL_TYPES[e.type].model);
  const type = sum.id === 'gwn7660' ? 'ap7660' : 'ap7664';
  sum.pos.forEach((q, i) => p.elements.push({ id: uid(), type, x: p.area.x + q.x / p.scale, y: p.area.y + q.y / p.scale, label: 'AP-' + String(i + 1).padStart(2, '0') }));
  if (!p.elements.some(e => e.type === 'rack')) suggestRack(true);
  CQ.changed(); toast(`${sum.N} APs posicionados`);
}
function suggestRack(silent) {
  const p = S.cur.plan; const aps = p.elements.filter(e => EL_TYPES[e.type].model);
  if (!aps.length) return toast('Posicione os APs primeiro');
  if (silent !== true) CQ.snap();
  const m = geoMedian(aps); let r = p.elements.find(e => e.type === 'rack');
  if (!r) { r = { id: uid(), type: 'rack', label: 'Rack' }; p.elements.push(r); }
  r.x = m.x; r.y = m.y; r.note = r.note || 'Posição sugerida (menor metragem total de cabo)';
  if (silent !== true) { CQ.changed(); toast('Rack posicionado no ponto de menor metragem total de cabo – ajuste conforme o local disponível'); }
}
async function autoTowers() {
  const v = S.cur, p = v.plan, c = calcCond(v.cond);
  if (!c.ok) return toast('Preencha a estrutura do condomínio');
  const type = c.vertical ? 'torre' : 'cto';
  const o = condSel(v, c);
  const n = c.vertical ? c.T : o.totalCTO;
  if (p.elements.some(e => e.type === type) && !(await confirmBox(`Substituir os elementos "${EL_TYPES[type].l}" existentes?`))) return;
  CQ.snap(); p.elements = p.elements.filter(e => e.type !== type);
  const cols = Math.ceil(Math.sqrt(n * p.w / p.h)), rows = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const cx = (i % cols + 0.5) / cols, cy = (Math.floor(i / cols) + 0.5) / rows;
    p.elements.push({ id: uid(), type, x: p.w * (0.08 + cx * 0.84), y: p.h * (0.1 + cy * 0.8), label: c.vertical ? `${v.cond.nomenclatura || 'Torre'} ${i + 1}` : 'CTO-' + String(i + 1).padStart(2, '0') });
  }
  CQ.changed(); toast(`${n} ${EL_TYPES[type].l.toLowerCase()} inseridos – arraste para as posições reais`);
}

/* ---------- exportação (croqui + carimbo) ---------- */
function croquiDataURL(v, maxW = 2000) {
  const p = v.plan; if (!p) return null;
  const u = unitOf(p), foot = Math.round(130 * u);
  const c = document.createElement('canvas'); c.width = p.w; c.height = p.h + foot; const x = c.getContext('2d');
  drawPlan(x, v, null);
  // carimbo
  const y0 = p.h; x.fillStyle = '#fff'; x.fillRect(0, y0, p.w, foot); x.fillStyle = '#13294b'; x.fillRect(0, y0, p.w, 4 * u);
  if (LOGO_IMG && LOGO_IMG.complete && LOGO_IMG.naturalWidth) { const lh = 34 * u, lw = lh * LOGO_IMG.naturalWidth / LOGO_IMG.naturalHeight; x.drawImage(LOGO_IMG, 12 * u, y0 + 16 * u, lw, lh); }
  x.fillStyle = '#13294b'; x.textAlign = 'left'; x.textBaseline = 'top';
  x.font = `700 ${14 * u}px Segoe UI, Arial`; x.fillText('CROQUI – ' + visitTitle(v).toUpperCase(), 12 * u, y0 + 60 * u);
  x.font = `${11 * u}px Segoe UI, Arial`; x.fillStyle = '#5d6b82';
  x.fillText(`${TYPES[v.type].nome} · ${v.loc.endereco || ''} ${v.loc.cidade ? '– ' + v.loc.cidade : ''}`, 12 * u, y0 + 80 * u);
  x.fillText(`Visita: ${dtBR(v.cli.data)} · Responsável: ${v.cli.tecnico || ''} · Escala: ${p.scale ? '1 px = ' + fmt(p.scale * 100, 1) + ' cm' : 'não calibrada'}`, 12 * u, y0 + 97 * u);
  // legenda
  const used = [...new Set(p.elements.map(e => e.type))], rts = [...new Set(p.routes.map(r => r.type))];
  let lx = Math.max(p.w * 0.5, 420 * u), ly = y0 + 14 * u; x.font = `600 ${10 * u}px Segoe UI, Arial`;
  const step = 17 * u, colW = 190 * u;
  [...used.map(t => ['e', t]), ...rts.map(t => ['r', t])].forEach(([k, t], i) => {
    const col = Math.floor(i / 6), row = i % 6, xx = lx + col * colW, yy = ly + row * step;
    if (xx + colW > p.w + 60 * u) return;
    if (k === 'e') { x.fillStyle = EL_TYPES[t].c; x.fillRect(xx, yy + 2 * u, 10 * u, 10 * u); x.fillStyle = '#13294b'; x.fillText(`${EL_TYPES[t].l} (${p.elements.filter(e => e.type === t).length})`, xx + 16 * u, yy + 1 * u); }
    else { x.strokeStyle = RT_TYPES[t].c; x.lineWidth = 3 * u; x.setLineDash(RT_TYPES[t].d.map(d => d * u * 0.6)); x.beginPath(); x.moveTo(xx, yy + 7 * u); x.lineTo(xx + 12 * u, yy + 7 * u); x.stroke(); x.setLineDash([]); x.fillStyle = '#13294b'; const L = p.routes.filter(r => r.type === t).reduce((s, r) => s + (routeLen(r, p) || 0), 0); x.fillText(`${RT_TYPES[t].l}${p.scale ? ' ' + fmt(L) + ' m' : ''}`, xx + 16 * u, yy + 1 * u); }
  });
  let out = c;
  if (c.width > maxW) { const k = maxW / c.width; out = document.createElement('canvas'); out.width = maxW; out.height = Math.round(c.height * k); out.getContext('2d').drawImage(c, 0, 0, out.width, out.height); }
  return out.toDataURL('image/jpeg', 0.88);
}

export { CQ, EL_TYPES, RT_TYPES, apRadiusM, croquiDataURL, drawGrid, initCroqui, planImage, routeLen };
