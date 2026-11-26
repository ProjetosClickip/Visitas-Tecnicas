/**
 * Middlewares HTTP: erros, cabeçalhos de segurança, proteção CSRF, sessão e papéis.
 */
import { agora, json } from './db.js';
import { hashToken } from './seguranca.js';

export const COOKIE_SESSAO = 'cip_sessao';

export class ErroHttp extends Error {
  constructor(status, mensagem, extra = {}) {
    super(mensagem);
    this.status = status;
    this.extra = extra;
  }
}

export const erro = (status, mensagem, extra) => new ErroHttp(status, mensagem, extra);

/* ---------- cabeçalhos ---------- */
const CSP = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': necessário para o OCR (Tesseract, WebAssembly). Nenhum script inline é permitido.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function cabecalhosSeguranca(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

/* ---------- CSRF ----------
 * O cookie de sessão é SameSite=Strict e, além disso, toda requisição que altera dados
 * precisa do cabeçalho X-CIP-Requisicao (um site de terceiros não consegue enviá-lo sem CORS,
 * e o servidor não habilita CORS) e, se o navegador enviar Origin, ela precisa ser a deste servidor.
 */
const SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function protecaoCsrf(req, res, next) {
  if (SEGUROS.has(req.method)) return next();
  if (req.get('X-CIP-Requisicao') !== '1') return next(erro(403, 'Requisição recusada (cabeçalho de segurança ausente).'));
  const origem = req.get('Origin');
  if (origem) {
    let host;
    try {
      host = new URL(origem).host;
    } catch {
      return next(erro(403, 'Origem inválida.'));
    }
    if (host !== req.get('Host')) return next(erro(403, 'Origem não permitida.'));
  }
  next();
}

/* ---------- cookies ---------- */
export function lerCookie(req, nome) {
  const bruto = req.headers.cookie || '';
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export function gravarCookieSessao(res, token, { seguro, maxAgeMs }) {
  const partes = [
    `${COOKIE_SESSAO}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (seguro) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function apagarCookieSessao(res, { seguro }) {
  res.setHeader('Set-Cookie', `${COOKIE_SESSAO}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${seguro ? '; Secure' : ''}`);
}

/* ---------- sessão ---------- */
export function usuarioPublico(u, { comEmail = true } = {}) {
  if (!u) return null;
  const perfil = json(u.perfil);
  return {
    id: u.id,
    nome: u.nome,
    email: comEmail ? u.email : undefined,
    cargo: u.cargo,
    papel: u.papel,
    supervisor: u.papel === 'supervisor',
    ativo: !!u.ativo,
    trocarSenha: !!u.trocar_senha,
    avatar: perfil.avatar || '',
    ultimoAcesso: u.ultimo_acesso,
    criadoEm: u.criado_em,
  };
}

const RENOVAR_APOS_MS = 5 * 60e3;

/** Carrega req.usuario a partir do cookie (não bloqueia rotas públicas). */
export function carregarSessao({ db, config }) {
  const buscar = db.prepare(
    `SELECT s.token_hash, s.expira_em, s.ultimo_uso, u.*
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?`,
  );
  const tocar = db.prepare('UPDATE sessoes SET ultimo_uso = ? WHERE token_hash = ?');
  const apagar = db.prepare('DELETE FROM sessoes WHERE token_hash = ?');
  return (req, res, next) => {
    const token = lerCookie(req, COOKIE_SESSAO);
    if (!token) return next();
    const th = hashToken(token);
    const linha = buscar.get(th);
    if (!linha) return next();
    const t = Date.now();
    const ultimo = Date.parse(linha.ultimo_uso);
    if (!linha.ativo || Date.parse(linha.expira_em) <= t || t - ultimo > config.sessaoInatividadeMs) {
      apagar.run(th);
      apagarCookieSessao(res, { seguro: config.cookieSeguro });
      return next();
    }
    if (t - ultimo > RENOVAR_APOS_MS) tocar.run(agora(), th);
    req.usuario = linha;
    req.tokenHash = th;
    next();
  };
}

/** Sessão válida, mesmo que o usuário ainda precise trocar a senha provisória. */
export function exigirSessao(req, res, next) {
  if (!req.usuario) return next(erro(401, 'Sessão expirada. Entre novamente.', { codigo: 'SEM_SESSAO' }));
  next();
}

export function exigirLogin(req, res, next) {
  if (!req.usuario) return next(erro(401, 'Sessão expirada. Entre novamente.', { codigo: 'SEM_SESSAO' }));
  if (req.usuario.trocar_senha) {
    return next(erro(403, 'Defina uma nova senha para continuar.', { codigo: 'TROCAR_SENHA' }));
  }
  next();
}

export function exigirSupervisor(req, res, next) {
  if (!req.usuario || req.usuario.papel !== 'supervisor') {
    return next(erro(403, 'Acesso restrito à supervisão.', { codigo: 'SEM_PERMISSAO' }));
  }
  next();
}

export const ehSupervisor = (req) => req.usuario?.papel === 'supervisor';

/* ---------- limitador de tentativas de login (memória) ---------- */
export function criarLimitador({ maxFalhas = 5, janelaMs = 15 * 60e3, bloqueioMs = 15 * 60e3 } = {}) {
  const mapa = new Map();
  const limpar = (t) => {
    for (const [k, v] of mapa) if (v.ate < t && t - v.inicio > janelaMs) mapa.delete(k);
  };
  return {
    bloqueado(chave) {
      const v = mapa.get(chave);
      return !!v && v.ate > Date.now();
    },
    falha(chave) {
      const t = Date.now();
      if (mapa.size > 10000) limpar(t);
      let v = mapa.get(chave);
      if (!v || t - v.inicio > janelaMs) v = { inicio: t, n: 0, ate: 0 };
      v.n += 1;
      if (v.n >= maxFalhas) v.ate = t + bloqueioMs;
      mapa.set(chave, v);
    },
    sucesso(chave) {
      mapa.delete(chave);
    },
  };
}

export function tratadorErros(err, req, res, _next) {
  if (err.type === 'entity.too.large') err = erro(413, 'Arquivo ou documento grande demais.');
  else if (err.type === 'entity.parse.failed') err = erro(400, 'JSON inválido.');
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ erro: status >= 500 ? 'Erro interno do servidor.' : err.message, ...(err.extra || {}) });
}
