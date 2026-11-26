/**
 * Importa para o servidor os dados da versão antiga (arquivo HTML único, dados no navegador).
 *
 *   npm run importar:legado -- <arquivo.json> [--dono email] [--catalogo]
 *
 * Arquivos aceitos:
 *  - Visitas Técnicas: "Exportar backup (.json)" de cada colaborador ou "Exportar base completa" da supervisão.
 *  - Mensuração de Custos: arquivo do "banco compartilhado" (.json), "Exportar backup dos meus projetos"
 *    ou um projeto exportado em JSON.
 *
 * O dono de cada visita/projeto é a conta com o mesmo e-mail que consta no arquivo (crie as contas antes,
 * com `npm run usuarios:semear`). Use --dono para atribuir a uma conta o que não tiver e-mail correspondente.
 * --catalogo também substitui o catálogo de materiais pelo que estiver no arquivo do banco compartilhado.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { carregarConfig } from '../server/config.js';
import { abrirBanco } from '../server/db.js';
import { buscarPorEmail } from '../server/lib/usuarios.js';
import { importarCustos, importarVisitas } from '../server/lib/importacao.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { dono: { type: 'string' }, catalogo: { type: 'boolean', default: false } },
});
if (!positionals.length) {
  console.error('Uso: npm run importar:legado -- <arquivo.json> [--dono email] [--catalogo]');
  process.exit(1);
}

const config = carregarConfig();
const db = abrirBanco(config.arquivoBanco);
const supervisor = db.prepare("SELECT id FROM usuarios WHERE papel = 'supervisor' AND ativo = 1 ORDER BY criado_em LIMIT 1").get();
if (!supervisor) {
  console.error('Crie ao menos uma conta de supervisor antes de importar (npm run usuarios:semear).');
  process.exit(1);
}
let donoPadraoId = null;
if (values.dono) {
  const u = buscarPorEmail(db, values.dono);
  if (!u) { console.error(`Conta não encontrada: ${values.dono}`); process.exit(1); }
  donoPadraoId = u.id;
}

for (const arq of positionals) {
  try {
    const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
    if (Array.isArray(dados.visits)) {
      const r = importarVisitas(db, dados, { modo: 'admin', importadorId: supervisor.id, donoPadraoId });
      console.log(`${arq}: visitas – ${r.importadas} nova(s), ${r.atualizadas} atualizada(s), ${r.ignoradas} ignorada(s)`);
      if (r.semConta.length) console.log(`  sem conta para: ${r.semConta.join(', ')} (crie as contas ou use --dono)`);
    } else {
      const r = importarCustos(db, dados, { importadorId: supervisor.id, donoPadraoId, incluirCatalogo: values.catalogo });
      console.log(`${arq}: custos – ${r.projetos} projeto(s), ${r.prestadoras} prestadora(s), ${r.aprovacoes} aprovação(ões)${r.catalogo ? `, catálogo com ${r.catalogo} itens` : ''}; ${r.ignorados} ignorado(s)`);
      if (r.semConta.length) console.log(`  sem conta para: ${r.semConta.join(', ')} (crie as contas ou use --dono)`);
      if (r.aprovacoesSemSupervisor.length) console.log(`  aprovações sem supervisor correspondente (não importadas): ${r.aprovacoesSemSupervisor.join(', ')}`);
    }
  } catch (e) {
    console.error(`${arq}: erro – ${e.message}`);
    process.exitCode = 1;
  }
}
db.close();
