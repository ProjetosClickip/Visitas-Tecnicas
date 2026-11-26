/* ================== CÁLCULOS DE DIMENSIONAMENTO ================== */
import { S } from '../estado.js';

const ENV_LABEL = {
  aberto: 'Área aberta / externa',
  salao: 'Salão, galpão ou pavilhão (poucas barreiras)',
  escritorio: 'Escritório com divisórias leves',
  denso: 'Alvenaria / muitas paredes'
};

const AP_DEFAULT = {   // base: planilha "COMPARAÇÃO ACCESS POINTS GRANDSTREAM" (Drive)
  gwn7660: {
    id: 'gwn7660', nome: 'Grandstream GWN7660', curto: 'GWN7660',
    tipo: 'Access Point Wi-Fi 6 (802.11ax) Dual Band com XTRA Range',
    padrao: 'IEEE 802.11 b/g/n/ac/ax com MIMO 2x2:2', mimo: 'Tecnologia MU-MIMO 2x2:2 de banda dupla com XTRA Range',
    portaOptica: '1 Porta SFP de 2.5 Gbps', portaEletrica: '1 Porta RJ45 1 Gbps',
    clientesMax: 256, raioMax: 300, vazaoMbps: 1770,
    aplicacao: 'Alternativa mais econômica, mantendo a porta de fibra nativa, embora tenha menor capacidade de processar reflexos de sinal em comparação ao GWN7664ELR devido ao MIMO inferior.',
    raios: { aberto: 100, salao: 45, escritorio: 22, denso: 14 },
    poeW: 13, poe: '802.3af/at (PoE)', porta: '1 RJ45 1 Gbps + 1 SFP 2,5 Gbps', cor: '#159c98'
  },
  gwn7664elr: {
    id: 'gwn7664elr', nome: 'Grandstream GWN7664ELR', curto: 'GWN7664ELR',
    tipo: 'Access Point Wi-Fi 6 (802.11ax) Extended Range (ELR) – uso interno/externo',
    padrao: 'IEEE 802.11 b/g/n/ac/ax com MIMO 4x4:4', mimo: 'Tecnologia MU-MIMO 4x4:4 de banda dupla com OFDMA',
    portaOptica: '1 Porta SFP de 2.5 Gbps', portaEletrica: '1 Porta RJ45 2.5 Gbps',
    clientesMax: 512, raioMax: 300, vazaoMbps: 3550,
    aplicacao: 'Possui a tecnologia Xtra Range 2.0, que melhora consideravelmente a penetração do sinal em ambientes complexos. Como o MIMO é 4x4, lida muito melhor com os reflexos de sinal gerados por estruturas metálicas do que modelos mais simples.',
    raios: { aberto: 120, salao: 55, escritorio: 28, denso: 16 },
    poeW: 25.5, poe: '802.3at (PoE+)', porta: '1 RJ45 2,5 Gbps + 1 SFP 2,5 Gbps', cor: '#f26a21'
  }
};
const RAIO_LIMITE = 300;      // raio máximo registrável (m)
const UTP_MAX = 90;           // enlace permanente UTP (TIA-568)
const VAZAO_UTIL = 0.35;      // fração da vazão nominal considerada útil em projeto
const CABO_RESERVA = 0.30;    // reserva de cabo (+30%) – padrão dos memoriais

function nOr(v, d = 0) { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : d; }
function iOr(v, d = 0) { return Math.max(0, Math.round(nOr(v, d))); }
function nextOf(list, v) { for (const x of list) if (x >= v) return x; return list[list.length - 1]; }

