/* ================== DIAGRAMAS: CAIXAS DE EMENDA E POP ================== */
import { S } from '../estado.js';
import { $, $$, lightbox, readImage, toast, uid } from '../util.js';
import { card, fld, isDupla } from './campos.js';
import { nOr } from './dimensionamento.js';
import { scheduleSave } from './lista.js';

function secDiag(n) {
  const d = isDupla(S.cur), simples = S.cur.type === 'corp';
  const btns = ab => `<label class="btn navy">🔗 Adicionar diagrama da caixa de emenda${simples ? ' de abordagem' : ''}<input type="file" data-dgin="ceo|${ab}" accept="image/png,image/jpeg" multiple hidden></label>
    <label class="btn teal">🏢 Adicionar diagrama do ${ab === 2 ? '2º ' : ''}POP de abordagem<input type="file" data-dgin="pop|${ab}" accept="image/png,image/jpeg" multiple hidden></label>`;
  return card('diag', n, d ? 'Caixas de emenda e POPs – dupla abordagem' : 'Caixas de emenda (CEO) e POP de abordagem', `
    <p class="small muted" style="margin-top:0">Envie os diagramas de fusão (PNG/JPEG) das caixas de emenda que serão fusionadas no trecho e do POP de abordagem. Os dados entram na tabela de detalhamento de fusões do relatório e, com coordenadas, no KML/KMZ.</p>
    ${d ? `<div class="row" style="margin-bottom:8px"><b style="min-width:110px">Abordagem 1</b>${btns(1)}</div><div class="row"><b style="min-width:110px">Abordagem 2</b>${btns(2)}</div>` : `<div class="row">${btns(1)}</div>`}
    <div id="dgList" style="margin-top:12px"></div>`, `<span class="small muted" id="dgCount"></span>`);
}
function bindDiag() {
  $$('[data-dgin]').forEach(i => i.onchange = () => { const [tipo, ab] = i.dataset.dgin.split('|'); addDiag(i.files, tipo, +ab).then(() => { i.value = ''; }); });
}
async function addDiag(files, tipo, ab) {
  const v = S.cur; v.diagramas = v.diagramas || []; let n = 0;
  for (const f of files) {
    if (!/image\/(png|jpe?g)/.test(f.type)) { toast('Use arquivos PNG ou JPEG'); continue; }
    try { const r = await readImage(f, 2400, 0.9); v.diagramas.push({ id: uid(), tipo, ab: ab || 1, data: r.data, nome: f.name.replace(/\.\w+$/, ''), fusoes: '', local: '', obs: '' }); n++; } catch (e) { }
  }
  if (n) { scheduleSave(); renderDiag(); toast(n + ' diagrama(s) adicionado(s)'); }
}
function renderDiag() {
  const el = $('#dgList'); if (!el) return; const L = S.cur.diagramas = S.cur.diagramas || [];
  $('#dgCount').textContent = L.length ? `${L.filter(d => d.tipo !== 'pop').length} CEO · ${L.filter(d => d.tipo === 'pop').length} POP` : '';
  el.innerHTML = L.length ? L.map((d, i) => `
    <div class="card" style="box-shadow:none;margin-bottom:10px;border-left:4px solid ${d.tipo === 'pop' ? 'var(--teal)' : 'var(--navy)'}"><div class="card-b dg-item">
      <img src="${d.data}" data-dgz="${i}" style="width:100%;height:130px;object-fit:contain;background:#f4f6fa;border:1px solid var(--line);border-radius:8px;cursor:zoom-in">
      <div class="grid g3">
        ${fld('Tipo', `diagramas.${i}.tipo`, { type: 'select', opts: [['ceo', 'Caixa de emenda (CEO)'], ['pop', 'POP de abordagem']] })}
        ${isDupla(S.cur) ? fld('Abordagem', `diagramas.${i}.ab`, { type: 'select', opts: [['1', 'Abordagem 1'], ['2', 'Abordagem 2']] }) : ''}
        ${fld(d.tipo === 'pop' ? 'Nome do POP' : 'Identificação da caixa', `diagramas.${i}.nome`, { ph: d.tipo === 'pop' ? 'POP-CENTRO-NOVO' : 'CEO-17078 / CEO-479 (REPARO)' })}
        ${fld(d.tipo === 'pop' ? 'DIO / bandeja / portas' : 'Fusões', `diagramas.${i}.fusoes`, { ph: d.tipo === 'pop' ? 'DIO 3 - BANDEJA 3 - PORTAS 9 a 12' : '12FO - F9 > 06FO - F1' })}
        ${fld('Localização (lat, lon)', `diagramas.${i}.local`, { ph: '-3.0855577, -60.0284506' })}
        ${fld('Observação', `diagramas.${i}.obs`, { cls: 'span2' })}
      </div>
      <div style="grid-column:1/-1;display:flex;gap:6px;justify-content:flex-end"><button class="btn sm" data-dgup="${i}">▲ Subir</button><button class="btn sm danger" data-dgrm="${i}">Remover</button></div>
    </div></div>`).join('') : '<div class="muted small">Nenhum diagrama enviado.</div>';
  $$('[data-dgz]', el).forEach(x => x.onclick = () => lightbox(x.src));
  $$('[data-dgrm]', el).forEach(x => x.onclick = () => { L.splice(+x.dataset.dgrm, 1); scheduleSave(); renderDiag(); });
  $$('[data-dgup]', el).forEach(x => x.onclick = () => { const i = +x.dataset.dgup; if (i > 0) { [L[i - 1], L[i]] = [L[i], L[i - 1]]; scheduleSave(); renderDiag(); } });
  $$('select[data-k$=".tipo"], select[data-k$=".ab"]', el).forEach(s => s.addEventListener('change', () => setTimeout(renderDiag, 0)));
}
function parseLL(s) { const m = String(s || '').match(/(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)/); return m ? { lat: nOr(m[1]), lon: nOr(m[2]) } : null; }

export { bindDiag, parseLL, renderDiag, secDiag };
