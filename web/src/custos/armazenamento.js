/* =====================================================================
   3. ARMAZENAMENTO (servidor da plataforma)
   Os dados são carregados do servidor ao abrir. As telas continuam alterando o objeto `db`
   e chamando saveDB(); a sincronização compara cada projeto, prestadora, catálogo e configuração
   com a última versão gravada e envia só o que mudou, com controle de versão (409 = conflito).
   ===================================================================== */
import { api, msgErro } from '../shared/api.js';
import { ACAO_VIEW, lastChangeHtml, logAlteracao } from './historico.js';
import { confirmDialog, go, toast, view } from './interface.js';
import { $, esc, fmtDateTime, round2, todayISO, uid } from './util.js';


const DEFAULT_UNITS = ['Unidade','Metro','Quilômetro','Rolo','Caixa','Peça','Pacote','Kit','Conjunto','Par','Jogo','Kg','Litro','Hora','Diária','Serviço','Ponto','Verba'];
let ORG = { nome: '', cidade: '', setor: 'Engenharia / Projetos', empresaResponsavel: { nome: '' }, empresasGrupo: [] };
function defaultDB(){
  return { projects:[], prestadoras:[], catalogo:[], catalogoFonte:'', users:[], aprovadores:[], currentId:null,
    settings:{ empresaRelatorio:ORG.empresaResponsavel.nome || '', departamento:ORG.setor || 'Engenharia / Projetos', cidade:String(ORG.cidade || '').split('/')[0], empresaPadrao:'', categoriaPadrao:'auto', ocrLang:'por', catalogoTabela:'01', unidades:DEFAULT_UNITS.slice() } };
}
let db = defaultDB();
let currentUser = null;
const definirUsuario = u => { currentUser = u; };

/* ---------- estado da sincronização ---------- */
const CAMPOS_SERVIDOR = ['versao','historico','aprovacoes','conteudoAlteradoEm','alteradoPor','atualizadoEm','criadoPor','ownerId','criadoEm'];
const conteudoProjeto = o => conteudo(o);
const conteudo = o => { const c = Object.assign({}, o); CAMPOS_SERVIDOR.forEach(k => delete c[k]); return JSON.stringify(c); };
const gravado = { projetos:new Map(), prestadoras:new Map(), catalogo:'', config:'' };
const versoes = { catalogo:0, config:0 };
const acoesPendentes = new Map();   // projeto -> ações a registrar no histórico (o servidor grava quem e quando)
let saveT = null, sincronizando = null, ressincronizar = false, semConexao = false;

const prefKey = () => 'mensuracaoCustos.projetoAtivo.' + (currentUser ? currentUser.id : '');

/** Carrega tudo do servidor (projetos visíveis ao usuário, prestadoras, catálogo, configurações). */
async function loadDB(){
  const r = await api.get('/custos/inicial');
  ORG = Object.assign(ORG, r.organizacao || {});
  const base = defaultDB();
  db.projects = r.projetos.map(fixProject);
  db.prestadoras = r.prestadoras || [];
  db.catalogo = (r.catalogo.dados && r.catalogo.dados.itens) || [];
  db.catalogoFonte = (r.catalogo.dados && r.catalogo.dados.fonte) || '';
  db.catalogoAtualizadoEm = r.catalogo.atualizadoEm;
  db.settings = Object.assign(base.settings, r.config.dados || {});
  db.users = r.usuarios || [];
  db.aprovadores = r.aprovadores || [];
  versoes.catalogo = r.catalogo.versao; versoes.config = r.config.versao;
  gravado.projetos = new Map(db.projects.map(p => [p.id, conteudo(p)]));
  gravado.prestadoras = new Map(db.prestadoras.map(p => [p.id, conteudo(p)]));
  gravado.catalogo = JSON.stringify(db.catalogo); gravado.config = JSON.stringify(db.settings);
  try { db.currentId = localStorage.getItem(prefKey()); } catch(e){}
}

function setSaveStatus(txt, erro){
  const st = $('#saveSt'); if (!st) return;
  st.textContent = txt; st.classList.toggle('err', !!erro);
}

/** Chamado pelas telas depois de cada alteração: agenda o envio ao servidor. */
function saveDB(){
  try { if (currentUser) localStorage.setItem(prefKey(), db.currentId || ''); } catch(e){}
  clearTimeout(saveT); saveT = setTimeout(sincronizar, 500);
}
const haPendencias = () => !!saveT || !!sincronizando || semConexao;

