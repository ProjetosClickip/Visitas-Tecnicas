/**
 * Mensuração de Custos.
 * - Projetos: o colaborador vê os próprios; a supervisão vê todos (valores incluídos).
 * - Aprovação: registrada pelo servidor em nome do supervisor logado (não há lista fixa de e-mails).
 * - Histórico: escrito pelo servidor a partir das ações informadas pelo navegador.
 * - Prestadoras, catálogo e configurações são compartilhados pela equipe, com controle de versão.
 */
import fs from 'node:fs';
import { Router } from 'express';
import { agora, auditar, json, transacao } from '../db.js';
import { novoId } from '../seguranca.js';
import { ehSupervisor, erro, exigirLogin, exigirSupervisor } from '../http.js';
import { mapaNomes, supervisoresAtivos } from '../lib/usuarios.js';
import { idValido } from '../lib/visitas.js';
import { assinaturaConteudo, limparProjeto, montarProjeto, registrarAcoes, totais } from '../lib/custos.js';

const acoesDe = (b) => (Array.isArray(b?.acoes) ? b.acoes.slice(0, 50) : []);

export function rotasCustos({ db, config }) {
  const r = Router();
  r.use(exigirLogin);

  const selProj = db.prepare('SELECT * FROM projetos_custos WHERE id = ?');
  const selAprov = db.prepare('SELECT * FROM aprovacoes_custos WHERE projeto_id = ? ORDER BY em');

  const montar = (linha, nomes = mapaNomes(db)) => montarProjeto(linha, selAprov.all(linha.id), nomes);

  function carregar(req, id) {
    const p = selProj.get(id);
    if (!p || (p.dono_id !== req.usuario.id && !ehSupervisor(req))) throw erro(404, 'Projeto não encontrado.');
    return p;
  }

  function lerDocumento(chave, padrao) {
    const l = db.prepare('SELECT * FROM documentos WHERE chave = ?').get(chave);
    return l ? { dados: json(l.dados, padrao), versao: l.versao, atualizadoEm: l.atualizado_em } : { dados: padrao, versao: 0, atualizadoEm: null };
  }

  function gravarDocumento(req, chave, dados, versao) {
    return transacao(db, () => {
      const l = db.prepare('SELECT versao FROM documentos WHERE chave = ?').get(chave);
      const atual = l ? l.versao : 0;
      if (Number(versao) !== atual) throw erro(409, 'Outra pessoa alterou estes dados. Recarregue a página.', { codigo: 'CONFLITO' });
      const t = agora();
      db.prepare(`INSERT INTO documentos (chave, dados, versao, atualizado_em, atualizado_por) VALUES (?, ?, 1, ?, ?)
                  ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, versao = documentos.versao + 1, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`)
        .run(chave, JSON.stringify(dados), t, req.usuario.id);
      auditar(db, { usuarioId: req.usuario.id, acao: `documento.gravar`, entidade: 'documento', entidadeId: chave });
      return lerDocumento(chave, null);
    });
  }

  /* ---------- carga inicial do subsistema ---------- */
  r.get('/inicial', (req, res) => {
    const nomes = mapaNomes(db);
    const linhas = ehSupervisor(req)
      ? db.prepare('SELECT * FROM projetos_custos ORDER BY atualizado_em DESC').all()
      : db.prepare('SELECT * FROM projetos_custos WHERE dono_id = ? ORDER BY atualizado_em DESC').all(req.usuario.id);
    res.json({
      projetos: linhas.map((l) => montar(l, nomes)),
      prestadoras: db.prepare('SELECT * FROM prestadoras').all().map((p) => ({ ...json(p.dados), id: p.id, versao: p.versao })),
      catalogo: lerDocumento('custos.catalogo', { itens: [], fonte: '' }),
      config: lerDocumento('custos.config', {}),
      aprovadores: supervisoresAtivos(db).map((u) => ({ id: u.id, nome: u.nome, cargo: u.cargo })),
      usuarios: Object.entries(nomes).map(([id, nome]) => ({ id, nome })),
      organizacao: {
        nome: config.organizacao.nome, cidade: config.organizacao.cidade, setor: config.organizacao.setor,
        empresaResponsavel: config.organizacao.empresaResponsavel, empresasGrupo: config.organizacao.empresasGrupo,
      },
    });
  });

  /* ---------- projetos ---------- */
  r.post('/projetos', (req, res) => {
    const doc = req.body?.projeto || {};
    const id = idValido(doc.id) && !selProj.get(doc.id) ? doc.id : novoId('p');
    const t = agora();
    const dados = limparProjeto(doc);
    dados.criadoEm = t;
    dados.historico = registrarAcoes([], ['Projeto criado', ...acoesDe(req.body).filter((a) => a !== 'Projeto criado')], req.usuario, t);
    db.prepare('INSERT INTO projetos_custos (id, dono_id, dados, versao, conteudo_alterado_em, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, ?, 1, ?, ?, ?, ?)')
      .run(id, req.usuario.id, JSON.stringify(dados), t, t, t, req.usuario.id);
    auditar(db, { usuarioId: req.usuario.id, acao: 'custos.projeto_criar', entidade: 'projeto', entidadeId: id });
    res.status(201).json({ projeto: montar(selProj.get(id)) });
  });

  r.put('/projetos/:id', (req, res) => {
    const { projeto: doc, versao } = req.body || {};
    if (!doc || typeof doc !== 'object') throw erro(400, 'Projeto ausente.');
    transacao(db, () => {
      const p = carregar(req, req.params.id);
      if (Number(versao) !== p.versao) {
        throw erro(409, 'Este projeto foi alterado por outra pessoa depois que você o abriu.', { codigo: 'CONFLITO', atual: montar(p) });
      }
      const salvo = json(p.dados);
      const dados = limparProjeto(doc);
      dados.criadoEm = salvo.criadoEm || p.criado_em;
      const t = agora();
      const mudou = assinaturaConteudo(dados) !== assinaturaConteudo(salvo);
      dados.historico = registrarAcoes(salvo.historico, mudou ? acoesDe(req.body) : [], req.usuario, t);
      db.prepare('UPDATE projetos_custos SET dados = ?, versao = versao + 1, conteudo_alterado_em = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
        .run(JSON.stringify(dados), mudou ? t : p.conteudo_alterado_em, t, req.usuario.id, p.id);
    });
    res.json({ projeto: montar(selProj.get(req.params.id)) });
  });

  r.delete('/projetos/:id', (req, res) => {
    const p = carregar(req, req.params.id);
    db.prepare('DELETE FROM projetos_custos WHERE id = ?').run(p.id);
    auditar(db, { usuarioId: req.usuario.id, acao: 'custos.projeto_excluir', entidade: 'projeto', entidadeId: p.id, detalhe: { nome: json(p.dados).info?.nome } });
    res.json({ ok: true });
  });

  /* ---------- aprovação (somente supervisão, sempre em nome de quem está logado) ---------- */
  r.post('/projetos/:id/aprovacao', exigirSupervisor, (req, res) => {
    const u = req.usuario;
    transacao(db, () => {
      const p = carregar(req, req.params.id);
      const dados = json(p.dados);
      const t = agora();
      const total = totais(dados).total;
      db.prepare(`INSERT INTO aprovacoes_custos (projeto_id, usuario_id, em, obs, total) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(projeto_id, usuario_id) DO UPDATE SET em = excluded.em, obs = excluded.obs, total = excluded.total`)
        .run(p.id, u.id, t, String(req.body?.obs || '').trim().slice(0, 2000), total);
      dados.historico = registrarAcoes(dados.historico, [`Projeto aprovado por ${u.nome}${u.cargo ? ` (${u.cargo})` : ''}`], u, t);
      // aprovação não muda o conteúdo: a versão fica igual para não gerar conflito com quem está editando
      db.prepare('UPDATE projetos_custos SET dados = ?, atualizado_em = ? WHERE id = ?').run(JSON.stringify(dados), t, p.id);
      auditar(db, { usuarioId: u.id, acao: 'custos.aprovar', entidade: 'projeto', entidadeId: p.id, detalhe: { total } });
    });
    res.json({ projeto: montar(selProj.get(req.params.id)) });
  });

  r.delete('/projetos/:id/aprovacao', exigirSupervisor, (req, res) => {
    const u = req.usuario;
    transacao(db, () => {
      const p = carregar(req, req.params.id);
      const n = db.prepare('DELETE FROM aprovacoes_custos WHERE projeto_id = ? AND usuario_id = ?').run(p.id, u.id).changes;
      if (!n) throw erro(400, 'Você não aprovou este projeto.');
      const dados = json(p.dados);
      const t = agora();
      dados.historico = registrarAcoes(dados.historico, [`Aprovação revogada por ${u.nome}${u.cargo ? ` (${u.cargo})` : ''}`], u, t);
      // aprovação não muda o conteúdo: a versão fica igual para não gerar conflito com quem está editando
      db.prepare('UPDATE projetos_custos SET dados = ?, atualizado_em = ? WHERE id = ?').run(JSON.stringify(dados), t, p.id);
      auditar(db, { usuarioId: u.id, acao: 'custos.revogar', entidade: 'projeto', entidadeId: p.id });
    });
    res.json({ projeto: montar(selProj.get(req.params.id)) });
  });

  /* ---------- prestadoras (compartilhadas) ---------- */
  r.put('/prestadoras/:id', (req, res) => {
    const id = req.params.id;
    if (!idValido(id)) throw erro(400, 'Identificador inválido.');
    const doc = { ...(req.body?.prestadora || {}) };
    delete doc.id;
    delete doc.versao;
    const versao = Number(req.body?.versao || 0);
    transacao(db, () => {
      const l = db.prepare('SELECT versao FROM prestadoras WHERE id = ?').get(id);
      if ((l ? l.versao : 0) !== versao) throw erro(409, 'Esta prestadora foi alterada por outra pessoa. Recarregue a página.', { codigo: 'CONFLITO' });
      const t = agora();
      db.prepare(`INSERT INTO prestadoras (id, dados, versao, atualizado_em, atualizado_por) VALUES (?, ?, 1, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET dados = excluded.dados, versao = prestadoras.versao + 1, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`)
        .run(id, JSON.stringify(doc), t, req.usuario.id);
      auditar(db, { usuarioId: req.usuario.id, acao: 'custos.prestadora_gravar', entidade: 'prestadora', entidadeId: id });
    });
    const p = db.prepare('SELECT * FROM prestadoras WHERE id = ?').get(id);
    res.json({ prestadora: { ...json(p.dados), id: p.id, versao: p.versao } });
  });

  r.delete('/prestadoras/:id', (req, res) => {
    db.prepare('DELETE FROM prestadoras WHERE id = ?').run(req.params.id);
    auditar(db, { usuarioId: req.usuario.id, acao: 'custos.prestadora_excluir', entidade: 'prestadora', entidadeId: req.params.id });
    res.json({ ok: true });
  });

  /* ---------- catálogo e configurações (compartilhados) ---------- */
  r.put('/catalogo', (req, res) => {
    const itens = req.body?.itens;
    if (!Array.isArray(itens)) throw erro(400, 'Lista de itens ausente.');
    const limpos = itens.slice(0, 50000).map((x) => ({
      codigo: String(x.codigo ?? '').slice(0, 60), descricao: String(x.descricao ?? '').slice(0, 500), unidade: String(x.unidade ?? '').slice(0, 40),
      valor: Number(x.valor) || 0, tabela: String(x.tabela ?? '').slice(0, 10), fonte: String(x.fonte ?? '').slice(0, 200),
    }));
    res.json({ catalogo: gravarDocumento(req, 'custos.catalogo', { itens: limpos, fonte: String(req.body?.fonte || '').slice(0, 200) }, req.body?.versao) });
  });

  /** Restaura o catálogo a partir do arquivo inicial (data/catalogo-inicial.json). Somente supervisão. */
  r.post('/catalogo/restaurar', exigirSupervisor, (req, res) => {
    const arq = config.arquivoCatalogoInicial;
    if (!arq || !fs.existsSync(arq)) throw erro(404, 'Arquivo do catálogo inicial não encontrado no servidor.');
    const c = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const itens = (c.itens || []).map((x) => ({ ...x, fonte: x.fonte || c.fonte || '' }));
    const atual = lerDocumento('custos.catalogo', null);
    res.json({ catalogo: gravarDocumento(req, 'custos.catalogo', { itens, fonte: c.fonte || '' }, atual.versao) });
  });

  r.put('/config', (req, res) => {
    const dados = req.body?.dados;
    if (!dados || typeof dados !== 'object' || JSON.stringify(dados).length > 100000) throw erro(400, 'Configuração inválida.');
    res.json({ config: gravarDocumento(req, 'custos.config', dados, req.body?.versao) });
  });

  return r;
}