/* ---------- CONDOMÍNIO: quantitativo + CTOs ---------- */
const CTO_TIPOS = [4, 8, 16];                 // CTO de condomínio 1:4, 1:8, 1:16
const SPLITTERS = [2, 4, 6, 8, 16, 32];       // splitter primário (CEO)
const SPLIT_LOSS = { 2: 3.7, 4: 7.3, 6: 9.0, 8: 10.5, 16: 13.7, 32: 17.1 }; // perda típica (dB)
function calcCond(c) {
  c = c || {};
  const vertical = (c.kind || 'vertical') === 'vertical';
  const reserva = Math.min(50, Math.max(0, nOr(c.reserva, 10)));
  const dropMed = nOr(c.dropMedio, vertical ? 25 : 60);
  const S = SPLITTERS.includes(iOr(c.splitter)) ? iOr(c.splitter) : 8;
  const tipos = CTO_TIPOS.includes(iOr(c.ctoTipo)) ? [iOr(c.ctoTipo)] : CTO_TIPOS;
  const out = { vertical, reserva, opts: [], ok: false, S, tipos };
  if (vertical) {
    const T = iOr(c.torres), F = iOr(c.andares), A = iOr(c.aptos);
    const extra = iOr(c.unidadesExtras); // salas, lojas, áreas comuns por torre
    const s0 = iOr(c.andarInicial); const s = s0 >= 1 && s0 <= F ? s0 : 0;
    out.T = T; out.F = F; out.A = A; out.extra = extra; out.andarInicial = s;
    out.porTorre = F * A + extra;
    out.total = T * out.porTorre;
    if (!(T && F && A)) return out;
    out.ok = true;
    for (const P of tipos) {
      const eff = Math.max(1, P - Math.ceil(P * reserva / 100));
      // Opção 1: CTO(s) em todos os andares
      out.opts.push(mkOptV({ P, eff, k: 1, porAndarCTO: Math.ceil(A / eff), F, A, T, extra, tipo: 'andar' }));
      // Opção 2: CTOs intercaladas (1 CTO atende k andares)
      for (let k = 2; k <= Math.min(4, F); k++) {
        const o = mkOptV({ P, eff, k, porAndarCTO: 1, F, A, T, extra, tipo: 'grupo', s });
        if (o) out.opts.push(o);
      }
    }
  } else {
    const H = iOr(c.casas), extra = iOr(c.unidadesExtras);
    out.H = H; out.extra = extra; out.total = H + extra;
    if (!H) return out;
    out.ok = true;
    for (const P of tipos) {
      const eff = Math.max(1, P - Math.ceil(P * reserva / 100));
      const n = Math.ceil(out.total / eff);
      out.opts.push({
        id: 'h' + P, P, eff, tipo: 'horiz', totalCTO: n,
        titulo: `CTO de condomínio 1:${P} distribuídas nas vias internas`,
        desc: `Cada CTO atende até ${eff} casas (${P} portas com ${P - eff} de reserva). Posicionar em postes/caixas subterrâneas de modo que o drop até cada casa não ultrapasse ~150 m.`,
        portas: n * P, ocup: out.total / (n * P), locais: `${n} pontos ao longo das vias`
      });
    }
  }
  out.opts.forEach(o => {
    o.S = S; o.splitSec = o.totalCTO; o.splitPri = Math.ceil(o.totalCTO / S); o.fusoes = 2 * o.totalCTO + 2;
    o.razao = S * o.P; o.perda = +(SPLIT_LOSS[S] + SPLIT_LOSS[o.P]).toFixed(1);
  });
  // recomendação: menor nº de CTOs com intercalação <= 3 andares (drop curto), desempate pela maior reserva
  const cand = out.opts.filter(o => !o.k || o.k <= 3);
  cand.sort((a, b) => a.totalCTO - b.totalCTO || (b.portas - a.portas));
  out.rec = cand[0] ? cand[0].id : (out.opts[0] && out.opts[0].id);
  out.dropTotal = Math.ceil(out.total * dropMed);
  out.dropMed = dropMed;
  return out;
}
function condSel(v, c) { return c.opts.find(o => o.id === v.cond.ctoEscolha) || c.opts.find(o => o.id === c.rec) || c.opts[0]; }
function mkOptV({ P, eff, k, porAndarCTO, F, A, T, extra, tipo, s }) {
  let andares = [], porTorre;
  if (tipo === 'andar') { porTorre = F * porAndarCTO; andares = Array.from({ length: F }, (_, i) => i + 1); }
  else {
    if (s) { for (let f = s; f <= F; f += k) andares.push(f); }
    else { const n = Math.ceil(F / k); for (let g = 0; g < n; g++) { const ini = g * k + 1, fim = Math.min(F, ini + k - 1); andares.push(ini + Math.floor((fim - ini) / 2)); } }
    // cada andar é atendido pela CTO mais próxima; verifica capacidade e distância
    const carga = andares.map(() => 0); let dist = 0;
    for (let f = 1; f <= F; f++) {
      const ord = andares.map((a, i) => i).sort((x, y) => Math.abs(andares[x] - f) - Math.abs(andares[y] - f) || carga[x] - carga[y]);
      const bi = ord.find(i => carga[i] + A <= eff) ?? ord[0];
      carga[bi] += A; dist = Math.max(dist, Math.abs(andares[bi] - f));
    }
    if (Math.max(...carga) > eff || dist > 2 || andares.length >= F) return null;
    porTorre = andares.length;
  }
  if (extra) porTorre += Math.ceil(extra / eff);
  const totalCTO = porTorre * T;
  const portas = totalCTO * P;
  const unidades = T * (F * A + extra);
  return {
    id: `${tipo}${P}k${k}s${s || 0}`, P, eff, k, tipo, porTorre, totalCTO, portas, andares, porAndarCTO,
    ocup: unidades / portas,
    fibrasTorre: nextOf([6, 12, 24, 36, 48, 72, 144], porTorre),
    titulo: tipo === 'andar'
      ? `CTO de condomínio 1:${P} em todos os andares${porAndarCTO > 1 ? ` (${porAndarCTO} por andar)` : ''}`
      : `CTO de condomínio 1:${P} intercalada a cada ${k} andares${s ? ` a partir do ${s}º` : ''}`,
    desc: tipo === 'andar'
      ? `${porAndarCTO} CTO 1:${P} por andar atendendo ${A} apartamentos (capacidade útil ${eff * porAndarCTO}).`
      : `1 CTO 1:${P} a cada ${k} andares; cada CTO atende os andares mais próximos (até ${Math.min(F, k) * A} aptos, capacidade útil ${eff}).`,
    locais: tipo === 'andar' ? 'Todos os andares (shaft de telecom)' : 'Andares: ' + andares.map(a => a + 'º').join(', ') + ' (shaft de telecom)'
  };
}

