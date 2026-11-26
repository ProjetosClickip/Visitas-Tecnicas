/**
 * Copia os arquivos do OCR (Tesseract) de node_modules para web/public/vendor/ocr,
 * para que sejam servidos pelo próprio servidor (sem depender de CDN externa).
 * Executado automaticamente antes de `npm run build` e `npm run dev`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from '../server/config.js';

const nm = path.join(RAIZ, 'node_modules');
const destino = path.join(RAIZ, 'web', 'public', 'vendor', 'ocr');

function copiar(origem, alvo) {
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  const o = fs.statSync(origem);
  if (fs.existsSync(alvo) && fs.statSync(alvo).size === o.size) return false;
  fs.copyFileSync(origem, alvo);
  return true;
}

let n = 0;
n += copiar(path.join(nm, 'tesseract.js', 'dist', 'worker.min.js'), path.join(destino, 'worker.min.js'));
const core = path.join(nm, 'tesseract.js-core');
for (const f of fs.readdirSync(core).filter((f) => f.endsWith('.wasm.js'))) n += copiar(path.join(core, f), path.join(destino, 'core', f));
for (const lang of ['por', 'eng']) {
  n += copiar(path.join(nm, '@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`), path.join(destino, 'lang', `${lang}.traineddata.gz`));
}
console.log(n ? `OCR: ${n} arquivo(s) copiado(s) para web/public/vendor/ocr` : 'OCR: arquivos já atualizados');
