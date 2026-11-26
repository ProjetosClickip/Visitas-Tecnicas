/** Monta a aplicação Express (separado de index.js para os testes criarem instâncias isoladas). */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { agora } from './db.js';
import { cabecalhosSeguranca, carregarSessao, erro, protecaoCsrf, tratadorErros } from './http.js';
import { rotasAuth } from './routes/auth.js';
import { rotasUsuarios } from './routes/usuarios.js';
import { rotasVisitas } from './routes/visitas.js';
import { rotasCustos } from './routes/custos.js';
import { rotasPainel } from './routes/painel.js';

/** Na primeira execução, carrega o catálogo de materiais de data/catalogo-inicial.json (fora do git). */
export function semearCatalogo(db, config) {
  if (db.prepare("SELECT 1 FROM documentos WHERE chave = 'custos.catalogo'").get()) return false;
  const arq = config.arquivoCatalogoInicial;
  if (!arq || !fs.existsSync(arq)) return false;
  const c = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const itens = (c.itens || []).map((x) => ({ ...x, fonte: x.fonte || c.fonte || '' }));
  db.prepare("INSERT INTO documentos (chave, dados, versao, atualizado_em) VALUES ('custos.catalogo', ?, 1, ?)")
    .run(JSON.stringify({ itens, fonte: c.fonte || '' }), agora());
  return itens.length;
}

export function criarApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(cabecalhosSeguranca);
  app.use('/api', express.json({ limit: '40mb' }));
  app.use('/api', protecaoCsrf);
  app.use('/api', carregarSessao({ db, config }));

  app.use('/api/auth', rotasAuth({ db, config }));
  app.use('/api', rotasPainel({ db, config }));
  app.use('/api/visitas', rotasVisitas({ db, config }));
  app.use('/api/custos', rotasCustos({ db, config }));
  app.use('/api', rotasUsuarios({ db, config }));
  app.use('/api', (req, res, next) => next(erro(404, 'Rota não encontrada.')));

  // interface (gerada por `npm run build`)
  if (fs.existsSync(config.pastaWeb)) {
    app.use(express.static(config.pastaWeb, {
      index: 'index.html',
      setHeaders(res, arq) {
        if (/[\\/]assets[\\/]/.test(arq)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(config.pastaWeb, 'index.html')));
  }

  app.use(tratadorErros);
  return app;
}
