/**
 * Configuração do servidor.
 *
 * Tudo o que é sensível (senhas, e-mails, CNPJs, catálogo de preços) fica FORA do git:
 *   .env                          → variáveis de ambiente (copie de .env.example)
 *   config/organizacao.json       → dados da organização (copie de config/organizacao.example.json)
 *   config/usuarios-iniciais.json → contas criadas por `npm run usuarios:semear`
 *   data/                         → banco SQLite e catálogo inicial
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function lerEnv() {
  const arq = path.join(RAIZ, '.env');
  if (fs.existsSync(arq)) process.loadEnvFile(arq);
}

function caminho(p, padrao) {
  return path.resolve(RAIZ, p || padrao);
}

function lerJSON(arq, padrao) {
  if (!fs.existsSync(arq)) return padrao;
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch (e) {
    throw new Error(`Arquivo de configuração inválido: ${arq} (${e.message})`);
  }
}

const ORG_PADRAO = {
  nome: 'Plataforma de Projetos',
  unidade: 'Engenharia / Projetos',
  cidade: '',
  setor: 'Engenharia / Projetos',
  empresaResponsavel: { nome: '', cnpj: '' },
  empresasGrupo: [],
  dominiosEmailPermitidos: [],
  painelPublico: false,
};

function int(v, padrao) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : padrao;
}

export function carregarConfig(sobrescrever = {}) {
  lerEnv();
  const env = process.env;
  const dataDir = caminho(sobrescrever.dataDir ?? env.DATA_DIR, './data');
  const arqOrg = caminho(env.ORGANIZACAO_ARQUIVO, './config/organizacao.json');
  const org = { ...ORG_PADRAO, ...lerJSON(arqOrg, {}), ...(sobrescrever.organizacao || {}) };
  return {
    porta: int(sobrescrever.porta ?? env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    dataDir,
    arquivoBanco: sobrescrever.arquivoBanco ?? path.join(dataDir, 'plataforma.sqlite'),
    cookieSeguro: sobrescrever.cookieSeguro ?? env.COOKIE_SECURE === 'true',
    trustProxy: int(env.TRUST_PROXY, 0),
    sessaoInatividadeMs: int(env.SESSAO_INATIVIDADE_HORAS, 12) * 3600e3,
    sessaoMaximaMs: int(env.SESSAO_MAXIMA_DIAS, 7) * 86400e3,
    arquivoUsuariosIniciais: caminho(env.USUARIOS_INICIAIS_ARQUIVO, './config/usuarios-iniciais.json'),
    arquivoCatalogoInicial: sobrescrever.arquivoCatalogoInicial ?? caminho(env.CATALOGO_INICIAL_ARQUIVO, './data/catalogo-inicial.json'),
    pastaWeb: path.join(RAIZ, 'web', 'dist'),
    organizacao: org,
    lerJSON,
  };
}
