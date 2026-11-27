/**
 * Teste de fumaça no navegador contra um projeto Supabase de verdade.
 * Cria uma conta de colaborador pela própria tela (testa a função admin-usuarios),
 * percorre os fluxos principais e confere que não há erros nem bloqueios da CSP.
 *
 *   npm run build
 *   E2E_SUP_EMAIL=... E2E_SUP_SENHA=... E2E_COLAB_EMAIL=... npm run test:e2e
 *
 * Use contas de TESTE (o roteiro cria visitas e orçamentos com essas contas).
 * Requer o Playwright: `npm i -D playwright && npx playwright install chromium`.
 */
import { createRequire } from 'node:module';
import { servir } from './servir.mjs';

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {
    console.error('Playwright não instalado. Rode: npm i -D playwright && npx playwright install chromium'); process.exit(1);
  }
}
const SUP = { email: process.env.E2E_SUP_EMAIL, senha: process.env.E2E_SUP_SENHA };
const COLAB_EMAIL = process.env.E2E_COLAB_EMAIL;
const COLAB_SENHA_NOVA = process.env.E2E_COLAB_SENHA || 'Colab' + Math.random().toString(36).slice(2, 10) + '7';
if (!SUP.email || !SUP.senha || !COLAB_EMAIL) { console.error('Defina E2E_SUP_EMAIL, E2E_SUP_SENHA e E2E_COLAB_EMAIL.'); process.exit(1); }

const site = await servir();
const browser = await chromium.launch();
const problemas = [];
let passos = 0;
const ok = (m) => { passos++; console.log('  ✓ ' + m); };
const falha = (m) => { throw new Error(m); };

async function pagina(nome) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    const t = m.text();
    if (/status of 40[0-9]/.test(t)) return; // respostas de erro esperadas (ex.: senha errada) já são conferidas pelo roteiro
    if (m.type() === 'error' || /Content Security Policy|Refused/.test(t)) problemas.push(`[${nome}] ${t}`);
  });
  p.on('pageerror', (e) => problemas.push(`[${nome}] ${e.message}`));
  return p;
}
async function entrar(p, email, senha) {
  await p.goto(site.url + '/#colaborador');
  await p.fill('#lgEmail', email);
  await p.fill('#lgPin', senha);
  await p.click('#lgGo');
}

try {
  console.log('Portal');
  const pub = await pagina('público');
  await pub.goto(site.url + '/');
  await pub.waitForSelector('#pubMain .hero', { timeout: 15000 });
  ok('painel público carrega');

  const s = await pagina('supervisão');
  await entrar(s, SUP.email, SUP.senha);
  await s.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
  ok('login da supervisão no Supabase Auth');
  await s.click('[data-env="sup"]');
  await s.waitForSelector('#supNovo', { timeout: 15000 });
  await s.click('#supNovo');
  await s.fill('#usNome', 'Colaborador E2E (teste)');
  await s.fill('#usEmail', COLAB_EMAIL);
  await s.fill('#usCargo', 'Projetos');
  await s.click('#usOk');
  await s.waitForSelector('#spSenha', { timeout: 20000 });
  const provisoria = (await s.textContent('#spSenha')).trim();
  if (provisoria.length < 12) falha('senha provisória não exibida');
  await s.click('.modal [data-close]');
  ok('supervisão cria conta (Edge Function) e recebe senha provisória');

  const c = await pagina('colaborador');
  await entrar(c, COLAB_EMAIL, provisoria);
  await c.waitForSelector('#tsForm', { timeout: 15000 });
  await c.fill('#tsAtual', provisoria);
  await c.fill('#tsNova', COLAB_SENHA_NOVA);
  await c.fill('#tsNova2', COLAB_SENHA_NOVA);
  await c.click('#tsForm button[type=submit]');
  await c.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
  ok('primeiro acesso obriga a trocar a senha provisória');

  await c.click('[data-sys="visitas"]');
  await c.click('button[data-new="cond"]');
  await c.waitForSelector('#btnSave', { timeout: 15000 });
  await c.fill('#main input[data-k="cli.nome"]', 'Condomínio Teste E2E');
  await c.click('#btnSave');
  await c.waitForFunction(() => /Salvo/.test(document.querySelector('#saveState')?.textContent || ''), null, { timeout: 15000 });
  ok('visita criada e salva no Supabase');
  await c.selectOption('#stSel', 'pending');
  await c.click('.modal .btn.primary');
  await c.waitForFunction(() => document.querySelector('#stSel')?.value === 'pending', null, { timeout: 15000 });
  ok('visita enviada para aprovação');

  await s.goto(site.url + '/#supervisao');
  await s.reload();
  await s.waitForSelector('[data-sapr]', { timeout: 20000 });
  await s.click('[data-sapr]');
  await s.click('#aprOk');
  await s.waitForFunction(() => !document.querySelector('[data-sapr]'), null, { timeout: 15000 });
  ok('supervisão aprova pela fila');

  console.log('Mensuração de Custos');
  await c.click('[data-sys="custos"]');
  const frame = await (await c.waitForSelector('#custosFrame')).contentFrame();
  await frame.waitForSelector('#nav [data-view="ident"]', { timeout: 20000 });
  ok('subsistema abre com a mesma sessão');
  await frame.click('#nav [data-view="ident"]');
  await frame.fill('[data-info="nome"]', 'Orçamento Teste E2E');
  await frame.click('#nav [data-view="obra"]');
  await frame.click('[data-action="calc-alca"]');
  await frame.fill('#cPostes', '20');
  await frame.click('.overlay [data-ok]');
  await frame.waitForFunction(() => /Salvo no servidor/.test(document.querySelector('#saveSt')?.textContent || ''), null, { timeout: 20000 });
  ok('orçamento salvo (histórico gravado pelo banco)');
  await frame.click('[data-action="report"]');
  const [dl] = await Promise.all([c.waitForEvent('download', { timeout: 30000 }), frame.click('.overlay [data-action="report-full"]')]);
  if (!(await dl.suggestedFilename()).endsWith('.pdf')) falha('relatório PDF não gerado');
  ok('relatório PDF gerado');
} catch (e) {
  problemas.push('Falha: ' + e.message);
} finally {
  await browser.close();
  site.fechar();
}
console.log(`\n${passos} passo(s) ok; ${problemas.length} problema(s)`);
for (const p of problemas) console.log('  ✗ ' + p);
process.exitCode = problemas.length ? 1 : 0;
