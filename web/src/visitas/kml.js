import { msgErro } from '../../shared/api.js';
import { S, TYPES } from '../estado.js';
import { visitaCompleta } from '../navegacao.js';
import { download, dtBR, esc, fmt, safeName, toast, today } from '../util.js';
import { ENTRADAS, PASSAGENS, SERVICOS, lbl } from './campos.js';
import { EL_TYPES, RT_TYPES, apRadiusM, croquiDataURL, drawGrid, planImage, routeLen } from './croqui.js';
import { parseLL } from './diagramas.js';
import { calcCond, condSel, nOr } from './dimensionamento.js';
import { visitTitle } from './lista.js';
import { apSummary } from './resultados.js';

/* ================== GOOGLE EARTH: KML / KMZ ================== */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) { // ZIP "store" (sem compressão) – suficiente para KMZ
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cs = cen.reduce((s, a) => s + a.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: 'application/vnd.google-earth.kmz' });
}
function b64bytes(dataURL) { const b = atob(dataURL.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const xesc = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
function kmlColor(hex, a = 'ff') { const h = hex.replace('#', ''); return a + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2); }

/* conversão planta (px) -> coordenadas geográficas */
function geoRef(v) {
  const p = v.plan, lat0 = nOr(v.loc.lat), lon0 = nOr(v.loc.lon);
  if (!p || !p.scale || !lat0 || !lon0) return null;
  const ref = (p.elements || []).find(e => e.type === 'ref') || { x: p.w / 2, y: p.h / 2 };
  const th = (p.rot || 0) * Math.PI / 180, s = p.scale, mLat = 111320, mLon = 111320 * Math.cos(lat0 * Math.PI / 180);
  const toGeo = (x, y) => { const mx = (x - ref.x) * s, my = -(y - ref.y) * s; const E = mx * Math.cos(th) + my * Math.sin(th), N = -mx * Math.sin(th) + my * Math.cos(th); return { lat: lat0 + N / mLat, lon: lon0 + E / mLon }; };
  return { toGeo, mLat, mLon, th };
}
function circleCoords(lat, lon, r, mLon) { const out = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * 2 * Math.PI; out.push(`${(lon + r * Math.sin(a) / mLon).toFixed(7)},${(lat + r * Math.cos(a) / 111320).toFixed(7)},0`); } return out.join(' '); }

