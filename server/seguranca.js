/**
 * Senhas e tokens.
 * - Senhas: scrypt (memória-intensivo) com salt aleatório por usuário, comparação em tempo constante.
 * - Sessões: token aleatório de 256 bits no cookie; no banco fica só o SHA-256 do token.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAM = 64;

export const SENHA_MIN = 8;

export async function gerarHashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(String(senha).normalize('NFKC'), salt, TAM, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), h.toString('base64')].join('$');
}

export async function conferirSenha(senha, armazenado) {
  const partes = String(armazenado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, 'base64');
  const h = await scrypt(String(senha).normalize('NFKC'), Buffer.from(saltB64, 'base64'), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem,
  });
  return crypto.timingSafeEqual(h, esperado);
}

/** Hash usado quando o e-mail não existe, para o tempo de resposta não revelar contas válidas. */
let hashFalso = null;
export async function conferirSenhaFalsa(senha) {
  hashFalso ??= await gerarHashSenha(crypto.randomBytes(12).toString('hex'));
  await conferirSenha(senha, hashFalso);
  return false;
}

export function validarSenhaNova(senha, { email = '', nome = '' } = {}) {
  const s = String(senha || '');
  if (s.length < SENHA_MIN) return `A senha precisa ter no mínimo ${SENHA_MIN} caracteres.`;
  if (s.length > 200) return 'Senha muito longa.';
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
  const baixa = s.toLowerCase();
  const local = String(email).split('@')[0].toLowerCase();
  if ((local && baixa.includes(local)) || (nome && baixa === String(nome).toLowerCase().replace(/\s+/g, ''))) {
    return 'A senha não pode conter o seu e-mail ou nome.';
  }
  return null;
}

/** Senha provisória legível (sem caracteres ambíguos) para contas novas e redefinições. */
export function senhaProvisoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digitos = '23456789';
  const todos = letras + digitos;
  const pega = (s) => s[crypto.randomInt(s.length)];
  const chars = [pega(letras), pega(digitos)];
  while (chars.length < 12) chars.push(pega(todos));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export const novoToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export const novoId = (prefixo) => `${prefixo}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
