/**
 * Importação dos dados da versão antiga (salvos no navegador de cada pessoa).
 * Usada pela tela (POST /api/visitas/importar) e pelo script `npm run importar:legado`.
 *
 * Modos:
 *  - 'colaborador': tudo vai para a própria conta; "Concluído" vira "Em andamento" (não havia como
 *     verificar as aprovações antigas).
 *  - 'supervisor': o dono é a conta com o e-mail que consta no backup; mantém o status.
 *  - 'admin' (script no servidor): como 'supervisor', com uma conta padrão para quem não tiver e-mail.
 */
import { agora, auditar, transacao } from '../db.js';
import { novoId } from '../seguranca.js';
import { buscarPorEmail, mapaNomes, slug } from './usuarios.js';
import { TIPOS, idValido, limparDados } from './visitas.js';
import { limparProjeto, registrarAcoes } from './custos.js';

function donoPorBackup({ db, usuariosBackup, idBackup, modo, importadorId, donoPadraoId }) {
  if (modo === 'colaborador') return { id: importadorId };
  const bu = usuariosBackup.find((x) => x && x.id === idBackup) || (usuariosBackup.length === 1 ? usuariosBackup[0] : null);
  const conta = bu && bu.email ? buscarPorEmail(db, bu.email) : null;
  if (conta) return { id: conta.id };
  if (modo === 'admin' && donoPadraoId) return { id: donoPadraoId };
  return { semConta: (bu && bu.email) || '(sem e-mail no backup)' };
}

