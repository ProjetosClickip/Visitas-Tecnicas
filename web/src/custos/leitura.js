/* =====================================================================
   8. IMPORTAÇÃO DE DOCUMENTOS
   ===================================================================== */
import { db } from '../armazenamento.js';
import { autoCategory, isUnitToken, normalizeUnit } from '../classificacao.js';
import { OCR_OPCOES, loadLib } from '../libs.js';
import { fmtBRL, norm, normKey, parseBR, round2 } from '../util.js';

const FIELDS = {
  auto:      [['empresa','Empresa de origem / prestadora'],['codigo','Código do item'],['nome','Descrição (material ou serviço)'],['categoria','Categoria / tipo'],['unidade','Unidade'],['quantidade','Quantidade'],['valorUnitario','Valor unitário'],['valorTotal','Valor total']],
  materiais: [['empresa','Empresa de origem'],['codigo','Código do item'],['nome','Nome / descrição do material'],['categoria','Categoria'],['unidade','Unidade de medida'],['quantidade','Quantidade'],['valorUnitario','Valor unitário'],['valorTotal','Valor total']],
  servicos:  [['nome','Descrição do serviço'],['empresa','Empresa / prestadora'],['codigo','Código do serviço'],['unidade','Unidade de medição'],['quantidade','Quantidade'],['valorUnitario','Valor unitário'],['valorTotal','Valor total']]
};
const fieldsFor = tipo => FIELDS[tipo] || FIELDS.auto;
const SYN = {
  empresa:['empresa de origem','empresa','fornecedor','origem','unidade de origem','filial','deposito','almoxarifado','equipe','equipe responsavel','empresa responsavel','prestador','prestadora','contratada','responsavel','empresa equipe','marca'],
  codigo:['codigo do item','codigo','cod','cod item','cod material','codigo material','codigo do material','sku','ref','referencia','part number','pn','cod produto','codigo produto','item cod','cod do item','cod servico','codigo do servico','cod sap','codigo sap','pro codigo','codigo do produto'],
  nome:['nome do item','descricao','descricao do material','descricao do item','descricao do servico','descricao dos servicos','descricao dos materiais','descricao do produto','descricao detalhada','nome','material','produto','especificacao','servico','discriminacao','materiais','servicos','descricao material','item','itens','pro nome','nome do produto'],
  categoria:['categoria','tipo','classificacao','grupo','tipo de material','tipo de item','natureza'],
  unidade:['unidade de medida','unidade','un','und','unid','um','u m','medida','unid medida','unidade medida','unidade de medicao','unid med','un med','unidade de saida','und saida','un saida'],
  quantidade:['quantidade','qtd','qtde','quant','qt','qte','qnt','quantidades','qtd total','quantidade total','qtd solicitada','quantidade solicitada'],
  valorUnitario:['valor unitario','vl unit','vlr unit','vl unitario','vlr unitario','preco unitario','preco unit','unitario','custo unitario','v unit','v unitario','pu','valor unit','r unit','custo unit','preco','valor unit r','preco unit r','unit','p unit','vlr unit r','valor unitario r','vlrunitarioentrada','vlr unitario entrada','valor de cadastro do item','valor de cadastro'],
  valorTotal:['valor total','total','vl total','vlr total','preco total','custo total','subtotal','valor','v total','total r','valor total r','total item','vlr total r','preco total r']
};
function autoMapRow(row, tipo){
  const allowed = new Set(fieldsFor(tipo).map(f=>f[0]));
  const cands = [];
  (row||[]).forEach((cell,ci)=>{
    const h = normKey(cell); if(!h || h.length>60) return;
    for (const f in SYN){ if(!allowed.has(f)) continue;
      SYN[f].forEach((s,i)=>{ let base=0;
        if (h===s) base=3; else if (h.startsWith(s+' ')||h.endsWith(' '+s)) base=2; else if ((' '+h+' ').includes(' '+s+' ')) base=1;
        if (base) cands.push({ci, f, sc:base*100-i - (f==='unidade' && /entrada/.test(h) ? 60 : 0)});   // "Und. de Saída" tem prioridade sobre "Und. de Entrada"
      });
    }
  });
  cands.sort((a,b)=>b.sc-a.sc);
  const mapping = {}, usedC = new Set();
  for (const c of cands){ if (mapping[c.f]!=null || usedC.has(c.ci)) continue; mapping[c.f]=c.ci; usedC.add(c.ci); }
  return mapping;
}
const combineRows = (a,b)=>{ const n = Math.max((a||[]).length,(b||[]).length); const o=[]; let lastA='';
  for (let i=0;i<n;i++){ let x = String((a||[])[i]==null?'':(a||[])[i]).trim(); const y = String((b||[])[i]==null?'':(b||[])[i]).trim();
    if (!x && y && lastA && /valor|preco|vlr|custo/i.test(lastA)) x = lastA;   // célula mesclada ("Valor" sobre "Unit." e "Total")
    if (x) lastA = x; o.push((x+' '+y).trim()); } return o; };
