/**
 * Regras das visitas técnicas no servidor.
 * O documento da visita é livre (formulário), mas os campos de fluxo/autoria são
 * controlados aqui: o cliente não consegue se autoaprovar nem trocar o dono.
 */
import crypto from 'node:crypto';
import { json } from '../db.js';

export const TIPOS = ['cond', 'corp', 'evt'];
export const STATUS = ['draft', 'pending', 'done'];

/** Campos que só o servidor define: são removidos do que o navegador envia. */
const CAMPOS_SERVIDOR = [
  'id', 'userId', 'type', 'status', 'aprovacao', 'devolucao', 'enviadoEm',
  'versao', 'createdAt', 'updatedAt', 'atualizadoPor', '_lite', 'importado', 'assinatura', 'userName',
];

export function limparDados(doc) {
  const d = { ...(doc && typeof doc === 'object' ? doc : {}) };
  for (const k of CAMPOS_SERVIDOR) delete d[k];
  return d;
}

/** Cópia sem imagens grandes (fotos, plantas, assinaturas) para listas e painéis. */
const LIMITE_LITE = 2048;
export function semImagens(valor) {
  if (typeof valor === 'string') return valor.startsWith('data:') && valor.length > LIMITE_LITE ? '' : valor;
  if (Array.isArray(valor)) return valor.map(semImagens);
  if (valor && typeof valor === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(valor)) o[k] = semImagens(v);
    return o;
  }
  return valor;
}

export function montarVisita(linha, { lite = false, nomes = {} } = {}) {
  const dados = json(linha.dados);
  const fluxo = json(linha.fluxo);
  const v = {
    ...(lite ? semImagens(dados) : dados),
    id: linha.id,
    userId: linha.dono_id,
    userName: nomes[linha.dono_id],
    type: linha.tipo,
    status: linha.status,
    versao: linha.versao,
    createdAt: linha.criado_em,
    updatedAt: linha.atualizado_em,
  };
  if (fluxo.aprovacao) v.aprovacao = fluxo.aprovacao;
  if (fluxo.devolucao) v.devolucao = fluxo.devolucao;
  if (fluxo.enviadoEm) v.enviadoEm = fluxo.enviadoEm;
  if (fluxo.importado) v.importado = fluxo.importado;
  if (fluxo.assinatura) v.assinatura = lite ? { ...fluxo.assinatura, img: '' } : fluxo.assinatura;
  if (lite) v._lite = true;
  return v;
}

export function nomeDemanda(dados, tipo) {
  const cli = (dados && dados.cli) || {};
  if (tipo === 'evt') return cli.evento || cli.nome || '(evento sem nome)';
  return cli.nome || '(sem nome)';
}

export function dataVisita(dados, criadoEm) {
  return (dados && dados.cli && dados.cli.data) || String(criadoEm || '').slice(0, 10);
}

export const idValido = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(id);

/** JSON com chaves ordenadas: o mesmo conteúdo sempre gera o mesmo texto (e o mesmo hash). */
export function jsonCanonico(v) {
  if (Array.isArray(v)) return '[' + v.map(jsonCanonico).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + jsonCanonico(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}

export const hashConteudo = (dados) => crypto.createHash('sha256').update(jsonCanonico(dados)).digest('hex');

/** Código de verificação impresso no PDF (derivado do hash do conteúdo, do signatário e do horário). */
export function codigoVerificacao(hash, usuarioId, em) {
  const h = crypto.createHash('sha256').update(`${hash}|${usuarioId}|${em}`).digest('hex').toUpperCase();
  return h.slice(0, 12).match(/.{4}/g).join('-');
}

export const mascararCpf = (c) => {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
};
