/* ---------- Início do colaborador ----------
 * Ordem pensada para o dia a dia: primeiro o que depende da pessoa (devolvidos e em andamento),
 * ao lado o que está com a supervisão e o resumo; números e gráficos ficam recolhidos no fim.
 */
import { avatarHTML, isSup, stPill } from './ambientes.js';
import { S } from './estado.js';
import { dashBlocos } from './painel/graficos.js';
import { KIND, dadosPlataforma } from './plataforma.js';
import { openSystem, sistemaAtual } from './sistemas.js';
import { $, $$, dtBR, esc } from './util.js';

const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const quando = x => x.ref.updatedAt || x.atualizado || '';
const porData = (a, b) => (quando(b) + '').localeCompare(quando(a) + '');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Uma linha de tarefa: tipo, nome, detalhe e a ação. */
function linha(x, detalhe, acao) {
  return `<li class="tf"><span class="pill ${KIND[x.k].pill}">${KIND[x.k].n}</span>
    <div class="tf-t"><b>${esc(x.nome)}</b>${detalhe ? `<span>${detalhe}</span>` : ''}</div>
    <button class="btn sm tf-go" data-iopen="${x.id}">${acao}</button></li>`;
}

async function renderInicio() {
  const u = S.user, D = await dadosPlataforma();
  // a resposta pode chegar depois de a pessoa ter aberto outra tela: não desenha por cima
  if (sistemaAtual() !== 'inicio' || S.user !== u) return;
  const meus = D.items.filter(x => x.userId === u.id);
  const n = f => meus.filter(f).length;
  const devolvida = x => x.sys === 'visitas' && x.ref.devolucao && x.status === 'draft';
  const devolvidas = meus.filter(devolvida).sort(porData);
  const andamento = meus.filter(x => x.status === 'draft' && !devolvida(x)).sort(porData);
  const comSup = meus.filter(x => x.status === 'pending').sort(porData);
  const recentes = meus.slice().sort(porData).slice(0, 10);
  const B = dashBlocos({ items: meus, umap: D.umap, users: D.users });
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const pendentes = devolvidas.length + andamento.length;
  const MAX = 8, andamentoVis = andamento.slice(0, MAX);

  const saudacao = `<div class="in-top${u.banner ? ' com-banner' : ''}" style="${u.banner ? `background-image:url(${u.banner})` : ''}">
      ${avatarHTML(u, 48)}<div><h2>Olá, ${esc(u.name.split(' ')[0])}</h2>
      <p>${esc(u.role || 'Colaborador')}${isSup(u) ? ' · Supervisão' : ''} · ${hoje}</p></div></div>`;

  const paraFazer = `<section class="card in-fazer" aria-labelledby="inFazerT">
      <div class="card-h"><h3 id="inFazerT">Para fazer</h3><div class="spacer"></div><span class="small muted">${pendentes ? plural(pendentes, 'pendência', 'pendências') : ''}</span></div>
      <div class="card-b">
      ${devolvidas.length ? `<h4 class="tf-g warn">${ic('undo')} Devolvidos pela supervisão</h4><ul class="tf-l">${devolvidas.map(x => linha(x,
        `Devolvido${x.ref.devolucao.por ? ' por ' + esc(x.ref.devolucao.por) : ''}${x.ref.devolucao.motivo ? ': ' + esc(x.ref.devolucao.motivo) : ''}`, 'Ajustar')).join('')}</ul>` : ''}
      ${andamento.length ? `<h4 class="tf-g">${ic('clock')} Em andamento</h4><ul class="tf-l">${andamentoVis.map(x => linha(x,
        `Atualizado em ${dtBR(String(quando(x)).slice(0, 10))}${x.sys === 'custos' && x.tipo ? ' · ' + esc(x.tipo) : ''}`, 'Continuar')).join('')}</ul>
        ${andamento.length > MAX ? `<p class="small muted tf-mais">e mais ${andamento.length - MAX} em andamento. <a href="#" data-goSys="visitas">Ver em Visitas Técnicas</a></p>` : ''}` : ''}
      ${pendentes ? '' : `<div class="tf-vazio">${ic('check')}<div><b>Nenhuma pendência</b><span>Para começar uma demanda, abra Visitas Técnicas ou Mensuração de Custos no menu.</span></div></div>`}
      </div></section>`;

  const lado = `<div class="in-lado">
      <section class="card" aria-labelledby="inSupT"><div class="card-h"><h3 id="inSupT">Com a supervisão</h3><div class="spacer"></div><span class="small muted">${comSup.length || ''}</span></div><div class="card-b">
        ${comSup.length ? `<ul class="tf-l compacta">${comSup.map(x => `<li class="tf"><div class="tf-t"><b>${esc(x.nome)}</b><span>${KIND[x.k].n} · enviado em ${dtBR(String(x.ref.enviadoEm || quando(x)).slice(0, 10))}</span></div><button class="btn sm tf-go" data-iopen="${x.id}">Ver</button></li>`).join('')}</ul>`
          : '<p class="small muted" style="margin:0">Nada aguardando aprovação.</p>'}
      </div></section>
      <section class="card" aria-labelledby="inResT"><div class="card-h"><h3 id="inResT">Resumo</h3></div><div class="card-b">
        <dl class="resumo">
          <div><dt>Visitas técnicas</dt><dd>${n(x => x.sys === 'visitas')}</dd></div>
          <div><dt>Orçamentos</dt><dd>${n(x => x.sys === 'custos')}</dd></div>
          <div><dt>Em andamento</dt><dd>${n(x => x.status === 'draft')}</dd></div>
          <div><dt>Aguardando aprovação</dt><dd>${comSup.length}</dd></div>
          <div><dt>Concluídos</dt><dd>${n(x => x.status === 'done')}</dd></div>
        </dl>
      </div></section>
    </div>`;

  const numeros = `<details class="in-mais">
      <summary>Meus números e gráficos</summary>
      <div class="dash-grid">
        <div class="card dcard"><div class="card-h"><h3>Andamento</h3></div><div class="card-b">${B.status}</div></div>
        <div class="card dcard"><div class="card-h"><h3>Minhas demandas por tipo</h3></div><div class="card-b">${B.tipos}</div></div>
        <div class="card dcard span-2"><div class="card-h"><h3>Minha produção mensal</h3><div class="spacer"></div><span class="small muted">últimos 12 meses</span></div><div class="card-b">${B.mensal}</div></div>
        <div class="card dcard span-2"><div class="card-h"><h3>Atividade recente</h3></div><div class="card-b">
          ${recentes.length ? `<div class="dem-list">${recentes.map(x => `<div class="dem"><span class="pill ${KIND[x.k].pill}">${KIND[x.k].n}</span><b class="dem-n">${esc(x.nome)}</b>${stPill(x.status)}<button class="btn sm" data-iopen="${x.id}">Abrir</button></div>`).join('')}</div>` : '<div class="empty" style="padding:24px">Nenhuma demanda ainda.</div>'}
        </div></div>
      </div>
    </details>`;

  $('#main').innerHTML = `${saudacao}<div class="in-grid">${paraFazer}${lado}</div>${numeros}`;
  $$('[data-goSys]').forEach(b => b.onclick = e => { e.preventDefault(); openSystem(b.dataset.gosys); });
  $$('[data-iopen]').forEach(b => b.onclick = e => { e.preventDefault(); const x = D.items.find(i => i.id === b.dataset.iopen); if (!x) return; if (x.sys === 'visitas') openSystem('visitas', { tab: x.ref.type, visit: S.visits.find(v => v.id === x.id) || x.ref }); else openSystem('custos', { pid: x.id, view: 'resumo' }); });
}

export { renderInicio };
