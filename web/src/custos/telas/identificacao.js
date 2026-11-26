/* ---------- 7.3 Identificação ---------- */
import { cur, touch } from '../armazenamento.js';
import { icon, renderProjSelect } from '../interface.js';
import { afterRender } from '../registro.js';
import { projHeader } from './comum.js';
import { TIPOS } from '../tema.js';
import { $, $$, esc } from '../util.js';

function vIdent(){
  const p = cur(); if(!p) return noProject();
  const f = (k,l,req,type,cls)=>`<div class="fld ${cls||''}"><label>${l}${req?' <span class="req">*</span>':''}</label><input class="inp" data-info="${k}" type="${type||'text'}" value="${esc(p.info[k])}"><div class="msg" id="msg-${k}"></div></div>`;
  return projHeader('Etapa 1 · Identificação do projeto','Dados da mensuração — salvos automaticamente a cada alteração.') + `
  <div class="card"><div class="form-grid">
    <div class="fld full"><label>Tipo de projeto <span class="req">*</span></label>
      <div class="tipo-opts" id="tipoOpts">${TIPOS.map(([k,l])=>`<label class="tipo-opt ${p.info.tipo===k?'on':''}"><input type="radio" name="tipo" value="${k}" ${p.info.tipo===k?'checked':''}>${icon('t_'+k,18)}<span>${l}</span></label>`).join('')}</div>
      <div class="msg" id="msg-tipo">${p.info.tipo?'':'Selecione o tipo de projeto.'}</div></div>
    ${f('nome','Nome do projeto',true,'text','span2')}${f('codigo','Número ou código do projeto')}
    ${f('cliente','Cliente ou empreendimento',false,'text','span2')}${f('data','Data de elaboração',false,'date')}
    ${f('responsavel','Responsável pela mensuração',false,'text','span2')}${f('versao','Versão do documento')}
    <div class="fld full"><label>Descrição do projeto</label><textarea class="inp" data-info="descricao">${esc(p.info.descricao)}</textarea></div>
    <div class="fld full"><label>Observações gerais</label><textarea class="inp" data-info="observacoes">${esc(p.info.observacoes)}</textarea></div>
  </div></div>`;
}
afterRender.ident = ()=>{
  $$('#tipoOpts input').forEach(r=>r.addEventListener('change', ()=>{
    const p = cur(); if(!p) return; p.info.tipo = r.value;
    $$('#tipoOpts .tipo-opt').forEach(l=>l.classList.toggle('on', l.querySelector('input').checked));
    $('#msg-tipo').textContent=''; renderProjSelect(); touch();
  }));
  $$('[data-info]').forEach(el=>el.addEventListener('input', ()=>{
    const p = cur(); if(!p) return;
    p.info[el.dataset.info] = el.value;
    if (el.dataset.info==='nome'){ const bad=!el.value.trim(); el.classList.toggle('err',bad); $('#msg-nome').textContent = bad?'Informe o nome do projeto.':''; renderProjSelect(); }
    touch();
  }));
};
function noProject(){ return `<div class="card empty">Nenhum projeto ativo.<div class="btns mt8" style="justify-content:center"><button class="btn primary" data-action="proj-new">${icon('plus')}Criar projeto</button></div></div>`; }

export { noProject, vIdent };
