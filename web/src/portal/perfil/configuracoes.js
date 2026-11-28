/* ================== CONFIGURAÇÕES ================== */
import { api, msgErro } from '../../shared/api.js';
import { refreshWho } from '../ambientes.js';
import { S } from '../estado.js';
import { bindPerfilMidia, bindSeguranca, perfilMidiaHTML, segurancaHTML } from './midia.js';
import { recarregarVisitas, salvarConfig, salvarPerfil } from '../sessao.js';
import { aparenciaCard, bindAparencia } from '../tema.js';
import { $, $$, download, esc, safeName, setP, toast, today } from '../util.js';
import { cpfMask, editarAssinatura } from '../visitas/assinatura.js';
import { ENV_LABEL, LINK_PLANOS_PADRAO, RAIO_LIMITE, apModels, nOr } from '../visitas/dimensionamento.js';


/** Revisores padrão do relatório vêm da configuração da organização (config/organizacao.json, fora do git). */
const revisoresPadrao = () => ((S.org && S.org.revisoresPadrao) || []).join('\n');
function revisoresLista(cfg) {
  return String((cfg && cfg.revisores) || revisoresPadrao()).split(/\n+/).map(l => l.trim()).filter(Boolean)
    .map(l => { const m = l.match(/^(.*?)\s+[-–—]\s+(.*)$/); return m ? { nome: m[1].trim(), cargo: m[2].trim() } : { nome: l, cargo: '' }; });
}
function renderSettings() {
  const c = S.cfg, M = apModels(c);
  $('#main').innerHTML = `
  <div class="page-h"><h2>Configurações e banco de dados</h2></div>
  <div class="card pf-card">${perfilMidiaHTML()}<div class="card-b grid g3">
    <label class="f">Nome<input type="text" id="pfName" value="${esc(S.user.name)}"></label>
    <label class="f">Cargo / setor<input type="text" id="pfRole" value="${esc(S.user.role || '')}"></label>
    <label class="f">E-mail <span class="hint">(identifica a conta – não editável)</span><input type="email" id="pfEmail" value="${esc(S.user.email || '')}" readonly></label>
    <div class="span3"><div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Assinatura eletrônica da conta</div>
      <div class="row"><div style="border:1px dashed var(--line);border-radius:10px;height:80px;width:260px;display:flex;align-items:center;justify-content:center;background:#fff">${S.user.assinatura && S.user.assinatura.img ? `<img src="${esc(S.user.assinatura.img)}" style="max-height:70px;max-width:95%">` : '<span class="small muted">Nenhuma</span>'}</div>
      <button class="btn sm" id="pfSig">${S.user.assinatura && S.user.assinatura.img ? 'Alterar assinatura' : 'Cadastrar assinatura'}</button>${S.user.assinatura && S.user.assinatura.cpf ? `<span class="small muted">CPF ${esc(cpfMask(S.user.assinatura.cpf))}</span>` : ''}</div>
      <p class="small muted" style="margin:6px 0 0">Usada para assinar os relatórios (última folha do PDF), mediante confirmação da senha da conta.</p></div>
    ${segurancaHTML()}
  </div></div>
  ${aparenciaCard()}
  <div class="card"><div class="card-h"><h3>Padrões do projeto executivo (PDF)</h3></div><div class="card-b grid g2">
    <label class="f">Responsável pela obra<input type="text" data-c="responsavelObra" value="${esc(c.responsavelObra || '')}"></label>
    <label class="f">CNPJ<input type="text" data-c="cnpj" value="${esc(c.cnpj || '')}"></label>
    <label class="f">Setor<input type="text" data-c="setor" value="${esc(c.setor || '')}"></label>
    <label class="f">Empresa prestadora<input type="text" data-c="empresaPrestadora" value="${esc(c.empresaPrestadora || '')}"></label>
    <label class="f">Público-alvo do relatório<input type="text" data-c="publicoAlvo" value="${esc(c.publicoAlvo || 'Comercial; Projetos e Planejamento Técnico; Implantação de Projetos; NOC; Empresa prestadora de serviços')}"></label>
    <label class="f span2">Revisão e supervisão – hierarquia (assinam o relatório)<textarea data-c="revisores" style="min-height:64px">${esc(c.revisores || revisoresPadrao())}</textarea><span class="hint">um por linha, do cargo mais alto para o mais baixo, no formato “Nome - Cargo”</span></label>
    <label class="f">Padrões base de link para eventos<input type="text" data-c="linkPlanos" value="${esc(c.linkPlanos || LINK_PLANOS_PADRAO)}"><span class="hint">separados por vírgula – ex.: 300 Mbps, 1 Gbps, 10 Gbps</span></label>
    <label class="f">Cidade de emissão<input type="text" data-c="cidade" value="${esc(c.cidade || '')}"></label>
  </div></div>
  <div class="card"><div class="card-h"><h3>Catálogo de access points</h3><div class="spacer"></div><button class="btn sm" id="apReset">Restaurar padrões</button></div><div class="card-b">
    <p class="small muted" style="margin-top:0">Parâmetros baseados na planilha “COMPARAÇÃO ACCESS POINTS GRANDSTREAM”. A quantidade de APs é calculada por dispositivos ÷ dispositivos simultâneos do equipamento, verificada pela cobertura da área. Raios de projeto por ambiente (m) – o raio máximo registrável é ${RAIO_LIMITE} m.</p>
    <div class="tbl-wrap"><table class="t"><tr><th>Parâmetro</th>${Object.values(M).map(m => `<th>${m.nome}</th>`).join('')}</tr>
    ${[['nome', 'Nome do modelo'], ['padrao', 'Padrão de Wi-Fi'], ['mimo', 'MIMO'], ['portaOptica', 'Porta óptica'], ['portaEletrica', 'Porta elétrica'], ['aplicacao', 'Aplicação']].map(([k, l]) => `<tr><td>${l}</td>${Object.values(M).map(m => `<td><input type="text" data-apt="${m.id}.${k}" value="${esc(m[k] || '')}"></td>`).join('')}</tr>`).join('')}
    ${[['clientesMax', 'Dispositivos simultâneos (base do cálculo)'], ['raioMax', 'Alcance típico (m)'], ['vazaoMbps', 'Vazão nominal agregada (Mbps)'], ['poeW', 'Consumo PoE (W)']].map(([k, l]) => `<tr><td>${l}</td>${Object.values(M).map(m => `<td><input type="number" data-ap="${m.id}.${k}" value="${m[k]}"></td>`).join('')}</tr>`).join('')}
    ${Object.keys(ENV_LABEL).map(e => `<tr><td>Raio de projeto – ${ENV_LABEL[e]}</td>${Object.values(M).map(m => `<td><input type="number" max="${RAIO_LIMITE}" data-ap="${m.id}.raios.${e}" value="${m.raios[e]}"></td>`).join('')}</tr>`).join('')}
    </table></div></div></div>
  <div class="card"><div class="card-h"><h3>Banco de dados</h3></div><div class="card-b">
    <p style="margin-top:0">Visitas de <b>${esc(S.user.name)}</b>: ${S.visits.length}. Os dados ficam no servidor da plataforma (acessíveis de qualquer computador, com cópia de segurança feita pela TI). Use a importação para trazer as visitas salvas no navegador pela versão antiga do sistema.</p>
    <div class="row"><button class="btn navy" id="bkExp">Exportar minhas visitas (.json)</button><label class="btn">Importar backup da versão antiga<input type="file" id="bkImp" accept=".json,application/json" hidden></label></div>
  </div></div>`;
  const savePf = async () => {
    try { await salvarPerfil({ nome: $('#pfName').value.trim() || S.user.name, cargo: $('#pfRole').value.trim() }); refreshWho(); toast('Perfil salvo'); }
    catch (e) { toast(msgErro(e), 4000); }
  };
  $$('#pfName,#pfRole').forEach(i => i.onchange = savePf);
  bindPerfilMidia(() => renderSettings()); bindSeguranca(); bindAparencia(() => renderSettings());
  $('#pfSig').onclick = () => editarAssinatura(() => renderSettings());
  $$('[data-c]').forEach(i => i.oninput = () => { c[i.dataset.c] = i.value; salvarConfig(); });
  $$('[data-ap]').forEach(i => i.oninput = () => { c.ap = c.ap || {}; const [id, ...rest] = i.dataset.ap.split('.'); c.ap[id] = c.ap[id] || {}; setP(c.ap[id], rest.join('.'), nOr(i.value)); salvarConfig(); });
  $$('[data-apt]').forEach(i => i.oninput = () => { c.ap = c.ap || {}; const [id, k] = i.dataset.apt.split('.'); c.ap[id] = c.ap[id] || {}; c.ap[id][k] = i.value; if (k === 'nome') c.ap[id].curto = i.value.replace(/^Grandstream\s+/i, ''); salvarConfig(); });
  $('#apReset').onclick = () => { c.ap = {}; salvarConfig(); renderSettings(); toast('Catálogo restaurado'); };
  $('#bkExp').onclick = async () => {
    try { const d = await api.get('/visitas/exportar'); download(`backup_visitas_${safeName(S.user.name)}_${today()}.json`, JSON.stringify(d), 'application/json'); }
    catch (e) { toast(msgErro(e), 4000); }
  };
  $('#bkImp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = await api.post('/visitas/importar', JSON.parse(await f.text()));
      await recarregarVisitas();
      toast(`${r.importadas} visita(s) importada(s), ${r.atualizadas} atualizada(s), ${r.ignoradas} ignorada(s)`, 5000); renderSettings();
    } catch (er) { toast('Arquivo de backup inválido: ' + msgErro(er), 5000); }
  };
}

export { renderSettings, revisoresLista };
