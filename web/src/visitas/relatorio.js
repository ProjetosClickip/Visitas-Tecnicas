import { msgErro } from '../../shared/api.js';
import { S, TYPES } from '../estado.js';
import { visitaCompleta } from '../navegacao.js';
import { revisoresLista } from '../perfil/configuracoes.js';
import { IMG, dtBR, esc, fmt, pct, toast } from '../util.js';
import { assinaturaValida } from './assinatura.js';
import { ABORDAGENS, ENTRADAS, PASSAGENS, SERVICOS, SIMNAO, SUPORTE, empresaSel, isDupla, lbl } from './campos.js';
import { RT_TYPES, croquiDataURL, routeLen } from './croqui.js';
import { ENV_LABEL, RACK_EVENTO, areaOf, calcCond, calcEvento, calcRack, condSel, iOr, nOr, velLabel } from './dimensionamento.js';
import { evtPeriodo } from './eventos.js';
import { CX_LISTAS, corpLink } from './link-dedicado.js';
import { visitTitle } from './lista.js';
import { evtRack, rackFinalRows, rackItensTable } from './rack.js';
import { AP_SPEC, apSummary, apUsed, rackCables, riserSVG } from './resultados.js';

/* ================== RELATÓRIO PDF (padrão projeto executivo) ================== */
/** Espera as imagens do documento do relatório carregarem (logo, timbrado, fotos) antes de medir e imprimir. */
function esperarImagens(doc, ms = 8000) {
  const imgs = Array.from(doc.images).filter(i => !i.complete);
  return Promise.race([
    Promise.all(imgs.map(i => new Promise(ok => { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); }))),
    new Promise(ok => setTimeout(ok, ms))
  ]);
}
async function openReport(v) {
  if (!v) return;
  const w = window.open('', '_blank');   // aberto já no clique (antes de esperar o servidor) para não ser bloqueado
  try { if (v._lite) v = await visitaCompleta(v.id); }
  catch (e) { if (w) w.close(); return toast(msgErro(e), 4000); }
  let html;
  try { html = buildReport(v); } catch (e) { console.error(e); if (w) w.close(); return toast('Erro ao montar relatório: ' + e.message, 4000); }
  const auto = !!w;
  let win = w, doc;
  if (w) { w.document.open(); w.document.write(html); w.document.close(); doc = w.document; }
  else {
    // pop-up bloqueado: imprime via iframe oculto
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    win = f.contentWindow; doc = f.contentDocument; setTimeout(() => f.remove(), 120000);
  }
  const bt = doc.querySelector('[data-acao="imprimir"]'); if (bt) bt.addEventListener('click', () => win.print());
  await esperarImagens(doc);
  try { keepTogether(doc); } catch (e) { console.error(e); }
  setTimeout(() => { win.focus(); win.print(); }, auto ? 600 : 300);
}
function dataExtenso(s) { const d = s ? new Date(s + 'T12:00:00') : new Date(); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }

