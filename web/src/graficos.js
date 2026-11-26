/* ================== DADOS CONSOLIDADOS ================== */
import { STATUS, avatarHTML, normResp } from '../ambientes.js';
import { KIND } from '../plataforma.js';
import { esc } from '../util.js';

const nomeDemanda = v => v.type === 'evt' ? (v.cli.evento || v.cli.nome || '(evento sem nome)') : (v.cli.nome || '(sem nome)');
const dataVisita = v => (v.cli && v.cli.data) || (v.createdAt || '').slice(0, 10);
function mesesUltimos(n) { const out = [], d = new Date(); d.setDate(1); for (let i = n - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); } return out; }
const mesLbl = m => { const [y, mm] = m.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+mm - 1] + '/' + y.slice(2); };

/* --- gráficos (SVG / HTML) --- */
function donutSVG(parts, size = 170) {
  const tot = parts.reduce((s, p) => s + p.v, 0) || 1, r = size / 2 - 14, c = 2 * Math.PI * r; let off = 0;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="22"/>
    ${parts.filter(p => p.v).map(p => { const L = c * p.v / tot, s = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${p.cor}" stroke-width="22" stroke-dasharray="${L} ${c - L}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(p.l)}: ${p.v}</title></circle>`; off += L; return s; }).join('')}
    <text x="50%" y="48%" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${parts.reduce((s, p) => s + p.v, 0)}</text><text x="50%" y="62%" text-anchor="middle" font-size="11" fill="var(--muted)">projetos</text></svg>`;
}
function barrasMensais(meses, series) {
  const max = Math.max(1, ...meses.map(m => series.reduce((s, x) => s + (x.d[m] || 0), 0)));
  return `<div class="mbars">${meses.map(m => { const tot = series.reduce((s, x) => s + (x.d[m] || 0), 0); return `<div class="mb"><div class="mb-v">${tot || ''}</div><div class="mb-col">${series.map(x => x.d[m] ? `<div title="${esc(x.l)}: ${x.d[m]}" style="height:${x.d[m] / max * 100}%;background:${x.cor}"></div>` : '').join('')}</div><div class="mb-l">${mesLbl(m)}</div></div>`; }).join('')}</div>
    <div class="legend">${series.map(x => `<span><i style="background:${x.cor}"></i>${esc(x.l)}</span>`).join('')}</div>`;
}
const TIPO_COR = { cond: '#3b6fb6', corp: '#159c98', evt: '#f26a21' };
function dashBlocos(D) {
  const items = D.items, umap = D.umap || {}, cnt = f => items.filter(f).length, T = items.length;
  // no painel público o servidor envia só a contagem de clientes (os nomes dos clientes não saem do servidor)
  const clientes = D.clientes != null && !items.some(x => x.cliente) ? D.clientes : new Set(items.map(x => normResp(x.sys === 'custos' && x.cliente ? x.cliente : x.nome))).size;
  const ativos = new Set(items.map(x => x.userId)).size;
  const st = Object.keys(STATUS).map(k => ({ l: STATUS[k].l, v: cnt(x => x.status === k), cor: STATUS[k].cor }));
  const meses = mesesUltimos(12), series = Object.keys(KIND).map(k => { const d = {}; items.filter(x => x.k === k).forEach(x => { const m = (x.data || '').slice(0, 7); d[m] = (d[m] || 0) + 1; }); return { l: KIND[k].l, cor: KIND[k].cor, d }; });
  const mesAtual = meses[11], mesAnt = meses[10], tot = m => series.reduce((s, x) => s + (x.d[m] || 0), 0);
  const team = Object.values(items.reduce((a, x) => { const k = x.userId; a[k] = a[k] || { u: umap[k] || { name: x.userName || 'Usuário' }, n: 0, done: 0, pend: 0, draft: 0, vis: 0, cus: 0 }; a[k].n++; a[k][x.status === 'done' ? 'done' : x.status === 'pending' ? 'pend' : 'draft']++; a[k][x.sys === 'custos' ? 'cus' : 'vis']++; return a; }, {})).sort((a, b) => b.n - a.n || b.done - a.done);
  const maxT = Math.max(1, ...team.map(x => x.n));
  return {
    kpis: `<div class="hero-k"><div class="hk"><div class="hk-i">🏢</div><b>${clientes}</b><span>Clientes / projetos atendidos</span></div><div class="hk"><div class="hk-i">📋</div><b>${cnt(x => x.sys === 'visitas')}</b><span>Visitas técnicas</span></div><div class="hk"><div class="hk-i">💰</div><b>${cnt(x => x.sys === 'custos')}</b><span>Orçamentos (custos)</span></div><div class="hk"><div class="hk-i">👥</div><b>${ativos}</b><span>Colaboradores ativos</span></div></div>`,
    tipos: `<div class="tipo-cards">${Object.keys(KIND).map(k => { const n = cnt(x => x.k === k); return `<div class="tc" style="--c:${KIND[k].cor}"><span>${KIND[k].l}</span><b>${n}</b><div class="tc-bar"><div style="width:${T ? n / T * 100 : 0}%"></div></div><small>${T ? Math.round(n / T * 100) : 0}% das demandas</small></div>`; }).join('')}</div>`,
    status: `<div class="donut-wrap">${donutSVG(st)}<div class="legend col">${st.map(s => `<span><i style="background:${s.cor}"></i>${s.l}<b>${s.v}</b><em>${T ? Math.round(s.v / T * 100) : 0}%</em></span>`).join('')}</div></div>`,
    mensal: barrasMensais(meses, series) + `<div class="small muted" style="margin-top:6px">Mês atual (${mesLbl(mesAtual)}): <b>${tot(mesAtual)}</b> demanda(s) · mês anterior: <b>${tot(mesAnt)}</b>${tot(mesAnt) ? ` · variação ${tot(mesAtual) >= tot(mesAnt) ? '▲' : '▼'} ${Math.abs(Math.round((tot(mesAtual) - tot(mesAnt)) / tot(mesAnt) * 100))}%` : ''}</div>`,
    time: team.length ? `<div class="team">${team.map((x, i) => `<div class="tm"><div class="tm-r">${i + 1}º</div>${avatarHTML(x.u, 36)}<div class="tm-b"><div class="tm-n"><b>${esc(x.u.name)}</b><span>${x.n} demanda(s) · ${x.vis} visita(s) · ${x.cus} orçamento(s) · ${x.done} concluída(s) · ${x.pend} aguardando · ${x.draft} em andamento</span></div>
        <div class="tm-bar"><div style="width:${x.done / maxT * 100}%;background:${STATUS.done.cor}"></div><div style="width:${x.pend / maxT * 100}%;background:${STATUS.pending.cor}"></div><div style="width:${x.draft / maxT * 100}%;background:${STATUS.draft.cor}"></div></div></div><div class="tm-p">${Math.round(x.done / x.n * 100)}%<small>conclusão</small></div></div>`).join('')}</div>` : '<div class="muted small">Nenhuma demanda registrada.</div>'
  };
}

export { dashBlocos, nomeDemanda };
