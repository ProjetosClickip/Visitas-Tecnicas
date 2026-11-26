/* ================== AMBIENTE DA SUPERVISÃO ==================
 * Todas as ações (aprovar, devolver, criar conta, redefinir senha) são validadas pelo servidor,
 * que confere o papel do usuário logado.
 */
import { api, msgErro } from '../../shared/api.js';
import { ENV, STATUS, avatarHTML, isSup, normResp, setEnv, stPill } from '../ambientes.js';
import { S, TYPES } from '../estado.js';
import { go } from '../navegacao.js';
import { dashBlocos, nomeDemanda } from './graficos.js';
import { brl, dadosPlataforma } from '../plataforma.js';
import { openSystem } from '../sistemas.js';
import { $, $$, confirmBox, download, dtBR, dtHrBR, esc, fmt, modal, toast, today } from '../util.js';
import { assinaturaValida } from '../visitas/assinatura.js';
import { calcCond, calcEvento, condSel, iOr, nOr, velLabel } from '../visitas/dimensionamento.js';
import { exportKMLList, exportKMZ } from '../visitas/kml.js';
import { summaryLine } from '../visitas/lista.js';
import { openReport } from '../visitas/relatorio.js';
import { apSummary } from '../visitas/resultados.js';
import { rerender } from '../visitas/vincular.js';