/* ---------- ACCESS POINTS ---------- */
function apModels(cfg) {
  const out = {};
  for (const id in AP_DEFAULT) out[id] = Object.assign({}, AP_DEFAULT[id], (cfg && cfg.ap && cfg.ap[id]) || {},
    { raios: Object.assign({}, AP_DEFAULT[id].raios, (cfg && cfg.ap && cfg.ap[id] && cfg.ap[id].raios) || {}) });
  return out;
}
function areaOf(a) {
  a = a || {};
  const W = nOr(a.largura), L = nOr(a.comprimento);
  const area = nOr(a.area) || (W && L ? W * L : 0);
  return { W, L, area };
}
function raioProj(model, env, override) {
  const r = nOr(override) || model.raios[env || 'salao'] || 20;
  return Math.min(RAIO_LIMITE, Math.max(1, r));
}
/* devices: dispositivos simultâneos ; mbps: demanda média por dispositivo */
function calcAPModel(model, a, devices, mbps, override) {
  const { W, L, area } = areaOf(a);
  const env = a.ambiente || 'salao';
  const r = raioProj(model, env, override);
  const side = r * Math.SQRT2; // quadrado inscrito no círculo de cobertura
  let cols = 0, rows = 0, cov = 0;
  if (W && L) { cols = Math.max(1, Math.ceil(W / side)); rows = Math.max(1, Math.ceil(L / side)); cov = cols * rows; }
  else if (area) { cov = Math.max(1, Math.ceil(area / (2 * r * r))); }
  const razao = devices ? devices / model.clientesMax : 0;          // ex.: 2000 ÷ 512 = 3,91
  const cap = devices ? Math.ceil(razao) : 0;                         // arredondado para cima
  const capMin = devices ? Math.max(1, Math.floor(razao)) : 0;        // sem arredondar (mínimo)
  const thr = 0;
  const N = Math.max(cov, cap, (area || devices) ? 1 : 0);
  const fator = N === 0 ? '-' : (N === cap && cap >= cov ? 'nº de dispositivos simultâneos' : 'cobertura da área');
  const pos = (W && L && N) ? gridPositions(W, L, N, cols, rows) : [];
  return { model, r, cov, cap, capMin, razao, thr, N, fator, pos, area, W, L, devPorAP: N ? Math.ceil(devices / N) : 0, poeTotal: N * model.poeW };
}
function gridPositions(W, L, N, cols, rows) {
  rows = Math.max(1, rows || 1); cols = Math.max(1, cols || 1);
  while (rows * cols < N) { if (W / cols >= L / rows) cols++; else rows++; }
  while (rows > 1 && (rows - 1) * cols >= N) rows--;
  const pos = [];
  const base = Math.floor(N / rows), rest = N % rows;
  for (let r = 0; r < rows; r++) {
    const n = base + (r < rest ? 1 : 0);
    const y = L * (r + 0.5) / rows;
    for (let c = 0; c < n; c++) pos.push({ x: W * (c + 0.5) / n, y });
  }
  return pos;
}
function calcAP(cfg, a, devices, mbps, raioOverride) {
  const models = apModels(cfg);
  const res = {};
  for (const id in models) res[id] = calcAPModel(models[id], a || {}, devices, mbps, raioOverride && raioOverride[id]);
  const ids = Object.keys(res).filter(id => res[id].N > 0);
  let rec = null;
  if (ids.length) {
    const env = (a && a.ambiente) || 'salao';
    ids.sort((x, y) => res[x].N - res[y].N || ((env === 'aberto' ? (x === 'gwn7664elr' ? -1 : 1) : (x === 'gwn7660' ? -1 : 1))));
    rec = ids[0];
  }
  return { res, rec, models };
}

