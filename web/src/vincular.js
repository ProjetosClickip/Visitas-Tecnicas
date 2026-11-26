import { api, msgErro } from '../../shared/api.js';
import { isSup, stLabel } from '../ambientes.js';
import { S } from '../estado.js';
import { go } from '../navegacao.js';
import { aprovarVisita } from '../painel/supervisao.js';
import { $, $$, confirmBox, getP, setP, toast } from '../util.js';
import { CQ } from './croqui.js';
import { bindDiag } from './diagramas.js';
import { nOr } from './dimensionamento.js';
import { renderForm } from './formulario.js';
import { bindPhotos } from './fotos.js';
import { exportKML, exportKMZ } from './kml.js';
import { bindCx } from './link-dedicado.js';
import { aplicarDoServidor, deleteVisit, saveNow, scheduleSave, visitTitle } from './lista.js';
import { openReport } from './relatorio.js';
import { updateCalc } from './resultados.js';

/* ================== BIND ================== */
function bindForm() {
  const root = $('#main');
  root.oninput = onFormInput; root.onchange = onFormChange; root.onclick = onFormClick;
  $('#btnBack').onclick = () => go(S.cur.type);
  $('#btnSave').onclick = async () => { S.dirty = true; await saveNow(); if (!S.dirty) toast('Visita salva'); };
  $('#btnPdf').onclick = async () => { await saveNow(); openReport(S.cur); };
  $('#btnDel').onclick = () => deleteVisit(S.cur.id);
  $('#stSel').onchange = async e => {
    const s = e.target.value, v = S.cur;
    if (s === 'done' && !isSup(S.user)) { e.target.value = v.status || 'draft'; return toast('Somente a supervisão pode concluir (aprovar) um relatório'); }
    if (s === 'pending' && !(await confirmBox('Enviar este relatório para aprovação da supervisão?'))) { e.target.value = v.status || 'draft'; return; }
    if (s === 'done') { e.target.value = v.status || 'draft'; return aprovarVisita(v); }
    await saveNow();
    try {
      const r = await api.post(`/visitas/${encodeURIComponent(v.id)}/status`, { status: s });
      aplicarDoServidor(v, r.visita); rerender(); toast('Status: ' + stLabel(s));
    } catch (er) { e.target.value = v.status || 'draft'; toast(msgErro(er), 4000); }
  };
  $('#btnGPS').onclick = () => {
    if (!navigator.geolocation) return toast('GPS indisponível neste navegador');
    toast('Obtendo localização…');
    navigator.geolocation.getCurrentPosition(p => { S.cur.loc.lat = +p.coords.latitude.toFixed(7); S.cur.loc.lon = +p.coords.longitude.toFixed(7); scheduleSave(); refreshLoc(); toast('Localização capturada (±' + Math.round(p.coords.accuracy) + ' m)'); },
      e => toast('Não foi possível obter o GPS: ' + e.message, 4000), { enableHighAccuracy: true, timeout: 15000 });
  };
  $('#pasteLL').onchange = e => { const m = e.target.value.match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/); if (!m) return toast('Formato esperado: lat, lon'); S.cur.loc.lat = nOr(m[1]); S.cur.loc.lon = nOr(m[2]); e.target.value = ''; scheduleSave(); refreshLoc(); };
  $('#kmlIn').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const m = (await f.text()).match(/<coordinates>\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/);
    if (!m) return toast('Nenhum ponto encontrado no KML');
    S.cur.loc.lon = +m[1]; S.cur.loc.lat = +m[2]; scheduleSave(); refreshLoc(); toast('Coordenadas importadas');
  };
  const exAdd = $('#exAdd'); if (exAdd) exAdd.onclick = () => { S.cur.evt.extras = S.cur.evt.extras || []; S.cur.evt.extras.push({}); scheduleSave(); rerender(); };
  $$('[data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); const el = $('#sec-' + a.dataset.jump); window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' }); });
  bindPhotos();
  bindDiag();
  bindCx();
}
function refreshLoc() {
  $$('[data-k="loc.lat"]').forEach(i => i.value = S.cur.loc.lat ?? ''); $$('[data-k="loc.lon"]').forEach(i => i.value = S.cur.loc.lon ?? '');
  const l = S.cur.loc, has = l.lat && l.lon;
  $('#lnkMaps').classList.toggle('hidden', !has); $('#lnkEarth').classList.toggle('hidden', !has);
  $('#lnkMaps').href = `https://www.google.com/maps?q=${l.lat},${l.lon}`; $('#lnkEarth').href = `https://earth.google.com/web/search/${l.lat},${l.lon}`;
}
function rerender() { const y = window.scrollY; renderForm(S.cur); window.scrollTo(0, y); }
function onFormInput(e) {
  const el = e.target, k = el.dataset && el.dataset.k; if (!k) return;
  let val = el.value; if (el.dataset.n) val = val === '' ? '' : nOr(val);
  setP(S.cur, k, val); scheduleSave();
  if (k === 'cli.nome') $('#formTitle').textContent = visitTitle(S.cur);
  if (k.startsWith('loc.')) refreshLoc();
  updateCalc();
}
function onFormChange(e) {
  const el = e.target;
  if (el.dataset.chk) {
    const arr = getP(S.cur, el.dataset.chk) || []; const v = el.value;
    const nv = el.checked ? [...new Set([...arr, v])] : arr.filter(x => x !== v);
    setP(S.cur, el.dataset.chk, nv); el.parentElement.classList.toggle('on', el.checked); scheduleSave();
    if (v === 'outro') rerender(); else updateCalc();
  }
  if (el.dataset.re && el.dataset.k) rerender();
  if (el.name === 'ctoOpt') { S.cur.cond.ctoEscolha = el.value; scheduleSave(); updateCalc(); if (window.CQ) CQ.draw(); }
  if (el.name === 'apOpt') { S.cur.ap.escolha = el.value; scheduleSave(); updateCalc(); if (window.CQ) CQ.draw(); }
}
function onFormClick(e) {
  const b = e.target.closest('[data-seg]');
  if (b) {
    const cur = getP(S.cur, b.dataset.seg); const v = b.dataset.v;
    setP(S.cur, b.dataset.seg, cur === v ? '' : v); scheduleSave();
    if (b.dataset.re) rerender(); else { $$(`[data-seg="${b.dataset.seg}"]`).forEach(x => x.classList.toggle('on', x.dataset.v === getP(S.cur, b.dataset.seg))); updateCalc(); }
    return;
  }
  const a = e.target.closest('[data-act]');
  if (a) { saveNow(); if (a.dataset.act === 'kml') exportKML(S.cur); else if (a.dataset.act === 'kmz') exportKMZ(S.cur); return; }
  const xd = e.target.closest('[data-exdel]');
  if (xd) { S.cur.evt.extras.splice(+xd.dataset.exdel, 1); scheduleSave(); rerender(); }
}

export { bindForm, rerender };
