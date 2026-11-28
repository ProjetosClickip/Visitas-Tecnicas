/* ================== LINK DEDICADO: APs condicionados + link ================== */
import { S } from '../estado.js';
import { $, $$, esc, fmt, lightbox, readImage, toast, uid } from '../util.js';
import { SIMNAO, card, fld, seg } from './campos.js';
import { RAIO_LIMITE, apModels, iOr, linkPlanos, nOr, velLabel } from './dimensionamento.js';
import { scheduleSave } from './lista.js';
import { apUsed, velMbps } from './resultados.js';

function secAPCorp(n) {
  const v = S.cur, c = v.corp, u = apUsed(v) ? 'sim' : (c.usaAP || '');
  const body = `<div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Haverá uso de access point no atendimento?</div>${seg('corp.usaAP', SIMNAO)}
    ${u === 'sim' ? `<div class="grid g4" style="margin:14px 0 12px">
        ${fld('Dispositivos simultâneos', 'corp.usuarios', { type: 'number', hint: 'usuários × dispositivos (100%)' })}
        ${fld('Demanda por dispositivo', 'corp.mbpsDisp', { type: 'number', unit: 'Mbps' })}
        ${Object.values(apModels(S.cfg)).map(m => fld('Raio de atendimento – ' + m.curto, 'ap.raio.' + m.id, { type: 'number', unit: 'm, até ' + RAIO_LIMITE, max: RAIO_LIMITE, ph: 'padrão: ' + m.raios[(c.area || {}).ambiente || 'salao'] + ' m', hint: 'nominal ' + m.raioMax + ' m – vazio = padrão do ambiente' })).join('')}
      </div><div id="res-link"></div><div id="res-ap" style="margin-top:12px"></div>`
      : u === 'nao' ? `<div class="note" style="margin-top:12px">Atendimento sem access points – entrega do link via ${esc(c.interface || 'interface cabeada')}. O rack é dimensionado apenas para os equipamentos de ativação e pontos cabeados.</div><div id="res-ap"></div>`
      : `<div class="note warn" style="margin-top:12px">Responda se haverá uso de access point para habilitar o dimensionamento.</div><div id="res-ap"></div>`}`;
  return card('ap', n, 'Dimensionamento de access points e link', body);
}
/* demanda do link (100%) frente aos padrões base e à velocidade solicitada */
function corpLink(v) {
  const dev = iOr(v.corp.usuarios), mbps = nOr(v.corp.mbpsDisp, 3), need = Math.ceil(dev * mbps), tiers = linkPlanos();
  const linkRec = tiers.find(t => t >= need) || tiers[tiers.length - 1];
  const e0 = nOr(v.corp.linkEscolhido), link = tiers.includes(e0) ? e0 : linkRec;
  const sol = velMbps(v.corp.velocidade === 'Outra' ? v.corp.velOutra : v.corp.velocidade);
  return { dev, mbps, need, tiers, linkRec, link, manual: tiers.includes(e0), excede: need > tiers[tiers.length - 1], sol };
}
function renderCorpLink() {
  const el = $('#res-link'); if (!el) return; const v = S.cur, e = corpLink(v);
  if (!e.dev) { el.innerHTML = `<div class="note warn">Informe os dispositivos simultâneos para dimensionar os access points e o link.</div>`; return; }
  el.innerHTML = `<div class="kpis"><div class="kpi"><div class="v">${fmt(e.dev)}</div><div class="l">Dispositivos simultâneos (100%)</div></div>
    <div class="kpi"><div class="v">${fmt(e.need)} Mbps</div><div class="l">Demanda estimada (${e.mbps} Mbps/disp.)</div></div>
    <div class="kpi"><div class="v">${e.sol ? velLabel(e.sol) : '—'}</div><div class="l">Velocidade solicitada</div></div>
    <div class="kpi accent"><div class="v">${velLabel(e.link)}</div><div class="l">${e.manual ? 'Link adotado (escolha manual)' : 'Link recomendado'}</div></div></div>
    <div style="margin-top:12px"><div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Padrão de link adotado</div>
    <div class="seg">${e.tiers.map(t => `<button type="button" data-lkc="${t}" class="${t === e.link ? 'on' : ''}">${velLabel(t)}${t === e.linkRec ? ' ★' : ''}</button>`).join('')}</div>
    <span class="small muted" style="margin-left:8px">★ recomendado para a demanda de ${fmt(e.need)} Mbps${e.manual ? ' · <a href="#" id="lkcAuto">voltar ao recomendado</a>' : ''}</span></div>
    ${e.excede ? `<div class="note warn">A demanda estimada excede o maior padrão disponível (${velLabel(e.tiers[e.tiers.length - 1])}).</div>` : ''}
    ${e.sol && e.sol < e.link ? `<div class="note warn">A velocidade solicitada (${velLabel(e.sol)}) está abaixo do padrão de link ${e.manual ? 'adotado' : 'recomendado'} (${velLabel(e.link)}) – considere um plano superior.</div>` : ''}`;
  $$('[data-lkc]', el).forEach(b => b.onclick = ev => { ev.stopPropagation(); v.corp.linkEscolhido = +b.dataset.lkc === e.linkRec ? '' : +b.dataset.lkc; scheduleSave(); renderCorpLink(); });
  const la = $('#lkcAuto'); if (la) la.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); v.corp.linkEscolhido = ''; scheduleSave(); renderCorpLink(); };
}

