/* ================== ESTADO ==================
 * S.user   – usuário logado (formato usado pela interface: name, role = cargo, papel…)
 * S.org    – dados da organização vindos do servidor (empresas do grupo, CNPJ, cidade)
 * S.cfg    – configurações das visitas do usuário (salvas no servidor)
 * S.visits – visitas do usuário em versão resumida (sem fotos); S.cur é a visita aberta, completa
 */
const S = { user: null, org: null, cfg: {}, visits: [], tab: 'hist', cur: null, saveT: null, filter: { q: '', type: '', status: '' } };
const TYPES = {
  cond: { nome: 'Condomínio', plural: 'Condomínios', cor: '#13294b', pill: 'cond' },
  corp: { nome: 'Link Dedicado', plural: 'Link Dedicado', cor: '#159c98', pill: 'corp' },
  evt: { nome: 'Evento', plural: 'Eventos', cor: '#f26a21', pill: 'evt' }
};

export { S, TYPES };
