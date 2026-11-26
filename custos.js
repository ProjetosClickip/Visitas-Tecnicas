/**
 * Regras da Mensuração de Custos no servidor: campos protegidos, histórico,
 * totais e situação de aprovação (calculados aqui, não confiados ao navegador).
 */
import { json } from '../db.js';

const CAMPOS_SERVIDOR = [
  'id', 'ownerId', 'criadoPor', 'aprovacoes', 'conteudoAlteradoEm', 'alteradoPor',
  'versao', 'excluido', 'atualizadoEm', 'historico',
];

export function limparProjeto(doc) {
  const d = { ...(doc && typeof doc === 'object' ? doc : {}) };
  for (const k of CAMPOS_SERVIDOR) delete d[k];
  if (!d.info || typeof d.info !== 'object') d.info = {};
  for (const k of ['materiais', 'servicos', 'importacoes']) if (!Array.isArray(d[k])) d[k] = [];
  return d;
}

/** Representação do conteúdo usada para saber se o orçamento mudou (ignora histórico e carimbos). */
export function assinaturaConteudo(d) {
  const { historico, criadoEm, atualizadoEm, ...resto } = d || {};
  return JSON.stringify(resto);
}

const LIMITE_HISTORICO = 500;

/**
 * O histórico é escrito só pelo servidor: o navegador informa as ações ("Materiais de obra alterados")
 * e o servidor registra quem (usuário da sessão) e quando (relógio do servidor).
 * Ações iguais e seguidas do mesmo usuário em menos de 3 minutos são agrupadas (campo n).
 */
export function registrarAcoes(historico, acoes, usuario, quando) {
  const base = Array.isArray(historico) ? historico.map((h) => ({ ...h })) : [];
  for (const bruta of acoes) {
    const acao = String(bruta || '').trim().slice(0, 300);
    if (!acao) continue;
    const ult = base[base.length - 1];
    if (ult && ult.uid === usuario.id && ult.acao === acao && Date.parse(quando) - Date.parse(ult.em) < 180e3) {
      ult.em = quando;
      ult.n = (ult.n || 1) + 1;
    } else {
      base.push({ em: quando, uid: usuario.id, nome: usuario.nome, acao });
    }
  }
  if (base.length > LIMITE_HISTORICO) base.splice(0, base.length - LIMITE_HISTORICO);
  return base;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Valor total = quantidade × valor unitário (dados antigos com só o total são convertidos). */
function valorItem(x) {
  const q = Number(x.quantidade) || 0;
  const temUnit = x.valorUnitario != null && x.valorUnitario !== '';
  const vu = temUnit ? Number(x.valorUnitario) || 0 : q ? (Number(x.valorTotal) || 0) / q : 0;
  return q * vu;
}

export function totais(p) {
  const mats = p.materiais || [];
  const svcs = p.servicos || [];
  const obra = r2(mats.filter((m) => m.categoria !== 'ativacao').reduce((s, m) => s + valorItem(m), 0));
  const ativ = r2(mats.filter((m) => m.categoria === 'ativacao').reduce((s, m) => s + valorItem(m), 0));
  const serv = r2(svcs.reduce((s, x) => s + valorItem(x), 0));
  return { obra, ativ, mat: r2(obra + ativ), serv, total: r2(obra + ativ + serv), nMat: mats.length, nServ: svcs.length };
}

/** Aprovações no formato que a interface usa: { [usuarioId]: { status, em, porUid, porNome, obs, total } } */
export function mapaAprovacoes(linhas, nomes) {
  const out = {};
  for (const a of linhas) {
    out[a.usuario_id] = { status: 'aprovado', em: a.em, porUid: a.usuario_id, porNome: nomes[a.usuario_id] || '', obs: a.obs, total: a.total };
  }
  return out;
}

export function situacaoAprovacao(linhas, conteudoAlteradoEm, nomes) {
  const regs = linhas.map((a) => ({ usuarioId: a.usuario_id, nome: nomes[a.usuario_id] || '', em: a.em }));
  const primeira = regs.map((r) => r.em).sort()[0];
  const alterado = !!(primeira && conteudoAlteradoEm && conteudoAlteradoEm > primeira);
  return { regs, n: regs.length, alterado, status: regs.length && !alterado ? 'done' : 'draft' };
}

export function montarProjeto(linha, aprovacoes, nomes) {
  const d = json(linha.dados);
  return {
    ...d,
    id: linha.id,
    ownerId: linha.dono_id,
    criadoPor: { uid: linha.dono_id, nome: nomes[linha.dono_id] || '' },
    criadoEm: d.criadoEm || linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    conteudoAlteradoEm: linha.conteudo_alterado_em,
    alteradoPor: linha.atualizado_por ? { uid: linha.atualizado_por, nome: nomes[linha.atualizado_por] || '' } : null,
    aprovacoes: mapaAprovacoes(aprovacoes, nomes),
    versao: linha.versao,
  };
}

/** Rascunho vazio criado automaticamente (sem nome, cliente ou itens) não entra nos painéis. */
export function projetoVazio(d) {
  const info = d.info || {};
  return !(d.materiais || []).length && !(d.servicos || []).length && !info.cliente && (!info.nome || info.nome === 'Novo projeto');
}

export const TIPOS_PROJETO = { rede: 'Projeto de rede', backbone: 'Projeto de backbone', cliente: 'Projeto de cliente', evento: 'Evento', condominio: 'Condomínio' };