function detectHeader(table, tipo){
  let best = null;
  const lim = Math.min(table.length, 45);
  const ok = m => m.nome!=null || m.quantidade!=null;
  for (let r=0; r<lim; r++){
    const m = autoMapRow(table[r], tipo); const n = Object.keys(m).length;
    if (n>=2 && ok(m) && (!best || n>best.n)) best = {row:r, mapping:m, n, span:1};
    if (r+1<table.length){
      const comb = combineRows(table[r], table[r+1]);
      const m2 = autoMapRow(comb, tipo); const n2 = Object.keys(m2).length;
      const nNext = Object.keys(autoMapRow(table[r+1], tipo)).length;
      if (n2>=3 && ok(m2) && n2>n && n2>nNext && (!best || n2>best.n)) best = {row:r, mapping:m2, n:n2, span:2, comb};
    }
  }
  return best;
}
const TOTAL_LINE = /^(sub ?total|total|valor total|total geral|soma|pagina|página|observa|obs|valor global|preco global)\b/;
const SVC_START = ['lancamento','instalacao','fusao','fusoes','configuracao','ativacao de','ativacao do','ativacao da','mao de obra','servico','servicos','execucao','montagem','vistoria','certificacao','manutencao','remocao','retirada','desmontagem','passagem de','emenda','teste','testes','organizacao','adequacao','acompanhamento','deslocamento','diaria','diarias','hora tecnica','mobilizacao','desmobilizacao','levantamento','cadastro','elaboracao','projeto executivo','limpeza','substituicao','construcao','escavacao','abertura de','recomposicao','lancar','instalar','fusionar','tecnico','equipe'];
function looksService(nome, unidade){
  const n = normKey(nome);
  if (SVC_START.some(w=>n===w || n.startsWith(w+' '))) return true;
  return ['Hora','Diária','Serviço','Verba'].includes(normalizeUnit(unidade));
}
function sectionOf(text){
  const n = normKey(text); if (!n || n.length>90) return null;
  if (/\b(servicos?|mao de obra|m o|instalacao e servicos)\b/.test(n)) return 'servico';
  if (/\bativac/.test(n) || /^solucao$/.test(n)) return 'ativacao';
  if (/\b(materia(l|is) de obra|obra|obras|infraestrutura|infra estrutura|rede externa|construcao|rede optica)\b/.test(n)) return 'obra';
  return null;
}
function classFromValue(v){
  const n = norm(v); if (!n) return null;
  if (/serv|mao de obra|^m\.?o\.?$/.test(n)) return 'servico';
  if (n.includes('ativ')) return 'ativacao';
  if (/obra|infra|rede/.test(n)) return 'obra';
  return null;
}
const isAllCaps = s => /[A-ZÀ-Ú]{3,}/.test(s) && s===s.toUpperCase();
function classify(d, cfg, secao){
  const col = classFromValue(d.categoria);
  const matCat = ()=> (!cfg.categoria || cfg.categoria==='auto') ? autoCategory(d.nome+' '+(d.codigo||''), 'obra') : cfg.categoria;
  if (cfg.tipo==='servicos') return 'servico';
  if (cfg.tipo==='materiais' && cfg.forcar && (cfg.categoria==='obra' || cfg.categoria==='ativacao')) return cfg.categoria;
  if (cfg.tipo==='materiais'){ if (col && col!=='servico') return col; if (secao && secao!=='servico') return secao; return matCat(); }
  if (col) return col;
  if (secao) return secao;
  if (looksService(d.nome, d.unidade)) return 'servico';
  return matCat();
}
function makeRow(d, cfg, secao){
  let q = d.quantidade, vu = d.valorUnitario, vt = d.valorTotal;
  let aviso = '';
  if (q==null && (vt!=null || vu!=null)){ q = 1; aviso = 'Quantidade não informada no arquivo — considerada 1'; if (vu==null) vu = vt; }
  else if (q==null && cfg.tipo==='materiais'){ q = 1; aviso = 'Quantidade não informada no arquivo — considerada 1, ajuste'; }   // lista de itens sem quantitativos
  if (vt==null && vu!=null && q!=null) vt = round2(q*vu);
  if (vu==null && vt!=null && q) vu = vt/q;
  if (!aviso && q!=null && vu!=null && vt!=null && q>0){
    const calc = round2(q*vu);
    if (Math.abs(calc-vt) > Math.max(0.05, Math.abs(vt)*0.01)) aviso = `Total do arquivo (${fmtBRL(vt)}) difere de Qtd × Unit. (${fmtBRL(calc)}) — confira o valor unitário`;
    vt = calc;
  }
  const categoria = classify(d, cfg, secao);
  return { sel:true, empresa: String(d.empresa||'').trim() || cfg.empresa || '', codigo:String(d.codigo||'').trim(), nome:String(d.nome||'').replace(/\s+/g,' ').trim(), categoria,
    unidade: normalizeUnit(d.unidade) || (categoria==='servico'?'Serviço':'Unidade'),
    quantidade: q, valorUnitario: vu==null?0:vu, valorTotal: vt==null?0:round2(vt), aviso, dup:null, dupAction:'ignorar', secao:secao||'' };
}
/* Remove a unidade "colada" no fim da descrição por PDFs impressos (ex.: "... NOBREAKUN", "... - ATN UN") */
function splitGluedUnit(txt){
  let t = String(txt).replace(/\s+/g,' ').trim(), un = '';
  for (let k=0;k<3;k++){
    let m = t.match(/^(.*\S)\s+(UN|UND|CJ|PC|PÇ|M|MT|RL|CX|KG)$/);
    if (m){ un = un || m[2]; t = m[1]; continue; }
    m = t.match(/^(.*(?:[A-ZÀ-Ú][A-ZÀ-Ú0-9]|\)))(UN|CJ)$/);
    if (m){ un = un || m[2]; t = m[1]; continue; }
    break;
  }
  const o = new String(t); o._un = un; return o;
}
function rowsFromMapping(table, headerRow, mapping, cfg, opts){
  opts = opts || {};
  const out = []; let secao = null, last = null; const stats = {titulos:0, continuacoes:0, cabecalhos:0, secoes:0};
  const g = (r,f)=> mapping[f]!=null && mapping[f]!=='' ? r[mapping[f]] : '';
  const nMap = Object.keys(mapping).filter(k=>mapping[k]!=null).length;
  for (let i=headerRow+1; i<table.length; i++){
    const r = table[i]; if (!r) continue;
    const cells = r.map(c=>String(c==null?'':c).trim()).filter(Boolean);
    if (!cells.length) continue;
    if (cells.length>=2 && Object.keys(autoMapRow(r, cfg.tipo)).length >= Math.min(3, nMap)){ stats.cabecalhos++; last=null; continue; }   // cabeçalho repetido (nova página)
    let nome = String(g(r,'nome')).replace(/\s+/g,' ').trim();
    let codigo = String(g(r,'codigo')).trim();
    let unid = g(r,'unidade');
    if (!nome && codigo){   // PDF em que código e descrição vieram juntos na mesma célula (ex.: "0000000001 ABRACADEIRA BAP 3 ...")
      const mm = codigo.match(/^(\d[\d.\-\/]{2,})\s+(.*[A-Za-zÀ-ú]{2}.*)$/);
      if (mm){ codigo = mm[1]; nome = splitGluedUnit(mm[2]); if (!String(unid).trim() || !isUnitToken(String(unid).trim().split(/\s+/)[0])) unid = nome._un || unid; nome = String(nome); }
    }
    if (unid && !isUnitToken(String(unid).trim()) && isUnitToken(String(unid).trim().split(/\s+/)[0])) unid = String(unid).trim().split(/\s+/)[0];   // "UN 1,00 MATERIAL DE REDE"
    else if (unid && /\d/.test(String(unid)) && !isUnitToken(String(unid).trim().split(/\s+/)[0])) unid = '';
    const q = parseBR(g(r,'quantidade')), vu = parseBR(g(r,'valorUnitario')), vt = parseBR(g(r,'valorTotal'));
    const hasNum = q!=null || vu!=null || vt!=null;
    if (!hasNum){
      const txt = cells.join(' ');
      const sec = cells.length<=2 ? sectionOf(txt) : null;
      if (sec){ secao = sec; last = null; stats.secoes++; continue; }
      if (opts.continuation && last && nome && !codigo && cells.length===1 && cells[0]===nome && !isAllCaps(nome) && !TOTAL_LINE.test(norm(nome))){ last.nome = (last.nome+' '+nome).replace(/\s+/g,' '); stats.continuacoes++; continue; }
      if (!(codigo && nome)){ stats.titulos++; last = null; continue; }
    }
    if (!nome && !codigo) continue;
    if (TOTAL_LINE.test(norm(nome)) && !codigo) { last=null; continue; }
    if ((TOTAL_LINE.test(norm(codigo)) || TOTAL_LINE.test(norm(nome))) && (q==null || !/[a-zA-ZÀ-ú]{3,}/.test(nome))) { last=null; continue; }
    if (!/[a-zA-ZÀ-ú0-9]/.test(nome) && q==null) continue;
    if (!/[a-zA-ZÀ-ú]{2,}/.test(nome)) continue;
    last = makeRow({nome, codigo, empresa:g(r,'empresa'), categoria:g(r,'categoria'), unidade:unid, quantidade:q, valorUnitario:vu, valorTotal:vt}, cfg, secao);
    out.push(last);
  }
  out.stats = stats;
  return out;
}

