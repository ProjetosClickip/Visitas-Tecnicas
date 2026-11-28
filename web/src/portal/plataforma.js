/* ================== PLATAFORMA: subsistemas ================== */
import { api } from '../shared/api.js';
import { S } from './estado.js';


const SISTEMAS = [
  { id: 'visitas', nome: 'Visitas Técnicas', ic: '<svg class="ic" aria-hidden="true"><use href="#i-clip"/></svg>', desc: 'Levantamento em campo, dimensionamento (CTOs, APs, rack), croqui, KML/KMZ e projeto executivo em PDF.', cor: '#159c98' },
  { id: 'custos', nome: 'Mensuração de Custos', ic: '<svg class="ic" aria-hidden="true"><use href="#i-calc"/></svg>', desc: 'Orçamento de projetos: materiais de obra e ativação, serviços, prestadoras, catálogo, relatórios PDF/Excel e aprovação.', cor: '#7a3db8' },
  { id: 'fiber', nome: 'ClickIP FiberControl', ic: '<svg class="ic" aria-hidden="true"><use href="#i-fiber"/></svg>', desc: 'Controle da rede óptica (em integração).', cor: '#f26a21', breve: true }
];
/* tipos de demanda de todos os subsistemas (para os painéis) */
const KIND = {
  cond: { l: 'Condomínios', n: 'Condomínio', cor: '#3b6fb6', pill: 'cond', sys: 'visitas' },
  corp: { l: 'Link Dedicado', n: 'Link Dedicado', cor: '#159c98', pill: 'corp', sys: 'visitas' },
  evt: { l: 'Eventos', n: 'Evento', cor: '#f26a21', pill: 'evt', sys: 'visitas' },
  custo: { l: 'Orçamentos (custos)', n: 'Orçamento', cor: '#7a3db8', pill: 'custo', sys: 'custos' }
};
const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Usuário da API no formato usado pelas telas. */
const usuarioLista = u => ({ id: u.id, name: u.nome, email: u.email || '', role: u.cargo || '', papel: u.papel, avatar: u.avatar || '', ativo: u.ativo, lastLogin: u.ultimoAcesso, trocarSenha: u.trocarSenha });

/**
 * Itens normalizados de todos os subsistemas, vindos do servidor.
 * escopo 'meu' = demandas do usuário; 'equipe' = todas (somente supervisão; inclui valores dos orçamentos).
 */
async function dadosPlataforma({ escopo = 'meu' } = {}) {
  const equipe = escopo === 'equipe';
  const [painel, us, vs] = await Promise.all([
    api.get('/painel?escopo=' + (equipe ? 'equipe' : 'meu')),
    api.get('/usuarios'),
    equipe ? api.get('/visitas?escopo=todas') : Promise.resolve({ visitas: S.visits })
  ]);
  const users = us.usuarios.map(usuarioLista);
  const umap = {}; users.forEach(u => umap[u.id] = u);
  const visits = vs.visitas;
  const vmap = {}; visits.forEach(v => vmap[v.id] = v);
  const items = painel.itens.map(x => Object.assign({}, x, { ref: x.sys === 'visitas' && vmap[x.id] ? vmap[x.id] : { updatedAt: x.atualizado } }));
  const custos = items.filter(x => x.sys === 'custos');
  return { visits, users, umap, custos, items, clientes: painel.clientes };
}

export { KIND, SISTEMAS, brl, dadosPlataforma };
