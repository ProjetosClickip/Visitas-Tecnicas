/* ================== AMBIENTE PÚBLICO (sem login; sem detalhes de clientes) ==================
 * O servidor só devolve nome da demanda, responsável, tipo, status e data (nenhum valor ou contato).
 */
import { api, msgErro } from '../../shared/api.js';
import { avatarHTML, normResp, stPill } from '../ambientes.js';
import { S } from '../estado.js';
import { dashBlocos } from './graficos.js';
import { KIND } from '../plataforma.js';
import { $, esc } from '../util.js';


let pubFiltro = { q: '', t: '' };
async function dadosPublico() {
  const r = await api.get('/publico/painel');
  const umap = {}; (r.usuarios || []).forEach(u => umap[u.id] = u);
  return { items: r.itens.map(x => Object.assign({ ref: { updatedAt: x.atualizado } }, x)), umap, clientes: r.clientes };
}
async function renderPublico() {
  const el = $('#pubMain');
  let D;
  try { D = await dadosPublico(); }
  catch (e) {
    el.innerHTML = `<section class="hero"><div class="hero-t"><span class="kicker">GRUPO CLICK IP · ENGENHARIA / PROJETOS</span><h1>Plataforma de Projetos</h1><p>${e.status === 404 ? 'O painel público está desativado. Entre no Ambiente do colaborador para ver as suas demandas.' : esc(msgErro(e))}</p></div></section>`;
    return;
  }
  const B = dashBlocos(D);
  let dem = D.items.slice().sort((a, b) => ((b.ref.updatedAt || b.atualizado || '') + '').localeCompare((a.ref.updatedAt || a.atualizado || '') + ''));
  if (pubFiltro.t) dem = dem.filter(x => x.k === pubFiltro.t);
  if (pubFiltro.q) { const q = normResp(pubFiltro.q); dem = dem.filter(x => normResp(x.nome + ' ' + (x.userName || '')).includes(q)); }
  el.innerHTML = `
  <section class="hero"><div class="hero-t"><span class="kicker">GRUPO CLICK IP · ENGENHARIA / PROJETOS</span><h1>Painel geral da Plataforma de Projetos</h1><p>Acompanhamento consolidado das demandas de todos os sistemas – visitas técnicas (condomínios, links dedicados e eventos) e orçamentos da mensuração de custos – do time de Planejamento e Implantação de Projetos.</p></div>${B.kpis}</section>
  <div class="dash-grid">
    <div class="card dcard"><div class="card-h"><div><span class="kicker2">VISÃO GERAL</span><h3>Demandas por tipo</h3></div></div><div class="card-b">${B.tipos}</div></div>
    <div class="card dcard"><div class="card-h"><div><span class="kicker2">STATUS</span><h3>Andamento dos projetos</h3></div></div><div class="card-b">${B.status}</div></div>
    <div class="card dcard span-2"><div class="card-h"><div><span class="kicker2">PRODUÇÃO</span><h3>Produção mensal do time (todos os sistemas)</h3></div><div class="spacer"></div><span class="small muted">últimos 12 meses</span></div><div class="card-b">${B.mensal}</div></div>
    <div class="card dcard span-2"><div class="card-h"><div><span class="kicker2">DESEMPENHO</span><h3>Desempenho do time</h3></div></div><div class="card-b">${B.time}</div></div>
    <div class="card dcard span-2"><div class="card-h"><div><span class="kicker2">DEMANDAS</span><h3>Demandas e responsáveis</h3></div><div class="spacer"></div><span class="small muted">${dem.length} de ${D.items.length}</span></div><div class="card-b">
      <div class="hist-tools"><input type="text" id="pbQ" placeholder="Buscar demanda ou colaborador…" value="${esc(pubFiltro.q)}"><select id="pbT"><option value="">Todos os tipos</option>${Object.keys(KIND).map(t => `<option value="${t}" ${pubFiltro.t === t ? 'selected' : ''}>${KIND[t].l}</option>`).join('')}</select></div>
      ${dem.length ? `<div class="dem-list">${dem.slice(0, 200).map(x => { const u = D.umap[x.userId] || { name: x.userName || 'Usuário' }; return `<div class="dem"><span class="pill ${KIND[x.k].pill}">${KIND[x.k].n}</span><b class="dem-n">${esc(x.nome)}</b><span class="dem-a">➜</span><span class="dem-u">${avatarHTML(u, 24)}${esc(u.name)}</span>${stPill(x.status)}</div>`; }).join('')}</div>` : '<div class="empty" style="padding:24px">Nenhuma demanda encontrada.</div>'}
    </div></div>
  </div>
  <p class="small muted" style="text-align:center;margin-top:16px">🔒 Ambiente público: exibe apenas o nome da demanda e o responsável – nenhum dado técnico, de contato ou valor de orçamento. Painel consolidado com os dados de toda a equipe.</p>`;
  $('#pbQ').oninput = e => { pubFiltro.q = e.target.value; clearTimeout(S.pbT); S.pbT = setTimeout(async () => { await renderPublico(); const i = $('#pbQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#pbT').onchange = e => { pubFiltro.t = e.target.value; renderPublico(); };
}

export { renderPublico };
