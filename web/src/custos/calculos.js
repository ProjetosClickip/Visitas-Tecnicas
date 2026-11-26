/* =====================================================================
   4. CÁLCULOS
   ===================================================================== */
import { round2 } from './util.js';

const unitValue = m => Number(m.valorUnitario)||0;
const m_vu = unitValue;
const matTotal = m => round2((Number(m.quantidade)||0) * (Number(m.valorUnitario)||0));
const svcTotal = s => round2((Number(s.quantidade)||0) * (Number(s.valorUnitario)||0));
function totals(p){
  const t = {obra:0, ativ:0, mat:0, serv:0, total:0, nObra:0, nAtiv:0, nMat:0, nServ:0, empresas:{}, servEmpresas:{}};
  if (!p) return t;
  for (const m of p.materiais){
    const v = round2(m.valorTotal);
    if (m.categoria==='ativacao'){ t.ativ += v; t.nAtiv++; } else { t.obra += v; t.nObra++; }
    const e = m.empresa || '(sem empresa)';
    const E = t.empresas[e] || (t.empresas[e] = {n:0, nObra:0, nAtiv:0, obra:0, ativ:0, total:0});
    E.n++; E.total += v;
    if (m.categoria==='ativacao'){ E.ativ += v; E.nAtiv++; } else { E.obra += v; E.nObra++; }
  }
  for (const s of p.servicos){
    const v = svcTotal(s); t.serv += v; t.nServ++;
    const e = s.empresa || '(sem empresa)';
    const E = t.servEmpresas[e] || (t.servEmpresas[e] = {n:0, total:0});
    E.n++; E.total += v;
  }
  t.obra = round2(t.obra); t.ativ = round2(t.ativ); t.serv = round2(t.serv);
  t.mat = round2(t.obra + t.ativ);
  t.total = round2(t.mat + t.serv);
  t.nMat = p.materiais.length;
  for (const k in t.empresas){ const E=t.empresas[k]; E.obra=round2(E.obra); E.ativ=round2(E.ativ); E.total=round2(E.total); }
  for (const k in t.servEmpresas){ t.servEmpresas[k].total = round2(t.servEmpresas[k].total); }
  return t;
}

export { m_vu, svcTotal, totals, unitValue };
