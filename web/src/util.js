/* ================== UTILITÁRIOS ================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Imagem segura para usar em style="background-image:url(...)" (evita injeção de CSS). */
const urlImg = s => (typeof s === 'string' && (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) || /^\/[\w\-./]+$/.test(s))) ? s : '';
/** Imagens institucionais (web/public/img) */
const IMG = { logo: '/img/logo-portal.png', timbrado: '/img/papel-timbrado.png' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = (n, d = 0) => (isFinite(n) ? Number(n) : 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = n => fmt(n * 100, 0) + '%';
const today = () => new Date().toISOString().slice(0, 10);
const dtBR = s => { if (!s) return '-'; const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s); return isNaN(d) ? s : d.toLocaleDateString('pt-BR'); };
const dtHrBR = s => { const d = new Date(s); return isNaN(d) ? '-' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
function getP(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
function setP(o, p, v) { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; }
function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
let toastT;
function toast(m, ms = 2400) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function download(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function safeName(s) { return String(s || 'visita').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60); }
function modal(html, onMount) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) bg.remove(); });
  document.body.appendChild(bg); onMount && onMount(bg.firstElementChild, () => bg.remove()); return bg;
}
function confirmBox(msg) { return new Promise(res => { modal(`<h3>Confirmar</h3><p>${esc(msg)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="cfOk">Confirmar</button></div>`, (m, close) => { $('#cfOk', m).onclick = () => { close(); res(true); }; }); }); }
function lightbox(src) { const b = modal(`<div class="lightbox" style="text-align:center"><img src="${src}"></div>`); b.firstElementChild.style.maxWidth = 'none'; b.firstElementChild.style.width = 'auto'; b.firstElementChild.style.background = 'transparent'; b.onclick = () => b.remove(); }

/* imagem -> dataURL JPEG redimensionada */
function readImage(file, max = 1600, q = 0.82) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); res({ data: c.toDataURL('image/jpeg', q), w: c.width, h: c.height }); }; img.onerror = rej; img.src = fr.result; };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}
function pdfFirstPageNote() { toast('PDF não suportado como planta: exporte a planta como imagem (JPG/PNG).', 4000); }

export { $, $$, IMG, confirmBox, download, dtBR, dtHrBR, esc, fmt, getP, initials, lightbox, modal, pct, pdfFirstPageNote, readImage, safeName, setP, toast, today, uid, urlImg };
