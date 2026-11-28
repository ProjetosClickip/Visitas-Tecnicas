/* ================== SEÇÕES COMUNS ================== */
import { S } from '../estado.js';
import { esc } from '../util.js';
import { ENTRADAS, PASSAGENS, card, chks, empresaSel, empresasGrupo, fld, isDupla, seg } from './campos.js';

function secCliente(n) {
  const t = S.cur.type;
  const nome = t === 'cond' ? 'Solicitante – nome do condomínio' : 'Solicitante – empresa / marca';
  return card('cli', n, 'Informações do cliente', `<div class="grid g3">
    ${fld(nome, 'cli.nome', { cls: 'span2', ph: t === 'cond' ? 'Ex.: Condomínio Conquista Topázio' : 'Ex.: FAEPI' })}
    ${fld(t === 'cond' ? 'CNPJ do condomínio (cliente)' : 'CNPJ do cliente', 'cli.cnpj', { ph: '00.000.000/0000-00' })}
    ${t ? fld('Nossa empresa (responsável pelo atendimento)', 'cli.empresa', { type: 'select', re: true, opts: [['', 'Selecione…'], ...empresasGrupo().map(e => [e.id, e.nome])] }) + `<label class="f">CNPJ da nossa empresa<input type="text" readonly value="${esc((empresaSel(S.cur) || {}).cnpj || '')}" placeholder="preenchido ao escolher a empresa"></label>` : ''}
    ${t === 'evt' ? fld('Nome do evento', 'cli.evento', { cls: 'span2' }) + fld('Cliente / organizador', 'cli.organizador') : ''}
    ${fld(t === 'cond' ? 'Síndico / contato' : 'Contato no cliente', 'cli.contato')}
    ${fld('Telefone', 'cli.telefone', { type: 'tel' })}
    ${fld('E-mail', 'cli.email', { type: 'email' })}
    ${t === 'cond' ? fld('Administradora', 'cli.administradora') : fld('Segmento / atividade', 'cli.segmento')}
    ${fld('Data da visita', 'cli.data', { type: 'date' })}
    ${fld('Horário', 'cli.hora', { type: 'time' })}
    ${fld('Técnico / projetista responsável', 'cli.tecnico')}
    ${fld('Acompanhante no local', 'cli.acompanhante')}
    ${fld('Código / nº da OS / proposta', 'cli.os')}
  </div>`);
}
function secLocal(n) {
  const l = S.cur.loc;
  const has = l.lat && l.lon;
  return card('loc', n, 'Localização da visita', `<div class="grid g4">
    ${fld('Endereço', 'loc.endereco', { cls: 'span2', ph: 'Rua, número, bairro' })}
    ${fld('Cidade / UF', 'loc.cidade', { ph: 'Manaus - AM' })}
    ${fld('CEP', 'loc.cep')}
    ${fld('Latitude', 'loc.lat', { type: 'number', ph: '-3.1190' })}
    ${fld('Longitude', 'loc.lon', { type: 'number', ph: '-60.0217' })}
    <label class="f span2">Colar coordenadas<input type="text" id="pasteLL" placeholder="-3.0855, -60.0284 (Google Maps / Earth)"></label>
    ${fld(isDupla(S.cur) ? 'POP de abordagem 1' : 'POP de atendimento', 'loc.pop', { ph: 'Ex.: POP-TORQUATO' })}
    ${fld(isDupla(S.cur) ? 'CEO de abordagem 1' : 'CEO / caixa de referência', 'loc.ceo', { ph: 'Ex.: CEO-17078' })}
    ${isDupla(S.cur) ? fld('POP de abordagem 2', 'loc.pop2', { ph: 'Ex.: POP-CENTRO-NOVO' }) + fld('CEO de abordagem 2', 'loc.ceo2', { ph: 'Ex.: CEO-479' }) : ''}
    ${fld('Ponto de referência', 'loc.referencia', { cls: 'span2' })}
  </div>
  <div class="row" style="margin-top:12px">
    <button class="btn" id="btnGPS"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg> Usar GPS do dispositivo</button>
    <label class="btn">Importar ponto KML<input type="file" id="kmlIn" accept=".kml" hidden></label>
    <a class="btn ${has ? '' : 'hidden'}" id="lnkMaps" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${l.lat},${l.lon}">Google Maps <svg class="ic" aria-hidden="true"><use href="#i-external"/></svg></a>
    <a class="btn ${has ? '' : 'hidden'}" id="lnkEarth" target="_blank" rel="noopener" href="https://earth.google.com/web/search/${l.lat},${l.lon}">Google Earth <svg class="ic" aria-hidden="true"><use href="#i-external"/></svg></a>
    <button class="btn teal" data-act="kml">Exportar KML</button><button class="btn teal" data-act="kmz">Exportar KMZ</button>
  </div>
  <p class="small muted" style="margin-bottom:0">Links do Maps/Earth exigem internet; os arquivos KML/KMZ são gerados offline e abrem no Google Earth (inclui croqui georreferenciado quando a escala estiver calibrada).</p>`);
}
function infraBlock(p) {
  const v = S.cur, i = v[p] = v[p] || { entrada: '', passagem: [] }, t = v.type;
  return `<div class="grid g2"><div><div class="f" style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Modo de entrada do cabo</div>${seg(p + '.entrada', ENTRADAS, false)}</div>
    <div><div style="font-size:13px;font-weight:600;color:var(--navy-2);margin-bottom:6px">Passagem interna do cabo</div>${chks(p + '.passagem', PASSAGENS)}</div></div>
    <div class="grid g4" style="margin-top:12px">
      ${(i.passagem || []).includes('outro') ? fld('Outro meio de passagem', p + '.passagemOutro', { cls: 'span2' }) : ''}
      ${fld('Tipo de cabo de distribuição', p + '.cabo', { type: 'select', opts: [['', '-'], ['CFOA-SM-ASU-80-S 06FO', 'CFOA-SM-ASU-80-S 06FO'], ['CFOA-SM-ASU-80-S 12FO', 'CFOA-SM-ASU-80-S 12FO'], ['CFOA-SM-ASU-80-S 24FO', 'CFOA-SM-ASU-80-S 24FO'], ['CFOA-SM-ASU-80-S 36FO', 'CFOA-SM-ASU-80-S 36FO'], ['Cabo drop óptico', 'Cabo drop óptico'], ['UTP CAT.5E', 'UTP CAT.5E'], ['UTP CAT.6', 'UTP CAT.6']] })}
      ${fld('Metragem estimada (OzMap)', p + '.metragem', { type: 'number', unit: 'm', hint: '+30% de reserva aplicado no relatório' })}
      ${fld('Distância entrada → ' + (t === 'cond' ? 'shaft/CEO' : 'rack'), p + '.distRack', { type: 'number', unit: 'm' })}
      ${fld('Ponto de ancoragem / entrada', p + '.ancoragem', { ph: 'Poste externo, olhal, fachada…' })}
      ${fld('Postes legalizados', p + '.postesLeg', { type: 'number' })}
      ${fld('Postes não legalizados', p + '.postesNaoLeg', { type: 'number' })}
      ${fld('Caixas subterrâneas (TEL)', p + '.cxSub', { type: 'number' })}
      ${fld('Caixas de emenda (CEO) a implantar', p + '.ceoNovas', { type: 'number' })}
      ${fld('Observações da infraestrutura', p + '.obs', { type: 'textarea', cls: 'span4', ph: 'Condições do forro, eletrocalha existente, necessidade de furação, etc.' })}
    </div>
    <div id="res-${p}"></div>`;
}
function secInfra(n) {
  const d = isDupla(S.cur), sub = (txt, extra) => `<div style="font-weight:700;color:var(--navy);margin:${extra || 0}px 0 10px;padding:6px 10px;background:#eef2f8;border-radius:8px">${txt}</div>`;
  return card('infra', n, 'Infraestrutura de entrada e passagem do cabo', d
    ? sub('Abordagem 1' + (S.cur.loc.pop ? ' – ' + esc(S.cur.loc.pop) : '')) + infraBlock('infra') + sub('Abordagem 2' + (S.cur.loc.pop2 ? ' – ' + esc(S.cur.loc.pop2) : ''), 18) + infraBlock('infra2')
    : infraBlock('infra'));
}
function secFotos(n) {
  return card('fotos', n, 'Registro fotográfico', `
    <label class="drop" id="phDrop"><svg class="ic" aria-hidden="true"><use href="#i-camera"/></svg> Toque para tirar/selecionar fotos ou arraste imagens aqui<input type="file" id="phIn" accept="image/*" multiple hidden></label>
    <div class="photos" id="phList"></div>`, `<span class="small muted" id="phCount"></span>`);
}
function secObs(n, title) {
  return card('obs', n, title || 'Observações gerais da visita', fld('', 'obs', { type: 'textarea', rows: 7, ph: 'Pontos relevantes observados na visita, pendências, restrições de acesso, horários, contatos…' }));
}
function secCroqui(n) {
  return card('croqui', n, 'Planta baixa e croqui', `<div id="croqui"></div>`);
}

export { secCliente, secCroqui, secFotos, secInfra, secLocal, secObs };