export function importarVisitas(db, backup, { modo, importadorId, donoPadraoId = null }) {
  if (!backup || !Array.isArray(backup.visits)) throw new Error('Arquivo de backup inválido (sem lista de visitas).');
  const usuariosBackup = backup.users || (backup.user ? [backup.user] : []);
  const sel = db.prepare('SELECT * FROM visitas WHERE id = ?');
  const rel = { importadas: 0, atualizadas: 0, ignoradas: 0, semConta: [] };
  const confiavel = modo !== 'colaborador';
  transacao(db, () => {
    for (const doc of backup.visits) {
      if (!doc || !TIPOS.includes(doc.type)) { rel.ignoradas++; continue; }
      const dono = donoPorBackup({ db, usuariosBackup, idBackup: doc.userId, modo, importadorId, donoPadraoId });
      if (!dono.id) { if (!rel.semConta.includes(dono.semConta)) rel.semConta.push(dono.semConta); rel.ignoradas++; continue; }
      const existente = idValido(doc.id) ? sel.get(doc.id) : null;
      if (existente && existente.dono_id !== dono.id && !confiavel) { rel.ignoradas++; continue; }
      if (existente && String(doc.updatedAt || '') <= existente.atualizado_em) { rel.ignoradas++; continue; }
      let status = ['draft', 'pending', 'done'].includes(doc.status) ? doc.status : 'draft';
      if (status === 'done' && !confiavel) status = 'draft';
      const fluxo = { importado: { em: agora(), por: importadorId } };
      if (status === 'done' && doc.aprovacao) fluxo.aprovacao = { ...doc.aprovacao, importada: true };
      if (status === 'pending' && doc.enviadoEm) fluxo.enviadoEm = doc.enviadoEm;
      if (doc.devolucao && status === 'draft') fluxo.devolucao = doc.devolucao;
      const t = agora();
      const dados = JSON.stringify(limparDados(doc));
      if (existente) {
        db.prepare('UPDATE visitas SET dados = ?, status = ?, fluxo = ?, versao = versao + 1, atualizado_em = ?, atualizado_por = ? WHERE id = ?')
          .run(dados, status, JSON.stringify(fluxo), t, importadorId, existente.id);
        rel.atualizadas++;
      } else {
        db.prepare('INSERT INTO visitas (id, dono_id, tipo, status, dados, fluxo, versao, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
          .run(idValido(doc.id) ? doc.id : novoId('v'), dono.id, doc.type, status, dados, JSON.stringify(fluxo), doc.createdAt || t, t, importadorId);
        rel.importadas++;
      }
    }
    auditar(db, { usuarioId: importadorId, acao: 'visitas.importar', detalhe: { modo, ...rel } });
  });
  return rel;
}

/**
 * Mensuração de Custos: aceita o banco compartilhado (.json), o backup "dos meus projetos"
 * ou um projeto exportado. Aprovações antigas são vinculadas ao supervisor cujo nome corresponde
 * à chave antiga (ex.: "paulo-farias") ou ao nome registrado na aprovação.
 */
export function importarCustos(db, backup, { importadorId, donoPadraoId = null, incluirCatalogo = false }) {
  let projetos = [];
  if (Array.isArray(backup?.projects)) projetos = backup.projects;
  else if (backup?.project) projetos = [backup.project];
  else if (backup?.info && (backup.materiais || backup.servicos)) projetos = [backup];
  else throw new Error('Arquivo não reconhecido como dados da Mensuração de Custos.');
  const usuariosBackup = backup.users || [];
  const supervisores = db.prepare("SELECT id, nome FROM usuarios WHERE papel = 'supervisor'").all();
  const supPorChave = (chave, nome) => supervisores.find((s) => slug(s.nome) === chave || slug(s.nome) === slug(nome));
  const nomes = mapaNomes(db);
  const rel = { projetos: 0, ignorados: 0, prestadoras: 0, aprovacoes: 0, aprovacoesSemSupervisor: [], semConta: [], catalogo: 0 };
  const selProj = db.prepare('SELECT 1 FROM projetos_custos WHERE id = ?');
  transacao(db, () => {
    for (const p of projetos) {
      if (!p || p.excluido) { rel.ignorados++; continue; }
      const idDono = p.ownerId || (p.criadoPor && p.criadoPor.uid);
      const bu = usuariosBackup.find((u) => u.id === idDono);
      let conta = bu && bu.email ? buscarPorEmail(db, bu.email) : null;
      if (!conta && donoPadraoId) conta = { id: donoPadraoId };
      if (!conta) { const e = (bu && bu.email) || (p.criadoPor && p.criadoPor.nome) || '(desconhecido)'; if (!rel.semConta.includes(e)) rel.semConta.push(e); rel.ignorados++; continue; }
      const id = idValido(p.id) && !selProj.get(p.id) ? p.id : novoId('p');
      const t = agora();
      const dados = limparProjeto(p);
      dados.criadoEm = p.criadoEm || t;
      // mantém o histórico antigo como registro, e marca a importação
      dados.historico = registrarAcoes(Array.isArray(p.historico) ? p.historico : [], ['Projeto importado da versão anterior'], { id: importadorId, nome: nomes[importadorId] || 'Importação' }, t);
      db.prepare('INSERT INTO projetos_custos (id, dono_id, dados, versao, conteudo_alterado_em, criado_em, atualizado_em, atualizado_por) VALUES (?, ?, ?, 1, ?, ?, ?, ?)')
        .run(id, conta.id, JSON.stringify(dados), p.conteudoAlteradoEm || null, dados.criadoEm, t, importadorId);
      rel.projetos++;
      for (const [chave, reg] of Object.entries(p.aprovacoes || {})) {
        if (!reg || reg.status !== 'aprovado') continue;
        const sup = supPorChave(chave, reg.porNome);
        if (!sup) { const n = reg.porNome || chave; if (!rel.aprovacoesSemSupervisor.includes(n)) rel.aprovacoesSemSupervisor.push(n); continue; }
        db.prepare('INSERT OR REPLACE INTO aprovacoes_custos (projeto_id, usuario_id, em, obs, total) VALUES (?, ?, ?, ?, ?)')
          .run(id, sup.id, reg.em || t, String(reg.obs || '') + ' (importada da versão anterior)', Number(reg.total) || 0);
        rel.aprovacoes++;
      }
    }
    for (const pr of backup.prestadoras || []) {
      if (!pr || !idValido(pr.id) || db.prepare('SELECT 1 FROM prestadoras WHERE id = ?').get(pr.id)) continue;
      const { id, ...resto } = pr;
      db.prepare('INSERT INTO prestadoras (id, dados, versao, atualizado_em, atualizado_por) VALUES (?, ?, 1, ?, ?)').run(id, JSON.stringify(resto), agora(), importadorId);
      rel.prestadoras++;
    }
    if (incluirCatalogo && Array.isArray(backup.catalogo) && backup.catalogo.length) {
      db.prepare(`INSERT INTO documentos (chave, dados, versao, atualizado_em, atualizado_por) VALUES ('custos.catalogo', ?, 1, ?, ?)
                  ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados, versao = documentos.versao + 1, atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`)
        .run(JSON.stringify({ itens: backup.catalogo, fonte: 'Importado da versão anterior' }), agora(), importadorId);
      rel.catalogo = backup.catalogo.length;
    }
    auditar(db, { usuarioId: importadorId, acao: 'custos.importar', detalhe: rel });
  });
  return rel;
}
