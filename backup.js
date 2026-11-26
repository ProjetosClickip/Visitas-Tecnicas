/**
 * Cópia de segurança consistente do banco (pode rodar com o servidor ligado).
 *   npm run backup                 → data/backups/plataforma-AAAA-MM-DD-HHMM.sqlite
 *   npm run backup -- /outra/pasta → grava na pasta indicada
 * Agende no Agendador de Tarefas do Windows ou no cron, e copie a pasta para outro local.
 */
import fs from 'node:fs';
import path from 'node:path';
import { carregarConfig } from '../server/config.js';
import { abrirBanco } from '../server/db.js';

const config = carregarConfig();
const pasta = path.resolve(process.argv[2] || path.join(config.dataDir, 'backups'));
fs.mkdirSync(pasta, { recursive: true });
const carimbo = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const destino = path.join(pasta, `plataforma-${carimbo}.sqlite`);
if (fs.existsSync(destino)) fs.rmSync(destino);
const db = abrirBanco(config.arquivoBanco);
db.prepare('VACUUM INTO ?').run(destino);
db.close();
console.log(`Backup gravado em ${destino} (${(fs.statSync(destino).size / 1024).toFixed(0)} KB)`);