function visitDescHTML(v) {
  const rows = [['Tipo', TYPES[v.type].nome], ['Cliente', visitTitle(v)], ['Endereço', [v.loc.endereco, v.loc.cidade].filter(Boolean).join(' – ')], ['Data da visita', dtBR(v.cli.data)], ['Responsável', v.cli.tecnico], ['Entrada do cabo', lbl(ENTRADAS, v.infra.entrada)], ['Passagem', (v.infra.passagem || []).map(x => lbl(PASSAGENS, x)).join(', ')]];
  if (v.type === 'cond') { const c = calcCond(v.cond); if (c.ok) { const o = condSel(v, c); rows.push(['Unidades', fmt(c.total)], ['CTOs', o ? `${o.totalCTO} × ${o.P} portas` : '-']); } }
  else { const s = apSummary(v); if (v.type === 'corp') rows.push(['Serviço', lbl(SERVICOS, v.corp.servico)], ['Velocidade', v.corp.velocidade === 'Outra' ? v.corp.velOutra : v.corp.velocidade]); if (s) rows.push(['Access points', `${s.N} × ${s.model.nome} (raio ${s.r} m)`]); }
  return `<table>${rows.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1] || '-')}</td></tr>`).join('')}</table>`;
}
function buildKML(v, withOverlay) {
  const lat = nOr(v.loc.lat), lon = nOr(v.loc.lon);
  const G = geoRef(v), p = v.plan;
  let styles = `<Style id="visita"><IconStyle><color>${kmlColor(TYPES[v.type].cor)}</color><scale>1.3</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`;
  for (const [k, t] of Object.entries(EL_TYPES)) styles += `<Style id="el_${k}"><IconStyle><color>${kmlColor(t.c)}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>`;
  for (const [k, t] of Object.entries(RT_TYPES)) styles += `<Style id="rt_${k}"><LineStyle><color>${kmlColor(t.c)}</color><width>3</width></LineStyle></Style>`;
  styles += `<Style id="cov_ap7660"><LineStyle><color>${kmlColor('#159c98')}</color><width>1.5</width></LineStyle><PolyStyle><color>${kmlColor('#159c98', '40')}</color></PolyStyle></Style><Style id="cov_ap7664"><LineStyle><color>${kmlColor('#f26a21')}</color><width>1.5</width></LineStyle><PolyStyle><color>${kmlColor('#f26a21', '40')}</color></PolyStyle></Style>`;
  let body = '';
  if (lat && lon) body += `<Placemark><name>${xesc(visitTitle(v))}</name><styleUrl>#visita</styleUrl><description><![CDATA[${visitDescHTML(v)}]]></description><Point><coordinates>${lon},${lat},0</coordinates></Point></Placemark>`;
  const dgp = (v.diagramas || []).map(d => Object.assign({ ll: parseLL(d.local) }, d)).filter(d => d.ll);
  if (dgp.length) {
    styles += `<Style id="dg_ceo"><IconStyle><color>${kmlColor('#7a3db8')}</color><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle></Style><Style id="dg_pop"><IconStyle><color>${kmlColor('#159c98')}</color><scale>1.2</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle></Style>`;
    body += `<Folder><name>Caixas de emenda e POP</name>${dgp.map(d => `<Placemark><name>${xesc(d.nome || (d.tipo === 'pop' ? 'POP' : 'CEO'))}</name><description>${xesc((d.tipo === 'pop' ? 'POP de abordagem' : 'Caixa de emenda') + (d.fusoes ? ' – ' + d.fusoes : ''))}</description><styleUrl>#dg_${d.tipo === 'pop' ? 'pop' : 'ceo'}</styleUrl><Point><coordinates>${d.ll.lon},${d.ll.lat},0</coordinates></Point></Placemark>`).join('')}</Folder>`;
  }
  if (G && p) {
    let els = '', rts = '', cov = '';
    for (const e of p.elements) {
      const g = G.toGeo(e.x, e.y), t = EL_TYPES[e.type]; if (!t) continue;
      els += `<Placemark><name>${xesc(e.label || t.l)}</name><description>${xesc(t.l + (e.note ? ' – ' + e.note : ''))}</description><styleUrl>#el_${e.type}</styleUrl><Point><coordinates>${g.lon.toFixed(7)},${g.lat.toFixed(7)},0</coordinates></Point></Placemark>`;
      if (t.model) { const r = apRadiusM(v, e.type); cov += `<Placemark><name>Cobertura ${xesc(e.label)} (${r} m)</name><styleUrl>#cov_${e.type}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${circleCoords(g.lat, g.lon, r, G.mLon)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`; }
    }
    for (const r of p.routes) {
      const L = routeLen(r, p);
      rts += `<Placemark><name>${xesc(RT_TYPES[r.type].l)}${L ? ' – ' + fmt(L) + ' m' : ''}</name><styleUrl>#rt_${r.type}</styleUrl><LineString><tessellate>1</tessellate><coordinates>${r.pts.map(q => { const g = G.toGeo(q.x, q.y); return `${g.lon.toFixed(7)},${g.lat.toFixed(7)},0`; }).join(' ')}</coordinates></LineString></Placemark>`;
    }
    body += `<Folder><name>Croqui – elementos</name>${els}</Folder><Folder><name>Rotas de cabo</name>${rts}</Folder>${cov ? `<Folder><name>Raio de cobertura dos APs</name>${cov}</Folder>` : ''}`;
    if (withOverlay) {
      const c = G.toGeo(p.w / 2, p.h / 2), hw = p.w * p.scale / 2, hh = p.h * p.scale / 2;
      body += `<GroundOverlay><name>Planta baixa</name><color>c8ffffff</color><Icon><href>files/planta.jpg</href></Icon><LatLonBox><north>${(c.lat + hh / G.mLat).toFixed(8)}</north><south>${(c.lat - hh / G.mLat).toFixed(8)}</south><east>${(c.lon + hw / G.mLon).toFixed(8)}</east><west>${(c.lon - hw / G.mLon).toFixed(8)}</west><rotation>${(-(p.rot || 0)).toFixed(2)}</rotation></LatLonBox></GroundOverlay>`;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xesc(TYPES[v.type].nome + ' – ' + visitTitle(v))}</name><description>Visita técnica Click IP / I_MAIS – ${xesc(dtBR(v.cli.data))}</description>${styles}${body}</Document></kml>`;
}
function kmlCheck(v) {
  if (!(nOr(v.loc.lat) && nOr(v.loc.lon))) { toast('Informe latitude e longitude da visita para exportar KML/KMZ', 3500); return false; }
  if (v.plan && !v.plan.scale) toast('Croqui sem escala calibrada: apenas o ponto da visita será exportado', 3500);
  return true;
}
async function exportKML(v) { if (v && v._lite) { try { v = await visitaCompleta(v.id); } catch (e) { return toast(msgErro(e), 4000); } } if (!kmlCheck(v)) return; download(`${safeName(visitTitle(v))}.kml`, buildKML(v, false), 'application/vnd.google-earth.kml+xml'); }
async function exportKMZ(v) {
  if (v && v._lite) { try { v = await visitaCompleta(v.id); } catch (e) { return toast(msgErro(e), 4000); } }
  if (!kmlCheck(v)) return;
  const files = [{ name: 'doc.kml', data: buildKML(v, !!(v.plan && v.plan.scale)) }];
  if (v.plan && v.plan.scale) {
    const c = document.createElement('canvas'); c.width = v.plan.w; c.height = v.plan.h; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); const img = planImage(v.plan); if (img && img.complete) x.drawImage(img, 0, 0, c.width, c.height); if (v.plan.grid) drawGrid(x, v.plan);
    files.push({ name: 'files/planta.jpg', data: b64bytes(c.toDataURL('image/jpeg', 0.85)) });
    const cq = croquiDataURL(v); if (cq) files.push({ name: 'files/croqui.jpg', data: b64bytes(cq) });
  }
  download(`${safeName(visitTitle(v))}.kmz`, makeZip(files));
}
function exportKMLList(list) {
  const pts = list.filter(v => nOr(v.loc.lat) && nOr(v.loc.lon));
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Visitas técnicas – ${xesc(S.user.name)}</name>
  ${Object.entries(TYPES).map(([k, t]) => `<Style id="t_${k}"><IconStyle><color>${kmlColor(t.cor)}</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon></IconStyle></Style>`).join('')}
  ${Object.entries(TYPES).map(([k, t]) => `<Folder><name>${t.plural}</name>${pts.filter(v => v.type === k).map(v => `<Placemark><name>${xesc(visitTitle(v))}</name><styleUrl>#t_${k}</styleUrl><description><![CDATA[${visitDescHTML(v)}]]></description><Point><coordinates>${v.loc.lon},${v.loc.lat},0</coordinates></Point></Placemark>`).join('')}</Folder>`).join('')}
  </Document></kml>`;
  download(`visitas_${safeName(S.user.name)}_${today()}.kml`, kml, 'application/vnd.google-earth.kml+xml');
  toast(`${pts.length} visita(s) exportada(s)`);
}

export { exportKML, exportKMLList, exportKMZ };