/* mediana geométrica (Weiszfeld) – minimiza o total de cabo até os APs */
function geoMedian(pts) {
  if (!pts.length) return null;
  let x = pts.reduce((s, p) => s + p.x, 0) / pts.length, y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  for (let it = 0; it < 80; it++) {
    let nx = 0, ny = 0, d = 0;
    for (const p of pts) { const w = 1 / Math.max(1e-6, Math.hypot(p.x - x, p.y - y)); nx += p.x * w; ny += p.y * w; d += w; }
    x = nx / d; y = ny / d;
  }
  return { x, y };
}
/* comprimento estimado de cabo: rota ortogonal + subida/descida + sobra */
function caboEstimado(dx, dy, peDireito) { return Math.abs(dx) + Math.abs(dy) + 2 * nOr(peDireito, 3) + 5; }

function calcRack(nAP, model, pontosCabeados, extraPoE) {
  const portas = nAP + iOr(pontosCabeados) + 2;
  const sw = nextOf([8, 16, 24, 48], portas);
  const nSw = portas > 48 ? Math.ceil(portas / 46) : 1;
  const poe = nAP * (model ? model.poeW : 0) + nOr(extraPoE);
  const patch = Math.ceil((nAP + iOr(pontosCabeados)) / 24) || 1;
  const itens = [
    ['Roteador / ONU / conversor de mídia', 1],
    [`Switch PoE ${sw > 48 ? 48 : sw} portas`, nSw],
    ['Patch panel 24 portas', patch],
    ['Organizador de cabos 1U', patch],
    ['DIO / bandeja de emenda óptica', 1],
    ['Régua de tomadas (PDU) 1U', 1]
  ];
  const U = itens.reduce((s, i) => s + i[1], 0);
  const rack = nextOf([5, 8, 12, 16, 20, 24, 44], Math.ceil(U * 1.3));
  return { portas, sw, nSw, poe, U, rack, itens, patch };
}