/* Leitura de linhas de texto (PDF/OCR) sem cabeçalho reconhecível */
function parseLinesHeuristic(lines, cfg){
  const out = []; let secao = null, last = null; const stats = {titulos:0, continuacoes:0, cabecalhos:0, secoes:0};
  for (let raw of lines){
    const line = String(raw).replace(/\s+/g,' ').trim();
    if (line.length<3 || !/[a-zA-ZÀ-ú]/.test(line)) continue;
    const tk = line.split(' ');
    const nums = []; let unit = ''; let i = tk.length-1;
    for (; i>=0; i--){
      const t = tk[i];
      if (/^r\$$/i.test(t)) continue;
      const n = /^[-(]?(R\$)?[\d.,]+\)?$/i.test(t) ? parseBR(t) : null;
      if (n!=null && nums.length<3){ nums.unshift({n, money:/,\d{2}$/.test(t)||/R\$/i.test(t)}); continue; }
      if (!unit && isUnitToken(t) && nums.length>0 && nums.length<3){ unit = t; continue; }
      if (!unit && isUnitToken(t) && nums.length===3 && i>0){ unit = t; i--; }
      break;
    }
    if (!nums.length){
      const sec = sectionOf(line);
      if (sec && line.length<70){ secao = sec; last = null; stats.secoes++; continue; }
      if (last && /^[a-zà-ú(\/-]/.test(line) && line.length<90){ last.nome = (last.nome+' '+line).replace(/\s+/g,' '); stats.continuacoes++; continue; }
      stats.titulos++; last = null; continue;
    }
    let head = tk.slice(0, i+1);
    if (head.length && /^\d{1,3}[.)]?$/.test(head[0]) && head.length>1) head = head.slice(1);           // nº do item
    let codigo = '';
    if (head.length>1 && /\d/.test(head[0]) && /^[A-Za-z0-9][A-Za-z0-9\-_.\/]{2,}$/.test(head[0]) && !isUnitToken(head[0])) { codigo = head[0]; head = head.slice(1); }
    const nome = head.join(' ').replace(/^[-–:|]+|[-–:|]+$/g,'').trim();
    if (nome.length<3 || !/[a-zA-ZÀ-ú]{2,}/.test(nome)) { last=null; continue; }
    if (TOTAL_LINE.test(norm(nome))) { last=null; continue; }
    if (Object.keys(autoMapRow(nome.split(/\s+/), cfg.tipo)).length>=3) { stats.cabecalhos++; last=null; continue; }   // linha de cabeçalho
    let q=null, vu=null, vt=null;
    if (nums.length===1 && !unit){
      if (nums[0].money && (cfg.tipo==='servicos' || looksService(nome,''))) { vt = nums[0].n; }   // serviço por preço global
      else { stats.titulos++; last=null; continue; }
    }
    else if (nums.length===3){ q=nums[0].n; vu=nums[1].n; vt=nums[2].n; }
    else if (nums.length===2){ q=nums[0].n; vu=nums[1].n; }
    else q = nums[0].n;
    last = makeRow({nome, codigo, unidade:unit, quantidade:q, valorUnitario:vu, valorTotal:vt}, cfg, secao);
    out.push(last);
  }
  out.stats = stats;
  return out;
}

