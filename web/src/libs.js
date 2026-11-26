/* =====================================================================
   1. BIBLIOTECAS (instaladas pelo npm e servidas pelo próprio servidor – sem CDN)
   Carregadas sob demanda (cada uma vira um arquivo separado no build).
   ===================================================================== */
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const LIBS = {
  chart:     { name:'Chart.js 4', uso:'Gráficos do dashboard', carregar: async ()=> (await import('chart.js/auto')).default },
  xlsx:      { name:'SheetJS (xlsx) 0.20.3', uso:'Importação de Excel (.xlsx/.xls)', carregar: ()=> import('xlsx') },
  pdfjs:     { name:'PDF.js', uso:'Leitura de PDF', carregar: async ()=>{ const m = await import('pdfjs-dist'); m.GlobalWorkerOptions.workerSrc = pdfWorkerUrl; return m; } },
  tesseract: { name:'Tesseract.js 7', uso:'OCR de documentos digitalizados', carregar: async ()=>{ const m = await import('tesseract.js'); return m.default || m; } },
  jspdf:     { name:'jsPDF 4', uso:'Geração do relatório PDF', carregar: async ()=> (await import('jspdf')).jsPDF },
  autotable: { name:'jsPDF-AutoTable 5', uso:'Tabelas do relatório PDF', carregar: async ()=>{ const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]); at.applyPlugin(jsPDF); return at; } }
};
/* OCR: núcleo (WebAssembly) e dados de idioma copiados para /vendor/ocr por scripts/copiar-ocr.js */
const OCR_OPCOES = { workerPath:'/vendor/ocr/worker.min.js', corePath:'/vendor/ocr/core', langPath:'/vendor/ocr/lang', workerBlobURL:false, gzip:true, cacheMethod:'none' };
const libCache = {};
const libPromises = {};
const libStatus = {};
const libGet = key => libCache[key];
function loadLib(key){
  const L = LIBS[key];
  if (libCache[key]) return Promise.resolve(libCache[key]);
  if (libPromises[key]) return libPromises[key];
  const p = L.carregar().then(v => { libCache[key] = v; libStatus[key] = 'ok'; return v; })
    .catch(e => { libStatus[key] = 'erro'; delete libPromises[key]; throw new Error('Não foi possível carregar '+L.name+' ('+L.uso+'): '+(e && e.message || e)); });
  libPromises[key] = p;
  return p;
}

export { LIBS, OCR_OPCOES, libGet, libStatus, loadLib };
