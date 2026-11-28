/* ================== FORMULÁRIO ================== */
import { STATUS, isSup } from '../ambientes.js';
import { S, TYPES } from '../estado.js';
import { $, dtHrBR, esc } from '../util.js';
import { renderAssinatura } from './assinatura.js';
import { ABORDAGENS, SERVICOS, SIMNAO, SUPORTE, VELOCIDADES, card, fld, seg } from './campos.js';
import { initCroqui } from './croqui.js';
import { renderDiag, secDiag } from './diagramas.js';
import { ENV_LABEL, RACK_EVENTO, RAIO_LIMITE, SPLITTERS, apModels, iOr } from './dimensionamento.js';
import { evtTerminoHint } from './eventos.js';
import { renderPhotos } from './fotos.js';
import { cxBlock, renderCx, secAPCorp } from './link-dedicado.js';
import { visitTitle } from './lista.js';
import { updateCalc } from './resultados.js';
import { secCliente, secCroqui, secFotos, secInfra, secLocal, secObs } from './secoes.js';
import { bindForm } from './vincular.js';

function renderForm(v) {
  S.cur = v; const t = v.type;
  let secs = [];
  if (t === 'cond') secs = [['cli', 'Cliente'], ['loc', 'Localização'], ['est', 'Estrutura'], ['qtd', 'Quantitativo geral'], ['cto', 'Dimensionamento de CTOs'], ['infra', 'Infraestrutura'], ['diag', 'CEOs e POP'], ['croqui', 'Planta / croqui'], ['fotos', 'Fotos'], ['obs', 'Observações'], ['ass', 'Assinatura']];
  if (t === 'corp') secs = [['cli', 'Cliente'], ['loc', 'Localização'], ['srv', 'Serviço e velocidade'], ['area', 'Área e ambiente'], ['ap', 'Access points e link'], ['rack', 'Rack'], ['infra', 'Infraestrutura'], ['diag', 'CEOs e POP'], ['croqui', 'Planta / croqui'], ['fotos', 'Fotos'], ['obs', 'Observações'], ['ass', 'Assinatura']];
  if (t === 'evt') secs = [['cli', 'Cliente'], ['loc', 'Localização'], ['ev', 'Dados do evento'], ['atd', 'Atendimentos'], ['area', 'Área e ambiente'], ['ap', 'Access points e link'], ['rack', 'Rack'], ['infra', 'Infraestrutura'], ['diag', 'CEOs e POP'], ['croqui', 'Planta / croqui'], ['fotos', 'Fotos'], ['obs', 'Observação geral'], ['ass', 'Assinatura']];
  let n = 0, body = '';
  for (const [id] of secs) {
    n++;
    if (id === 'cli') body += secCliente(n);
    else if (id === 'loc') body += secLocal(n);
    else if (id === 'infra') body += secInfra(n);
    else if (id === 'diag') body += secDiag(n);
    else if (id === 'croqui') body += secCroqui(n);
    else if (id === 'fotos') body += secFotos(n);
    else if (id === 'ass') body += card('ass', n, 'Assinatura eletrônica do responsável técnico', '<div id="assBox"></div>');
    else if (id === 'obs') body += secObs(n, t === 'evt' ? 'Observação geral da visita' : null);
    else if (id === 'est') body += secEstrutura(n);
    else if (id === 'qtd') body += card('qtd', n, 'Quantitativo geral', '<div id="res-qtd"></div>');
    else if (id === 'cto') body += card('cto', n, 'Dimensionamento de CTOs', `<div class="grid g4" style="margin-bottom:12px">${fld('Reserva técnica de portas', 'cond.reserva', { type: 'number', unit: '%' })}${fld('Drop médio por unidade', 'cond.dropMedio', { type: 'number', unit: 'm' })}${fld('Local das CTOs', 'cond.localCTO', { ph: 'Shaft de telecom, quadro…' })}${fld('Modelo / fabricante CTO', 'cond.modeloCTO')}</div><div id="res-cto"></div>`);
    else if (id === 'srv') body += secServico(n);
    else if (id === 'area') body += secArea(n);
    else if (id === 'ap') body += t === 'corp' ? secAPCorp(n) : card('ap', n, 'Dimensionamento de access points e link', `<div class="grid g4" style="margin-bottom:12px">${Object.values(apModels(S.cfg)).map(m => fld('Raio de atendimento – ' + m.curto, 'ap.raio.' + m.id, { type: 'number', unit: 'm, até ' + RAIO_LIMITE, max: RAIO_LIMITE, ph: 'padrão: ' + m.raios[((t === 'corp' ? v.corp : v.evt).area || {}).ambiente || 'salao'] + ' m', hint: 'nominal ' + m.raioMax + ' m – vazio = padrão do ambiente' })).join('')}</div><div id="res-ap"></div>`);
    else if (id === 'rack') body += card('rack', n, 'Rack e equipamentos de ativação', t !== 'cond'
      ? `<div class="note" style="margin:0 0 12px">Rack padrão${t === 'evt' ? ' para eventos' : ''}: <b>${esc(RACK_EVENTO.modelo)}</b> – ${esc(RACK_EVENTO.desc)}. Itens sugeridos com base nas listas de materiais do Drive (SENAC Capacitar / Zona Food).</div><div class="grid g3" style="margin-bottom:12px">${fld('Local proposto para o rack', 'rack.local', { cls: 'span2', ph: t === 'evt' ? 'Ex.: área técnica próxima ao palco / entrada do cabo' : 'Ex.: sala técnica, próximo à entrada do cabo' })}${fld('Quantidade de racks', 'rack.qtd', { type: 'number', ph: '1' })}${fld('Energia / tomada no local', 'rack.energia', { type: 'select', opts: [['', '-'], ['ok', 'Disponível'], ['nobreak', 'Disponível com nobreak'], ['nao', 'Não disponível – providenciar']] })}${fld('Observações do rack', 'rack.obs', { cls: 'span2' })}</div><div id="res-rack"></div>`
      : `<div class="grid g3" style="margin-bottom:12px">${fld('Local proposto para o rack', 'rack.local', { cls: 'span2', ph: 'Ex.: sala técnica do térreo, próximo à entrada do cabo' })}${fld('Rack existente?', 'rack.existente', { type: 'select', opts: [['', '-'], ['nao', 'Não – fornecer rack'], ['sim', 'Sim – usar rack do cliente']] })}${fld('Energia / tomada no local', 'rack.energia', { type: 'select', opts: [['', '-'], ['ok', 'Disponível'], ['nobreak', 'Disponível com nobreak'], ['nao', 'Não disponível – providenciar']] })}${fld('Observações do rack', 'rack.obs', { cls: 'span2' })}</div><div id="res-rack"></div>`);
    else if (id === 'ev') body += secEvento(n);
    else if (id === 'atd') body += secAtend(n);
  }
  $('#main').innerHTML = `
  <div class="page-h"><button class="btn sm" id="btnBack">← Voltar</button><span class="pill ${TYPES[t].pill}">${TYPES[t].nome}</span><h2 id="formTitle">${esc(visitTitle(v))}</h2><div class="spacer"></div>
    <label class="f st-sel">Status<select id="stSel">${Object.keys(STATUS).map(s => `<option value="${s}" ${(v.status || 'draft') === s ? 'selected' : ''} ${s === 'done' && !isSup(S.user) && v.status !== 'done' ? 'disabled' : ''}>${STATUS[s].l}${s === 'done' && !isSup(S.user) ? ' (supervisão)' : ''}</option>`).join('')}</select></label></div>
  ${v.devolucao && v.status === 'draft' ? `<div class="note warn" style="margin:-6px 0 14px"><svg class="ic" aria-hidden="true"><use href="#i-undo"/></svg> <b>Devolvido para ajustes</b> por ${esc(v.devolucao.por)} em ${dtHrBR(v.devolucao.em)}: ${esc(v.devolucao.motivo)}</div>` : ''}
  ${v.aprovacao && v.status === 'done' ? `<div class="note" style="margin:-6px 0 14px"><svg class="ic" aria-hidden="true"><use href="#i-check"/></svg> <b>Aprovado</b> por ${esc(v.aprovacao.por)} em ${dtHrBR(v.aprovacao.em)}${v.aprovacao.obs ? ': ' + esc(v.aprovacao.obs) : ''}</div>` : ''}
  <div class="layout"><aside class="side">${secs.map(([id, l]) => `<a href="#sec-${id}" data-jump="${id}">${l}</a>`).join('')}</aside>
  <div class="form-body">${body}
    <div class="savebar"><span class="st" id="saveState">Salvo automaticamente</span>
      <button class="btn danger" id="btnDel">Excluir</button><button class="btn" data-act="kml">KML</button><button class="btn" data-act="kmz">KMZ</button>
      <button class="btn navy" id="btnSave">Salvar</button><button class="btn primary" id="btnPdf">Gerar relatório PDF</button></div>
  </div></div>`;
  bindForm();
  updateCalc();
  initCroqui(v);
  renderPhotos();
  renderDiag();
  renderAssinatura();
  renderCx();
}