/* CSV próprio (detecta ; , ou TAB, aspas e codificação) */
function decodeText(buf){
  try { return new TextDecoder('utf-8',{fatal:true}).decode(buf); }
  catch(e){ return new TextDecoder('windows-1252').decode(buf); }
}
function parseCSV(text){
  text = text.replace(/^﻿/,'');
  const sample = text.split(/\r?\n/).filter(l=>l.trim()).slice(0,12).join('\n');
  const count = ch => { let n=0, q=false; for (const c of sample){ if(c==='"') q=!q; else if(c===ch && !q) n++; } return n; };
  const cands = [[';',count(';')],['\t',count('\t')],[',',count(',')]].sort((a,b)=>b[1]-a[1]);
  const sep = cands[0][1]>0 ? cands[0][0] : ';';
  const rows = []; let row = [], fld = '', q = false;
  for (let i=0;i<text.length;i++){
    const c = text[i];
    if (q){ if (c==='"'){ if (text[i+1]==='"'){ fld+='"'; i++; } else q=false; } else fld+=c; }
    else if (c==='"') q = true;
    else if (c===sep){ row.push(fld); fld=''; }
    else if (c==='\n' || c==='\r'){ if(c==='\r' && text[i+1]==='\n') i++; row.push(fld); rows.push(row); row=[]; fld=''; }
    else fld += c;
  }
  if (fld!=='' || row.length){ row.push(fld); rows.push(row); }
  return rows.map(r=>r.map(c=>c.replace(/\s+/g,' ').trim()));
}

