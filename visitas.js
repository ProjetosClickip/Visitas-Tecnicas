/**
 * Visitas técnicas.
 * - O colaborador vê e edita as próprias visitas; a supervisão vê e edita todas.
 * - Status "Concluído" só é atribuído pela rota de aprovação (somente supervisão).
 * - Cada gravação informa a versão que foi carregada; se outra pessoa salvou antes, responde 409.
 */
import { Router } from 'express';
import { agora, auditar, json, transacao } from '../db.js';
import { conferirSenha, novoId } from '../seguranca.js';
import { ehSupervisor, erro, exigirLogin, exigirSupervisor } from '../http.js';
import { mapaNomes, perfilDe } from '../lib/usuarios.js';
import { importarVisitas } from '../lib/importacao.js';
import {
  TIPOS, codigoVerificacao, hashConteudo, idValido, limparDados, mascararCpf, montarVisita,
} from '../lib/visitas.js';

export function rotasVisitas({ db }) {
  const r = Router();
  r.use(exigirLogin);

  const sel = db.prepare('SELECT * FROM visitas WHERE id = ?');

  function carregar(req, id, { paraEditar = false } = {}) {
    const v = sel.get(id);
    if (!v) throw erro(404, 'Visita não encontrada.');
    if (v.dono_id !== req.usuario.id && !ehSupervisor(req)) {
      throw erro(paraEditar ? 403 : 404, paraEditar ? 'Você não pode alterar esta visita.' : 'Visita não encontrada.');
    }
    return v;
  }

  const responder = (res, id, extra = {}) => res.json({ visita: montarVisita(sel.get(id), { nomes: mapaNomes(db) }), ...extra });

  /* Mudanças de fluxo (enviar, aprovar, devolver, assinar) não alteram o conteúdo, então não mudam a versão:
     quem estiver com a visita aberta continua podendo salvar (e, se for o colaborador alterando uma visita
     aprovada, a regra do PUT devolve o status para "Em andamento"). */
  function gravarFluxo(id, status, fluxo, usuarioId) {
    db.prepare('UPDATE visitas SET status = ?, fluxo = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
      .run(status, JSON.stringify(fluxo), agora(), usuarioId, id);
  }

  /* ---------- leitura ---------- */
  r.get('/', (req, res) => {
    const todas = req.query.escopo === 'todas';
    if (todas && !ehSupervisor(req)) throw erro(403, 'Acesso restrito à supervisão.');
    const linhas = todas
      ? db.prepare('SELECT * FROM visitas ORDER BY atualizado_em DESC').all()
      : db.prepare('SELECT * FROM visitas WHERE dono_id = ? ORDER BY atualizado_em DESC').all(req.usuario.id);
    const nomes = mapaNomes(db);
    res.json({ visitas: linhas.map((l) => montarVisita(l, { lite: true, nomes })) });
  });

  r.get('/exportar', (req, res) => {
    const todas = ehSupervisor(req) && req.query.escopo === 'todas';
    const linhas = todas
      ? db.prepare('SELECT * FROM visitas').all()
      : db.prepare('SELECT * FROM visitas WHERE dono_id = ?').all(req.usuario.id);
    const nomes = mapaNomes(db);
    const usuarios = db.prepare('SELECT id, nome, email, cargo FROM usuarios').all()
      .filter((u) => todas || u.id === req.usuario.id)
      .map((u) => ({ id: u.id, name: u.nome, email: u.email, role: u.cargo }));
    auditar(db, { usuarioId: req.usuario.id, acao: 'visitas.exportar', detalhe: { n: linhas.length, todas } });
    res.json({ app: 'clickip-visitas', v: 3, exportadoEm: agora(), users: usuarios, visits: linhas.map((l) => montarVisita(l, { nomes })) });
  });

  r.get('/:id', (req, res) => {
    const v = carregar(req, req.params.id);
    res.json({ visita: montarVisita(v, { nomes: mapaNomes(db) }) });
  });

  /* ---------- criação e edição ---------- */
  r.post('/', (req, res) => {
    const doc = req.body?.visita || {};
    if (!TIPOS.includes(doc.type)) throw erro(400, 'Tipo de visita inválido.');
    const id = idValido(doc.id) && !sel.get(doc.id) ? doc.id : novoId('v');
    const t = agora();
    db.prepare('INSERT INTO visitas (id, dono_id, tipo, status, dados, fluxo, versao, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
      .run(id, req.usuario.id, doc.type, 'draft', JSON.stringify(limparDados(doc)), '{}', t, t, req.usuario.id);
    auditar(db, { usuarioId: req.usuario.id, acao: 'visita.criar', entidade: 'visita', entidadeId: id });
    res.status(201);
    responder(res, id);
  });

  r.put('/:id', (req, res) => {
    const { visita: doc, versao } = req.body || {};
    if (!doc || typeof doc !== 'object') throw erro(400, 'Documento ausente.');
    if (doc._lite) throw erro(400, 'Documento incompleto (versão resumida) não pode ser salvo.');
    let statusAlterado = false;
    transacao(db, () => {
      const v = carregar(req, req.params.id, { paraEditar: true });
      if (Number(versao) !== v.versao) {
        throw erro(409, 'Esta visita foi alterada por outra pessoa depois que você a abriu.', {
          codigo: 'CONFLITO', atual: montarVisita(v, { nomes: mapaNomes(db) }),
        });
      }
      const dados = limparDados(doc);
      const fluxo = json(v.fluxo);
      let status = v.status;
      const mudou = hashConteudo(dados) !== hashConteudo(json(v.dados));
      // relatório aprovado alterado pelo colaborador volta para "Em andamento"
      if (mudou && status === 'done' && !ehSupervisor(req)) {
        status = 'draft';
        delete fluxo.aprovacao;
        statusAlterado = true;
      }
      if (mudou && fluxo.assinatura && fluxo.assinatura.hash !== hashConteudo(dados)) fluxo.assinatura.valida = false;
      db.prepare('UPDATE visitas SET dados = ?, status = ?, fluxo = ?, versao = versao + 1, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
        .run(JSON.stringify(dados), status, JSON.stringify(fluxo), agora(), req.usuario.id, v.id);
    });
    responder(res, req.params.id, { statusAlterado });
  });

  r.delete('/:id', (req, res) => {
    const v = carregar(req, req.params.id, { paraEditar: true });
    db.prepare('DELETE FROM visitas WHERE id = ?').run(v.id);
    auditar(db, { usuarioId: req.usuario.id, acao: 'visita.excluir', entidade: 'visita', entidadeId: v.id, detalhe: { dono: v.dono_id, tipo: v.tipo } });
    res.json({ ok: true });
  });

  r.post('/:id/duplicar', (req, res) => {
    const v = carregar(req, req.params.id);
    const dados = json(v.dados);
    dados.cli = { ...(dados.cli || {}), nome: ((dados.cli && dados.cli.nome) || '') + ' (cópia)' };
    const id = novoId('v');
    const t = agora();
    db.prepare('INSERT INTO visitas (id, dono_id, tipo, status, dados, fluxo, versao, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
      .run(id, req.usuario.id, v.tipo, 'draft', JSON.stringify(dados), '{}', t, t, req.usuario.id);
    auditar(db, { usuarioId: req.usuario.id, acao: 'visita.duplicar', entidade: 'visita', entidadeId: id, detalhe: { origem: v.id } });
    res.status(201);
    responder(res, id);
  });

  /* ---------- fluxo de aprovação ---------- */
  r.post('/:id/status', (req, res) => {
    const novo = req.body?.status;
    if (!['draft', 'pending'].includes(novo)) throw erro(400, 'Status inválido (a conclusão é feita pela aprovação da supervisão).');
    transacao(db, () => {
      const v = carregar(req, req.params.id, { paraEditar: true });
      const fluxo = json(v.fluxo);
      if (novo === 'pending') {
        fluxo.enviadoEm = agora();
        delete fluxo.devolucao;
      }
      delete fluxo.aprovacao;
      gravarFluxo(v.id, novo, fluxo, req.usuario.id);
      auditar(db, { usuarioId: req.usuario.id, acao: novo === 'pending' ? 'visita.enviar' : 'visita.reabrir', entidade: 'visita', entidadeId: v.id });
    });
    responder(res, req.params.id);
  });

  r.post('/:id/aprovar', exigirSupervisor, (req, res) => {
    transacao(db, () => {
      const v = carregar(req, req.params.id);
      const fluxo = json(v.fluxo);
      const u = req.usuario;
      fluxo.aprovacao = { por: u.nome, usuarioId: u.id, email: u.email, cargo: u.cargo, em: agora(), obs: String(req.body?.obs || '').trim().slice(0, 2000) };
      delete fluxo.devolucao;
      gravarFluxo(v.id, 'done', fluxo, u.id);
      auditar(db, { usuarioId: u.id, acao: 'visita.aprovar', entidade: 'visita', entidadeId: v.id });
    });
    responder(res, req.params.id);
  });

  r.post('/:id/devolver', exigirSupervisor, (req, res) => {
    const motivo = String(req.body?.motivo || '').trim();
    if (!motivo) throw erro(400, 'Informe o motivo da devolução.');
    transacao(db, () => {
      const v = carregar(req, req.params.id);
      const fluxo = json(v.fluxo);
      fluxo.devolucao = { por: req.usuario.nome, usuarioId: req.usuario.id, em: agora(), motivo: motivo.slice(0, 2000) };
      delete fluxo.aprovacao;
      gravarFluxo(v.id, 'draft', fluxo, req.usuario.id);
      auditar(db, { usuarioId: req.usuario.id, acao: 'visita.devolver', entidade: 'visita', entidadeId: v.id });
    });
    responder(res, req.params.id);
  });

  /* ---------- assinatura eletrônica (confirmada com a senha da conta) ---------- */
  r.post('/:id/assinar', async (req, res) => {
    const u = req.usuario;
    if (!(await conferirSenha(String(req.body?.senha || ''), u.senha_hash))) throw erro(400, 'Senha incorreta.');
    const sg = perfilDe(u).assinatura;
    if (!sg || !sg.img) throw erro(400, 'Cadastre a sua assinatura em Perfil antes de assinar.');
    transacao(db, () => {
      const v = carregar(req, req.params.id, { paraEditar: true });
      if (Number(req.body?.versao) !== v.versao) throw erro(409, 'Salve ou recarregue a visita antes de assinar.', { codigo: 'CONFLITO' });
      const fluxo = json(v.fluxo);
      const em = agora();
      const hash = hashConteudo(json(v.dados));
      fluxo.assinatura = { userId: u.id, nome: u.nome, cargo: u.cargo, cpf: mascararCpf(sg.cpf), em, img: sg.img, hash, codigo: codigoVerificacao(hash, u.id, em), valida: true };
      gravarFluxo(v.id, v.status, fluxo, u.id);
      auditar(db, { usuarioId: u.id, acao: 'visita.assinar', entidade: 'visita', entidadeId: v.id, detalhe: { hash } });
    });
    responder(res, req.params.id);
  });

  r.delete('/:id/assinatura', (req, res) => {
    transacao(db, () => {
      const v = carregar(req, req.params.id, { paraEditar: true });
      const fluxo = json(v.fluxo);
      delete fluxo.assinatura;
      gravarFluxo(v.id, v.status, fluxo, req.usuario.id);
      auditar(db, { usuarioId: req.usuario.id, acao: 'visita.remover_assinatura', entidade: 'visita', entidadeId: v.id });
    });
    responder(res, req.params.id);
  });

  /* ---------- importação de backups do sistema antigo ---------- */
  r.post('/importar', (req, res) => {
    try {
      res.json(importarVisitas(db, req.body, { modo: ehSupervisor(req) ? 'supervisor' : 'colaborador', importadorId: req.usuario.id }));
    } catch (e) {
      if (e.status) throw e;
      throw erro(400, e.message);
    }
  });

  return r;
}