/* ================== PROVEDOR: imagem/diagrama da caixa do cliente ================== */
const CX_LISTAS = {
  cxImgs: { btn: 'Anexar imagem / diagrama da caixa do cliente', titulo: 'Caixa do cliente', nome: 'Identificação da caixa do cliente', ph: 'CX-CLIENTE-01', cor: 'var(--orange)' },
  cxNova: { btn: 'Anexar diagrama da caixa de emenda exclusiva do cliente (a implantar)', titulo: 'Caixa de emenda exclusiva do cliente (a implantar)', nome: 'Identificação da caixa', ph: 'CEO-CLIENTE-01', cor: 'var(--navy)' },
  fibraDiag: { btn: 'Anexar diagrama da fibra escolhida para o atendimento', titulo: 'Diagrama da fibra de atendimento', nome: 'Cabo / fibra escolhida', ph: '12FO - F9 > 06FO - F1', cor: 'var(--teal)' }
};
function cxBlock(key) {
  return `<div style="margin-top:12px"><label class="btn navy"><svg class="ic" aria-hidden="true"><use href="#i-paperclip"/></svg> ${CX_LISTAS[key].btn}<input type="file" data-cxin="${key}" accept="image/png,image/jpeg" multiple hidden></label><div data-cxlist="${key}" style="margin-top:10px"></div></div>`;
}
function bindCx() {
  $$('[data-cxin]').forEach(i => i.onchange = async () => {
    const v = S.cur, key = i.dataset.cxin; v.corp[key] = v.corp[key] || []; let n = 0;
    for (const f of i.files) { if (!/image\/(png|jpe?g)/.test(f.type)) { toast('Use PNG ou JPEG'); continue; } try { const r = await readImage(f, 2400, 0.9); v.corp[key].push({ id: uid(), data: r.data, nome: f.name.replace(/\.\w+$/, ''), local: '', obs: '' }); n++; } catch (e) { } }
    i.value = ''; if (n) { scheduleSave(); renderCx(); toast(n + ' imagem(ns) adicionada(s)'); }
  });
}
function renderCx() {
  $$('[data-cxlist]').forEach(el => {
    const key = el.dataset.cxlist, C = CX_LISTAS[key], L = S.cur.corp[key] = S.cur.corp[key] || [];
    el.innerHTML = L.length ? L.map((d, i) => `<div class="card" style="box-shadow:none;margin-bottom:8px;border-left:4px solid ${C.cor}"><div class="card-b dg-item">
        <img src="${d.data}" data-cxz style="width:100%;height:110px;object-fit:contain;background:#f4f6fa;border:1px solid var(--line);border-radius:8px;cursor:zoom-in">
        <div class="grid g3">${fld(C.nome, `corp.${key}.${i}.nome`, { ph: C.ph })}${fld('Localização (lat, lon)', `corp.${key}.${i}.local`)}${fld('Observação', `corp.${key}.${i}.obs`)}</div>
        <div style="grid-column:1/-1;text-align:right"><button class="btn sm danger" data-cxrm="${i}">Remover</button></div></div></div>`).join('') : `<div class="small muted">Nenhum arquivo anexado (${C.titulo.toLowerCase()}).</div>`;
    $$('[data-cxz]', el).forEach(x => x.onclick = () => lightbox(x.src));
    $$('[data-cxrm]', el).forEach(b => b.onclick = e => { e.stopPropagation(); L.splice(+b.dataset.cxrm, 1); scheduleSave(); renderCx(); });
  });
}

export { CX_LISTAS, bindCx, corpLink, cxBlock, renderCorpLink, renderCx, secAPCorp };