/* PDF -> linhas com posição das células (camada de texto) ou texto (OCR) */
function textItemsToLines(items){
  const its = items.filter(it=>it.str && it.str.trim()!=='').map(it=>({s:it.str, x:it.transform[4], y:it.transform[5], w:it.width||0, h:Math.abs(it.transform[3])||it.height||10}));
  its.sort((a,b)=> (b.y-a.y) || (a.x-b.x));
  const lines = [];
  for (const it of its){
    const L = lines.find(l=>Math.abs(l.y-it.y) <= Math.max(2, Math.min(l.h,it.h)*0.45));
    if (L) { L.items.push(it); } else lines.push({y:it.y, h:it.h, items:[it]});
  }
  lines.sort((a,b)=>b.y-a.y);
  return lines.map(L=>{
    L.items.sort((a,b)=>a.x-b.x);
    const cells = []; let cur = null;
    for (const it of L.items){
      const gap = cur ? it.x - cur.x1 : 0;
      if (!cur || gap > it.h*0.9){ cur = {t:it.s, x0:it.x, x1:it.x+it.w}; cells.push(cur); }
      else { cur.t += (gap > it.h*0.12 ? ' ' : '') + it.s; cur.x1 = Math.max(cur.x1, it.x+it.w); }
    }
    cells.forEach(c=>c.t = c.t.replace(/\s+/g,' ').trim());
    return {cells: cells.filter(c=>c.t), text: cells.map(c=>c.t).join('   ')};
  }).filter(l=>l.cells.length);
}
/* Alinha as células de cada linha às colunas do cabeçalho pela posição horizontal */
function alignByHeader(struct, hr){
  const H = struct[hr].cells; const pad = 6;
  const starts = H.map(c=>c.x0 - pad);
  return struct.map((L, li)=>{
    if (li===hr) return H.map(c=>c.t);
    const arr = new Array(H.length).fill('');
    for (const c of L.cells){
      const isNum = parseBR(c.t)!=null;
      const pt = isNum ? c.x1 - 0.5 : c.x0 + 0.5;
      let j = 0; for (let k=0;k<starts.length;k++){ if (pt >= starts[k]) j = k; }
      arr[j] = arr[j] ? arr[j]+' '+c.t : c.t;
    }
    return arr;
  });
}
async function ocrSources(sources, onProg){
  const T = await loadLib('tesseract');
  onProg('Carregando OCR (idioma: '+db.settings.ocrLang+')…', 0);
  const worker = await T.createWorker(db.settings.ocrLang||'por', 1, Object.assign({}, OCR_OPCOES, { logger: m=>{ if (m.status==='recognizing text') onProg(null, m.progress); } }));
  try {
    await worker.setParameters({ preserve_interword_spaces:'1' });
    const out = [];
    for (let i=0;i<sources.length;i++){
      onProg(`Reconhecendo texto (OCR) — página ${i+1} de ${sources.length}…`, 0);
      const { data } = await worker.recognize(await sources[i]());
      out.push(...String(data.text||'').split(/\r?\n/));
    }
    return out;
  } finally { try{ await worker.terminate(); }catch(e){} }
}
async function extractPdf(file, cfg, onProg){
  const pdfjs = await loadLib('pdfjs');
  // isEvalSupported:false – PDF.js não executa código gerado a partir do arquivo (proteção contra PDFs maliciosos)
  const pdf = await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()), isEvalSupported:false}).promise;
  const lines = []; const struct = []; const ocrPages = [];
  for (let n=1; n<=pdf.numPages; n++){
    onProg(`Lendo página ${n} de ${pdf.numPages}…`, n/pdf.numPages);
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const chars = tc.items.map(i=>i.str||'').join('').replace(/\s/g,'').length;
    if (cfg.forceOcr || chars < 25){
      ocrPages.push(n);
      const pl = await ocrSources([async ()=>{ const vp = page.getViewport({scale:2.2}); const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
        await page.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise; return cv; }], onProg);
      lines.push(...pl);
    } else { const ls = textItemsToLines(tc.items); struct.push(...ls); lines.push(...ls.map(l=>l.text)); }
  }
  return {lines, struct: ocrPages.length ? null : struct, ocrPages, numPages:pdf.numPages};
}

export { TOTAL_LINE, alignByHeader, autoMapRow, decodeText, detectHeader, extractPdf, fieldsFor, ocrSources, parseCSV, parseLinesHeuristic, rowsFromMapping };
