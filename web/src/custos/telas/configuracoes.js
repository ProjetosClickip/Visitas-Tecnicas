/* ---------- 7.10 Configurações ---------- */
import { ORG, currentUser, db, saveDB } from '../armazenamento.js';
import { icon } from '../interface.js';
import { LIBS, libGet, libStatus } from '../libs.js';
import { afterRender } from '../registro.js';
import { hubIsSup, initials } from '../sessao.js';
import { setTheme, themePref } from '../tema.js';
import { $, $$, esc } from '../util.js';

function vConfig(){
  const s = db.settings;
  return `<div class="pg-head"><div><h1 class="pg">Configurações</h1><p class="pg-sub">Preferências gerais, bibliotecas e dados armazenados.</p></div></div>
  <div class="card"><h2>Perfil e aparência</h2><div class="form-grid">
    <div class="fld"><label>Perfil conectado</label><div style="display:flex;gap:10px;align-items:center"><span class="avatar">${esc(initials(currentUser.nome))}</span><div><b>${esc(currentUser.nome)}</b><div class="muted" style="font-size:12px">${esc(currentUser.email)}</div></div></div></div>
    <div class="fld"><label>Aparência</label><select class="inp" id="cfgTheme"><option value="auto" ${themePref()==='auto'?'selected':''}>Automático (seguir o sistema)</option><option value="light" ${themePref()==='light'?'selected':''}>Modo claro</option><option value="dark" ${themePref()==='dark'?'selected':''}>Modo noturno</option></select></div>
    <div class="fld"><label>&nbsp;</label><div class="btns"><button class="btn" data-action="profile">${icon('user')}Perfil e senha (na plataforma)</button><button class="btn" data-action="logout">${icon('logout')}Sair</button></div></div>
  </div></div>
  <div class="card"><h2>Preferências</h2><div class="form-grid">
    <div class="fld"><label>Empresa emissora do relatório (timbrado)</label><input class="inp" data-set="empresaRelatorio" value="${esc(s.empresaRelatorio)}" placeholder="${esc(ORG.empresaResponsavel && ORG.empresaResponsavel.nome || '')}"></div>
    <div class="fld"><label>Departamento (rodapé)</label><input class="inp" data-set="departamento" value="${esc(s.departamento||'')}" placeholder="Engenharia / Projetos"></div>
    <div class="fld"><label>Cidade (rodapé)</label><input class="inp" data-set="cidade" value="${esc(s.cidade||'')}" placeholder="Manaus"></div>
    <div class="fld"><label>Empresa de origem padrão</label><input class="inp" data-set="empresaPadrao" value="${esc(s.empresaPadrao)}" placeholder="Usada em novos itens e importações"></div>
    <div class="fld"><label>Categoria padrão na importação</label><select class="inp" data-set="categoriaPadrao"><option value="auto" ${s.categoriaPadrao==='auto'?'selected':''}>Detectar por palavras-chave</option><option value="obra" ${s.categoriaPadrao==='obra'?'selected':''}>Obra</option><option value="ativacao" ${s.categoriaPadrao==='ativacao'?'selected':''}>Ativação</option></select></div>
    <div class="fld"><label>Idioma do OCR</label><select class="inp" data-set="ocrLang"><option value="por" ${s.ocrLang==='por'?'selected':''}>Português</option><option value="por+eng" ${s.ocrLang==='por+eng'?'selected':''}>Português + Inglês</option><option value="eng" ${s.ocrLang==='eng'?'selected':''}>Inglês</option></select></div>
    <div class="fld span2"><label>Unidades de medida sugeridas (uma por linha)</label><textarea class="inp" data-set="unidades" rows="4">${esc((s.unidades||[]).join('\n'))}</textarea></div>
  </div></div>
  <div class="card"><h2>Bibliotecas <span class="hint">servidas pelo servidor da plataforma (sem CDN)</span></h2>
    <div class="tbl-wrap"><table class="tbl libs"><thead><tr><th>Biblioteca</th><th>Uso</th><th>Origem</th><th>Status</th></tr></thead><tbody>
    ${Object.entries(LIBS).map(([k,L])=>`<tr><td>${L.name}</td><td>${L.uso}</td><td class="muted" style="font-size:11.5px">Servidor da plataforma</td><td id="lib-${k}">${libGet(k)?'<span class="badge b-ok">Carregada</span>':libStatus[k]==='erro'?'<span class="badge b-err">Indisponível</span>':'<span class="badge b-gray">Sob demanda</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="btns mt8"><button class="btn" data-action="lib-test">Testar carregamento de todas</button></div>
    <p class="muted mt8" style="font-size:12px">As bibliotecas são carregadas só quando usadas (gráficos, leitura de Excel/PDF, OCR, relatório PDF).</p></div>
  <div class="card"><h2>Dados</h2>
    <p>Os projetos, prestadoras, catálogo e configurações ficam no servidor da plataforma, acessíveis de qualquer computador com a sua conta. ${hubIsSup(currentUser) ? 'Como supervisão, você vê os projetos de toda a equipe.' : 'Você vê os projetos criados por você.'}</p>
    <div class="btns"><button class="btn" data-action="backup-export">${icon('download')}Exportar backup dos meus projetos</button><button class="btn" data-action="proj-import-json">${icon('upload')}Importar projetos (JSON da versão antiga)</button><button class="btn danger" data-action="data-wipe">${icon('trash')}Apagar os projetos criados por mim</button></div></div>`;
}
afterRender.config = ()=>{
  $('#cfgTheme').addEventListener('change', e=>setTheme(e.target.value));
  $$('[data-set]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input', ()=>{
    const k = el.dataset.set;
    db.settings[k] = k==='unidades' ? el.value.split('\n').map(x=>x.trim()).filter(Boolean) : el.value;
    saveDB();
  }));
};

export { vConfig };
