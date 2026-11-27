/**
 * Servidor estático do build (web/dist) com os mesmos cabeçalhos de segurança do vercel.json.
 * Usado pelo teste de fumaça para conferir que nada é bloqueado pela política de segurança (CSP).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(RAIZ, 'web', 'dist');
const cabecalhos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8')).headers
  .find((h) => h.source === '/(.*)').headers;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.map': 'application/json', '.svg': 'image/svg+xml' };

export function servir(porta = 0) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const arq = path.join(DIST, path.normalize(p));
    if (!arq.startsWith(DIST) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('não encontrado'); }
    for (const { key, value } of cabecalhos) res.setHeader(key, value);
    res.setHeader('Content-Type', TIPOS[path.extname(arq)] || 'application/octet-stream');
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise((ok) => srv.listen(porta, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}`, fechar: () => srv.close() })));
}
