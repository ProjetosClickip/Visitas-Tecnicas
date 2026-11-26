/** Entrar, sair, sessão atual e troca de senha. */
import { Router } from 'express';
import { agora, auditar } from '../db.js';
import { conferirSenha, conferirSenhaFalsa, gerarHashSenha, hashToken, novoToken, validarSenhaNova } from '../seguranca.js';
import { apagarCookieSessao, criarLimitador, erro, exigirSessao, gravarCookieSessao, usuarioPublico } from '../http.js';
import { buscarPorEmail, normalizarEmail } from '../lib/usuarios.js';

export function rotasAuth({ db, config }) {
  const r = Router();
  // 5 falhas por conta+IP ou 30 falhas por IP em 15 minutos bloqueiam novas tentativas por 15 minutos
  const porConta = criarLimitador({ maxFalhas: 5 });
  const porIp = criarLimitador({ maxFalhas: 30 });

  r.post('/entrar', async (req, res) => {
    const email = normalizarEmail(req.body?.email);
    const senha = String(req.body?.senha || '');
    const chave = `${req.ip}|${email}`;
    if (porConta.bloqueado(chave) || porIp.bloqueado(req.ip)) {
      throw erro(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
    }
    const u = email ? buscarPorEmail(db, email) : null;
    const ok = u ? await conferirSenha(senha, u.senha_hash) : await conferirSenhaFalsa(senha);
    if (!ok || !u.ativo) {
      porConta.falha(chave);
      porIp.falha(req.ip);
      auditar(db, { usuarioId: u?.id ?? null, acao: 'auth.falha', detalhe: { email, ip: req.ip } });
      throw erro(401, 'E-mail ou senha incorretos.');
    }
    porConta.sucesso(chave);
    const token = novoToken();
    const t = agora();
    db.prepare('INSERT INTO sessoes (token_hash, usuario_id, criada_em, expira_em, ultimo_uso, ip, agente) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(hashToken(token), u.id, t, new Date(Date.now() + config.sessaoMaximaMs).toISOString(), t, req.ip, String(req.get('User-Agent') || '').slice(0, 200));
    db.prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?').run(t, u.id);
    db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(t);
    auditar(db, { usuarioId: u.id, acao: 'auth.entrar', detalhe: { ip: req.ip } });
    gravarCookieSessao(res, token, { seguro: config.cookieSeguro, maxAgeMs: config.sessaoMaximaMs });
    res.json({ usuario: usuarioPublico({ ...u, ultimo_acesso: t }) });
  });

  r.post('/sair', (req, res) => {
    if (req.tokenHash) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(req.tokenHash);
    apagarCookieSessao(res, { seguro: config.cookieSeguro });
    res.json({ ok: true });
  });

  // sem sessão responde { usuario: null } (não é erro: a página só quer saber se há alguém logado)
  r.get('/eu', (req, res) => {
    res.json({ usuario: req.usuario ? usuarioPublico(req.usuario) : null });
  });

  r.post('/senha', exigirSessao, async (req, res) => {
    const u = req.usuario;
    const { atual, nova } = req.body || {};
    if (!(await conferirSenha(String(atual || ''), u.senha_hash))) throw erro(400, 'Senha atual incorreta.');
    if (String(nova) === String(atual)) throw erro(400, 'A nova senha precisa ser diferente da atual.');
    const msg = validarSenhaNova(nova, { email: u.email, nome: u.nome });
    if (msg) throw erro(400, msg);
    db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, atualizado_em = ? WHERE id = ?').run(await gerarHashSenha(nova), agora(), u.id);
    // encerra as outras sessões deste usuário
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token_hash <> ?').run(u.id, req.tokenHash);
    auditar(db, { usuarioId: u.id, acao: 'auth.trocar_senha' });
    res.json({ usuario: usuarioPublico({ ...u, trocar_senha: 0 }) });
  });

  return r;
}
