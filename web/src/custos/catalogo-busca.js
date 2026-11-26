/* =====================================================================
   12a-2. BUSCA DE MATERIAIS NO CATÁLOGO PELA DESCRIÇÃO (correspondência aproximada)
   Compara as palavras da descrição do documento com as do catálogo. Números e especificações
   (ex.: 12FO, 1X16, 1200MM, AS80) pesam mais, para não confundir cabos/caixas de tamanhos diferentes.
   ===================================================================== */
import { ORG, db } from './armazenamento.js';
import { catalogo } from './catalogo.js';
import { esc, fmtBRL, normKey, round2 } from './util.js';

const CAT_OK = 0.62, CAT_SUG = 0.45;
const CAT_STOP = new Set('de da do das dos para p c com e a o em sem tipo the of ou x'.split(' '));
/* nomes das tabelas de preço por empresa do grupo (config/organizacao.json → empresasGrupo.tabelaCatalogo) */
const catTabNome = t => { const e = (ORG.empresasGrupo||[]).find(x => x.tabelaCatalogo === t); return e ? (e.nomeCurto || e.nome) : ''; };
const catTabLabel = t => t ? (catTabNome(t) ? `${t} · ${catTabNome(t)}` : t) : '';
function catToks(s){ return [...new Set(normKey(s).split(' ').filter(t=>t && !CAT_STOP.has(t) && !(t.length===1 && !/\d/.test(t))))]; }
let CATIDX = null;
function catIndex(){
  const cat = catalogo(); const key = cat.length + '|' + (db.catalogoAtualizadoEm||'');
  if (CATIDX && CATIDX.key===key && CATIDX.cat===cat) return CATIDX;
  const inv = new Map(); const add = (k,it)=>{ let a = inv.get(k); if (!a) inv.set(k, a=[]); a.push(it); };
  const items = cat.map((x,i)=>({x, i, t:catToks(x.descricao)}));
  items.forEach(it=>it.t.forEach(t=>{ add(t, it); if (t.length>=5 && !/\d/.test(t)) add('~'+t.slice(0,5), it); }));
  return CATIDX = {key, cat, items, inv};
}
const tokW = t => /\d/.test(t) ? 2 : (t.length<=3 ? 0.8 : 1);
const tokShape = t => t.replace(/\d+/g,'#');
/* Especificações conflitantes: mesmo "formato" com números diferentes (ex.: 20a × 10a, 12fo × 24fo, 430 × 304) */
function specConflicts(A, B){
  const sa = new Set(A), sb = new Set(B); let n = 0;
  const shB = new Map(); B.forEach(b=>{ if (/\d/.test(b) && !sa.has(b)) shB.set(tokShape(b), true); });
  A.forEach(a=>{ if (/\d/.test(a) && !sb.has(a) && shB.has(tokShape(a))) n++; });
  return n;
}
function tokSim(a, b){
  if (a===b) return 1;
  if (/\d/.test(a) || /\d/.test(b)) return 0;
  if (a.length>=5 && b.length>=5 && a.slice(0,5)===b.slice(0,5) && Math.abs(a.length-b.length)<=3) return 0.85;
  return 0;
}
function catScore(A, B){
  const side = (X, Y)=>{ let w=0, m=0; for (const a of X){ const k = tokW(a); w += k; let best = 0; for (const b of Y){ const s = tokSim(a,b); if (s>best){ best = s; if (s===1) break; } } m += k*best; } return w ? m/w : 0; };
  return 0.6*side(A,B) + 0.4*side(B,A);
}
/* Retorna até n itens do catálogo [{item, i, s}] ordenados pela semelhança com a descrição */
function catalogMatch(nome, n){
  const A = catToks(nome); if (!A.length) return [];
  const ix = catIndex(); const cand = new Set();
  A.forEach(t=>{ (ix.inv.get(t)||[]).forEach(it=>cand.add(it)); if (t.length>=5 && !/\d/.test(t)) (ix.inv.get('~'+t.slice(0,5))||[]).forEach(it=>cand.add(it)); });
  const pref = db.settings.catalogoTabela || '';
  const res = [];
  cand.forEach(it=>{ const c = specConflicts(A, it.t); const s = catScore(A, it.t) * Math.pow(0.7, c); if (s < 0.3) return; res.push({item:it.x, i:it.i, s, c, r: s + (pref && it.x.tabela===pref ? 0.03 : 0) + (it.x.valor>0 ? 0.02 : 0)}); });
  res.sort((a,b)=>b.r-a.r);
  return res.slice(0, n||5);
}
function catalogBest(nome){ const m = catalogMatch(nome, 1)[0]; return m && m.s>=CAT_SUG && !m.c ? m : null; }
const pctTxt = s => Math.round(Math.min(1,s)*100)+'%';
/* Aplica o catálogo a uma linha de importação de material (preço, unidade e, opcionalmente, descrição) */
function applyCatalogRow(r, cfg, force){
  if (r.categoria==='servico' || cfg.catalogo===false) return;
  if (r._catDone && !force) return;
  r._catDone = true;
  if (r.nomeArquivo==null) r.nomeArquivo = r.nome;
  if (r.valorArquivo==null) r.valorArquivo = r.valorUnitario;
  r.catOpts = catalogMatch(r.nomeArquivo, 6).filter(m=>m.s>=0.35).map(m=>({i:m.i, s:m.s, c:m.c}));
  const best = r.catOpts[0];
  r.catSel = best && best.s>=CAT_SUG && !best.c ? best.i : -1;   // especificação diferente (ex.: 20A × 10A) não é escolhida automaticamente
  setCatalogChoice(r, cfg);
}
function setCatalogChoice(r, cfg){
  const cat = catalogo(); const it = r.catSel>=0 ? cat[r.catSel] : null; const opt = (r.catOpts||[]).find(o=>o.i===r.catSel);
  r.aviso = String(r.aviso||'').split(' · ').filter(x=>x && !/catálogo/i.test(x)).join(' · ');
  const addAviso = t => { r.aviso = r.aviso ? r.aviso+' · '+t : t; };
  if (it){
    r.valorUnitario = it.valor>0 ? it.valor : (r.valorArquivo||0);
    if (!it.valor) addAviso('Item do catálogo sem valor — informe o valor unitário');
    if (cfg.catNome!==false && opt && opt.s>=CAT_OK) r.nome = it.descricao; else r.nome = r.nomeArquivo;
    if (!r.unidadeArquivo) r.unidadeArquivo = r.unidade || '';
    if (!r.unidadeArquivo || r.unidadeArquivo==='Unidade') r.unidade = it.unidade || r.unidade || 'Unidade';
    if (opt && opt.s<CAT_OK) addAviso('Correspondência aproximada no catálogo — confira o item escolhido');
  } else {
    r.valorUnitario = r.valorArquivo || 0; r.nome = r.nomeArquivo;
    addAviso(r.valorUnitario ? 'Não encontrado no catálogo — mantido o valor do arquivo' : 'Não encontrado no catálogo — informe o valor unitário');
  }
  r.valorTotal = round2((r.quantidade||0)*r.valorUnitario);
}
function catCell(r){
  if (r.categoria==='servico' || !r.catOpts) return '<span class="muted">—</span>';
  const cat = catalogo();
  const sel = r.catSel>=0 ? (r.catOpts.find(o=>o.i===r.catSel)||{s:0}) : null;
  const badge = sel ? `<span class="badge ${sel.s>=CAT_OK?'b-ok':'b-warn'}" title="Semelhança da descrição">${pctTxt(sel.s)}</span> ` : '<span class="badge b-err">Sem correspondência</span> ';
  return `${badge}<select class="inp" data-k="catSel" style="min-width:250px;max-width:330px">${r.catOpts.map(o=>{ const x = cat[o.i]; return `<option value="${o.i}" ${o.i===r.catSel?'selected':''}>${esc(x.descricao.slice(0,70))} · ${fmtBRL(x.valor)} (${pctTxt(o.s)})</option>`; }).join('')}<option value="-1" ${r.catSel<0?'selected':''}>— Sem correspondência (usar valor do arquivo / informar)</option></select>${r.nomeArquivo && r.nomeArquivo!==r.nome ? `<div class="muted" style="font-size:11px" title="Descrição no arquivo">Arquivo: ${esc(r.nomeArquivo.slice(0,80))}</div>`:''}`;
}

export { CAT_OK, applyCatalogRow, catCell, catTabLabel, catalogBest, pctTxt, setCatalogChoice };