/* ---------- EVENTOS: demanda (100% do público estimado, sem multiplicadores) ---------- */
function calcEvento(e) {
  e = e || {};
  const pub = iOr(e.publico), dpp = nOr(e.dispPorPessoa, 1) || 1;
  const s = e.serv || {};
  const linhas = [
    ['Público estimado', Math.ceil(pub * dpp), dpp === 1 ? `${fmtN(pub)} pessoas (100% do público)` : `${fmtN(pub)} pessoas × ${dpp} disp. (100% do público)`],
    ['Credenciamento', iOr(s.cred), 'dispositivos'],
    ['Área administrativa', iOr(s.admin), 'pessoas simultâneas'],
    ['Expositores – computadores', iOr(s.exposPC), 'computadores'],
    ['Expositores – projetos', iOr(s.exposProj), 'projetos']
  ];
  (e.extras || []).forEach(x => { if (x && x.nome) linhas.push([x.nome, iOr(x.qtd), x.obs || 'dispositivos']); });
  const wifi = linhas.reduce((t, l) => t + l[1], 0);
  const stream = iOr(s.streamPontos), up = nOr(s.streamUp);
  const cabeados = stream + iOr(s.credCabeado) + iOr(s.outrosCabeados);
  const mbps = nOr(e.mbpsDisp, 2);
  const down = wifi * mbps + stream * up;           // 100% da demanda
  const upTot = stream * up + wifi * mbps * 0.1;
  const need = Math.max(down, upTot), tiers = linkPlanos();
  const linkRec = tiers.find(t => t >= need) || tiers[tiers.length - 1];
  const esc0 = nOr(e.linkEscolhido);
  const link = tiers.includes(esc0) ? esc0 : linkRec;
  return { linhas, wifi, stream, up, cabeados, down: Math.ceil(down), upTot: Math.ceil(upTot), link, linkRec, tiers, need: Math.ceil(need), excede: need > tiers[tiers.length - 1], manual: tiers.includes(esc0), mbps };
}
/* padrões base de link para eventos (Configurações) – padrão: 300 Mbps, 1 Gbps, 10 Gbps */
const LINK_PLANOS_PADRAO = '300 Mbps, 1 Gbps, 10 Gbps';
function parsePlanos(txt) {
  const out = String(txt || '').split(/[;,\n]+/).map(x => { const m = x.trim().match(/^([\d.,]+)\s*(g|m)?/i); return m ? nOr(m[1]) * (m[2] && m[2].toLowerCase() === 'g' ? 1000 : 1) : 0; }).filter(x => x > 0);
  return [...new Set(out)].sort((a, b) => a - b);
}
function linkPlanos() { const p = parsePlanos(typeof S !== 'undefined' && S.cfg && S.cfg.linkPlanos || LINK_PLANOS_PADRAO); return p.length ? p : [300, 1000, 10000]; }
function fmtN(n) { return Number(n || 0).toLocaleString('pt-BR'); }

