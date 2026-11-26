/* =====================================================================
   2. UTILITÁRIOS
   ===================================================================== */
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const uid = ()=> Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const esc = v => String(v==null?'':v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round2 = n => Math.round((Number(n)||0)*100 + Number.EPSILON*100)/100;
const BRL = new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2});
const fmtBRL = n => BRL.format(Number(n)||0).replace(/[  ]/g,' ');
const fmtNum = (n, d=3) => (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:d});
const fmtInput = (n, d=2) => (n==null||n==='') ? '' : (Number(n)).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:d,useGrouping:false});
const fmtPct = (part, tot) => tot>0 ? (part/tot*100).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%' : '0,0%';
const todayISO = ()=>{ const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
const fmtDate = iso => { if(!iso) return '—'; const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const fmtDateTime = iso => { try{ const d=new Date(iso); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return iso; } };
const norm = s => String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const normKey = s => norm(s).replace(/[^a-z0-9]+/g,' ').trim();
const deepClone = o => JSON.parse(JSON.stringify(o));

/** Converte texto numérico (padrão brasileiro ou internacional) em número. Retorna null se inválido. */
function parseBR(v){
  if (v==null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1,-1); }
  s = s.replace(/R\$|\s| | /gi,'');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0,-1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc>-1 && ld>-1) {
    s = lc>ld ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,'');
  } else if (lc>-1) {
    const parts = s.split(',');
    s = parts.length>2 ? s.replace(/,/g,'') : s.replace(',','.');
  } else if (ld>-1) {
    const parts = s.split('.');
    if (parts.length>2) s = s.replace(/\./g,'');
    else if (parts[1].length===3 && parts[0]!=='0' && parts[0]!=='') s = s.replace('.','');
  }
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

export { $, $$, deepClone, esc, fmtBRL, fmtDate, fmtDateTime, fmtInput, fmtNum, fmtPct, norm, normKey, parseBR, round2, todayISO, uid };
