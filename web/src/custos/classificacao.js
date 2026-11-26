/* =====================================================================
   5. CLASSIFICAÇÃO, UNIDADES E DUPLICIDADES
   ===================================================================== */
import { norm, normKey } from './util.js';

const ATIV_WORDS = ['onu','ont','ont/onu','roteador','router','fonte','patch cord','patchcord','cordao de manobra','conector','adaptador','switch','modem','wifi','wi fi','mesh','access point','sfp','gbic','transceiver','mikrotik','repetidor','set top','stb','telefone ip','ata','poe','injetor'];
function autoCategory(text, fallback){
  const n = ' ' + normKey(text) + ' ';
  for (const w of ATIV_WORDS){ if (n.includes(' '+w+' ')) return 'ativacao'; }
  return fallback || 'obra';
}
function categoryFromValue(v){
  const n = norm(v);
  if (!n) return null;
  if (n.includes('ativ')) return 'ativacao';
  if (n.includes('obra') || n.includes('infra') || n.includes('rede externa')) return 'obra';
  return null;
}
const UNIT_MAP = {
  'un':'Unidade','und':'Unidade','unid':'Unidade','unidade':'Unidade','unidades':'Unidade','u':'Unidade','uni':'Unidade','ud':'Unidade',
  'm':'Metro','mt':'Metro','mts':'Metro','metro':'Metro','metros':'Metro','ml':'Metro',
  'km':'Quilômetro','quilometro':'Quilômetro','quilometros':'Quilômetro',
  'rl':'Rolo','rolo':'Rolo','rolos':'Rolo',
  'cx':'Caixa','caixa':'Caixa','caixas':'Caixa',
  'pc':'Peça','pç':'Peça','pca':'Peça','peca':'Peça','pecas':'Peça','pcs':'Peça',
  'pct':'Pacote','pt':'Ponto','pacote':'Pacote','pacotes':'Pacote','pc.':'Peça',
  'kit':'Kit','kits':'Kit','cj':'Conjunto','conj':'Conjunto','conjunto':'Conjunto',
  'par':'Par','pr':'Par','jg':'Jogo','jogo':'Jogo','kg':'Kg','l':'Litro','lt':'Litro','litro':'Litro',
  'h':'Hora','hr':'Hora','hrs':'Hora','hora':'Hora','horas':'Hora','diaria':'Diária','dia':'Diária',
  'vb':'Verba','verba':'Verba','sv':'Serviço','serv':'Serviço','servico':'Serviço','pto':'Ponto','ponto':'Ponto','pontos':'Ponto'
};
function normalizeUnit(u){
  const raw = String(u==null?'':u).trim();
  if (!raw) return '';
  const k = norm(raw).replace(/\.$/,'');
  if (UNIT_MAP[k]) return UNIT_MAP[k];
  const k2 = k.replace(/[^a-z]/g,'');
  if (UNIT_MAP[k2]) return UNIT_MAP[k2];
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
const isUnitToken = t => { const k = norm(t).replace(/[^a-zç]/g,''); return !!k && Object.prototype.hasOwnProperty.call(UNIT_MAP, k) && k.length<=7; };

function findMatDup(row, list, ignoreId){
  const n = norm(row.nome);  // materiais: duplicidade pela descrição (empresa e código não são mais usados)
  return list.find(m => m.id!==ignoreId && n && norm(m.nome)===n) || null;
}
function findSvcDup(row, list, ignoreId){
  const e = norm(row.empresa), n = norm(row.nome!=null?row.nome:row.descricao);
  return list.find(s => s.id!==ignoreId && norm(s.empresa)===e && n && norm(s.descricao)===n) || null;
}

export { autoCategory, findMatDup, findSvcDup, isUnitToken, normalizeUnit };
