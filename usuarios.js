/** Equipe (gestão pela supervisão), perfil próprio e preferências. */
import { Router } from 'express';
import { agora, auditar, json, transacao } from '../db.js';
import { gerarHashSenha, senhaProvisoria } from '../seguranca.js';
import { ehSupervisor, erro, exigirLogin, exigirSupervisor, usuarioPublico } from '../http.js';
import { buscarUsuario, criarUsuario, PAPEIS } from '../lib/usuarios.js';

const LIMITE_IMAGEM = 1.5 * 1024 * 1024; // ~1,5 MB por imagem (avatar, banner, assinatura)
const CHAVES_PREFERENCIA = /^(visitas|custos|portal)\.[a-z0-9_.-]{1,40}$/i;

function imagemOuVazio(v, campo) {
  if (v == null || v === '') return '';
  if (typeof v !== 'string') throw erro(400, `Imagem inválida em ${campo}.`);
  if (v.length > LIMITE_IMAGEM) throw erro(413, `Imagem muito grande em ${campo}.`);
  // o conteúdo inteiro precisa ser base64: impede injetar HTML/CSS por meio do campo de imagem
  if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw erro(400, `Imagem inválida em ${campo}.`);
  return v;
}

export function rotasUsuarios({ db, config }) {
  const r = Router();
  r.use(exigirLogin);

  /* ---------- equipe ---------- */
  r.get('/usuarios', (req, res) => {
    const sup = ehSupervisor(req);
    const linhas = db.prepare('SELECT * FROM usuarios ORDER BY nome').all();
    res.json({ usuarios: linhas.filter((u) => sup || u.ativo).map((u) => usuarioPublico(u, { comEmail: sup || u.id === req.usuario.id })) });
  });

  r.post('/usuarios', exigirSupervisor, async (req, res) => {
    const senha = senhaProvisoria();
    const { email, nome, cargo, papel } = req.body || {};
    const u = await criarUsuario(db, { email, nome, cargo, papel, senha, trocarSenha: true, dominios: config.organizacao.dominiosEmailPermitidos, criadoPor: req.usuario.id });
    res.status(201).json({ usuario: usuarioPublico(u), senhaProvisoria: senha });
  });

  r.patch('/usuarios/:id', exigirSupervisor, (req, res) => {
    const alvo = buscarUsuario(db, req.params.id);
    if (!alvo) throw erro(404, 'Usuário não encontrado.');
    const b = req.body || {};
    const novo = {
      nome: b.nome != null ? String(b.nome).trim() : alvo.nome,
      cargo: b.cargo != null ? String(b.cargo).trim() : alvo.cargo,
      papel: b.papel != null ? b.papel : alvo.papel,
      ativo: b.ativo != null ? (b.ativo ? 1 : 0) : alvo.ativo,
    };
    if (!novo.nome) throw erro(400, 'Informe o nome.');
    if (!PAPEIS.includes(novo.papel)) throw erro(400, 'Papel inválido.');
    transacao(db, () => {
      const perdeSupervisao = alvo.papel === 'supervisor' && (novo.papel !== 'supervisor' || !novo.ativo);
      if (perdeSupervisao) {
        const n = db.prepare("SELECT COUNT(*) n FROM usuarios WHERE papel = 'supervisor' AND ativo = 1 AND id <> ?").get(alvo.id).n;
        if (!n) throw erro(400, 'É preciso manter pelo menos um supervisor ativo.');
      }
      db.prepare('UPDATE usuarios SET nome = ?, cargo = ?, papel = ?, ativo = ?, atualizado_em = ? WHERE id = ?')
        .run(novo.nome, novo.cargo, novo.papel, novo.ativo, agora(), alvo.id);
      if (!novo.ativo || novo.papel !== alvo.papel) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(alvo.id);
      auditar(db, { usuarioId: req.usuario.id, acao: 'usuario.alterar', entidade: 'usuario', entidadeId: alvo.id, detalhe: { de: { papel: alvo.papel, ativo: !!alvo.ativo }, para: { papel: novo.papel, ativo: !!novo.ativo } } });
    });
    res.json({ usuario: usuarioPublico(buscarUsuario(db, alvo.id)) });
  });

  r.post('/usuarios/:id/redefinir-senha', exigirSupervisor, async (req, res) => {
    const alvo = buscarUsuario(db, req.params.id);
    if (!alvo) throw erro(404, 'Usuário não encontrado.');
    if (alvo.id === req.usuario.id) throw erro(400, 'Para trocar a sua própria senha use Perfil → Segurança.');
    const senha = senhaProvisoria();
    db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1, atualizado_em = ? WHERE id = ?').run(await gerarHashSenha(senha), agora(), alvo.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(alvo.id);
    auditar(db, { usuarioId: req.usuario.id, acao: 'usuario.redefinir_senha', entidade: 'usuario', entidadeId: alvo.id });
    res.json({ senhaProvisoria: senha });
  });

  /* ---------- perfil próprio ---------- */
  r.get('/eu/perfil', (req, res) => {
    const p = json(req.usuario.perfil);
    res.json({ usuario: usuarioPublico(req.usuario), perfil: { avatar: p.avatar || '', banner: p.banner || '', assinatura: p.assinatura || null, prefs: p.prefs || {} } });
  });

  r.patch('/eu/perfil', (req, res) => {
    const u = req.usuario;
    const b = req.body || {};
    const p = json(u.perfil);
    if ('avatar' in b) p.avatar = imagemOuVazio(b.avatar, 'avatar');
    if ('banner' in b) p.banner = imagemOuVazio(b.banner, 'banner');
    if ('assinatura' in b) {
      p.assinatura = b.assinatura
        ? { img: imagemOuVazio(b.assinatura.img, 'assinatura'), cpf: String(b.assinatura.cpf || '').replace(/\D/g, '').slice(0, 11) }
        : null;
    }
    if ('prefs' in b) {
      const txt = JSON.stringify(b.prefs || {});
      if (txt.length > 20000) throw erro(413, 'Preferências grandes demais.');
      p.prefs = b.prefs || {};
    }
    const nome = b.nome != null ? String(b.nome).trim() || u.nome : u.nome;
    const cargo = b.cargo != null ? String(b.cargo).trim() : u.cargo;
    db.prepare('UPDATE usuarios SET nome = ?, cargo = ?, perfil = ?, atualizado_em = ? WHERE id = ?').run(nome, cargo, JSON.stringify(p), agora(), u.id);
    const atualizado = buscarUsuario(db, u.id);
    res.json({ usuario: usuarioPublico(atualizado), perfil: { avatar: p.avatar || '', banner: p.banner || '', assinatura: p.assinatura || null, prefs: p.prefs || {} } });
  });

  /* ---------- preferências (por usuário) ---------- */
  r.get('/eu/preferencias/:chave', (req, res) => {
    if (!CHAVES_PREFERENCIA.test(req.params.chave)) throw erro(400, 'Chave inválida.');
    const l = db.prepare('SELECT dados FROM preferencias WHERE usuario_id = ? AND chave = ?').get(req.usuario.id, req.params.chave);
    res.json({ dados: l ? json(l.dados, null) : null });
  });

  r.put('/eu/preferencias/:chave', (req, res) => {
    if (!CHAVES_PREFERENCIA.test(req.params.chave)) throw erro(400, 'Chave inválida.');
    const txt = JSON.stringify(req.body?.dados ?? null);
    if (txt.length > 200000) throw erro(413, 'Preferências grandes demais.');
    db.prepare('INSERT INTO preferencias (usuario_id, chave, dados) VALUES (?, ?, ?) ON CONFLICT(usuario_id, chave) DO UPDATE SET dados = excluded.dados')
      .run(req.usuario.id, req.params.chave, txt);
    res.json({ ok: true });
  });

  /* ---------- organização (dados de configuração para usuários logados) ---------- */
  r.get('/organizacao', (req, res) => {
    const o = config.organizacao;
    res.json({
      organizacao: {
        nome: o.nome, unidade: o.unidade, cidade: o.cidade, setor: o.setor,
        empresaResponsavel: o.empresaResponsavel, empresasGrupo: o.empresasGrupo, revisoresPadrao: o.revisoresPadrao || [],
      },
    });
  });

  return r;
}
