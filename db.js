/**
 * Banco de dados central (SQLite embutido no Node, sem dependências nativas).
 * Documentos (visitas, projetos) ficam em JSON; o que é regra de negócio
 * (dono, status, aprovações, versão) fica em colunas controladas pelo servidor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRACOES = [
  `
  CREATE TABLE usuarios (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nome          TEXT NOT NULL,
    cargo         TEXT NOT NULL DEFAULT '',
    papel         TEXT NOT NULL CHECK (papel IN ('colaborador', 'supervisor')),
    senha_hash    TEXT NOT NULL,
    trocar_senha  INTEGER NOT NULL DEFAULT 1,
    ativo         INTEGER NOT NULL DEFAULT 1,
    perfil        TEXT NOT NULL DEFAULT '{}',
    criado_em     TEXT NOT NULL,
    atualizado_em TEXT NOT NULL,
    ultimo_acesso TEXT
  );

  CREATE TABLE sessoes (
    token_hash  TEXT PRIMARY KEY,
    usuario_id  TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criada_em   TEXT NOT NULL,
    expira_em   TEXT NOT NULL,
    ultimo_uso  TEXT NOT NULL,
    ip          TEXT,
    agente      TEXT
  );
  CREATE INDEX sessoes_usuario ON sessoes(usuario_id);

  CREATE TABLE visitas (
    id             TEXT PRIMARY KEY,
    dono_id        TEXT NOT NULL REFERENCES usuarios(id),
    tipo           TEXT NOT NULL CHECK (tipo IN ('cond', 'corp', 'evt')),
    status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'done')),
    dados          TEXT NOT NULL,
    fluxo          TEXT NOT NULL DEFAULT '{}',
    versao         INTEGER NOT NULL DEFAULT 1,
    criado_em      TEXT NOT NULL,
    atualizado_em  TEXT NOT NULL,
    atualizado_por TEXT
  );
  CREATE INDEX visitas_dono ON visitas(dono_id);

  CREATE TABLE projetos_custos (
    id                   TEXT PRIMARY KEY,
    dono_id              TEXT NOT NULL REFERENCES usuarios(id),
    dados                TEXT NOT NULL,
    versao               INTEGER NOT NULL DEFAULT 1,
    conteudo_alterado_em TEXT,
    criado_em            TEXT NOT NULL,
    atualizado_em        TEXT NOT NULL,
    atualizado_por       TEXT
  );
  CREATE INDEX projetos_custos_dono ON projetos_custos(dono_id);

  CREATE TABLE aprovacoes_custos (
    projeto_id TEXT NOT NULL REFERENCES projetos_custos(id) ON DELETE CASCADE,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id),
    em         TEXT NOT NULL,
    obs        TEXT NOT NULL DEFAULT '',
    total      REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (projeto_id, usuario_id)
  );

  CREATE TABLE prestadoras (
    id             TEXT PRIMARY KEY,
    dados          TEXT NOT NULL,
    versao         INTEGER NOT NULL DEFAULT 1,
    atualizado_em  TEXT NOT NULL,
    atualizado_por TEXT
  );

  -- documentos únicos compartilhados (ex.: catálogo de materiais, configurações de custos)
  CREATE TABLE documentos (
    chave          TEXT PRIMARY KEY,
    dados          TEXT NOT NULL,
    versao         INTEGER NOT NULL DEFAULT 1,
    atualizado_em  TEXT NOT NULL,
    atualizado_por TEXT
  );

  -- preferências por usuário (ex.: configurações das visitas, projeto ativo)
  CREATE TABLE preferencias (
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    chave      TEXT NOT NULL,
    dados      TEXT NOT NULL,
    PRIMARY KEY (usuario_id, chave)
  );

  CREATE TABLE auditoria (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    em          TEXT NOT NULL,
    usuario_id  TEXT,
    acao        TEXT NOT NULL,
    entidade    TEXT,
    entidade_id TEXT,
    detalhe     TEXT
  );
  CREATE INDEX auditoria_entidade ON auditoria(entidade, entidade_id);
  `,
];

export function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrar(db);
  return db;
}

function migrar(db) {
  const atual = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = atual; v < MIGRACOES.length; v++) {
    transacao(db, () => {
      db.exec(MIGRACOES[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Executa fn dentro de uma transação (BEGIN IMMEDIATE evita corrida entre leitura e escrita). */
export function transacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const agora = () => new Date().toISOString();

export function json(txt, padrao = {}) {
  if (txt == null) return padrao;
  try {
    return JSON.parse(txt);
  } catch {
    return padrao;
  }
}

export function auditar(db, { usuarioId = null, acao, entidade = null, entidadeId = null, detalhe = null }) {
  db.prepare('INSERT INTO auditoria (em, usuario_id, acao, entidade, entidade_id, detalhe) VALUES (?, ?, ?, ?, ?, ?)')
    .run(agora(), usuarioId, acao, entidade, entidadeId, detalhe == null ? null : JSON.stringify(detalhe));
}
