/* ---------- 7.9 Relatórios ---------- */
import { cur, db, saveDB } from '../armazenamento.js';
import { totals } from '../calculos.js';
import { afterRender } from '../registro.js';
import { dlCards } from '../relatorios/downloads.js';
import { projHeader } from './comum.js';
import { noProject } from './identificacao.js';
import { tipoLabel } from '../tema.js';
import { $, $$, esc, fmtBRL, fmtDate } from '../util.js';

function vRelatorios(){
  const p = cur(); if(!p) return noProject();
  const t = totals(p);
  const o = db.settings.reportOpts || (db.settings.reportOpts = {descricao:true, empresas:true, vazias:true});
  const miss = [];
  if (!p.info.nome) miss.push('nome do projeto'); if(!p.info.tipo) miss.push('tipo de projeto'); if(!p.info.responsavel) miss.push('responsável'); if(!p.info.data) miss.push('data de elaboração');
  return projHeader('Etapa 6 · Relatórios','Relatório profissional de mensuração em PDF (A4), pronto para impressão e compartilhamento.') + `
  <div class="card">
    ${miss.length?`<div class="alert warn">Campos de identificação não preenchidos: <b>${miss.join(', ')}</b>. <a href="#" data-view="ident">Preencher agora</a></div>`:''}
    <h2>Conteúdo do relatório</h2>
    <table class="tbl"><tbody>
      <tr><td>Identificação do projeto</td><td>${p.info.tipo?esc(tipoLabel(p.info.tipo))+' · ':''}${esc(p.info.nome||'—')} · ${esc(p.info.cliente||'—')} · Código ${esc(p.info.codigo||'—')} · ${esc(p.info.responsavel||'—')} · ${fmtDate(p.info.data)}</td></tr>
      <tr><td>Relação de materiais de obra</td><td>${t.nObra} item(ns) · <b>${fmtBRL(t.obra)}</b></td></tr>
      <tr><td>Relação de materiais de ativação</td><td>${t.nAtiv} item(ns) · <b>${fmtBRL(t.ativ)}</b></td></tr>
      <tr><td>Relação de serviços e mão de obra</td><td>${t.nServ} serviço(s) · <b>${fmtBRL(t.serv)}</b> · ${[...new Set(p.servicos.map(s=>s.empresa).filter(Boolean))].length} prestadora(s)/equipe(s) <span class="muted">(somente no relatório completo)</span></td></tr>
      <tr><td>Resumo financeiro consolidado</td><td>Estimativa total: <b>${fmtBRL(t.total)}</b></td></tr>
    </tbody></table>
    <h2 class="mt16">Opções</h2>
    <div class="btns" style="gap:18px">
      <label><input type="checkbox" data-ropt="descricao" ${o.descricao?'checked':''}> Incluir descrição e observações</label>
      <label><input type="checkbox" data-ropt="empresas" ${o.empresas?'checked':''}> Incluir subtotais por prestadora de serviço</label>
      <label><input type="checkbox" data-ropt="vazias" ${o.vazias?'checked':''}> Exibir seções sem itens</label>
    </div>
    <div class="fld mt16" style="max-width:420px"><label>Empresa emissora (cabeçalho do relatório)</label><input class="inp" id="rEmp" value="${esc(db.settings.empresaRelatorio)}" placeholder="Ex.: CLICK IP Serviços de Comunicação"></div>
    <h2 class="mt16">Baixar</h2>${dlCards()}
    <p class="muted mt8" style="font-size:12px">PDF: requer jsPDF e AutoTable; Excel: requer SheetJS (internet no primeiro uso). Sem internet, as planilhas são baixadas em CSV (abre no Excel).</p>
  </div>`;
}
afterRender.relatorios = ()=>{
  $$('[data-ropt]').forEach(c=>c.addEventListener('change',()=>{ db.settings.reportOpts[c.dataset.ropt]=c.checked; saveDB(); }));
  $('#rEmp').addEventListener('input', e=>{ db.settings.empresaRelatorio = e.target.value; saveDB(); });
};

export { vRelatorios };