let supFiltro = { q: '', t: '', s: '', u: '' };
function numerosDetalhados(visits) {
  let hp = 0, ctos = 0, pub = 0, aps = 0, cabo = 0; const vel = {}, links = {};
  visits.forEach(v => {
    try {
      if (v.type === 'cond') { const c = calcCond(v.cond); if (c.ok) { hp += c.total; const o = condSel(v, c); if (o) ctos += o.totalCTO; } }
      if (v.type === 'evt') { pub += iOr(v.evt.publico); const e = calcEvento(v.evt); links[velLabel(e.link)] = (links[velLabel(e.link)] || 0) + 1; }
      if (v.type === 'corp') { const s = v.corp.velocidade === 'Outra' ? v.corp.velOutra : v.corp.velocidade; if (s) vel[s] = (vel[s] || 0) + 1; }
      const a = apSummary(v); if (a) aps += a.N;
      cabo += nOr((v.infra || {}).metragem) + nOr((v.infra2 || {}).metragem);
    } catch (e) { }
  });
  return { hp, ctos, pub, aps, cabo, vel, links, dupla: visits.filter(v => v.type === 'corp' && v.corp.abordagem === 'dupla').length };
}
async function renderSup() {
  const el = $('#supMain');
  if (!isSup(S.user)) {
    el.innerHTML = `<div class="split-card"><div class="split-l"><span class="kicker">AMBIENTE DA SUPERVISÃO</span><h2>Acesso restrito</h2><p>Esta área é exclusiva da supervisão do Grupo Click IP. A conta <b>${esc(S.user.email || S.user.name)}</b> não possui permissão.</p></div><div class="split-r"><p>O acesso é concedido por um supervisor em <b>Equipe → Perfil</b>.</p><button class="btn" id="supVoltar">Ir para o Ambiente do colaborador</button></div></div>`;
    $('#supVoltar').onclick = () => setEnv('col'); return;
  }
  let D;
  try { D = await dadosPlataforma({ escopo: 'equipe' }); }
  catch (e) { el.innerHTML = `<div class="empty"><h3>Não foi possível carregar o painel</h3><p>${esc(msgErro(e))}</p></div>`; return; }
  const B = dashBlocos(D), N = numerosDetalhados(D.visits), f = supFiltro;
  const pend = D.visits.filter(v => v.status === 'pending').sort((a, b) => (a.enviadoEm || a.updatedAt || '').localeCompare(b.enviadoEm || b.updatedAt || ''));
  let all = D.visits.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (f.t) all = all.filter(v => v.type === f.t); if (f.s) all = all.filter(v => (v.status || 'draft') === f.s); if (f.u) all = all.filter(v => v.userId === f.u);
  if (f.q) { const q = normResp(f.q); all = all.filter(v => normResp([nomeDemanda(v), v.cli.contato, v.cli.cnpj, v.loc.endereco, v.loc.cidade, (D.umap[v.userId] || {}).name].join(' ')).includes(q)); }
  const uName = v => (D.umap[v.userId] || { name: 'Usuário removido' }).name;
  el.innerHTML = `
  <section class="hero sup"><div class="hero-t"><span class="kicker">AMBIENTE DA SUPERVISÃO</span><h1>Central de gestão e aprovação</h1><p>Aprovação dos relatórios e orçamentos, visão detalhada de todas as visitas, clientes, projetos, eventos e valores, e acompanhamento do time.</p></div>
    <div class="hero-k"><div class="hk"><div class="hk-i">⏳</div><b>${pend.length}</b><span>Visitas aguardando aprovação</span></div><div class="hk"><div class="hk-i">💰</div><b>${brl(D.custos.reduce((s, x) => s + x.t.total, 0))}</b><span>Total orçado (${D.custos.length} orçamento(s))</span></div><div class="hk"><div class="hk-i">✅</div><b>${D.items.filter(x => x.status === 'done').length}</b><span>Concluídos / aprovados</span></div><div class="hk"><div class="hk-i">👥</div><b>${D.users.length}</b><span>Usuários</span></div></div></section>
  <div class="card"><div class="card-h"><h3>⏳ Fila de aprovação – visitas técnicas</h3><div class="spacer"></div><span class="small muted">${pend.length} relatório(s)</span></div><div class="card-b">
    ${pend.length ? `<div class="tbl-wrap"><table class="t"><tr><th>Demanda</th><th>Tipo</th><th>Colaborador</th><th>Enviado em</th><th>Resumo</th><th></th></tr>${pend.map(v => `<tr><td><b>${esc(nomeDemanda(v))}</b><div class="small muted">${esc([v.loc.endereco, v.loc.cidade].filter(Boolean).join(' – '))}</div></td><td><span class="pill ${TYPES[v.type].pill}">${TYPES[v.type].nome}</span></td><td>${esc(uName(v))}</td><td>${dtHrBR(v.enviadoEm || v.updatedAt)}</td><td class="small">${summaryLine(v)}${assinaturaValida(v) ? '<br>✍️ assinado' : ''}</td>
      <td><div class="row"><button class="btn sm" data-sopen="${v.id}">Abrir</button><button class="btn sm" data-spdf="${v.id}">PDF</button><button class="btn sm teal" data-sapr="${v.id}">Aprovar</button><button class="btn sm danger" data-sdev="${v.id}">Devolver</button></div></td></tr>`).join('')}</table></div>` : '<div class="muted">Nenhum relatório aguardando aprovação. ✔</div>'}
  </div></div>
  <div class="dash-grid">
    <div class="card dcard"><div class="card-h"><div><span class="kicker2">STATUS</span><h3>Andamento dos projetos</h3></div></div><div class="card-b">${B.status}</div></div>
    <div class="card dcard"><div class="card-h"><div><span class="kicker2">NÚMEROS LEVANTADOS</span><h3>Indicadores técnicos</h3></div></div><div class="card-b"><div class="kpis">
      <div class="kpi"><div class="v">${fmt(N.hp)}</div><div class="l">Unidades (HP) em condomínios</div></div><div class="kpi"><div class="v">${fmt(N.ctos)}</div><div class="l">CTOs dimensionadas</div></div>
      <div class="kpi"><div class="v">${fmt(N.aps)}</div><div class="l">Access points dimensionados</div></div><div class="kpi"><div class="v">${fmt(N.pub)}</div><div class="l">Público total de eventos</div></div>
      <div class="kpi"><div class="v">${fmt(N.cabo)} m</div><div class="l">Cabo óptico (OzMap)</div></div><div class="kpi"><div class="v">${N.dupla}</div><div class="l">Links com dupla abordagem</div></div></div>
      ${Object.keys(N.vel).length ? `<div class="small" style="margin-top:10px"><b>Velocidades solicitadas (Link Dedicado):</b> ${Object.entries(N.vel).map(([k, n]) => `${esc(k)} (${n})`).join(' · ')}</div>` : ''}
      ${Object.keys(N.links).length ? `<div class="small" style="margin-top:4px"><b>Links de eventos:</b> ${Object.entries(N.links).map(([k, n]) => `${esc(k)} (${n})`).join(' · ')}</div>` : ''}</div></div>
    <div class="card dcard span-2"><div class="card-h"><div><span class="kicker2">PRODUÇÃO</span><h3>Produção mensal de viabilidades</h3></div></div><div class="card-b">${B.mensal}</div></div>
    <div class="card dcard span-2"><div class="card-h"><div><span class="kicker2">DESEMPENHO</span><h3>Desempenho do time</h3></div></div><div class="card-b">${B.time}</div></div>
  </div>
  ${custosSupHTML(D)}
  <div class="card"><div class="card-h"><h3>📂 Todas as visitas, clientes e projetos</h3><div class="spacer"></div><span class="small muted">${all.length} de ${D.visits.length}</span></div><div class="card-b">
    <div class="hist-tools"><input type="text" id="sfQ" placeholder="Buscar cliente, CNPJ, contato, endereço, colaborador…" value="${esc(f.q)}">
      <select id="sfT"><option value="">Todos os tipos</option>${Object.keys(TYPES).map(t => `<option value="${t}" ${f.t === t ? 'selected' : ''}>${TYPES[t].nome}</option>`).join('')}</select>
      <select id="sfS"><option value="">Todos os status</option>${Object.keys(STATUS).map(s => `<option value="${s}" ${f.s === s ? 'selected' : ''}>${STATUS[s].l}</option>`).join('')}</select>
      <select id="sfU"><option value="">Todos os colaboradores</option>${D.users.map(u => `<option value="${u.id}" ${f.u === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <div class="spacer" style="flex:1"></div><button class="btn sm" id="sfKml">Exportar KML</button></div>
    <div class="tbl-wrap"><table class="t"><tr><th>Cliente / demanda</th><th>Tipo</th><th>Colaborador</th><th>Contato</th><th>Local</th><th>Visita</th><th>Status</th><th>Resumo técnico</th><th></th></tr>
    ${all.map(v => `<tr><td><b>${esc(nomeDemanda(v))}</b>${v.cli.cnpj ? `<div class="small muted">CNPJ ${esc(v.cli.cnpj)}</div>` : ''}</td><td><span class="pill ${TYPES[v.type].pill}">${TYPES[v.type].nome}</span></td><td>${esc(uName(v))}</td>
      <td class="small">${esc([v.cli.contato, v.cli.telefone, v.cli.email].filter(Boolean).join(' · ') || '-')}</td><td class="small">${esc([v.loc.endereco, v.loc.cidade].filter(Boolean).join(' – ') || '-')}</td><td class="small">${dtBR(v.cli.data)}</td>
      <td>${stPill(v.status)}${v.aprovacao && v.status === 'done' ? `<div class="small muted">por ${esc(v.aprovacao.por)}</div>` : ''}</td><td class="small">${summaryLine(v)}</td>
      <td><div class="row"><button class="btn sm" data-sopen="${v.id}">Abrir</button><button class="btn sm" data-spdf="${v.id}">PDF</button><button class="btn sm" data-skmz="${v.id}">KMZ</button>${v.status === 'pending' ? `<button class="btn sm teal" data-sapr="${v.id}">Aprovar</button>` : ''}</div></td></tr>`).join('')}</table></div>
  </div></div>
  <div class="card"><div class="card-h"><h3>👥 Equipe</h3><div class="spacer"></div><button class="btn sm primary" id="supNovo">+ Nova conta</button></div><div class="card-b"><div class="tbl-wrap"><table class="t"><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Demandas</th><th>Último acesso</th><th></th></tr>
    ${D.users.map(u => `<tr class="${u.ativo ? '' : 'muted'}"><td><div class="row">${avatarHTML(u, 28)}<div><b>${esc(u.name)}</b><div class="small muted">${esc(u.role || '')}</div></div></div></td><td class="small">${esc(u.email || '-')}</td><td>${isSup(u) ? '<span class="pill done">Supervisão</span>' : '<span class="pill draft">Colaborador</span>'}${u.ativo ? '' : ' <span class="pill pend">desativada</span>'}${u.trocarSenha ? ' <span class="pill pend">senha provisória</span>' : ''}</td><td>${D.items.filter(x => x.userId === u.id).length}</td><td class="small">${u.lastLogin ? dtHrBR(u.lastLogin) : '-'}</td>
      <td><div class="row">${u.id !== S.user.id ? `<button class="btn sm" data-sedit="${u.id}">Perfil</button><button class="btn sm" data-srst="${u.id}">Redefinir senha</button>` : '<span class="small muted">você</span>'}</div></td></tr>`).join('')}</table></div>
    <p class="small muted" style="margin:8px 0 0">As contas são criadas aqui, com senha provisória; no primeiro acesso a pessoa define a própria senha. Contas desativadas não conseguem entrar e mantêm o histórico.</p></div></div>
  <div class="card"><div class="card-h"><h3>🔄 Importação e exportação</h3></div><div class="card-b">
    <p style="margin-top:0">Para trazer dados do sistema antigo (salvo no navegador de cada colaborador), importe os backups (.json) exportados em <i>Configurações → Banco de dados</i>. Cada visita vai para a conta cujo e-mail consta no backup; crie as contas antes de importar.</p>
    <div class="row"><label class="btn navy">📥 Importar backups da equipe<input type="file" id="supImp" accept=".json,application/json" multiple hidden></label><button class="btn" id="supExp">📤 Exportar base completa</button></div></div></div>`;
  bindCustosSup();
  const find = id => D.visits.find(v => v.id === id);
  $$('[data-sopen]').forEach(b => b.onclick = () => { const v = find(b.dataset.sopen); setEnv('col'); go(v.type, v); });
  $$('[data-spdf]').forEach(b => b.onclick = () => openReport(find(b.dataset.spdf)));
  $$('[data-skmz]').forEach(b => b.onclick = () => exportKMZ(find(b.dataset.skmz)));
  $$('[data-sapr]').forEach(b => b.onclick = () => aprovarVisita(find(b.dataset.sapr)));
  $$('[data-sdev]').forEach(b => b.onclick = () => devolverVisita(find(b.dataset.sdev)));
  $$('[data-srst]').forEach(b => b.onclick = () => redefinirSenhaUsuario(D.umap[b.dataset.srst]));
  $$('[data-sedit]').forEach(b => b.onclick = () => editarUsuario(D.umap[b.dataset.sedit]));
  $('#supNovo').onclick = () => novoUsuario();
  const re = () => renderSup();
  $('#sfQ').oninput = e => { f.q = e.target.value; clearTimeout(S.sfT); S.sfT = setTimeout(async () => { await re(); const i = $('#sfQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#sfT').onchange = e => { f.t = e.target.value; re(); }; $('#sfS').onchange = e => { f.s = e.target.value; re(); }; $('#sfU').onchange = e => { f.u = e.target.value; re(); };
  $('#sfKml').onclick = () => exportKMLList(all);
  $('#supExp').onclick = async () => {
    try { const d = await api.get('/visitas/exportar?escopo=todas'); download(`base_visitas_equipe_${today()}.json`, JSON.stringify(d), 'application/json'); }
    catch (er) { toast(msgErro(er), 4000); }
  };
  $('#supImp').onchange = async e => {
    const tot = { importadas: 0, atualizadas: 0, ignoradas: 0, semConta: [] };
    for (const arq of e.target.files) {
      try {
        const r = await api.post('/visitas/importar', JSON.parse(await arq.text()));
        tot.importadas += r.importadas; tot.atualizadas += r.atualizadas; tot.ignoradas += r.ignoradas;
        r.semConta.forEach(x => { if (!tot.semConta.includes(x)) tot.semConta.push(x); });
      } catch (er) { toast('Arquivo inválido: ' + arq.name + ' – ' + msgErro(er), 5000); }
    }
    modal(`<h3>Importação concluída</h3><p>${tot.importadas} visita(s) nova(s), ${tot.atualizadas} atualizada(s), ${tot.ignoradas} ignorada(s) (já atualizadas ou sem conta).</p>${tot.semConta.length ? `<div class="note warn">Sem conta cadastrada para: ${tot.semConta.map(esc).join(', ')}. Crie as contas em <b>Equipe</b> e importe de novo.</div>` : ''}<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-close>OK</button></div>`);
    renderSup();
  };
}
function aprovarVisita(v) {
  if (!v || !isSup(S.user)) return;
  modal(`<h3>Aprovar relatório</h3><p><b>${esc(nomeDemanda(v))}</b> – ${TYPES[v.type].nome}</p><label class="f">Observação da aprovação (opcional)<textarea id="aprObs"></textarea></label>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-close>Cancelar</button><button class="btn teal" id="aprOk">✔ Aprovar</button></div>`, (m, close) => {
    $('#aprOk', m).onclick = async () => {
      try {
        const r = await api.post(`/visitas/${encodeURIComponent(v.id)}/aprovar`, { obs: $('#aprObs', m).value.trim() });
        syncLocal(r.visita); close(); toast('Relatório aprovado'); if (ENV === 'sup') renderSup(); else rerender();
      } catch (e) { toast(msgErro(e), 4000); }
    };
  });
}
function devolverVisita(v) {
  if (!v || !isSup(S.user)) return;
  modal(`<h3>Devolver para ajustes</h3><p><b>${esc(nomeDemanda(v))}</b> volta para <b>Em andamento</b> com o motivo abaixo para o colaborador.</p><label class="f">Motivo / ajustes necessários<textarea id="devM"></textarea></label>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-close>Cancelar</button><button class="btn danger" id="devOk">Devolver</button></div>`, (m, close) => {
    $('#devOk', m).onclick = async () => {
      const mo = $('#devM', m).value.trim(); if (!mo) return toast('Informe o motivo');
      try {
        const r = await api.post(`/visitas/${encodeURIComponent(v.id)}/devolver`, { motivo: mo });
        syncLocal(r.visita); close(); toast('Relatório devolvido ao colaborador'); if (ENV === 'sup') renderSup(); else rerender();
      } catch (e) { toast(msgErro(e), 4000); }
    };
  });
}
/** Atualiza a cópia local (lista e visita aberta) com a versão que o servidor devolveu. */
function syncLocal(v) {
  const i = S.visits.findIndex(x => x.id === v.id); if (i >= 0) S.visits[i] = v;
  if (S.cur && S.cur.id === v.id) { ['status', 'aprovacao', 'devolucao', 'enviadoEm', 'assinatura', 'versao', 'updatedAt'].forEach(k => { if (k in v) S.cur[k] = v[k]; else delete S.cur[k]; }); }
}
function mostrarSenhaProvisoria(nome, email, senha) {
  modal(`<h3>Senha provisória</h3><p>Entregue a senha abaixo para <b>${esc(nome)}</b>${email ? ` (${esc(email)})` : ''}. Ela só é exibida agora; no primeiro acesso a pessoa define uma senha nova.</p>
    <div class="note" style="font-size:18px;text-align:center;letter-spacing:1px"><b id="spSenha">${esc(senha)}</b></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="spCopiar">Copiar</button><button class="btn primary" data-close>Fechar</button></div>`, m => {
    $('#spCopiar', m).onclick = () => navigator.clipboard && navigator.clipboard.writeText(senha).then(() => toast('Senha copiada'));
  });
}
function redefinirSenhaUsuario(u) {
  if (!u || !isSup(S.user)) return;
  confirmBox(`Gerar uma nova senha provisória para ${u.name}? A pessoa será desconectada e terá que definir uma senha nova no próximo acesso.`).then(async ok => {
    if (!ok) return;
    try { const r = await api.post(`/usuarios/${encodeURIComponent(u.id)}/redefinir-senha`); mostrarSenhaProvisoria(u.name, u.email, r.senhaProvisoria); renderSup(); }
    catch (e) { toast(msgErro(e), 4000); }
  });
}
function formUsuario(u) {
  return `<div class="grid g2">
    <label class="f">Nome completo<input type="text" id="usNome" value="${esc(u ? u.name : '')}"></label>
    <label class="f">E-mail corporativo<input type="email" id="usEmail" value="${esc(u ? u.email : '')}" ${u ? 'disabled' : ''} placeholder="nome@clickip.com.br"></label>
    <label class="f">Cargo / setor<input type="text" id="usCargo" value="${esc(u ? u.role : '')}" placeholder="Engenharia / Projetos"></label>
    <label class="f">Perfil de acesso<select id="usPapel"><option value="colaborador" ${u && u.papel === 'supervisor' ? '' : 'selected'}>Colaborador</option><option value="supervisor" ${u && u.papel === 'supervisor' ? 'selected' : ''}>Supervisão (aprova relatórios e orçamentos, gerencia a equipe)</option></select></label>
    ${u ? `<label class="f">Situação<select id="usAtivo"><option value="1" ${u.ativo ? 'selected' : ''}>Ativa</option><option value="0" ${u.ativo ? '' : 'selected'}>Desativada (não consegue entrar)</option></select></label>` : ''}
  </div>`;
}
function novoUsuario() {
  modal(`<h3>Nova conta</h3>${formUsuario(null)}
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="usOk">Criar conta</button></div>`, (m, close) => {
    $('#usOk', m).onclick = async () => {
      try {
        const r = await api.post('/usuarios', { nome: $('#usNome', m).value.trim(), email: $('#usEmail', m).value.trim(), cargo: $('#usCargo', m).value.trim(), papel: $('#usPapel', m).value });
        close(); mostrarSenhaProvisoria(r.usuario.nome, r.usuario.email, r.senhaProvisoria); renderSup();
      } catch (e) { toast(msgErro(e), 4000); }
    };
  });
}
function editarUsuario(u) {
  if (!u) return;
  modal(`<h3>Perfil de ${esc(u.name)}</h3>${formUsuario(u)}
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="usOk">Salvar</button></div>`, (m, close) => {
    $('#usOk', m).onclick = async () => {
      try {
        await api.patch(`/usuarios/${encodeURIComponent(u.id)}`, { nome: $('#usNome', m).value.trim(), cargo: $('#usCargo', m).value.trim(), papel: $('#usPapel', m).value, ativo: $('#usAtivo', m).value === '1' });
        close(); toast('Perfil atualizado'); renderSup();
      } catch (e) { toast(msgErro(e), 4000); }
    };
  });
}

/* ---------- supervisão: orçamentos da mensuração de custos (valores só aqui) ---------- */
function custosSupHTML(D) {
  const L = D.custos.slice().sort((a, b) => ((b.atualizado || '') + '').localeCompare((a.atualizado || '') + ''));
  const T = L; // totais e situação de aprovação calculados pelo servidor
  const soma = k => T.reduce((s, x) => s + x.t[k], 0);
  const apr = T.filter(x => x.status === 'done').length, alt = T.filter(x => x.aprov.alterado).length;
  return `<div class="card"><div class="card-h"><h3>💰 Mensuração de custos – orçamentos</h3><div class="spacer"></div><span class="small muted">valores visíveis somente para a supervisão</span></div><div class="card-b">
    <div class="kpis" style="margin-bottom:12px"><div class="kpi accent"><div class="v">${brl(soma('total'))}</div><div class="l">Total orçado</div></div><div class="kpi"><div class="v">${brl(soma('mat'))}</div><div class="l">Materiais (obra + ativação)</div></div><div class="kpi"><div class="v">${brl(soma('serv'))}</div><div class="l">Serviços</div></div>
      <div class="kpi"><div class="v">${T.length ? brl(soma('total') / T.length) : brl(0)}</div><div class="l">Valor médio por orçamento</div></div><div class="kpi teal"><div class="v">${apr}</div><div class="l">Aprovados</div></div><div class="kpi"><div class="v">${T.length - apr}</div><div class="l">Pendentes de aprovação${alt ? ` (${alt} alterado(s) após aprovação)` : ''}</div></div></div>
    ${T.length ? `<div class="tbl-wrap"><table class="t"><tr><th>Projeto</th><th>Tipo</th><th>Cliente</th><th>Responsável</th><th>Data</th><th>Obra</th><th>Ativação</th><th>Serviços</th><th>Total</th><th>Aprovação</th><th></th></tr>
    ${T.map(x => `<tr><td><b>${esc(x.nome)}</b></td><td class="small">${esc(x.tipo || '-')}</td><td class="small">${esc(x.cliente || '-')}</td><td>${esc(x.userName)}</td><td class="small">${dtBR(x.data)}</td><td class="small">${brl(x.t.obra)}</td><td class="small">${brl(x.t.ativ)}</td><td class="small">${brl(x.t.serv)}</td><td><b>${brl(x.t.total)}</b></td>
      <td class="small">${x.aprov.n ? x.aprov.regs.map(a => `✔ ${esc(a.nome)} <span class="muted">${dtBR((a.em || '').slice(0, 10))}</span>`).join('<br>') + (x.aprov.alterado ? '<br><span style="color:var(--warn)">⚠ alterado após aprovação</span>' : '') : '<span class="pill pend">Pendente</span>'}</td>
      <td><div class="row"><button class="btn sm" data-copen="${x.id}">Abrir</button><button class="btn sm teal" data-capr="${x.id}">Aprovar</button></div></td></tr>`).join('')}</table></div>` : '<div class="muted">Nenhum orçamento registrado no sistema de custos.</div>'}
  </div></div>`;
}
function bindCustosSup() {
  $$('[data-copen]').forEach(b => b.onclick = () => { setEnv('col'); openSystem('custos', { pid: b.dataset.copen, view: 'resumo' }); });
  $$('[data-capr]').forEach(b => b.onclick = () => { setEnv('col'); openSystem('custos', { pid: b.dataset.capr, view: 'aprovacao' }); });
}

export { aprovarVisita, renderSup };
