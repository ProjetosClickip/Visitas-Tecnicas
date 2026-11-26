/** Ponto de entrada: `npm start` (produção) ou `npm run dev` (desenvolvimento). */
import fs from 'node:fs';
import { carregarConfig } from './config.js';
import { abrirBanco } from './db.js';
import { criarApp, semearCatalogo } from './app.js';

const config = carregarConfig();
const db = abrirBanco(config.arquivoBanco);

const n = semearCatalogo(db, config);
if (n) console.log(`Catálogo de materiais carregado: ${n} itens.`);

const usuarios = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
if (!usuarios) {
  console.log('\nNenhuma conta cadastrada. Crie as contas iniciais com:');
  console.log('  npm run usuarios:semear        (a partir de config/usuarios-iniciais.json)');
  console.log('  npm run usuario:criar -- --email nome@empresa.com.br --nome "Nome" --papel supervisor\n');
}
if (!fs.existsSync(config.pastaWeb)) console.log('Interface ainda não compilada: rode `npm run build` (ou use `npm run dev`).');

const app = criarApp({ db, config });
const servidor = app.listen(config.porta, config.host, () => {
  console.log(`Plataforma de Projetos rodando em http://localhost:${config.porta}`);
});

function encerrar() {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