/** Copia para o objeto local os campos que o servidor controla (versão, histórico, aprovações…). */
function aplicarServidor(local, srv){ CAMPOS_SERVIDOR.forEach(k => { if (k in srv) local[k] = srv[k]; }); }

async function sincronizar(){
  saveT = null;
  if (sincronizando){ ressincronizar = true; return sincronizando; }
  sincronizando = (async () => {
    setSaveStatus('Salvando…');
    try {
      await enviarProjetos();
      await enviarPrestadoras();
      if (JSON.stringify(db.catalogo) !== gravado.catalogo){
        const txt = JSON.stringify(db.catalogo);
        const r = await api.put('/custos/catalogo', { itens: db.catalogo, fonte: db.catalogoFonte || '', versao: versoes.catalogo });
        versoes.catalogo = r.catalogo.versao; db.catalogoAtualizadoEm = r.catalogo.atualizadoEm; gravado.catalogo = txt;
      }
      if (JSON.stringify(db.settings) !== gravado.config){
        const txt = JSON.stringify(db.settings);
        const r = await api.put('/custos/config', { dados: db.settings, versao: versoes.config });
        versoes.config = r.config.versao; gravado.config = txt;
      }
      semConexao = false;
      setSaveStatus('Salvo no servidor às ' + new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
    } catch(e){
      if (e.status === 0){ semConexao = true; setSaveStatus('Sem conexão – alterações pendentes (não feche esta página)', true); setTimeout(sincronizar, 15000); }
      else if (e.codigo === 'CONFLITO') conflito(e);
      else { setSaveStatus('ERRO AO SALVAR – ' + msgErro(e), true); toast('Não foi possível salvar: ' + msgErro(e), 'err', 7000); }
    }
  })();
  try { await sincronizando; } finally {
    sincronizando = null;
    if (ressincronizar){ ressincronizar = false; sincronizar(); }
  }
}

async function enviarProjetos(){
  for (const p of db.projects.slice()){
    const txt = conteudo(p), antes = gravado.projetos.get(p.id);
    if (antes === txt) continue;
    const acoes = [...(acoesPendentes.get(p.id) || [])]; acoesPendentes.delete(p.id);
    try {
      if (antes === undefined){
        const r = await api.post('/custos/projetos', { projeto: p, acoes });
        if (r.projeto.id !== p.id){ if (db.currentId === p.id) db.currentId = r.projeto.id; p.id = r.projeto.id; }
        aplicarServidor(p, r.projeto);
      } else {
        const r = await api.put('/custos/projetos/' + encodeURIComponent(p.id), { projeto: p, versao: p.versao, acoes });
        aplicarServidor(p, r.projeto);
      }
      gravado.projetos.set(p.id, txt);
    } catch(e){
      if (acoes.length) acoesPendentes.set(p.id, new Set([...acoes, ...(acoesPendentes.get(p.id) || [])]));
      if (e.codigo === 'CONFLITO') e.projetoLocal = p;
      throw e;
    }
  }
  for (const id of [...gravado.projetos.keys()]){
    if (db.projects.some(p => p.id === id)) continue;
    await api.del('/custos/projetos/' + encodeURIComponent(id));
    gravado.projetos.delete(id);
  }
}

async function enviarPrestadoras(){
  for (const pr of db.prestadoras){
    const txt = conteudo(pr);
    if (gravado.prestadoras.get(pr.id) === txt) continue;
    const r = await api.put('/custos/prestadoras/' + encodeURIComponent(pr.id), { prestadora: pr, versao: pr.versao || 0 });
    pr.versao = r.prestadora.versao; gravado.prestadoras.set(pr.id, txt);
  }
  for (const id of [...gravado.prestadoras.keys()]){
    if (db.prestadoras.some(p => p.id === id)) continue;
    await api.del('/custos/prestadoras/' + encodeURIComponent(id));
    gravado.prestadoras.delete(id);
  }
}

/** Outra pessoa salvou antes: o usuário escolhe recarregar (descarta as suas) ou manter a sua versão. */
async function conflito(e){
  setSaveStatus('Conflito de edição', true);
  const p = e.projetoLocal, atual = e.dados && e.dados.atual;
  const ok = await confirmDialog({ title:'Alterado por outra pessoa',
    message: p && atual ? `O projeto <b>${esc(p.info.nome||'(sem nome)')}</b> foi salvo por <b>${esc(atual.alteradoPor ? atual.alteradoPor.nome : 'outra pessoa')}</b> em ${fmtDateTime(atual.atualizadoEm)}, depois que você o abriu.<br><br><b>Manter a minha versão</b> sobrescreve as alterações da outra pessoa. <b>Cancelar</b> recarrega a versão salva e descarta as suas.`
      : 'Estes dados foram alterados por outra pessoa. <b>Cancelar</b> recarrega a versão salva (as suas últimas alterações serão descartadas).',
    okText: p && atual ? 'Manter a minha versão' : 'OK', danger: true });
  if (ok && p && atual){ p.versao = atual.versao; saveDB(); return; }
  await loadDB(); if (!cur() && myProjects().length) db.currentId = myProjects()[0].id; go(); toast('Dados recarregados do servidor.');
}

/** Substitui o catálogo local pela versão devolvida pelo servidor (ex.: após restaurar o inicial). */
function aplicarCatalogo(c){
  db.catalogo = (c.dados && c.dados.itens) || []; db.catalogoFonte = (c.dados && c.dados.fonte) || '';
  db.catalogoAtualizadoEm = c.atualizadoEm; versoes.catalogo = c.versao; gravado.catalogo = JSON.stringify(db.catalogo);
}
function newProject(info){
  const now = new Date().toISOString();
  return fixProject({ id:uid(), criadoEm:now, atualizadoEm:now,
    ownerId: currentUser ? currentUser.id : null,
    criadoPor: currentUser ? {uid:currentUser.id, nome:currentUser.nome} : null,
    historico: currentUser ? [{em:now, uid:currentUser.id, nome:currentUser.nome, acao:'Projeto criado'}] : [], aprovacoes:{},
    info:Object.assign({nome:'Novo projeto', tipo:'', cliente:'', codigo:'', responsavel: currentUser ? currentUser.nome : '', data:todayISO(), versao:'1.0', descricao:'', observacoes:''}, info||{}),
    materiais:[], servicos:[], importacoes:[] });
}
function fixProject(p){
  p.info = Object.assign({nome:'', tipo:'', cliente:'', codigo:'', responsavel:'', data:'', versao:'1.0', descricao:'', observacoes:''}, p.info||{});
  p.historico = Array.isArray(p.historico) ? p.historico : []; p.aprovacoes = p.aprovacoes || {};
  p.materiais = (p.materiais||[]).map(m=>{
    const q = Number(m.quantidade)||0;
    // Regra: Valor total = Quantidade × Valor unitário. Dados antigos (só com total) são convertidos sem alterar o total.
    const vu = (m.valorUnitario!=null && m.valorUnitario!=='') ? (Number(m.valorUnitario)||0) : (q>0 ? (Number(m.valorTotal)||0)/q : 0);
    return {id:m.id||uid(), empresa:m.empresa||'', codigo:m.codigo||'', nome:m.nome||'', categoria:m.categoria==='ativacao'?'ativacao':'obra', unidade:m.unidade||'Unidade', quantidade:q, valorUnitario:vu, valorTotal:round2(q*vu), origem:m.origem||'Manual', importId:m.importId||null};
  });
  p.servicos = (p.servicos||[]).map(s=>({id:s.id||uid(), prestadoraId:s.prestadoraId||null, descricao:s.descricao||'', empresa:s.empresa||'', unidade:s.unidade||'Serviço', quantidade:Number(s.quantidade)||0, valorUnitario:Number(s.valorUnitario)||0, origem:s.origem||'Manual', importId:s.importId||null}));
  p.importacoes = p.importacoes||[];
  p.id = p.id || uid();
  return p;
}
/* O servidor já devolve só o que o usuário pode ver: supervisão = todos; colaborador = os próprios. */
function myProjects(){ return currentUser ? db.projects : []; }
function cur(){ return myProjects().find(p=>p.id===db.currentId) || null; }
/* Registra a alteração (para o histórico gravado pelo servidor) e agenda o salvamento. */
function touch(acao){
  const p = cur();
  if (p){ const now = new Date().toISOString(); p.atualizadoEm = now; logAlteracao(p, acao || ACAO_VIEW[view] || 'Projeto alterado'); p.conteudoAlteradoEm = now; }
  saveDB();
  const el = $('.last-change'); if (el && p) el.outerHTML = lastChangeHtml();
}

export { DEFAULT_UNITS, ORG, acoesPendentes, aplicarCatalogo, aplicarServidor, conteudoProjeto, cur, currentUser, db, definirUsuario, fixProject, gravado, haPendencias, loadDB, myProjects, newProject, saveDB, sincronizar, touch };
