/**
 * Teste de fumaça no navegador (Chromium via Playwright): os fluxos principais dos dois sistemas,
 * sem erros de JavaScript e sem bloqueios da política de segurança (CSP).
 *
 *   npm run build
 *   npm run test:e2e
 *
 * Requer o Playwright: `npm i -D playwright && npx playwright install chromium`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { subirServidorTeste, SENHA_TESTE } from './servidor-teste.mjs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    // instalação global (respeita NODE_PATH)
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('Playwright não instalado. Rode: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }
}

const srv = await subirServidorTeste();
const browser = await chromium.launch();
const problemas = [];
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cip-fumaca-'));
let passos = 0;
const ok = (msg) => { passos++; console.log('  ✓ ' + msg); };
const falha = (msg) => { throw new Error(msg); };

async function pagina(nome) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    if (/409 \(Conflict\)/.test(m.text())) return;
    if (m.type() === 'error' || /Content Security Policy|Refused/.test(m.text())) problemas.push(`[${nome}] ${m.text()}`);
  });
  p.on('pageerror', (e) => problemas.push(`[${nome}] ${e.message}`));
  return p;
}
async function entrarPelaTela(p, email) {
  await p.goto(srv.url + '/#colaborador');
  await p.fill('#lgEmail', email);
  await p.fill('#lgPin', SENHA_TESTE);
  await p.click('#lgGo');
  await p.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
}

try {
  console.log('Portal');
  const pub = await pagina('público');
  await pub.goto(srv.url + '/');
  await pub.waitForSelector('#pubMain .hero', { timeout: 10000 });
  ok('painel público abre sem login');

  const c = await pagina('colaborador');
  await entrarPelaTela(c, 'colaborador@teste.com');
  ok('login do colaborador');
  await c.click('[data-sys="visitas"]');
  await c.click('button[data-new="cond"]');
  await c.waitForSelector('#btnSave');
  await c.fill('#main input[data-k="cli.nome"]', 'Condomínio Fumaça');
  await c.click('#btnSave');
  await c.waitForFunction(() => /Salvo/.test(document.querySelector('#saveState')?.textContent || ''), null, { timeout: 8000 });
  ok('visita criada e salva no servidor');
  await c.selectOption('#stSel', 'pending');
  await c.click('.modal .btn.primary');
  await c.waitForFunction(() => document.querySelector('#stSel')?.value === 'pending', null, { timeout: 8000 });
  ok('visita enviada para aprovação');

  const s = await pagina('supervisão');
  await entrarPelaTela(s, 'supervisora@teste.com');
  await s.click('[data-env="sup"]');
  await s.waitForSelector('[data-sapr]', { timeout: 10000 });
  await s.click('[data-sapr]');
  await s.click('#aprOk');
  await s.waitForFunction(() => !document.querySelector('[data-sapr]'), null, { timeout: 8000 });
  ok('supervisão aprova pela fila');

  console.log('Mensuração de Custos');
  await c.click('[data-sys="custos"]');
  const frame = await (await c.waitForSelector('#custosFrame')).contentFrame();
  await frame.waitForSelector('#nav [data-view="ident"]', { timeout: 10000 });
  ok('subsistema abre dentro do portal com a mesma sessão');
  await frame.click('#nav [data-view="ident"]');
  await frame.fill('[data-info="nome"]', 'Orçamento Fumaça');
  await frame.click('#nav [data-view="obra"]');
  await frame.click('[data-action="calc-alca"]');
  await frame.fill('#cPostes', '20');
  await frame.click('.overlay [data-ok]');
  await frame.waitForFunction(() => /Salvo no servidor/.test(document.querySelector('#saveSt')?.textContent || ''), null, { timeout: 8000 });
  ok('materiais adicionados e salvos');
  await frame.click('[data-action="report"]');
  const [dl] = await Promise.all([c.waitForEvent('download', { timeout: 30000 }), frame.click('.overlay [data-action="report-full"]')]);
  const arq = path.join(pasta, 'relatorio.pdf');
  await dl.saveAs(arq);
  if (fs.readFileSync(arq).subarray(0, 4).toString() !== '%PDF') falha('relatório PDF inválido');
  ok('relatório PDF gerado (jsPDF carregado do próprio servidor)');

  const painel = await (await s.request.get(srv.url + '/api/painel?escopo=equipe')).json();
  const orc = painel.itens.find((x) => x.nome === 'Orçamento Fumaça');
  if (!orc || !(orc.t.total >= 0)) falha('orçamento não aparece no painel da supervisão');
  ok('orçamento aparece no painel da supervisão com valores');
  const publico = await (await pub.request.get(srv.url + '/api/publico/painel')).text();
  if (/"t":|Cliente|@teste\.com/.test(publico)) falha('painel público expõe dados sensíveis');
  ok('painel público sem valores nem e-mails');
} catch (e) {
  problemas.push('Falha: ' + e.message);
} finally {
  await browser.close();
  srv.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
}

console.log(`\n${passos} passo(s) ok; ${problemas.length} problema(s)`);
for (const p of problemas) console.log('  ✗ ' + p);
process.exitCode = problemas.length ? 1 : 0;
