/**
 * Testes do servidor: autenticação, papéis, fluxo de aprovação, proteção contra dados forjados
 * pelo navegador, controle de versão e painel público.
 *   npm test
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig } from '../server/config.js';
import { abrirBanco } from '../server/db.js';
import { criarApp } from '../server/app.js';
import { criarUsuario } from '../server/lib/usuarios.js';

const SENHA = 'senhaForte123';
const IMG = 'data:image/png;base64,' + 'A'.repeat(5000);

let servidor, base, db;

before(async () => {
  const config = carregarConfig({
    arquivoBanco: ':memory:',
    porta: 0,
    cookieSeguro: false,
    arquivoCatalogoInicial: null,
    organizacao: { painelPublico: true, dominiosEmailPermitidos: ['empresa.com.br'] },
  });
  config.pastaWeb = '/nao-existe';
  db = abrirBanco(':memory:');
  await criarUsuario(db, { email: 'sup@empresa.com.br', nome: 'Supervisora Teste', cargo: 'Supervisão', papel: 'supervisor', senha: SENHA, trocarSenha: false });
  await criarUsuario(db, { email: 'colab@empresa.com.br', nome: 'Colaborador Teste', papel: 'colaborador', senha: SENHA, trocarSenha: false });
  await criarUsuario(db, { email: 'outro@empresa.com.br', nome: 'Outro Colaborador', papel: 'colaborador', senha: SENHA, trocarSenha: false });
  await criarUsuario(db, { email: 'novo@empresa.com.br', nome: 'Novato', papel: 'colaborador', senha: SENHA, trocarSenha: true });
  await criarUsuario(db, { email: 'terceiro@empresa.com.br', nome: 'Terceiro', papel: 'colaborador', senha: SENHA, trocarSenha: false });
  const app = criarApp({ db, config });
  await new Promise((ok) => { servidor = app.listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
  servidor.close();
  db.close();
});

/** Cliente HTTP com cookie de sessão (como o navegador). */
function cliente() {
  let cookie = '';
  async function chamar(metodo, url, corpo, cab = {}) {
    const headers = { 'Content-Type': 'application/json', 'X-CIP-Requisicao': '1', ...cab };
    if (cookie) headers.Cookie = cookie;
    const r = await fetch(base + url, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const txt = await r.text();
    return { status: r.status, corpo: txt ? JSON.parse(txt) : null, headers: r.headers };
  }
  return {
    get: (u, c) => chamar('GET', u, undefined, c),
    post: (u, b, c) => chamar('POST', u, b ?? {}, c),
    put: (u, b, c) => chamar('PUT', u, b, c),
    patch: (u, b, c) => chamar('PATCH', u, b, c),
    del: (u, c) => chamar('DELETE', u, undefined, c),
    async entrar(email) {
      const r = await chamar('POST', '/api/auth/entrar', { email, senha: SENHA });
      assert.equal(r.status, 200, JSON.stringify(r.corpo));
      return r;
    },
  };
}

const novaVisita = (extra = {}) => ({ id: 'v_teste' + Math.random().toString(36).slice(2, 10), type: 'cond', cli: { nome: 'Condomínio Alfa', contato: 'Sr. Fulano', telefone: '92 99999-0000' }, cond: { torres: 2 }, photos: [{ src: IMG }], ...extra });

describe('autenticação', () => {
  test('senha errada → 401; senha certa → cookie HttpOnly + SameSite=Strict', async () => {
    const c = cliente();
    const r1 = await c.post('/api/auth/entrar', { email: 'colab@empresa.com.br', senha: 'errada999' });
    assert.equal(r1.status, 401);
    const r2 = await c.entrar('colab@empresa.com.br');
    const sc = r2.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    assert.equal(r2.corpo.usuario.papel, 'colaborador');
    assert.equal(r2.corpo.usuario.senha_hash, undefined);
    assert.equal((await c.get('/api/auth/eu')).status, 200);
    await c.post('/api/auth/sair');
    const depois = await c.get('/api/auth/eu');
    assert.equal(depois.status, 200);
    assert.equal(depois.corpo.usuario, null);
    assert.equal((await c.get('/api/visitas')).status, 401);
  });

  test('e-mail inexistente responde igual a senha errada', async () => {
    const r = await cliente().post('/api/auth/entrar', { email: 'ninguem@empresa.com.br', senha: 'qualquer123' });
    assert.equal(r.status, 401);
    assert.equal(r.corpo.erro, 'E-mail ou senha incorretos.');
  });

  test('5 falhas seguidas bloqueiam a conta temporariamente (429)', async () => {
    const c = cliente();
    for (let i = 0; i < 5; i++) await c.post('/api/auth/entrar', { email: 'outro@empresa.com.br', senha: 'errada' + i });
    const r = await c.post('/api/auth/entrar', { email: 'outro@empresa.com.br', senha: SENHA });
    assert.equal(r.status, 429);
  });

  test('conta com senha provisória precisa trocar a senha antes de usar o sistema', async () => {
    const c = cliente();
    await c.entrar('novo@empresa.com.br');
    const r = await c.get('/api/visitas');
    assert.equal(r.status, 403);
    assert.equal(r.corpo.codigo, 'TROCAR_SENHA');
    assert.equal((await c.post('/api/auth/senha', { atual: SENHA, nova: '123' })).status, 400);
    assert.equal((await c.post('/api/auth/senha', { atual: SENHA, nova: 'novaSenha2026' })).status, 200);
    assert.equal((await c.get('/api/visitas')).status, 200);
  });

  test('CSRF: sem o cabeçalho de segurança ou com outra origem → 403', async () => {
    const r1 = await fetch(base + '/api/auth/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r1.status, 403);
    const r2 = await cliente().post('/api/auth/entrar', { email: 'x', senha: 'y' }, { Origin: 'https://site-malicioso.com' });
    assert.equal(r2.status, 403);
  });

  test('cabeçalhos de segurança (CSP sem script inline)', async () => {
    const r = await fetch(base + '/api/auth/eu');
    const csp = r.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });
});

describe('visitas técnicas', () => {
  test('colaborador cria, lista (sem imagens) e não consegue se autoaprovar', async () => {
    const c = cliente();
    await c.entrar('colab@empresa.com.br');
    const doc = novaVisita({ status: 'done', aprovacao: { por: 'Diretor Forjado' }, userId: 'outra-pessoa' });
    const r = await c.post('/api/visitas', { visita: doc });
    assert.equal(r.status, 201);
    const v = r.corpo.visita;
    assert.equal(v.status, 'draft');
    assert.equal(v.aprovacao, undefined);
    assert.notEqual(v.userId, 'outra-pessoa');
    assert.equal(v.photos[0].src, IMG);

    const lista = (await c.get('/api/visitas')).corpo.visitas;
    const lite = lista.find((x) => x.id === v.id);
    assert.equal(lite._lite, true);
    assert.equal(lite.photos[0].src, '');

    const aprov = await c.post(`/api/visitas/${v.id}/aprovar`, { obs: 'ok' });
    assert.equal(aprov.status, 403);
    const st = await c.post(`/api/visitas/${v.id}/status`, { status: 'done' });
    assert.equal(st.status, 400);
    const put = await c.put(`/api/visitas/${v.id}`, { visita: { ...v, status: 'done' }, versao: v.versao });
    assert.equal(put.corpo.visita.status, 'draft');
  });

  test('versão resumida (_lite) não pode ser gravada por cima da completa', async () => {
    const c = cliente();
    await c.entrar('colab@empresa.com.br');
    const v = (await c.post('/api/visitas', { visita: novaVisita() })).corpo.visita;
    const lite = (await c.get('/api/visitas')).corpo.visitas.find((x) => x.id === v.id);
    assert.equal((await c.put(`/api/visitas/${v.id}`, { visita: lite, versao: lite.versao })).status, 400);
  });

  test('fluxo completo: enviar → supervisão aprova → colaborador altera → volta para "Em andamento"', async () => {
    const c = cliente();
    const s = cliente();
    await c.entrar('colab@empresa.com.br');
    await s.entrar('sup@empresa.com.br');
    let v = (await c.post('/api/visitas', { visita: novaVisita() })).corpo.visita;
    v = (await c.post(`/api/visitas/${v.id}/status`, { status: 'pending' })).corpo.visita;
    assert.equal(v.status, 'pending');
    assert.ok(v.enviadoEm);

    const todas = await s.get('/api/visitas?escopo=todas');
    assert.ok(todas.corpo.visitas.some((x) => x.id === v.id));
    const ap = await s.post(`/api/visitas/${v.id}/aprovar`, { obs: 'Aprovado' });
    assert.equal(ap.status, 200);
    assert.equal(ap.corpo.visita.status, 'done');
    assert.equal(ap.corpo.visita.aprovacao.por, 'Supervisora Teste');

    v = (await c.get(`/api/visitas/${v.id}`)).corpo.visita;
    const ed = await c.put(`/api/visitas/${v.id}`, { visita: { ...v, obs: 'mudei' }, versao: v.versao });
    assert.equal(ed.corpo.statusAlterado, true);
    assert.equal(ed.corpo.visita.status, 'draft');
    assert.equal(ed.corpo.visita.aprovacao, undefined);
  });

  test('duas pessoas salvando a mesma versão: a segunda recebe 409 (sem perder dados)', async () => {
    const c = cliente();
    const s = cliente();
    await c.entrar('colab@empresa.com.br');
    await s.entrar('sup@empresa.com.br');
    const v = (await c.post('/api/visitas', { visita: novaVisita() })).corpo.visita;
    const r1 = await s.put(`/api/visitas/${v.id}`, { visita: { ...v, obs: 'supervisão' }, versao: v.versao });
    assert.equal(r1.status, 200);
    const r2 = await c.put(`/api/visitas/${v.id}`, { visita: { ...v, obs: 'colaborador' }, versao: v.versao });
    assert.equal(r2.status, 409);
    assert.equal(r2.corpo.codigo, 'CONFLITO');
    assert.equal(r2.corpo.atual.obs, 'supervisão');
  });

  test('colaborador não vê nem altera visita de outra pessoa', async () => {
    const c = cliente();
    const o = cliente();
    await c.entrar('colab@empresa.com.br');
    await o.entrar('sup@empresa.com.br');
    const v = (await o.post('/api/visitas', { visita: novaVisita() })).corpo.visita;
    assert.equal((await c.get(`/api/visitas/${v.id}`)).status, 404);
    assert.equal((await c.put(`/api/visitas/${v.id}`, { visita: v, versao: v.versao })).status, 403);
    assert.equal((await c.del(`/api/visitas/${v.id}`)).status, 403);
    assert.equal((await c.get('/api/visitas?escopo=todas')).status, 403);
  });

  test('assinatura: exige senha, é registrada pelo servidor e é invalidada se o conteúdo mudar', async () => {
    const c = cliente();
    await c.entrar('colab@empresa.com.br');
    await c.patch('/api/eu/perfil', { assinatura: { img: 'data:image/png;base64,iVBOR', cpf: '123.456.789-01' } });
    let v = (await c.post('/api/visitas', { visita: novaVisita() })).corpo.visita;
    assert.equal((await c.post(`/api/visitas/${v.id}/assinar`, { senha: 'errada', versao: v.versao })).status, 400);
    const r = await c.post(`/api/visitas/${v.id}/assinar`, { senha: SENHA, versao: v.versao });
    assert.equal(r.status, 200);
    v = r.corpo.visita;
    assert.equal(v.assinatura.valida, true);
    assert.equal(v.assinatura.nome, 'Colaborador Teste');
    assert.equal(v.assinatura.cpf, '***.456.789-**');
    assert.match(v.assinatura.codigo, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const forjada = { ...v, obs: 'alterei', assinatura: { ...v.assinatura, valida: true, hash: 'x' } };
    const ed = await c.put(`/api/visitas/${v.id}`, { visita: forjada, versao: v.versao });
    assert.equal(ed.corpo.visita.assinatura.valida, false);
  });

  test('importação de backup antigo pelo colaborador não mantém "Concluído"', async () => {
    const c = cliente();
    await c.entrar('colab@empresa.com.br');
    const r = await c.post('/api/visitas/importar', { visits: [{ ...novaVisita(), id: 'v_legado01', status: 'done', aprovacao: { por: 'Alguém' }, updatedAt: '2026-01-01T00:00:00Z' }] });
    assert.equal(r.corpo.importadas, 1);
    const v = (await c.get('/api/visitas/v_legado01')).corpo.visita;
    assert.equal(v.status, 'draft');
    assert.equal(v.aprovacao, undefined);
  });
});

describe('mensuração de custos', () => {
  const projeto = (extra = {}) => ({
    info: { nome: 'Rede Bairro X', cliente: 'Cliente Sigiloso', tipo: 'rede' },
    materiais: [{ nome: 'Cabo', categoria: 'obra', quantidade: 100, valorUnitario: 2.5 }],
    servicos: [{ descricao: 'Lançamento', quantidade: 1, valorUnitario: 300 }],
    ...extra,
  });

  test('colaborador não aprova; supervisão aprova em nome próprio; alteração posterior é sinalizada', async () => {
    const c = cliente();
    const s = cliente();
    await c.entrar('colab@empresa.com.br');
    await s.entrar('sup@empresa.com.br');
    const forjado = projeto({ aprovacoes: { qualquer: { status: 'aprovado', porNome: 'Diretor' } }, historico: [{ em: '2020-01-01', nome: 'Diretor', acao: 'Projeto aprovado' }] });
    let p = (await c.post('/api/custos/projetos', { projeto: forjado, acoes: ['Projeto criado'] })).corpo.projeto;
    assert.deepEqual(p.aprovacoes, {});
    assert.equal(p.historico.length, 1);
    assert.equal(p.historico[0].nome, 'Colaborador Teste');

    assert.equal((await c.post(`/api/custos/projetos/${p.id}/aprovacao`, {})).status, 403);
    const ap = await s.post(`/api/custos/projetos/${p.id}/aprovacao`, { obs: 'ok' });
    assert.equal(ap.status, 200);
    const reg = Object.values(ap.corpo.projeto.aprovacoes)[0];
    assert.equal(reg.porNome, 'Supervisora Teste');
    assert.equal(reg.total, 550);

    let painel = (await s.get('/api/painel?escopo=equipe')).corpo.itens.find((x) => x.id === p.id);
    assert.equal(painel.aprov.status, 'done');
    assert.equal(painel.aprov.alterado, false);

    p = (await c.get('/api/custos/inicial')).corpo.projetos.find((x) => x.id === p.id);
    const ed = await c.put(`/api/custos/projetos/${p.id}`, { projeto: { ...p, servicos: [] }, versao: p.versao, acoes: ['Serviços e mão de obra alterados'] });
    assert.equal(ed.status, 200);
    assert.equal(ed.corpo.projeto.historico.at(-1).acao, 'Serviços e mão de obra alterados');
    painel = (await s.get('/api/painel?escopo=equipe')).corpo.itens.find((x) => x.id === p.id);
    assert.equal(painel.aprov.alterado, true);
    assert.equal(painel.aprov.status, 'draft');
  });

  test('aprovação não gera conflito para quem está editando (a versão do conteúdo não muda)', async () => {
    const c = cliente();
    const s = cliente();
    await c.entrar('colab@empresa.com.br');
    await s.entrar('sup@empresa.com.br');
    const p = (await c.post('/api/custos/projetos', { projeto: projeto() })).corpo.projeto;
    await s.post(`/api/custos/projetos/${p.id}/aprovacao`, {});
    const ed = await c.put(`/api/custos/projetos/${p.id}`, { projeto: { ...p, servicos: [] }, versao: p.versao, acoes: ['Serviços alterados'] });
    assert.equal(ed.status, 200);
    assert.equal(Object.keys(ed.corpo.projeto.aprovacoes).length, 1);
    assert.ok(ed.corpo.projeto.historico.some((h) => /aprovado por Supervisora Teste/.test(h.acao)));
  });

  test('colaborador só vê os próprios projetos; supervisão vê todos', async () => {
    const c = cliente();
    const o = cliente();
    const s = cliente();
    await c.entrar('colab@empresa.com.br');
    await o.entrar('terceiro@empresa.com.br');
    await s.entrar('sup@empresa.com.br');
    const p = (await c.post('/api/custos/projetos', { projeto: projeto() })).corpo.projeto;
    assert.ok(!(await o.get('/api/custos/inicial')).corpo.projetos.some((x) => x.id === p.id));
    assert.ok((await s.get('/api/custos/inicial')).corpo.projetos.some((x) => x.id === p.id));
    assert.equal((await o.put(`/api/custos/projetos/${p.id}`, { projeto: p, versao: p.versao })).status, 404);
  });

  test('catálogo: controle de versão impede sobrescrever alteração de outra pessoa', async () => {
    const c = cliente();
    await c.entrar('colab@empresa.com.br');
    const ini = (await c.get('/api/custos/inicial')).corpo.catalogo;
    const r1 = await c.put('/api/custos/catalogo', { itens: [{ codigo: '1', descricao: 'Item', valor: 3 }], versao: ini.versao });
    assert.equal(r1.status, 200);
    const r2 = await c.put('/api/custos/catalogo', { itens: [], versao: ini.versao });
    assert.equal(r2.status, 409);
  });
});

describe('painel público e equipe', () => {
  test('painel público não expõe valores, clientes nem contatos', async () => {
    const r = await fetch(base + '/api/publico/painel');
    assert.equal(r.status, 200);
    const txt = await r.text();
    assert.doesNotMatch(txt, /Cliente Sigiloso/);
    assert.doesNotMatch(txt, /99999-0000/);
    assert.doesNotMatch(txt, /"t":/);
    assert.doesNotMatch(txt, /@empresa\.com\.br/);
    const d = JSON.parse(txt);
    assert.ok(d.itens.length > 0);
  });

  test('somente a supervisão cria contas; senha provisória obriga troca; não dá para remover o último supervisor', async () => {
    const c = cliente();
    const s = cliente();
    await c.entrar('colab@empresa.com.br');
    await s.entrar('sup@empresa.com.br');
    assert.equal((await c.post('/api/usuarios', { email: 'x@empresa.com.br', nome: 'X' })).status, 403);
    assert.equal((await s.post('/api/usuarios', { email: 'x@gmail.com', nome: 'X' })).status, 400);
    const r = await s.post('/api/usuarios', { email: 'fulana@empresa.com.br', nome: 'Fulana', papel: 'colaborador' });
    assert.equal(r.status, 201);
    assert.ok(r.corpo.senhaProvisoria.length >= 12);
    const f = cliente();
    const login = await f.post('/api/auth/entrar', { email: 'fulana@empresa.com.br', senha: r.corpo.senhaProvisoria });
    assert.equal(login.corpo.usuario.trocarSenha, true);

    const eu = (await s.get('/api/auth/eu')).corpo.usuario;
    const rebaixar = await s.patch(`/api/usuarios/${eu.id}`, { papel: 'colaborador' });
    assert.equal(rebaixar.status, 400);
  });

  test('colaborador não vê e-mails da equipe; supervisão vê', async () => {
    const c = cliente();
    const s = cliente();
    await c.entrar('colab@empresa.com.br');
    await s.entrar('sup@empresa.com.br');
    const lc = (await c.get('/api/usuarios')).corpo.usuarios;
    assert.ok(lc.filter((u) => u.email).every((u) => u.email === 'colab@empresa.com.br'));
    const ls = (await s.get('/api/usuarios')).corpo.usuarios;
    assert.ok(ls.every((u) => u.email));
  });
});
