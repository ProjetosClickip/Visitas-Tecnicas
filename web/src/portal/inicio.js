/* ---------- Início do colaborador ---------- */
import { avatarHTML, isSup, stPill } from './ambientes.js';
import { S } from './estado.js';
import { dashBlocos } from './painel/graficos.js';
import { KIND, SISTEMAS, dadosPlataforma } from './plataforma.js';
import { openSystem, sistemaAtual } from './sistemas.js';
import { $, $$, esc } from './util.js';

async function renderInicio() {
  const u = S.user, D = await dadosPlataforma();
  // a resposta pode chegar depois de a pessoa ter aberto outra tela: não desenha por cima
  if (sistemaAtual() !== 'inicio' || S.user !== u) return;
  const meus = D.items.filter(x => x.userId === u.id);
  const B = dashBlocos({ items: meus, umap: D.umap, users: D.users });
  const n = (f) => meus.filter(f).length;
  const devolvidas = meus.filter(x => x.sys === 'visitas' && x.ref.devolucao && x.status === 'draft');
  const recentes = meus.slice().sort((a, b) => ((b.ref.updatedAt || b.atualizado || '') + '').localeCompare((a.ref.updatedAt || a.atualizado || '') + '')).slice(0, 12);
  $('#main').innerHTML = `
  <div class="pf-hero" style="${u.banner ? `background-image:url(${u.banner})` : ''}"><div class="pf-hero-in">${avatarHTML(u, 64)}<div><h3>Olá, ${esc(u.name.split(' ')[0])}!</h3><span>${esc(u.role || 'Colaborador')}${isSup(u) ? ' · 🛡️ Supervisão' : ''} · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span></div><div class="spacer" style="flex:1"></div><button class="btn sm" id="inPerfil">⚙️ Perfil e aparência</button></div></div>
  <div class="stats">
    <div class="kpi"><div class="v">${n(x => x.sys === 'visitas')}</div><div class="l">Minhas visitas técnicas</div></div>
    <div class="kpi" style="border-color:#7a3db8"><div class="v" style="color:#7a3db8">${n(x => x.sys === 'custos')}</div><div class="l">Meus orçamentos (custos)</div></div>
    <div class="kpi"><div class="v">${n(x => x.status === 'draft')}</div><div class="l">Em andamento</div></div>
    <div class="kpi accent"><div class="v">${n(x => x.status === 'pending')}</div><div class="l">Aguardando aprovação</div></div>
    <div class="kpi teal"><div class="v">${n(x => x.status === 'done')}</div><div class="l">Concluídos / aprovados</div></div>
  </div>
  ${devolvidas.length ? `<div class="note warn" style="margin-bottom:14px">↩ <b>${devolvidas.length} relatório(s) devolvido(s) pela supervisão</b> aguardam ajustes: ${devolvidas.map(x => `<a href="#" data-iopen="${x.id}">${esc(x.nome)}</a>`).join(', ')}</div>` : ''}
  <h3 style="margin:6px 0 10px">Sistemas</h3>
  <div class="sys-cards">${SISTEMAS.map(s => `<button class="sys-card ${s.breve ? 'breve' : ''}" data-goSys="${s.id}" style="--c:${s.cor}"><span class="sys-ic">${s.ic}</span><b>${s.nome}</b><small>${s.desc}</small>${s.breve ? '<span class="pill pend">em breve</span>' : `<span class="sys-n">${s.id === 'visitas' ? n(x => x.sys === 'visitas') + ' visita(s)' : n(x => x.sys === 'custos') + ' orçamento(s)'} ›</span>`}</button>`).join('')}</div>
  <div class="dash-grid" style="margin-top:16px">
    <div class="card dcard"><div class="card-h"><div><span class="kicker2">MEUS PROJETOS</span><h3>Andamento</h3></div></div><div class="card-b">${B.status}</div></div>
    <div class="card dcard"><div class="card-h"><div><span class="kicker2">POR TIPO</span><h3>Minhas demandas por tipo</h3></div></div><div class="card-b">${B.tipos}</div></div>
    <div class="card dcard span-2"><div class="card-h"><div><span class="kicker2">PRODUÇÃO</span><h3>Minha produção mensal</h3></div><div class="spacer"></div><span class="small muted">últimos 12 meses</span></div><div class="card-b">${B.mensal}</div></div>
    <div class="card dcard span-2"><div class="card-h"><div><span class="kicker2">RECENTES</span><h3>Minhas demandas</h3></div></div><div class="card-b">
      ${recentes.length ? `<div class="dem-list">${recentes.map(x => `<div class="dem"><span class="pill ${KIND[x.k].pill}">${KIND[x.k].n}</span><b class="dem-n">${esc(x.nome)}</b>${x.sys === 'custos' && x.tipo ? `<span class="small muted">${esc(x.tipo)}</span>` : ''}${stPill(x.status)}<button class="btn sm" data-iopen="${x.id}">Abrir</button></div>`).join('')}</div>` : '<div class="empty" style="padding:24px">Nenhuma demanda ainda. Escolha um sistema acima para começar.</div>'}
    </div></div>
  </div>`;
  $('#inPerfil').onclick = () => openSystem('perfil');
  $$('[data-goSys]').forEach(b => b.onclick = () => openSystem(b.dataset.gosys));
  $$('[data-iopen]').forEach(b => b.onclick = e => { e.preventDefault(); const x = D.items.find(i => i.id === b.dataset.iopen); if (!x) return; if (x.sys === 'visitas') openSystem('visitas', { tab: x.ref.type, visit: S.visits.find(v => v.id === x.id) || x.ref }); else openSystem('custos', { pid: x.id, view: 'resumo' }); });
}

export { renderInicio };
