/**
 * Contas de usuário. O papel (colaborador/supervisor) é guardado no servidor e só
 * a supervisão (ou o script de linha de comando) pode atribuí-lo.
 */
import { agora, auditar, json } from '../db.js';
import { gerarHashSenha, novoId, validarSenhaNova } from '../seguranca.js';
import { erro } from '../http.js';

export const PAPEIS = ['colaborador', 'supervisor'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizarEmail(e) {
  return String(e || '').trim().toLowerCase();
}

export function validarEmail(email, dominiosPermitidos = []) {
  if (!EMAIL_RE.test(email)) return 'E-mail inválido.';
  if (dominiosPermitidos.length) {
    const dom = email.split('@')[1];
    if (!dominiosPermitidos.map((d) => d.toLowerCase()).includes(dom)) {
      return `Use um e-mail corporativo (${dominiosPermitidos.map((d) => '@' + d).join(', ')}).`;
    }
  }
  return null;
}

export async function criarUsuario(db, { email, nome, cargo = '', papel = 'colaborador', senha, trocarSenha = true, dominios = [], criadoPor = null }) {
  email = normalizarEmail(email);
  nome = String(nome || '').trim();
  const msgEmail = validarEmail(email, dominios);
  if (msgEmail) throw erro(400, msgEmail);
  if (!nome) throw erro(400, 'Informe o nome.');
  if (!PAPEIS.includes(papel)) throw erro(400, 'Papel inválido.');
  const msgSenha = validarSenhaNova(senha, { email, nome });
  if (msgSenha) throw erro(400, msgSenha);
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) throw erro(409, 'Já existe uma conta com este e-mail.');
  const id = novoId('u');
  const t = agora();
  db.prepare(
    `INSERT INTO usuarios (id, email, nome, cargo, papel, senha_hash, trocar_senha, ativo, perfil, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}', ?, ?)`,
  ).run(id, email, nome, String(cargo || '').trim(), papel, await gerarHashSenha(senha), trocarSenha ? 1 : 0, t, t);
  auditar(db, { usuarioId: criadoPor, acao: 'usuario.criar', entidade: 'usuario', entidadeId: id, detalhe: { email, papel } });
  return db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
}

export const buscarUsuario = (db, id) => db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
export const buscarPorEmail = (db, email) => db.prepare('SELECT * FROM usuarios WHERE email = ?').get(normalizarEmail(email));

/** { id: nome } de todos os usuários (para exibir autores). */
export function mapaNomes(db) {
  const m = {};
  for (const u of db.prepare('SELECT id, nome FROM usuarios').all()) m[u.id] = u.nome;
  return m;
}

export function perfilDe(u) {
  return json(u.perfil);
}

export function supervisoresAtivos(db) {
  return db.prepare("SELECT * FROM usuarios WHERE papel = 'supervisor' AND ativo = 1 ORDER BY nome").all();
}

export const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
