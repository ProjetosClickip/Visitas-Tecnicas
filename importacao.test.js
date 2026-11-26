/**
 * Importação dos dados da versão antiga (backups JSON do navegador).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, json } from '../server/db.js';
import { criarUsuario } from '../server/lib/usuarios.js';
import { importarCustos, importarVisitas } from '../server/lib/importacao.js';

async function banco() {
  const db = abrirBanco(':memory:');
  const sup = await criarUsuario(db, { email: 'fulano@empresa.com.br', nome: 'Fulano Diretor', papel: 'supervisor', senha: 'senhaForte123', trocarSenha: false });
  const col = await criarUsuario(db, { email: 'colaboradora@empresa.com.br', nome: 'Colaboradora Teste', papel: 'colaborador', senha: 'senhaForte123', trocarSenha: false });
  return { db, sup, col };
}

const backupVisitas = {
  app: 'clickip-visitas', v: 2, equipe: true,
  users: [{ id: 'u_antigo1', name: 'Colaboradora', email: 'COLABORADORA@empresa.com.br' }, { id: 'u_antigo2', name: 'Sem Conta', email: 'semconta@empresa.com.br' }],
  visits: [
    { id: 'v_antiga1', userId: 'u_antigo1', type: 'cond', status: 'done', aprovacao: { por: 'Fulano Diretor' }, cli: { nome: 'Cond. A' }, updatedAt: '2026-05-01T10:00:00Z' },
    { id: 'v_antiga2', userId: 'u_antigo2', type: 'evt', status: 'draft', cli: { evento: 'Feira' } },
    { id: 'v_antiga3', userId: 'u_antigo1', type: 'invalido' },
  ],
};

test('visitas (supervisão/script): dono pelo e-mail do backup, status mantido e aprovação marcada como importada', async () => {
  const { db, sup, col } = await banco();
  const r = importarVisitas(db, backupVisitas, { modo: 'admin', importadorId: sup.id });
  assert.deepEqual([r.importadas, r.ignoradas], [1, 2]);
  assert.deepEqual(r.semConta, ['semconta@empresa.com.br']);
  const v = db.prepare('SELECT * FROM visitas WHERE id = ?').get('v_antiga1');
  assert.equal(v.dono_id, col.id);
  assert.equal(v.status, 'done');
  assert.equal(json(v.fluxo).aprovacao.importada, true);
  // reimportar o mesmo arquivo não duplica nem sobrescreve
  const r2 = importarVisitas(db, backupVisitas, { modo: 'admin', importadorId: sup.id });
  assert.equal(r2.importadas, 0);
});

test('visitas (colaborador): tudo para a própria conta e "Concluído" vira "Em andamento"', async () => {
  const { db, sup, col } = await banco();
  const r = importarVisitas(db, backupVisitas, { modo: 'colaborador', importadorId: col.id });
  assert.equal(r.importadas, 2);
  const v = db.prepare('SELECT * FROM visitas WHERE id = ?').get('v_antiga1');
  assert.equal(v.status, 'draft');
  assert.equal(json(v.fluxo).aprovacao, undefined);
  void sup;
});

test('custos (banco compartilhado antigo): projetos, prestadoras e aprovações ligadas ao supervisor', async () => {
  const { db, sup, col } = await banco();
  const antigo = {
    app: 'mensuracao-custos', tipo: 'banco-compartilhado', version: 4,
    users: [{ id: 'cu1', nome: 'Colaboradora', email: 'colaboradora@empresa.com.br', salt: 'x', hash: 'y' }],
    projects: [
      {
        id: 'proj_antigo1', ownerId: 'cu1', criadoEm: '2026-03-01T00:00:00Z', info: { nome: 'Rede X' },
        materiais: [{ nome: 'Cabo', quantidade: 10, valorUnitario: 2 }], servicos: [],
        historico: [{ em: '2026-03-01T00:00:00Z', uid: 'cu1', nome: 'Colaboradora', acao: 'Projeto criado' }],
        aprovacoes: {
          'fulano-diretor': { status: 'aprovado', em: '2026-03-02T00:00:00Z', porNome: 'Fulano Diretor', total: 20 },
          'ciclano-supervisor': { status: 'aprovado', em: '2026-03-02T00:00:00Z', porNome: 'Ciclano Supervisor', total: 20 },
          'beltrana-supervisora': { status: 'revogado', em: '2026-03-03T00:00:00Z' },
        },
      },
      { id: 'proj_antigo2', ownerId: 'cu1', excluido: true, info: {} },
    ],
    prestadoras: [{ id: 'prest1', nome: 'Prestadora Y', precos: [] }],
    catalogo: [{ codigo: '1', descricao: 'Item', valor: 3 }],
  };
  const r = importarCustos(db, antigo, { importadorId: sup.id, incluirCatalogo: true });
  assert.equal(r.projetos, 1);
  assert.equal(r.ignorados, 1);
  assert.equal(r.prestadoras, 1);
  assert.equal(r.aprovacoes, 1);
  assert.deepEqual(r.aprovacoesSemSupervisor, ['Ciclano Supervisor']);
  assert.equal(r.catalogo, 1);
  const p = db.prepare('SELECT * FROM projetos_custos WHERE id = ?').get('proj_antigo1');
  assert.equal(p.dono_id, col.id);
  const d = json(p.dados);
  assert.equal(d.historico.at(-1).acao, 'Projeto importado da versão anterior');
  assert.equal(d.aprovacoes, undefined);
  const ap = db.prepare('SELECT * FROM aprovacoes_custos WHERE projeto_id = ?').all('proj_antigo1');
  assert.equal(ap[0].usuario_id, sup.id);
});
