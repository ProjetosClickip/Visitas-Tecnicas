/* ================== HELPERS DE FORMULÁRIO ================== */
import { S } from '../estado.js';
import { esc, getP } from '../util.js';

function fld(label, path, o = {}) {
  const v = getP(S.cur, path) ?? '';
  const t = o.type || 'text', cls = o.cls ? ` class="f ${o.cls}"` : ' class="f"';
  const hint = o.hint ? `<span class="hint">${o.hint}</span>` : '';
  let inp;
  if (t === 'textarea') inp = `<textarea data-k="${path}" placeholder="${esc(o.ph || '')}" ${o.rows ? `style="min-height:${o.rows * 22}px"` : ''}>${esc(v)}</textarea>`;
  else if (t === 'select') inp = `<select data-k="${path}" ${o.re ? 'data-re="1"' : ''}>${(o.opts || []).map(([a, b]) => `<option value="${esc(a)}" ${String(v) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
  else inp = `<input type="${t}" data-k="${path}" ${o.re ? 'data-re="1"' : ''} ${t === 'number' ? 'data-n="1" inputmode="decimal" step="any" min="0"' : ''} ${o.max ? `max="${o.max}"` : ''} value="${esc(v)}" placeholder="${esc(o.ph || '')}">`;
  return `<label${cls}>${label}${o.unit ? ` <span class="hint">(${o.unit})</span>` : ''}${inp}${hint}</label>`;
}
function seg(path, opts, re = true) {
  const v = getP(S.cur, path);
  return `<div class="seg">${opts.map(([a, b]) => `<button type="button" data-seg="${path}" data-v="${esc(a)}" ${re ? 'data-re="1"' : ''} class="${String(v) === String(a) ? 'on' : ''}">${b}</button>`).join('')}</div>`;
}
function chks(path, opts) {
  const v = getP(S.cur, path) || [];
  return `<div class="checks">${opts.map(([a, b]) => `<label class="chk ${v.includes(a) ? 'on' : ''}"><input type="checkbox" data-chk="${path}" value="${esc(a)}" ${v.includes(a) ? 'checked' : ''}>${b}</label>`).join('')}</div>`;
}
function card(id, n, title, body, extra = '') {
  return `<section class="card" id="sec-${id}"><div class="card-h"><div class="num">${n}</div><h3>${title}</h3><div class="spacer"></div>${extra}</div><div class="card-b">${body}</div></section>`;
}

const SERVICOS = [['transporte', 'Transporte'], ['banda_larga', 'Banda larga'], ['dedicado', 'Empresarial dedicado'], ['provedor', 'Provedor']];
const VELOCIDADES = ['100 Mbps', '300 Mbps', '500 Mbps', '600 Mbps', '1 Gbps', '2 Gbps', '5 Gbps', '10 Gbps', 'Outra'];
const ENTRADAS = [['aerea', 'Aérea'], ['subterranea', 'Subterrânea'], ['mista', 'Mista (aérea + subterrânea)']];
const PASSAGENS = [['forro', 'Forro'], ['eletrocalha', 'Eletrocalha'], ['eletroduto', 'Eletroduto'], ['shaft', 'Shaft'], ['canaleta', 'Canaleta'], ['leito', 'Leito / esteira'], ['cx_sub', 'Caixa subterrânea'], ['parede', 'Fixação em parede / olhal'], ['outro', 'Outro']];
const ABORDAGENS = [['simples', 'Abordagem simples'], ['dupla', 'Dupla abordagem']];
const SIMNAO = [['sim', 'Sim'], ['nao', 'Não']];
const isDupla = v => v && v.type === 'corp' && v.corp && v.corp.abordagem === 'dupla';
/* empresas do grupo – CNPJ preenchido automaticamente (Condomínios, Link Dedicado e Eventos) */
/* empresas do grupo vêm de config/organizacao.json (fora do git), via servidor */
const empresasGrupo = () => (S.org && S.org.empresasGrupo) || [];
const empresaSel = v => (v && v.cli && empresasGrupo().find(e => e.id === v.cli.empresa)) || null;
const SUPORTE = [['cliente', 'Somente equipe do cliente'], ['conjunto', 'Em conjunto com a TI do cliente'], ['clickip', 'Somente Click IP']];
const lbl = (arr, v) => (arr.find(x => x[0] === v) || [, v || '-'])[1];

export { ABORDAGENS, ENTRADAS, PASSAGENS, SERVICOS, SIMNAO, SUPORTE, VELOCIDADES, card, chks, empresaSel, empresasGrupo, fld, isDupla, lbl, seg };
