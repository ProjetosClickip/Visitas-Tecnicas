/* ---------- Downloads: escolha do relatório ---------- */
import { cur } from '../armazenamento.js';
import { icon, openModal, toast } from '../interface.js';

function reportChooser(){
  const p = cur(); if (!p) return toast('Nenhum projeto ativo.','err');
  openModal(`<div class="mh"><h3>Baixar relatório</h3><button class="btn icon" data-fechar>${icon('x')}</button></div>
  <div class="mb">${dlOptions()}</div>`, {size:'sm'});
}
const DL = {
  pdf: [
    ['report-full','#b42318','pdf','Relatório completo (PDF)','Identificação, materiais, serviços, subtotais e resumo financeiro.'],
    ['report-mat','#b42318','list','Lista de materiais com custos (PDF)','Materiais de obra e de ativação com valores e subtotais, sem serviços.'],
    ['report-semcusto','#b42318','list','Lista de materiais sem custo (PDF)','Somente itens e quantidades (código, descrição, unidade), sem nenhum valor.'],
    ['report-resumo','#b42318','resumo','Resumo financeiro consolidado (PDF)','Somente o quadro de custos: obra, ativação, materiais, serviços e estimativa total.']
  ],
  xls: [
    ['xls-full','#157f3b','xls','Relatório completo (Excel)','Abas: resumo, materiais de obra, materiais de ativação, serviços, custos por empresa e por prestadora.'],
    ['xls-custos','#157f3b','resumo','Apenas custos (Excel)','Resumo financeiro e subtotais por categoria, empresa e prestadora — sem a lista de itens.'],
    ['xls-semcusto','#157f3b','list','Lista de materiais sem custo (Excel)','Somente itens e quantidades (código, descrição, unidade), sem nenhum valor.']
  ]
};
const dlBtn = ([a,c,ic,t,d])=>`<button class="dl-opt" data-action="${a}"><span class="ic" style="background:${c}">${icon(ic,22)}</span><div><b>${t}</b><span>${d}</span></div></button>`;
const dlOptions = ()=>`<div class="dl-group"><div class="dl-h">PDF</div><div class="dl-opts">${DL.pdf.map(dlBtn).join('')}</div></div>
  <div class="dl-group"><div class="dl-h">Excel (.xlsx)</div><div class="dl-opts">${DL.xls.map(dlBtn).join('')}</div></div>`;
const dlCards = ()=>`<div class="dl-h">PDF</div><div class="dl-cards">${DL.pdf.map(dlBtn).join('')}</div>
  <div class="dl-h mt16">Excel (.xlsx)</div><div class="dl-cards">${DL.xls.map(dlBtn).join('')}</div>`;

export { dlCards, reportChooser };