function secEstrutura(n) {
  const c = S.cur.cond, vert = (c.kind || 'vertical') === 'vertical';
  return card('est', n, 'Estrutura do condomínio', `
    <div style="margin-bottom:12px">${seg('cond.kind', [['vertical', 'Vertical (torres)'], ['horizontal', 'Horizontal (casas)']])}</div>
    <div class="grid g4">
    ${vert ? `
      ${fld('Quantidade de torres / blocos', 'cond.torres', { type: 'number' })}
      ${fld('Andares por torre', 'cond.andares', { type: 'number', hint: 'pavimentos com unidades' })}
      ${fld('Apartamentos por andar', 'cond.aptos', { type: 'number' })}
      ${fld('Unidades extras por torre', 'cond.unidadesExtras', { type: 'number', hint: 'salas, lojas, áreas comuns' })}
      ${fld('Nomenclatura', 'cond.nomenclatura', { type: 'select', opts: [['Torre', 'Torre'], ['Bloco', 'Bloco'], ['Edifício', 'Edifício']] })}
      ${fld('Possui shaft de telecom?', 'cond.shaft', { type: 'select', opts: [['', '-'], ['sim', 'Sim'], ['nao', 'Não'], ['parcial', 'Parcial / compartilhado']] })}
      ${fld('Pavimentos sem unidades', 'cond.subsolos', { ph: 'Térreo, garagem, subsolo…' })}
      ${fld('Estado da tubulação interna', 'cond.tubulacao', { type: 'select', opts: [['', '-'], ['livre', 'Livre / boa'], ['ocupada', 'Ocupada – avaliar'], ['obstruida', 'Obstruída'], ['inexistente', 'Inexistente']] })}
      <div class="span4" style="border-top:1px dashed var(--line);margin-top:4px;padding-top:10px;font-size:13px;font-weight:700;color:var(--navy)">Padrão de rede óptica</div>
      ${fld('CTO de condomínio a utilizar', 'cond.ctoTipo', { type: 'select', opts: [['', 'Comparar 1:4, 1:8 e 1:16'], ['4', 'CTO de condomínio 1:4'], ['8', 'CTO de condomínio 1:8'], ['16', 'CTO de condomínio 1:16']] })}
      ${fld('Splitter primário (CEO)', 'cond.splitter', { type: 'select', opts: SPLITTERS.map(x => [String(x), 'Splitter 1:' + x + (x === 8 ? ' (padrão)' : '')]), hint: 'divide o sinal antes das CTOs' })}
      ${fld('Andar inicial das CTOs intercaladas', 'cond.andarInicial', { type: 'number', hint: 'vazio = andar central de cada grupo' })}`
      : `
      ${fld('Quantidade de casas', 'cond.casas', { type: 'number' })}
      ${fld('Unidades extras', 'cond.unidadesExtras', { type: 'number', hint: 'portaria, clube, áreas comuns' })}
      ${fld('Quantidade de ruas / quadras', 'cond.quadras', { type: 'number' })}
      ${fld('Postes internos existentes', 'cond.postesInternos', { type: 'number' })}
      <div class="span4" style="border-top:1px dashed var(--line);margin-top:4px;padding-top:10px;font-size:13px;font-weight:700;color:var(--navy)">Padrão de rede óptica</div>
      ${fld('CTO de condomínio a utilizar', 'cond.ctoTipo', { type: 'select', opts: [['', 'Comparar 1:4, 1:8 e 1:16'], ['4', 'CTO de condomínio 1:4'], ['8', 'CTO de condomínio 1:8'], ['16', 'CTO de condomínio 1:16']] })}
      ${fld('Splitter primário (CEO)', 'cond.splitter', { type: 'select', opts: SPLITTERS.map(x => [String(x), 'Splitter 1:' + x + (x === 8 ? ' (padrão)' : '')]), hint: 'divide o sinal antes das CTOs' })}`}
    </div>`);
}
function secServico(n) {
  const c = S.cur.corp;
  return card('srv', n, 'Serviço e velocidade solicitada', `
    <div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Serviço a ser realizado</div>${seg('corp.servico', SERVICOS)}
    ${c.servico === 'provedor' ? `<div class="note" style="margin-top:12px">
      <div style="font-weight:600;margin-bottom:6px">A rota será construída pelo cliente?</div>${seg('corp.rotaCliente', SIMNAO)}
      ${c.rotaCliente === 'nao' ? `<div style="font-weight:600;margin:12px 0 6px">Possui caixa de cliente construída no trecho próximo?</div>${seg('corp.caixaCliente', SIMNAO)}` : ''}
      ${c.rotaCliente === 'nao' && c.caixaCliente === 'sim' ? cxBlock('cxImgs') : ''}
      ${c.rotaCliente === 'nao' && c.caixaCliente === 'nao' ? cxBlock('cxNova') + cxBlock('fibraDiag') : ''}
    </div>` : ''}
    <div style="font-size:13px;font-weight:600;color:var(--navy-2);margin:14px 0 6px">Tipo de viabilidade</div>${seg('corp.abordagem', ABORDAGENS)}
    <div class="small muted" style="margin-top:6px">${(c.abordagem || 'simples') === 'dupla' ? 'Dupla abordagem: informe POP, caixa de emenda, infraestrutura e diagramas de cada uma das 2 abordagens.' : 'Abordagem simples: uma caixa de emenda e um POP de abordagem.'}</div>
    <div style="font-size:13px;font-weight:600;color:var(--navy-2);margin:14px 0 6px">Velocidade solicitada</div>${seg('corp.velocidade', VELOCIDADES.map(x => [x, x]))}
    <div class="grid g4" style="margin-top:12px">
      ${c.velocidade === 'Outra' ? fld('Velocidade (informar)', 'corp.velOutra', { ph: 'Ex.: 800 Mbps' }) : ''}
      ${fld('Interface de entrega', 'corp.interface', { type: 'select', opts: [['', '-'], ['RJ45 GbE', 'RJ45 GbE'], ['SFP 1G', 'Óptica SFP 1G'], ['SFP+ 10G', 'Óptica SFP+ 10G'], ['Wi-Fi', 'Wi-Fi (APs)']] })}
      ${fld('IPs fixos', 'corp.ips', { ph: 'Ex.: /29' })}
      ${fld('Arquitetura', 'corp.arquitetura', { type: 'select', opts: [['', '-'], ['FTTB', 'FTTB (Fiber-to-the-Building)'], ['FTTH', 'FTTH'], ['FTTO', 'FTTO (Fiber-to-the-Office)'], ['Rádio', 'Rádio enlace']] })}
      ${fld('Observações do serviço', 'corp.obsServ', { cls: 'span4' })}
    </div>`);
}
function secArea(n) {
  const p = S.cur.type === 'corp' ? 'corp' : 'evt';
  return card('area', n, 'Área do local e ambiente', `<div class="grid g4">
    ${fld('Largura', p + '.area.largura', { type: 'number', unit: 'm' })}
    ${fld('Comprimento', p + '.area.comprimento', { type: 'number', unit: 'm' })}
    ${fld('Área total (manual)', p + '.area.area', { type: 'number', unit: 'm²', hint: 'opcional – sobrepõe L × C' })}
    ${fld('Pé-direito', p + '.area.peDireito', { type: 'number', unit: 'm' })}
    ${fld('Tipo de ambiente', p + '.area.ambiente', { type: 'select', opts: Object.entries(ENV_LABEL), cls: 'span2' })}
    ${fld('Nº de pavimentos atendidos', p + '.area.pavimentos', { type: 'number' })}
    ${p === 'corp' ? '' : fld('Área coberta / descoberta', 'evt.area.cobertura', { type: 'select', opts: [['', '-'], ['coberta', 'Coberta'], ['descoberta', 'Descoberta'], ['mista', 'Mista']] })}
    ${p === 'corp' ? fld('Pontos cabeados', 'corp.pontosCabeados', { type: 'number' }) + fld('Ambientes / salas', 'corp.ambientes', { cls: 'span2', ph: 'Recepção, sala de reunião, produção…' }) : ''}
  </div><div id="res-area" class="small muted" style="margin-top:8px"></div>`);
}
function secEvento(n) {
  return card('ev', n, 'Dados do evento', `<div class="grid g4">
    ${fld('Média estimada de público', 'evt.publico', { type: 'number', unit: 'pessoas' })}
    ${fld('Quantidade de dias', 'evt.dias', { type: 'number', re: true, hint: 'mais de 1 dia habilita a data de término' })}
    ${iOr(S.cur.evt.dias, 1) > 1
      ? fld('Data de início', 'evt.inicio', { type: 'date', re: true }) + fld('Data de término', 'evt.termino', { type: 'date', re: true, hint: evtTerminoHint(S.cur.evt) })
      : fld('Data do evento', 'evt.inicio', { type: 'date' })}
    ${fld('Horário de funcionamento', 'evt.horario', { ph: '08h às 22h' })}
    ${fld('Dispositivos por pessoa', 'evt.dispPorPessoa', { type: 'number', hint: 'padrão 1 – público considerado 100%' })}
    ${fld('Demanda por dispositivo', 'evt.mbpsDisp', { type: 'number', unit: 'Mbps' })}
    ${fld('Data de montagem', 'evt.montagem', { type: 'date' })}
  </div>
  <div style="font-size:13px;font-weight:600;color:var(--navy-2);margin:14px 0 6px">Suporte técnico</div>${seg('evt.suporte', SUPORTE, false)}`);
}
function secAtend(n) {
  const ex = S.cur.evt.extras || [];
  return card('atd', n, 'Tipos e quantidade de atendimentos', `<div class="grid g4">
    ${fld('Credenciamento', 'evt.serv.cred', { type: 'number', unit: 'dispositivos' })}
    ${fld('Credenciamento cabeado', 'evt.serv.credCabeado', { type: 'number', unit: 'pontos' })}
    ${fld('Área administrativa', 'evt.serv.admin', { type: 'number', unit: 'pessoas simultâneas' })}
    ${fld('Outros pontos cabeados', 'evt.serv.outrosCabeados', { type: 'number' })}
    ${fld('Expositores – projetos', 'evt.serv.exposProj', { type: 'number' })}
    ${fld('Expositores – computadores', 'evt.serv.exposPC', { type: 'number' })}
    ${fld('Transmissões (live/podcast)', 'evt.serv.streamPontos', { type: 'number', unit: 'pontos cabeados exclusivos' })}
    ${fld('Upload mínimo por transmissão', 'evt.serv.streamUp', { type: 'number', unit: 'Mbps' })}
  </div>
  <div style="margin-top:12px"><b class="small">Outros atendimentos</b>
    <div id="exList">${ex.map((x, i) => `<div class="grid g4" style="margin-top:6px">${fld('Atendimento', `evt.extras.${i}.nome`)}${fld('Quantidade', `evt.extras.${i}.qtd`, { type: 'number', unit: 'dispositivos' })}${fld('Observação', `evt.extras.${i}.obs`)}<div style="align-self:end"><button class="btn sm danger" data-exdel="${i}">Remover</button></div></div>`).join('')}</div>
    <button class="btn sm" id="exAdd" style="margin-top:8px">+ Adicionar atendimento</button></div>
  <div id="res-evt" style="margin-top:14px"></div>`);
}

export { renderForm };