function buildReport(v) {
  const cfg = S.cfg, t = v.type, nome = visitTitle(v), NOME = nome.toUpperCase();
  const emp = empresaSel(v);   // nossa empresa responsável (todas as abas)
  let fig = 0; const F = cap => `<div class="cap">Figura ${++fig} - ${esc(cap)}</div>`;
  const kv = rows => { const L = rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '' && r[1] !== '-'); return L.length ? `<table class="kv">${L.map(r => `<tr><th>${esc(r[0])}</th><td>${r[2] ? r[1] : esc(r[1])}</td></tr>`).join('')}</table>` : ''; };
  const vel = v.corp.velocidade === 'Outra' ? v.corp.velOutra : v.corp.velocidade;
  const sum = t !== 'cond' ? apSummary(v) : null;
  const cc = t === 'cond' ? calcCond(v.cond) : null;
  const co = cc && cc.ok ? (condSel(v, cc) || cc.opts[0]) : null;
  const ev = t === 'evt' ? calcEvento(v.evt) : null;
  const subt = t === 'cond' ? 'PROJETO DE CABEAMENTO' : 'PROJETO DE ATENDIMENTO';
  const tipoObra = t === 'cond' ? 'Cabeamento' : t === 'corp' ? 'Cabeamento / ' + (lbl(SERVICOS, v.corp.servico) || 'Atendimento') : 'Cabeamento – atendimento de evento';
  const end = [v.loc.endereco, v.loc.cidade, v.loc.cep].filter(Boolean).join(', ');
  const secs = [];
  const add = (title, body, sub) => secs.push({ title, body, sub });

  // 1 OBJETIVO
  add('OBJETIVO', t === 'cond'
    ? `<p>Este documento tem por finalidade detalhar os critérios e orientações, a partir do levantamento realizado em visita técnica, para a execução das Instalações de Cabeamento a ser instalada no condomínio <b>${esc(nome)}</b>, tendendo detalhar adequadamente as condições técnicas mínimas a serem obedecidas na execução do projeto e serviços acima citados, fixando, portanto, o parâmetro mínimo a ser atendido para materiais, serviços e equipamentos, seguindo as normas técnicas da ABNT. Qualquer alteração deverá garantir no mínimo a mesma qualidade ou superior ao especificado e deverá ser submetida à aprovação e fiscalização do Projetista.</p>`
    : t === 'corp'
      ? `<p>O presente Projeto Executivo tem por finalidade estabelecer as diretrizes e os procedimentos técnicos para a implantação da infraestrutura de telecomunicações destinada ao atendimento do cliente <b>${esc(nome)}</b>${end ? `, localizado em ${esc(end)}` : ''}, com o serviço de <b>${esc(lbl(SERVICOS, v.corp.servico))}</b>${vel ? ` na velocidade de <b>${esc(vel)}</b>` : ''}. A solução proposta tem como objetivo disponibilizar infraestrutura capaz de atender às demandas de conectividade do cliente, garantindo escalabilidade, confiabilidade, facilidade de manutenção e conformidade com as normas técnicas aplicáveis.</p><p>O documento busca detalhar de forma clara as condições técnicas mínimas a serem observadas durante a execução do projeto e dos serviços mencionados, estabelecendo os parâmetros básicos para a correta aplicação de materiais, execução dos serviços e utilização de equipamentos.</p>`
      : `<p>O presente projeto executivo tem como finalidade descrever os procedimentos técnicos a serem adotados na implantação do sistema de ativação de link dedicado${end ? ` na unidade localizada em ${esc(end)}` : ''}, local destinado à realização do evento <b>${esc(v.cli.evento || nome)}</b>, sob responsabilidade da empresa I_MAIS.</p><p>Todas as etapas deverão seguir rigorosamente as normas técnicas da ABNT, garantindo qualidade, segurança e desempenho adequado da infraestrutura. Qualquer alteração em relação ao especificado deverá assegurar, no mínimo, a mesma qualidade ou nível superior, sendo obrigatoriamente submetida à aprovação e fiscalização do projetista responsável.</p>`);
  // 2 PROJETO
  add('PROJETO', `<ul><li>O serviço deve ser executado de acordo com o projeto feito na plataforma Ozmap e as especificações de materiais que fazem parte integrante deste projeto executivo.</li><li>O serviço deve ser feito por profissionais especializados e habilitados, de modo a atender as Normas Técnicas da ABNT, relativas à execução dos serviços.</li><li>Fica a critério da fiscalização contestar parcialmente ou totalmente qualquer trabalho que esteja em desacordo com o proposto nas normas, como também especificações de material e do projeto em questão, conforme o caso.</li><li>Toda e qualquer alteração do projeto durante a execução deverá ser feita mediante a consulta prévia da fiscalização. Todos os serviços das instalações do sistema e cabeamento estruturado devem obedecer aos passos descritos neste projeto executivo.</li></ul>`);
  // 3 NORMAS
  add('REFERÊNCIAS NORMATIVAS', `<p>O sistema de cabeamento deverá ser implantado em conformidade com as seguintes normas:</p><ul><li>ABNT NBR 14565 – Procedimento básico para elaboração de projetos de cabeamento de telecomunicações para rede interna estruturada.</li><li>ABNT NBR 5410 – Instalações elétricas de baixa tensão.</li><li>ABNT NBR 14771 – Cabo óptico interno.</li><li>ANSI/EIA/TIA-568-B e ANSI/EIA/TIA-569-A.</li></ul><p>Caso sejam detectadas inconformidades com as normas vigentes, estas devem ser sanadas para a correta execução dos serviços.</p>`);
  // 4 CONCEITO
  add('CONCEITO DA PROPOSTA PROJETUAL' + (t === 'cond' ? ' - CABEAMENTO ' + NOME : ''), t === 'cond'
    ? `<p>Disponibilizar o acesso aos planos de internet da <b>I_MAIS</b> para as unidades do condomínio, operando sobre topologia ${cc && !cc.vertical ? 'FTTH (<i>Fiber to the Home</i>)' : 'FTTA (<i>Fiber to the Apartment</i>)'} com tecnologia de multiplexação GPON, uma tecnologia de interligação de residências através de fibra óptica para o fornecimento de serviços de acesso à internet com melhor qualidade, menos interferência, menor perda e com 100% fibra óptica do provedor até a residência do cliente.</p>`
    : t === 'corp'
      ? `<p>A presente proposta tem como objetivo implantar uma infraestrutura de telecomunicações baseada na arquitetura ${esc(v.corp.arquitetura || 'FTTB (Fiber-to-the-Building)')}, destinada ao atendimento de <b>${esc(nome)}</b>. A solução prevê a disponibilização de acesso à internet por meio de rede 100% em fibra óptica, garantindo elevados níveis de desempenho, estabilidade, baixa latência e alta disponibilidade dos serviços${sum ? `, complementada por ${sum.N} access point(s) ${esc(sum.model.nome)} para distribuição Wi-Fi` : ''}${isDupla(v) ? `. A viabilidade contempla <b>dupla abordagem</b>${v.loc.pop && v.loc.pop2 ? ` (${esc(v.loc.pop)} e ${esc(v.loc.pop2)})` : ''}, com duas rotas ópticas independentes, garantindo redundância e maior disponibilidade do serviço` : ''}.</p><p>Dessa forma, a implantação da rede visa oferecer uma solução moderna, escalável e de alto desempenho, assegurando ao cliente uma infraestrutura de telecomunicações compatível com as necessidades operacionais de seu negócio, mediante adesão aos serviços contratados junto ao Grupo Click IP.</p>`
      : `<p>O objetivo desta iniciativa é oferecer aos participantes e visitantes do evento <b>${esc(v.cli.evento || nome)}</b> a oportunidade de fazer uso da qualidade da internet disponibilizada pela empresa I_MAIS. Por meio de uma infraestrutura de rede moderna e de alto desempenho, a I_MAIS apresenta uma solução tecnológica que garante maior estabilidade, velocidade e eficiência na navegação, com mínimas interferências e perdas, adequada à demanda de eventos de grande porte.</p><p>Além de proporcionar uma experiência diferenciada e eficiente de conectividade durante o evento, a ação visa demonstrar, na prática, os benefícios do serviço, reforçando o compromisso da I_MAIS em oferecer soluções inovadoras e confiáveis.</p>`);
  // 5 LEVANTAMENTO
  let lev = kv([['Solicitante', nome], ['CNPJ do cliente', v.cli.cnpj], emp ? ['Empresa responsável', `${emp.nome} – CNPJ ${emp.cnpj}`] : null, ['Contato', v.cli.contato], ['Telefone', v.cli.telefone], ['E-mail', v.cli.email], [t === 'cond' ? 'Administradora' : 'Segmento', t === 'cond' ? v.cli.administradora : v.cli.segmento], ['Data da visita', dtBR(v.cli.data) + (v.cli.hora ? ' às ' + v.cli.hora : '')], ['Técnico responsável', v.cli.tecnico], ['Acompanhante', v.cli.acompanhante], ['OS / proposta', v.cli.os]]);
  lev += `<h3>Localização</h3>` + kv([['Endereço', end], ['Coordenadas', v.loc.lat && v.loc.lon ? `${v.loc.lat}, ${v.loc.lon}` : ''], ['Ponto de referência', v.loc.referencia], [isDupla(v) ? 'POP de abordagem 1' : 'POP de atendimento', v.loc.pop], [isDupla(v) ? 'CEO de abordagem 1' : 'CEO / caixa de referência', v.loc.ceo], isDupla(v) ? ['POP de abordagem 2', v.loc.pop2] : null, isDupla(v) ? ['CEO de abordagem 2', v.loc.ceo2] : null]);
  if (t === 'cond') {
    lev += `<h3>Estrutura do condomínio</h3>` + (cc.vertical
      ? kv([['Tipo', 'Vertical'], [(v.cond.nomenclatura || 'Torre') + 's', cc.T], ['Andares por ' + (v.cond.nomenclatura || 'torre').toLowerCase(), cc.F], ['Apartamentos por andar', cc.A], ['Unidades extras por torre', cc.extra || ''], ['Shaft de telecom', lbl([['sim', 'Sim'], ['nao', 'Não'], ['parcial', 'Parcial / compartilhado']], v.cond.shaft)], ['Pavimentos sem unidades', v.cond.subsolos], ['Tubulação interna', v.cond.tubulacao]])
      : kv([['Tipo', 'Horizontal'], ['Casas', cc.H], ['Unidades extras', cc.extra || ''], ['Ruas / quadras', v.cond.quadras], ['Postes internos', v.cond.postesInternos]]));
  } else if (t === 'corp') {
    const prov = v.corp.servico === 'provedor' && v.corp.rotaCliente === 'nao';
    const cxKeys = prov ? (v.corp.caixaCliente === 'sim' ? ['cxImgs'] : v.corp.caixaCliente === 'nao' ? ['cxNova', 'fibraDiag'] : []) : [];
    const cxHTML = cxKeys.map(k => { const L = v.corp[k] || [], C = CX_LISTAS[k]; return L.length ? `<h3>${C.titulo}</h3>` + L.map(d => `<div class="fig"><img src="${d.data}"></div>${F(C.titulo + (d.nome ? ' - ' + d.nome : '') + (d.local ? ' (' + d.local + ')' : ''))}${d.obs ? `<p class="small">${esc(d.obs)}</p>` : ''}`).join('') : ''; }).join('');
    lev += `<h3>Serviço solicitado</h3>` + kv([['Serviço', lbl(SERVICOS, v.corp.servico)], ['Velocidade solicitada', vel], ['Tipo de viabilidade', lbl(ABORDAGENS, v.corp.abordagem || 'simples')],
      v.corp.servico === 'provedor' ? ['Rota construída pelo cliente', lbl(SIMNAO, v.corp.rotaCliente)] : null,
      v.corp.servico === 'provedor' && v.corp.rotaCliente === 'nao' ? ['Caixa de cliente construída no trecho próximo', lbl(SIMNAO, v.corp.caixaCliente)] : null,
      ['Uso de access points', apUsed(v) ? 'Sim' : (v.corp.usaAP === 'nao' ? 'Não' : '')], ['Interface de entrega', v.corp.interface], ['IPs fixos', v.corp.ips], ['Arquitetura', v.corp.arquitetura], ['Observações', v.corp.obsServ]]) + cxHTML;
  } else {
    lev += `<h3>Dados do evento</h3>` + kv([['Evento', v.cli.evento], ['Organizador', v.cli.organizador], ['Público médio estimado', v.evt.publico ? fmt(v.evt.publico) + ' pessoas' : ''], ['Dias de evento', v.evt.dias], [iOr(v.evt.dias, 1) > 1 ? 'Período do evento' : 'Data do evento', evtPeriodo(v.evt)], ['Montagem', v.evt.montagem ? dtBR(v.evt.montagem) : ''], ['Horário', v.evt.horario], ['Suporte técnico', lbl(SUPORTE, v.evt.suporte)]]);
    const s = v.evt.serv || {};
    lev += `<h3>Atendimentos necessários</h3><ul>${[s.cred ? `<li><b>Credenciamento:</b> aproximadamente ${fmt(s.cred)} dispositivos${s.credCabeado ? ` e ${s.credCabeado} pontos cabeados` : ''}.</li>` : '', s.admin ? `<li><b>Área administrativa:</b> até ${fmt(s.admin)} pessoas simultâneas.</li>` : '', (s.exposProj || s.exposPC) ? `<li><b>Expositores:</b> cerca de ${fmt(s.exposProj || 0)} projetos e ${fmt(s.exposPC || 0)} computadores.</li>` : '', s.streamPontos ? `<li><b>Transmissões (live/podcasts):</b> ${s.streamPontos} pontos cabeados exclusivos, com upload mínimo de ${fmt(s.streamUp || 0)} Mbps.</li>` : '', s.outrosCabeados ? `<li><b>Outros pontos cabeados:</b> ${s.outrosCabeados}.</li>` : '', ...(v.evt.extras || []).filter(x => x.nome).map(x => `<li><b>${esc(x.nome)}:</b> ${fmt(x.qtd || 0)} ${esc(x.obs || 'dispositivos')}.</li>`)].join('') || '<li>Não informado.</li>'}</ul>`;
  }
  if (t !== 'cond') { const a = areaOf((t === 'corp' ? v.corp : v.evt).area), ar = (t === 'corp' ? v.corp : v.evt).area || {}; lev += `<h3>Área do local</h3>` + kv([['Dimensões', a.W && a.L ? `${fmt(a.W, 1)} m × ${fmt(a.L, 1)} m` : ''], ['Área considerada', a.area ? fmt(a.area) + ' m²' : ''], ['Pé-direito', ar.peDireito ? ar.peDireito + ' m' : ''], ['Ambiente', ENV_LABEL[ar.ambiente]], ['Pavimentos', ar.pavimentos], ['Cobertura', ar.cobertura], ['Ambientes', t === 'corp' ? v.corp.ambientes : ''], ['Dispositivos simultâneos', t === 'corp' ? v.corp.usuarios : ev.wifi], ['Pontos cabeados', t === 'corp' ? v.corp.pontosCabeados : ev.cabeados]]); }
  add('LEVANTAMENTO DA VISITA TÉCNICA', lev);

  // 6 INFRAESTRUTURA
  const infraHTML = i => { i = i || {}; const pas = (i.passagem || []).map(x => x === 'outro' ? (i.passagemOutro || 'Outro') : lbl(PASSAGENS, x)).join(', ');
    let s = `<p>A entrada do cabeamento será feita por via <b>${esc(i.entrada ? lbl(ENTRADAS, i.entrada).toLowerCase() : 'a definir')}</b>${i.ancoragem ? `, a partir de ${esc(i.ancoragem)}` : ''}${pas ? `, e a passagem interna ocorrerá por meio de <b>${esc(pas.toLowerCase())}</b>, respeitando a infraestrutura existente` : ''}.</p>`;
    s += kv([['Modo de entrada', lbl(ENTRADAS, i.entrada)], ['Passagem do cabo', pas], ['Ponto de ancoragem / entrada', i.ancoragem], ['Tipo de cabo', i.cabo], ['Metragem estimada (OzMap)', nOr(i.metragem) ? fmt(nOr(i.metragem)) + ' m' : ''], ['Distância entrada → ' + (t === 'cond' ? 'shaft/CEO' : 'rack'), i.distRack ? i.distRack + ' m' : ''], ['Postes legalizados', i.postesLeg], ['Postes não legalizados', i.postesNaoLeg], ['Caixas subterrâneas (TEL)', i.cxSub], ['CEOs a implantar', i.ceoNovas]]);
    if (i.postesNaoLeg) s += `<p><b>Observação:</b> serão utilizados ${i.postesNaoLeg} postes não legalizados para a passagem dos cabos de fibras ópticas.</p>`;
    if (i.obs) s += `<p>${esc(i.obs).replace(/\n/g, '<br>')}</p>`;
    return s; };
  const i = v.infra;
  const inf = isDupla(v) ? `<p>A viabilidade contempla <b>dupla abordagem</b>, com duas rotas de atendimento independentes.</p><h3>Abordagem 1${v.loc.pop ? ' – ' + esc(v.loc.pop) : ''}</h3>` + infraHTML(v.infra) + `<h3>Abordagem 2${v.loc.pop2 ? ' – ' + esc(v.loc.pop2) : ''}</h3>` + infraHTML(v.infra2) : infraHTML(v.infra);
  add('INFRAESTRUTURA PARA PASSAGEM DE CABO ' + (t === 'cond' ? 'ÓPTICO' : ''), inf);

  // CAIXAS DE EMENDA E POP
  const dg = v.diagramas || [];
  const dgHTML = L => { const ceos = L.filter(d => d.tipo !== 'pop'), pops = L.filter(d => d.tipo === 'pop'); let h = '';
    if (ceos.length) {
      h += `<h3>Detalhamento de fusões</h3><table class="g"><tr><th>CAIXA</th><th>FUSÕES</th><th>LOCALIZAÇÃO DA CAIXA</th></tr>${ceos.map(d => `<tr><td>${esc(d.nome || '-')}</td><td>${esc(d.fusoes || '-')}</td><td>${esc(d.local || '-')}</td></tr>`).join('')}</table>`;
      h += `<h3>Detalhamento das caixas de emenda abordadas</h3>` + ceos.map(d => `<div class="fig"><img src="${d.data}"></div>${F('Diagrama da ' + (d.nome || 'caixa de emenda'))}${d.obs ? `<p class="small">${esc(d.obs)}</p>` : ''}`).join('');
    }
    if (pops.length) h += `<h3>Abordagem no POP (Point of Presence)</h3>` + pops.map(d => `<div class="fig"><img src="${d.data}"></div>${F('Abordagem ao ' + (d.nome || 'POP') + (d.fusoes ? ' - ' + d.fusoes : ''))}${d.obs ? `<p class="small">${esc(d.obs)}</p>` : ''}`).join('');
    return { h, ceos, pops }; };
  if (dg.length) {
    if (isDupla(v)) {
      let h = '';
      for (const ab of [1, 2]) { const L = dg.filter(d => +(d.ab || 1) === ab); if (!L.length) continue; h += `<h2 style="font-size:12.5pt;border:0;margin:5mm 0 1mm">Abordagem ${ab}${(ab === 1 ? v.loc.pop : v.loc.pop2) ? ' – ' + esc(ab === 1 ? v.loc.pop : v.loc.pop2) : ''}</h2>` + dgHTML(L).h; }
      add('CAIXAS DE EMENDA E POPs DE ABORDAGEM (DUPLA ABORDAGEM)', h);
    } else {
      const { h, ceos, pops } = dgHTML(dg);
      add(ceos.length && pops.length ? 'CAIXAS DE EMENDA E POP DE ABORDAGEM' : ceos.length ? 'CAIXAS DE EMENDA' : 'POP DE ATENDIMENTO' + (pops[0].nome ? ' - ' + pops[0].nome.toUpperCase() : ''), h);
    }
  }

  const rackRep = er => `<h3>Detalhamento de rack</h3><p>O acondicionamento dos equipamentos de ativação será realizado em ${er.racks > 1 ? er.racks + ' racks' : 'rack'} padrão${t === 'evt' ? ' para eventos' : ''} <b>${esc(RACK_EVENTO.modelo)}</b> – ${esc(RACK_EVENTO.desc)}${v.rack.local ? `, localizado em ${esc(v.rack.local)}` : ''}.</p>` + kv([['Energia no local', lbl([['ok', 'Disponível'], ['nobreak', 'Disponível com nobreak'], ['nao', 'Não disponível – providenciar']], v.rack.energia)], ['Orçamento PoE mínimo', fmt(er.poe) + ' W'], ['Observações', v.rack.obs]]) + rackItensTable('SOLUÇÃO', rackFinalRows(v, 'solucao', er.solucao), 'g') + rackItensTable('MATERIAIS', rackFinalRows(v, 'materiais', er.materiais), 'g') + rackItensTable('MÃO DE OBRA', rackFinalRows(v, 'servicos', er.servicos), 'g');
  // 7 DIMENSIONAMENTO
  if (t === 'cond' && co) {
    let d = `<h3>Quantitativo geral</h3>` + kv(cc.vertical ? [[(v.cond.nomenclatura || 'Torre') + 's', cc.T], ['Andares', cc.F], ['Apartamentos por andar', cc.A], ['Unidades por ' + (v.cond.nomenclatura || 'torre').toLowerCase(), fmt(cc.porTorre)], ['Total de unidades (HP)', fmt(cc.total)]] : [['Casas', fmt(cc.H)], ['Unidades extras', cc.extra || ''], ['Total de unidades (HP)', fmt(cc.total)]]);
    d += `<h3>Implantação das caixas para atendimento do condomínio – CTO e CEOS</h3><p>Conforme vistoria, as CTOs para atendimento ao cliente ficarão localizadas ${esc(v.cond.localCTO || (cc.vertical ? 'nos shafts destinados à rede de telecomunicações existente dos blocos' : 'ao longo das vias internas do condomínio'))}, respeitando um padrão${cc.vertical ? `, e ficarão localizadas ${co.tipo === 'andar' ? 'em todos os andares' : 'nos andares ' + co.andares.map(a => a + 'º').join(', ')} de cada ${(v.cond.nomenclatura || 'torre').toLowerCase()}` : ''}.</p>`;
    d += `<p>A infraestrutura de telecomunicações do condomínio será composta por <b>${co.totalCTO} CTOs de condomínio 1:${co.P}</b> (splitter primário 1:${co.S} na CEO)${cc.vertical ? `, sendo ${co.porTorre} unidade(s) alocada(s) por ${(v.cond.nomenclatura || 'torre').toLowerCase()}` : ''}, totalizando ${fmt(co.portas)} portas para ${fmt(cc.total)} unidades (ocupação de ${pct(co.ocup)} e reserva técnica de ${cc.reserva}%).</p>`;
    d += `<h3>Solução adotada</h3><table class="g"><tr><th>Opção adotada</th><th>CTOs / ${cc.vertical ? (v.cond.nomenclatura || 'torre').toLowerCase() : 'total'}</th><th>Total CTOs</th><th>Portas</th><th>Ocupação</th><th>Localização</th>${cc.vertical ? '<th>Cabo riser</th>' : ''}</tr><tr><td><b>${esc(co.titulo)}</b><div class="small">${esc(co.desc)}</div></td><td>${cc.vertical ? co.porTorre : co.totalCTO}</td><td><b>${co.totalCTO}</b></td><td>${fmt(co.portas)} <span class="small">(${fmt(co.portas - cc.total)} livres)</span></td><td>${pct(co.ocup)}</td><td>${esc(co.locais)}</td>${cc.vertical ? `<td>${co.fibrasTorre}FO por ${(v.cond.nomenclatura || 'torre').toLowerCase()}</td>` : ''}</tr></table><p>Divisão óptica total <b>1:${co.razao}</b> (splitter 1:${co.S} na CEO × CTO de condomínio 1:${co.P}), com perda estimada dos splitters de ${fmt(co.perda, 1)} dB. Reserva técnica de ${cc.reserva}% das portas.</p>`;
    d += `<h3>Materiais de rede de acesso (estimativa)</h3>` + kv([['CTO de condomínio 1:' + co.P, co.totalCTO + (v.cond.modeloCTO ? ' – ' + v.cond.modeloCTO : '')], ['Splitter primário 1:' + co.S + ' (CEO)', co.splitPri], ['Splitter secundário 1:' + co.P + ' (CTO)', co.splitSec], cc.vertical ? ['Cabo riser por ' + (v.cond.nomenclatura || 'torre').toLowerCase(), co.fibrasTorre + 'FO'] : null, ['Cabo drop low friction indoor', fmt(cc.dropTotal) + ' m (' + cc.dropMed + ' m por unidade)'], ['Fusões estimadas', co.fusoes]]);
    if (cc.vertical) d += `<div class="fig">${riserSVG(v, cc, co)}</div>${F('Diagrama vertical das CTOs dimensionadas')}`;
    add('DIMENSIONAMENTO DE CTOs', d);
  } else if (t !== 'cond') {
    let d = '';
    if (ev) d += `<h3>Demanda estimada</h3><table class="g"><tr><th>Atendimento</th><th>Dispositivos</th><th>Base</th></tr>${ev.linhas.map(l => `<tr><td>${esc(l[0])}</td><td>${fmt(l[1])}</td><td>${esc(l[2])}</td></tr>`).join('')}<tr class="hl"><td><b>Total de dispositivos Wi-Fi</b></td><td><b>${fmt(ev.wifi)}</b></td><td></td></tr></table>` + kv([['Pontos cabeados', ev.cabeados], ['Upload exclusivo para transmissões', fmt(ev.stream * ev.up) + ' Mbps'], ['Demanda estimada de download', fmt(ev.down) + ' Mbps'], ['Link adotado', velLabel(ev.link) + (ev.link === ev.linkRec ? ' (padrão recomendado para a demanda)' : ' (recomendado: ' + velLabel(ev.linkRec) + ')')], ['Padrões base de link', ev.tiers.map(velLabel).join(' / ')]]);
    if (sum) {
      const A = sum.all;
      const m = sum.model;
      d += `<h3>Equipamento adotado</h3><table class="g"><tr><th>Parâmetro</th><th>${esc(m.nome)}</th></tr>
        ${AP_SPEC.filter(x => x[0] !== 'aplicacao').map(([k, l]) => `<tr><td>${l}</td><td>${esc(m[k])}${k === 'raioMax' ? ' m' : ''}</td></tr>`).join('')}
        <tr><td>Raio de atendimento de projeto</td><td><b>${sum.r} m</b></td></tr>
        <tr><td>Cálculo por dispositivos simultâneos</td><td>${sum.I.dev ? `${fmt(sum.I.dev)} ÷ ${m.clientesMax} = ${fmt(sum.razao, 2)} → ${sum.capMin} AP(s) no mínimo, ${sum.cap} arredondando` : '-'}</td></tr>
        <tr><td>APs por cobertura da área</td><td>${sum.cov}</td></tr>
        <tr class="hl"><td><b>Quantidade adotada</b></td><td><b>${sum.N}</b></td></tr>
        <tr><td>Consumo PoE total</td><td>${fmt(sum.poeTotal, 1)} W · ${esc(m.poe)}</td></tr></table>`;
      d += `<h3>Posicionamento dos equipamentos</h3><p>Serão utilizados <b>${String(sum.N).padStart(2, '0')} access points ${esc(sum.model.nome)}</b> estrategicamente distribuídos para garantir a cobertura ${t === 'evt' ? 'do evento' : 'do ambiente'}, com raio de atendimento de projeto de ${sum.r} m por equipamento (${esc(ENV_LABEL[sum.I.area.ambiente || 'salao'])}), proporcionando conectividade Wi-Fi estável e de alta disponibilidade em toda a área de atuação. O dimensionamento foi limitado por <b>${sum.fator}</b>, resultando em aproximadamente ${sum.devPorAP} dispositivos por AP.</p>`;
      if (sum.pos.length) d += `<table class="g"><tr><th>AP</th><th>X (m)</th><th>Y (m)</th><th>Raio (m)</th></tr>${sum.pos.map((q, k) => `<tr><td>AP-${String(k + 1).padStart(2, '0')}</td><td>${fmt(q.x, 1)}</td><td>${fmt(q.y, 1)}</td><td>${sum.r}</td></tr>`).join('')}</table><p class="small">Coordenadas a partir do canto superior esquerdo da área de ${fmt(sum.W, 1)} × ${fmt(sum.L, 1)} m. Posições finais conforme croqui.</p>`;
      d += `<h3>Detalhamento do hotspot</h3><p>O ${esc(sum.model.nome)} é um ${esc(sum.model.tipo.replace(/^Access Point/, 'ponto de acesso'))}, padrão ${esc(sum.model.padrao)}, com alcance típico de ${sum.model.raioMax} m e suporte para até ${sum.model.clientesMax} dispositivos simultâneos. Interfaces: ${esc(sum.model.portaOptica)} e ${esc(sum.model.portaEletrica)}. ${esc(sum.model.aplicacao || '')}</p>`;
      const r = calcRack(sum.N, sum.model, sum.I.cab), cab = rackCables(v, sum);
      if (t !== 'cond') {
        d += rackRep(evtRack(v, sum, cab));
      } else
      d += `<h3>Detalhamento de rack</h3><p>O acondicionamento dos equipamentos de ativação será realizado em rack metálico de parede padrão 19" com altura útil de <b>${r.rack}U</b>, homologado para aplicações em redes de telecomunicações${v.rack.local ? `, localizado em ${esc(v.rack.local)}` : ''}.</p>` + kv([['Rack existente no cliente', lbl([['nao', 'Não – fornecer rack'], ['sim', 'Sim']], v.rack.existente)], ['Energia no local', lbl([['ok', 'Disponível'], ['nobreak', 'Disponível com nobreak'], ['nao', 'Não disponível – providenciar']], v.rack.energia)], ['Switch PoE', `${r.nSw} × ${r.sw} portas (${r.portas} portas necessárias)`], ['Orçamento PoE mínimo', fmt(r.poe) + ' W'], ['Observações', v.rack.obs]]) + `<table class="g"><tr><th>Item</th><th>Qtd.</th></tr>${r.itens.map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join('')}</table>`;
      if (cab) d += `<table class="g"><tr><th>Enlace rack → AP</th><th>Cabo estimado</th><th>Meio</th></tr>${cab.map(c => `<tr><td>${esc(c.label)}</td><td>${fmt(c.L)} m</td><td>${c.fibra ? 'Cabo drop de fibra óptica (excede 90 m)' : 'UTP CAT.5E/6'}</td></tr>`).join('')}</table>${cab.some(c => c.fibra) ? '<p>Os equipamentos cuja distância excede o limite máximo recomendado para cabeamento UTP (90 m) serão interligados por meio de cabo drop de fibra óptica, garantindo maior confiabilidade e desempenho do enlace.</p>' : ''}`;
    }
    if (t === 'corp' && sum) { const L = corpLink(v); d = `<h3>Dimensionamento do link</h3>` + kv([['Dispositivos simultâneos', fmt(L.dev) + ' (100%)'], ['Demanda por dispositivo', L.mbps + ' Mbps'], ['Demanda estimada', fmt(L.need) + ' Mbps'], ['Velocidade solicitada', vel], ['Padrão de link adotado', velLabel(L.link) + (L.link === L.linkRec ? ' (padrão recomendado para a demanda)' : ' (recomendado: ' + velLabel(L.linkRec) + ')')], ['Padrões base de link', L.tiers.map(velLabel).join(' / ')]]) + (L.sol && L.sol < L.link ? `<p>A velocidade solicitada (${velLabel(L.sol)}) está abaixo do padrão de link indicado para a demanda (${velLabel(L.link)}); recomenda-se avaliar plano superior.</p>` : '') + d; }
    if (t === 'corp' && !sum) d += `<p>O atendimento ${v.corp.usaAP === 'nao' ? 'não contempla' : 'não teve definido o uso de'} access points; a entrega do link será realizada via ${esc(v.corp.interface || 'interface cabeada')}.</p>` + rackRep(evtRack(v, null, null));
    add(t === 'corp' && !sum ? 'RACK E EQUIPAMENTOS DE ATIVAÇÃO' : 'DIMENSIONAMENTO DE ACCESS POINTS, LINK E RACK', d || '<p>Dimensionamento não preenchido.</p>');
  }

  // 8 CROQUI
  const cq = v.plan ? croquiDataURL(v, 1800) : null;
  if (cq) add('CROQUI', `<p>Croqui elaborado sobre a planta baixa do local com as informações levantadas na visita técnica${v.plan.scale ? '' : ' (escala não calibrada – medidas ilustrativas)'}.</p><div class="fig"><img src="${cq}"></div>${F('Croqui – ' + nome)}`);

  // 9 TOTAL DE CABOS / FUSÕES
  const rows = [];
  if (nOr(i.metragem)) rows.push([(i.cabo || 'Cabo de distribuição') + (isDupla(v) ? ' – abordagem 1' : ''), fmt(nOr(i.metragem)) + ' m', fmt(Math.ceil(nOr(i.metragem) * 1.3 / 10) * 10) + ' m']);
  if (isDupla(v) && nOr((v.infra2 || {}).metragem)) { const i2 = v.infra2; rows.push([(i2.cabo || 'Cabo de distribuição') + ' – abordagem 2', fmt(nOr(i2.metragem)) + ' m', fmt(Math.ceil(nOr(i2.metragem) * 1.3 / 10) * 10) + ' m']); }
  if (v.plan && v.plan.scale) { const rl = {}; v.plan.routes.forEach(r => rl[r.type] = (rl[r.type] || 0) + routeLen(r, v.plan)); Object.entries(rl).forEach(([k, L]) => rows.push([RT_TYPES[k].l + ' (croqui)', fmt(L) + ' m', fmt(Math.ceil(L * 1.3 / 10) * 10) + ' m'])); }
  if (cc && cc.ok) rows.push(['Cabo drop low friction indoor', fmt(cc.dropTotal) + ' m', '-']);
  if (sum) { const cab = rackCables(v, sum); if (cab) { const utp = cab.filter(c => !c.fibra).reduce((s, c) => s + c.L, 0), fo = cab.filter(c => c.fibra).reduce((s, c) => s + c.L, 0); if (utp) rows.push(['UTP CAT.5E/6 (rack → APs)', fmt(utp) + ' m', fmt(Math.ceil(utp * 1.3 / 10) * 10) + ' m']); if (fo) rows.push(['Cabo drop óptico (rack → APs)', fmt(fo) + ' m', fmt(Math.ceil(fo * 1.3 / 10) * 10) + ' m']); } }
  if (rows.length || co) add('TOTAL DE CABOS E FUSÕES', `${rows.length ? `<table class="g"><tr><th>TIPO DE CABO</th><th>METRAGEM OZMAP / CROQUI</th><th>METRAGEM + 30%</th></tr>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table>` : ''}${co ? `<table class="g"><tr><th>TOTAL DE FUSÃO</th></tr><tr><td><b>${co.fusoes} fusões para rede de acesso (estimativa)</b></td></tr></table>` : ''}`);

  // 10 FOTOS
  if (v.photos.length) add('REGISTRO FOTOGRÁFICO', `<div class="photos">${v.photos.map(p => `<div class="ph"><img src="${p.data}">${F(p.caption || 'Registro da visita')}</div>`).join('')}</div>`);
  // 11 OBS
  if (v.obs) add(t === 'evt' ? 'OBSERVAÇÃO GERAL DA VISITA' : 'OBSERVAÇÕES GERAIS', `<p>${esc(v.obs).replace(/\n/g, '<br>')}</p>`);
  // 12 CONSIDERAÇÕES
  add('CONSIDERAÇÕES FINAIS', t === 'cond'
    ? `<p>O presente projeto executivo integra elementos fundamentais para o cumprimento das metas estabelecidas para a execução do serviço de cabeamento no condomínio ${esc(nome)}${co ? `, contemplando ${fmt(cc.total)} unidades atendidas por ${co.totalCTO} CTOs` : ''}.</p><p>A execução do serviço obedecerá rigorosamente às indicações constantes no projeto, conforme imagens e prescrições contidas neste documento. O serviço executado deverá obedecer severamente às boas técnicas adotadas usualmente nas Telecomunicações, em estrita consonância com as Normas Técnicas em vigor.</p>`
    : t === 'corp'
      ? `<p>Conclui-se que a solução proposta para o atendimento de ${esc(nome)} contempla uma infraestrutura de rede dimensionada para atender às necessidades de conectividade do cliente${sum ? `, composta por ${String(sum.N).padStart(2, '0')} access point(s) ${esc(sum.model.curto)}` : ''}${nOr(v.corp.pontosCabeados) ? ` e ${String(v.corp.pontosCabeados).padStart(2, '0')} ponto(s) de rede cabeado(s)` : ''}.</p><p>A implantação será realizada de forma a proporcionar cobertura adequada, estabilidade e desempenho na utilização dos serviços de conectividade, garantindo a qualidade do atendimento em toda a área contemplada pelo projeto, assegurando confiabilidade, disponibilidade e qualidade na prestação do serviço para as demandas atuais e futuras.</p>`
      : `<p>A ativação da conectividade planejada para o evento ${esc(v.cli.evento || nome)} tem como objetivo garantir um serviço de internet estável, eficiente e de alta qualidade para todos os visitantes${sum ? `, por meio de ${String(sum.N).padStart(2, '0')} access points ${esc(sum.model.curto)}` : ''}${ev ? ` e link de ${velLabel(ev.link)}` : ''}.</p><p>O suporte técnico durante o evento será realizado ${esc({ cliente: 'somente pela equipe do cliente', conjunto: 'pela equipe de implantação do grupo I_MAIS em conjunto com a equipe de TI do cliente', clickip: 'pela equipe de implantação do grupo I_MAIS (Click IP), que ficará responsável por garantir a operação da rede durante o evento' }[v.evt.suporte] || 'conforme alinhamento com o cliente')}.</p><p>Além disso, a iniciativa fortalece a atuação da empresa I_MAIS, reforçando seu compromisso com a inovação, a inclusão digital e a oferta de soluções tecnológicas de alto padrão.</p>`);

  const toc = secs.map((s, k) => `<div class="toc-i"><span>${k + 1}. ${esc(s.title.trim())}</span></div>`).join('');
  // remove subtítulos sem conteúdo (evita título isolado no PDF)
  const semVazio = h => { let p; do { p = h; h = h.replace(/<h3[^>]*>[^<]*<\/h3>\s*(?=<h3|<h2|$)/g, ''); } while (h !== p); return h; };
  const secHTML = (s, k) => `<section class="sec"><h2>${k + 1}. ${esc(s.title.trim())}</h2>${semVazio(s.body) || '<p>Não informado.</p>'}</section>`;
  const body = secs.slice(0, -1).map(secHTML).join('');
  const finalSec = secs.length ? secHTML(secs[secs.length - 1], secs.length - 1) : '';
  const cidade = cfg.cidade || 'Manaus';
  const revs = revisoresLista(cfg);
  const sigOk = assinaturaValida(v);   // hierarquia: maior cargo primeiro
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Projeto Executivo – ${esc(nome)}</title>
<style>
@page{size:A4;margin:12mm 14mm 14mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:"Segoe UI",Arial,sans-serif;color:#1b2840;font-size:11.5pt;line-height:1.5;margin:0;background:#e9edf3}
.bar{position:sticky;top:0;background:#13294b;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;z-index:9}
.bar button{background:#f26a21;color:#fff;border:0;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer}
.doc{max-width:210mm;margin:16px auto;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.15)}
table.pg{width:100%;border-collapse:collapse}table.pg>thead td,table.pg>tfoot td{padding:0}
.hd{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #13294b;padding:8px 0 6px;margin:0 14mm}
.hd img{height:24px}.hd span{font-size:8.5pt;color:#5d6b82;text-align:right}
.ft{border-top:1px solid #c9d2df;margin:0 14mm;padding:5px 0;font-size:8pt;color:#5d6b82;display:flex;justify-content:space-between}
.ct{padding:6mm 14mm}
.cover{min-height:255mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:20mm 14mm;page-break-after:always;border-bottom:8px solid #f26a21;background:linear-gradient(180deg,#fff 60%,#eef3f9)}
.cover img{width:72%;margin-bottom:28mm}.cover h1{font-size:28pt;color:#13294b;margin:0 0 6mm;letter-spacing:.02em}.cover .s{font-size:14pt;color:#159c98;font-weight:700}.cover .n{font-size:16pt;color:#13294b;font-weight:700;margin-top:14mm}.cover .d{margin-top:30mm;color:#5d6b82}
h2{color:#13294b;font-size:14pt;border-bottom:2px solid #f26a21;padding-bottom:3px;margin:8mm 0 4mm;page-break-after:avoid}
h3{color:#159c98;font-size:12pt;margin:5mm 0 2mm;page-break-after:avoid}
p{text-align:justify;margin:0 0 3mm}ul{margin:0 0 3mm}
table.kv,table.g{width:100%;border-collapse:collapse;margin:2mm 0 4mm;font-size:10pt;page-break-inside:auto}
table.kv th{width:38%;text-align:left;background:#eef2f8;color:#13294b;padding:4px 8px;border:1px solid #d3dbe7;font-weight:600}
table.kv td,table.g td{padding:4px 8px;border:1px solid #d3dbe7;vertical-align:top}
table.g th{background:#13294b;color:#fff;padding:5px 8px;text-align:left;border:1px solid #13294b;font-weight:600}
tr{page-break-inside:avoid}tr.hl td{background:#fff3ec}
.info th{background:#13294b!important;color:#fff!important}
.fig{text-align:center;margin:3mm 0 1mm;page-break-inside:avoid}.fig img{max-width:100%;max-height:200mm;border:1px solid #d3dbe7}.fig svg{max-width:100%;height:auto}
.cap{text-align:center;font-size:9.5pt;font-weight:700;color:#13294b;margin:1mm 0 4mm}
.photos{display:grid;grid-template-columns:1fr 1fr;gap:4mm}.ph{page-break-inside:avoid}.ph img{width:100%;height:68mm;object-fit:cover;border:1px solid #d3dbe7}
.toc{break-inside:avoid;page-break-inside:avoid}.toc-i{border-bottom:1px dotted #9aa8bd;padding:2px 0;font-weight:600;color:#13294b}
.sign{margin-top:22mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;text-align:center;page-break-inside:avoid}.sign>div{flex:1;font-size:10pt}
.sgimg{height:20mm;display:flex;align-items:flex-end;justify-content:center}.sgimg img{max-height:20mm;max-width:100%}
.sgl{border-top:1px solid #1b2840;padding-top:4px}
.selo{margin-top:5mm;border:1px solid #9fb0c8;border-left:4px solid #159c98;border-radius:4px;padding:2.5mm 3mm;font-size:8.5pt;color:#1b2840;display:flex;gap:3mm;align-items:center;break-inside:avoid;text-align:left}
.selo .ic{flex:none;width:9mm;height:9mm;border-radius:50%;background:#159c98;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13pt}
.small{font-size:9pt;color:#5d6b82}.pb{page-break-before:always}
/* papel timbrado Click IP (Drive: PADRÃO - PAPEL TIMBRADO CLICKIP) – fundo de todas as páginas na impressão/PDF */
.tb{display:none}
/* ---- controle de quebra de página: títulos nunca separados do conteúdo, textos não divididos ---- */
h1,h2,h3,h4{break-after:avoid;page-break-after:avoid;break-inside:avoid;page-break-inside:avoid}
p,li,.cap,.toc-i,.note{break-inside:avoid;page-break-inside:avoid;orphans:4;widows:4}
ul,ol{break-before:avoid}
table.kv,table.g{break-inside:auto}
tr,td,th{break-inside:avoid;page-break-inside:avoid}
.keep{break-inside:avoid;page-break-inside:avoid}
.keep.big{break-inside:auto;page-break-inside:auto}
.keep.big>:first-child{break-after:avoid;page-break-after:avoid}
.figk{break-inside:avoid;page-break-inside:avoid}
.sign{break-before:avoid}
.final{break-before:page;page-break-before:always;break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column}
.final .sign{margin-top:auto;padding-top:14mm}
@media print{.final{min-height:224mm}}
@media print{
  @page{size:A4;margin:0}
  html,body{background:transparent}.bar{display:none}.doc{box-shadow:none;margin:0;max-width:none;background:transparent}
  .tb{display:block;position:fixed;top:0;left:0;width:210mm;height:297mm;z-index:-1}.tb img{width:100%;height:100%;display:block}
  table.pg>thead td{padding:15mm 20mm 0}table.pg>tfoot td{padding:0 20mm 29mm}
  .hd{margin:0}.hd img{display:none}.ft{margin:0}.ct{padding:3mm 20mm}
  .cover{height:296mm;min-height:0;box-sizing:border-box;padding:30mm 20mm 40mm;border-bottom:0;background:transparent}
}
</style></head><body>
<div class="tb"><img src="${location.origin + IMG.timbrado}" alt=""></div>
<div class="bar"><b>Relatório – ${esc(nome)}</b><span style="flex:1"></span><span style="font-size:12px;opacity:.8">O papel timbrado Click IP é aplicado no PDF · no diálogo de impressão escolha “Salvar como PDF”</span><button type="button" data-acao="imprimir">Imprimir / Salvar PDF</button></div>
<div class="doc">
<div class="cover"><img src="${location.origin + IMG.logo}" alt=""><h1>PROJETO EXECUTIVO</h1><div class="s">${subt}</div><div class="s" style="color:#13294b;font-weight:600;font-size:12pt;margin-top:3mm">RELATÓRIO DE VISITA TÉCNICA – ${TYPES[t].nome.toUpperCase()}</div><div class="n">${esc(NOME)}</div><div class="d">${esc(cidade)}, ${dataExtenso(v.cli.data)}</div></div>
<table class="pg"><thead><tr><td><div class="hd"><img src="${location.origin + IMG.logo}" alt=""><span>PROJETO EXECUTIVO<br>${subt} – ${esc(NOME)}</span></div></td></tr></thead>
<tfoot><tr><td><div class="ft"><span>${esc(emp ? emp.nome : (cfg.responsavelObra || 'I_MAIS'))} · ${esc(cfg.setor || 'Engenharia / Projetos')}</span><span>Versão 1.0 – ${esc(cidade)}, ${dataExtenso(v.cli.data)}</span></div></td></tr></tfoot>
<tbody><tr><td><div class="ct">
<h2 style="margin-top:2mm">PROJETO EXECUTIVO DE ${t === 'cond' ? 'CABEAMENTO' : 'ATENDIMENTO'}</h2>
<table class="kv info"><tr><th colspan="2" style="text-align:center">INFORMAÇÕES GERAIS</th></tr>
${[['Obra', t === 'evt' ? (v.cli.evento || nome) : nome], ['Endereço', end], ['Setor', cfg.setor || 'Engenharia / Projetos'], ['Tipo de Obra', tipoObra], ['Responsável pela Obra', emp ? emp.nome : (cfg.responsavelObra || 'I_MAIS')], ...(emp ? [['CNPJ da empresa responsável', emp.cnpj], ['CNPJ do cliente', v.cli.cnpj]] : [['CNPJ', v.cli.cnpj || cfg.cnpj]]), ['Empresa prestadora', cfg.empresaPrestadora || 'A definir'], ['Projetista Responsável', v.cli.tecnico || S.user.name]].map(r => `<tr><th style="background:#eef2f8;color:#13294b">${r[0]}</th><td>${esc(r[1] || '-')}</td></tr>`).join('')}</table>
<h3>Ficha Técnica</h3>${kv([['Responsável pela elaboração', v.cli.tecnico || S.user.name], ['Revisão e supervisão', revs.map(x => esc(x.nome) + (x.cargo ? ' – ' + esc(x.cargo) : '')).join('<br>'), 1], ['Público-alvo', cfg.publicoAlvo || 'Comercial; Projetos e Planejamento Técnico; Implantação de Projetos; Centro de Operações de Rede - NOC; Empresa prestadora de serviços'], ['Versão', `1.0 – ${cidade}, ${dataExtenso(v.cli.data)}`]])}
<h3>Registro de Alterações</h3><table class="g"><tr><th>Versão</th><th>Responsável</th><th>Data</th><th>Alterações realizadas</th></tr><tr><td>1.0</td><td>${esc(v.cli.tecnico || S.user.name)}</td><td>${dtBR(v.cli.data)}</td><td>Levantamento em visita técnica e desenvolvimento do relatório</td></tr>${v.aprovacao && v.status === 'done' ? `<tr><td>1.0</td><td>${esc(v.aprovacao.por)}</td><td>${dtBR(v.aprovacao.em.slice(0, 10))}</td><td>Revisão e aprovação pela supervisão${v.aprovacao.obs ? ' – ' + esc(v.aprovacao.obs) : ''}</td></tr>` : ''}</table>
<h2>SUMÁRIO</h2><div class="toc">${toc}</div>
${body}
<div class="final">${finalSec}<div class="sign"><div><div class="sgimg">${sigOk ? `<img src="${esc(v.assinatura.img)}" alt="">` : ''}</div><div class="sgl">${esc(sigOk ? v.assinatura.nome : (v.cli.tecnico || S.user.name))}<br><span class="small">Responsável técnico – visita</span></div></div>${revs.slice().reverse().map(x => `<div><div class="sgimg"></div><div class="sgl">${esc(x.nome)}<br><span class="small">${esc(x.cargo)}</span></div></div>`).join('')}</div>${sigOk ? `<div class="selo"><div class="ic">✓</div><div>Documento assinado eletronicamente por <b>${esc(v.assinatura.nome.toUpperCase())}</b>${v.assinatura.cpf ? `, CPF ${esc(v.assinatura.cpf)}` : ''}, em ${new Date(v.assinatura.em).toLocaleDateString('pt-BR')}, às ${new Date(v.assinatura.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}, com assinatura registrada e vinculada à conta do usuário no sistema de Visitas Técnicas Click IP. Código de verificação: <b>${esc(v.assinatura.codigo)}</b>.</div></div>` : ''}</div>
</div></td></tr></tbody></table></div>
</body></html>`;
}

/* agrupa cada título com o bloco seguinte (e figura + legenda) para que nunca fiquem separados */
function keepTogether(doc) {
  const PX_MM = 96 / 25.4;
  const LIM = 200 * PX_MM;                  // altura útil segura de uma folha (A4 com timbrado)
  doc.querySelectorAll('.ct').forEach(c => c.style.padding = '3mm 20mm');   // mede com a largura de impressão
  const isHead = e => e && /^H[1-4]$/.test(e.tagName);
  const wrap = (els, cls) => { const w = doc.createElement('div'); w.className = cls; els[0].parentNode.insertBefore(w, els[0]); els.forEach(e => w.appendChild(e)); return w; };
  const unwrap = w => { while (w.firstChild) w.parentNode.insertBefore(w.firstChild, w); w.remove(); };
  // figura + legenda (+ observação)
  doc.querySelectorAll('.ct .fig').forEach(f => {
    const g = [f]; let n = f.nextElementSibling;
    if (n && n.classList.contains('cap')) { g.push(n); n = n.nextElementSibling; if (n && n.tagName === 'P' && n.classList.contains('small')) g.push(n); }
    wrap(g, 'figk');
  });
  // cada título fica com TODO o seu conteúdo (até o próximo título) quando couber em uma folha;
  // se não couber, fica no mínimo com o primeiro bloco (e o segundo, se o primeiro for um parágrafo curto)
  doc.querySelectorAll('.ct h2, .ct h3').forEach(h => {
    if (h.closest('.keep')) return;
    const heads = [h]; let n = h.nextElementSibling;
    while (isHead(n)) { heads.push(n); n = n.nextElementSibling; }
    const body = []; while (n && !isHead(n)) { body.push(n); n = n.nextElementSibling; }
    let w = wrap([...heads, ...body], 'keep');
    if (w.offsetHeight <= LIM || body.length <= 1) { if (w.offsetHeight > LIM) w.classList.add('big'); return; }
    unwrap(w);
    const g = [...heads, body[0]];
    if (body[0].tagName === 'P' && body[0].offsetHeight < 30 * PX_MM && body[1]) g.push(body[1]);
    w = wrap(g, 'keep'); if (w.offsetHeight > LIM) w.classList.add('big');
  });
  // tabelas que cabem em uma folha não se dividem
  doc.querySelectorAll('.ct table.kv, .ct table.g').forEach(t => { if (t.offsetHeight < LIM) t.style.breakInside = 'avoid'; });
}

export { openReport };
