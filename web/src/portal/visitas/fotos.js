/* ================== FOTOS ================== */
import { S } from '../estado.js';
import { $, $$, esc, lightbox, readImage, toast, uid } from '../util.js';
import { scheduleSave } from './lista.js';

function bindPhotos() {
  const inp = $('#phIn'), dz = $('#phDrop'); if (!inp) return;
  inp.onchange = () => addPhotos(inp.files);
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); addPhotos(e.dataTransfer.files); });
}
async function addPhotos(files) {
  const v = S.cur; let n = 0;
  for (const f of files) { if (!f.type.startsWith('image/')) continue; try { const r = await readImage(f, 1600, 0.8); v.photos.push({ id: uid(), data: r.data, caption: f.name.replace(/\.\w+$/, ''), ts: new Date().toISOString() }); n++; } catch (e) { } }
  if (n) { scheduleSave(); renderPhotos(); toast(n + ' foto(s) adicionada(s)'); }
  $('#phIn').value = '';
}
function renderPhotos() {
  const el = $('#phList'); if (!el) return; const v = S.cur;
  $('#phCount').textContent = v.photos.length ? v.photos.length + ' foto(s)' : '';
  el.innerHTML = v.photos.map((p, i) => `<div class="ph"><img src="${p.data}" data-zoom="${i}"><input type="text" data-cap="${i}" value="${esc(p.caption)}" placeholder="Legenda"><div class="x"><span>Figura ${i + 1}</span><span><button class="btn sm" data-mv="${i}" title="Mover para trás"><svg class="ic" aria-hidden="true"><use href="#i-chevron-left"/></svg></button> <button class="btn sm danger" data-rm="${i}">✕</button></span></div></div>`).join('');
  $$('[data-zoom]', el).forEach(i => i.onclick = () => lightbox(i.src));
  $$('[data-cap]', el).forEach(i => i.oninput = () => { v.photos[+i.dataset.cap].caption = i.value; scheduleSave(); });
  $$('[data-rm]', el).forEach(b => b.onclick = () => { v.photos.splice(+b.dataset.rm, 1); scheduleSave(); renderPhotos(); });
  $$('[data-mv]', el).forEach(b => b.onclick = () => { const i = +b.dataset.mv; if (i > 0) { [v.photos[i - 1], v.photos[i]] = [v.photos[i], v.photos[i - 1]]; scheduleSave(); renderPhotos(); } });
}

export { bindPhotos, renderPhotos };