/* ---------- EVENTOS: rack padrão + itens (base: listas SENAC CAPACITAR / ZONA FOOD) ---------- */
const RACK_EVENTO = { modelo: 'RACK OUTDOOR 6UX19"X28CM ALGCOM', desc: 'Rack 6U outdoor 19" × 28 cm (gabinete outdoor GO-06-19-28-AC-ECP, aço, ALGCOM)', U: 6 };
function calcRackEvento(o) {
  // o: { nAP, model, cabeados, racks, cab:[{L,fibra}], dias, suporte }
  const racks = Math.max(1, iOr(o.racks, 1));
  const fibraAPs = (o.cab || []).filter(c => c.fibra).length;
  const utpM = (o.cab || []).filter(c => !c.fibra).reduce((t, c) => t + c.L, 0);
  const foM = (o.cab || []).filter(c => c.fibra).reduce((t, c) => t + c.L, 0);
  const portas = o.nAP + iOr(o.cabeados);
  const sw = Math.max(racks, Math.ceil(portas / 8));
  const r10 = x => Math.ceil(x / 10) * 10;
  const solucao = [
    [RACK_EVENTO.modelo, racks, 'un', 'Gabinete outdoor 6U × 19" × 28 cm'],
    ['SWITCH DM-S100 8GP2GX L2 (8x RJ45 10/100/1000 PoE + 2x SFP 1000)', sw, 'un', `${portas} portas necessárias (APs + pontos cabeados)`],
    ['NOBREAK NEW ORON PREMIUM 1200VA E/S 220V 6 TOMADAS', racks, 'un', '1 por rack'],
    ['ACCESS POINT ' + (o.model ? o.model.nome.toUpperCase() : ''), o.nAP, 'un', 'conforme dimensionamento'],
    ['TRANSCEPTOR DM986-SFP V2 GPON ONU 1310/1490nm 20KM DATACOM', Math.max(1, iOr(o.abordagens, 1)), 'un', iOr(o.abordagens, 1) > 1 ? 'ativação do link – 1 por abordagem' : 'ativação do link']
  ];
  if (o.modo === 'corp' && !o.nAP) solucao.splice(3, 1);   // sem access points no atendimento
  if (fibraAPs) {
    solucao.push(['FONTE INJETOR POE', fibraAPs, 'un', 'APs interligados por fibra (alimentação local)']);
    solucao.push(['TRANSCEPTOR SFP 1.25G 1310NM 20KM', fibraAPs, 'un', 'par BiDi – lado rack']);
    solucao.push(['TRANSCEPTOR SFP 1.25G 1550NM 20KM', fibraAPs, 'un', 'par BiDi – lado AP']);
  }
  const materiais = [
    ['CABO DROP', Math.max(100, r10(foM * 1.3)), 'm', foM ? 'enlaces ópticos + 30%' : 'padrão de evento (link)'],
    ['CABO UTP CAT 5E', utpM ? r10(utpM * 1.3) : Math.max(50, (o.nAP + iOr(o.cabeados)) * 50), 'm', utpM ? 'enlaces UTP do croqui + 30%' : '~50 m por ponto (estimativa)']
  ];
  if (fibraAPs) {
    materiais.push(['CORDÃO ÓPTICO SM LC/UPC - SC/A 2,5M', fibraAPs * 2, 'un', '2 por enlace óptico']);
    materiais.push(['CONECTOR DE CAMPO', fibraAPs * 2, 'un', '2 por enlace óptico']);
  }
  (o.caboRows || []).slice().reverse().forEach(([nome, m, ab]) => materiais.unshift([nome, r10(m * 1.3), 'm', `rota${iOr(o.abordagens, 1) > 1 ? ' da abordagem ' + ab : ''} – OzMap ${fmtN(m)} m + 30%`]));
  materiais.push(['ABRAÇADEIRA NYLON', 100, 'un', 'fixação']);
  const corp = o.modo === 'corp', lanc = (o.caboRows || []).reduce((t, x) => t + x[1], 0);
  const servicos = corp ? [
    ['ATIVAÇÃO DO LINK', Math.max(1, iOr(o.abordagens, 1)), 'un'],
    ['SERVIÇO DE INFRAESTRUTURA', 1, 'un'],
    ['LANÇAMENTOS INTERNOS - REDE ÓPTICA', lanc ? r10(lanc * 1.3) : Math.max(100, r10(foM * 1.3)), 'm'],
    ...(o.nAP ? [['INSTALAÇÃO DE ANTENAS', o.nAP, 'un'], ['ATIVAÇÃO E TESTE - HOTSPOT (TIME PRÓPRIO - HE)', 1, 'un']] : [])
  ] : [
    ['ATIVAÇÃO DO LINK', 1, 'un'],
    ['SERVIÇO DE INFRAESTRUTURA', 1, 'un'],
    ['LANÇAMENTOS INTERNOS - REDE ÓPTICA', Math.max(100, r10(foM * 1.3)), 'm'],
    ['INSTALAÇÃO DE ANTENAS', o.nAP, 'un'],
    ['ATIVAÇÃO E TESTE - HOTSPOT (TIME PRÓPRIO - HE)', 1, 'un'],
    ['EQUIPE DE PLANTÃO DURANTE O EVENTO', o.suporte === 'clickip' || o.suporte === 'conjunto' ? Math.max(1, iOr(o.dias, 1)) : 0, 'diária'],
    ['RECOLHIMENTO PÓS EVENTO', 1, 'un']
  ];
  return { racks, sw, portas, fibraAPs, solucao, materiais, servicos, poe: o.nAP * (o.model ? o.model.poeW : 0) };
}
function velLabel(m) { return m >= 1000 ? (m / 1000).toLocaleString('pt-BR') + ' Gbps' : m + ' Mbps'; }

export { CABO_RESERVA, ENV_LABEL, LINK_PLANOS_PADRAO, RACK_EVENTO, RAIO_LIMITE, SPLITTERS, UTP_MAX, apModels, areaOf, caboEstimado, calcAP, calcCond, calcEvento, calcRack, calcRackEvento, condSel, geoMedian, iOr, linkPlanos, nOr, raioProj, velLabel };
