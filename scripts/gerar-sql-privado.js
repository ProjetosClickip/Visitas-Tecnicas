/**
 * Gera os SQL com os dados PRIVADOS da empresa, para colar no SQL Editor do Supabase.
 * Os arquivos de entrada e de saída ficam fora do git (config/*.json e data/).
 *
 *   npm run sql:privado
 *
 * Entrada:
 *   config/organizacao.json     → empresas do grupo, CNPJs, domínios de e-mail, revisores, painel público
 *   data/catalogo-inicial.json  → tabela de preços (formato de config/catalogo.example.json)
 * Saída:
 *   data/organizacao-supabase.sql
 *   data/catalogo-supabase.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arq = (...p) => path.join(RAIZ, ...p);
const dolar = (txt, tag) => {
  if (txt.includes(`$${tag}$`)) throw new Error(`O conteúdo contém $${tag}$`);
  return `$${tag}$${txt}$${tag}$`;
};
fs.mkdirSync(arq('data'), { recursive: true });

let n = 0;
if (fs.existsSync(arq('config', 'organizacao.json'))) {
  const org = JSON.parse(fs.readFileSync(arq('config', 'organizacao.json'), 'utf8'));
  fs.writeFileSync(arq('data', 'organizacao-supabase.sql'),
    `-- DADOS DA ORGANIZAÇÃO (privado – NÃO coloque no git). Cole no Supabase: SQL Editor → New query → Run.\n` +
    `update public.organizacao set dados = ${dolar(JSON.stringify(org), 'org')}::jsonb where id = 1;\n` +
    `select dados ->> 'nome' as nome, jsonb_array_length(dados -> 'empresasGrupo') as empresas, dados ->> 'painelPublico' as painel_publico from public.organizacao;\n`);
  console.log('Gerado data/organizacao-supabase.sql');
  n++;
}

if (fs.existsSync(arq('data', 'catalogo-inicial.json'))) {
  const cat = JSON.parse(fs.readFileSync(arq('data', 'catalogo-inicial.json'), 'utf8'));
  const linhas = JSON.stringify(cat.itens.map((i) => [i.codigo, i.descricao, i.unidade, i.valor, i.tabela]));
  const fonte = String(cat.fonte || '').replace(/'/g, "''");
  fs.writeFileSync(arq('data', 'catalogo-supabase.sql'),
    `-- CATÁLOGO DE MATERIAIS (privado – NÃO coloque no git). Cole no Supabase: SQL Editor → New query → Run.\n` +
    `-- Pode rodar mais de uma vez: não duplica nem sobrescreve um catálogo já editado pela equipe.\n` +
    `with linhas as (select x from jsonb_array_elements(${dolar(linhas, 'cat')}::jsonb) x),\n` +
    `doc as (select jsonb_build_object('fonte', '${fonte}', 'itens', jsonb_agg(jsonb_build_object('codigo', x->>0, 'descricao', x->>1, 'unidade', x->>2,\n` +
    `  'valor', (x->>3)::numeric, 'tabela', x->>4, 'fonte', '${fonte}'))) d from linhas)\n` +
    `insert into public.documentos (chave, dados)\n` +
    `select k, d from doc, (values ('custos.catalogo_inicial'), ('custos.catalogo')) v(k)\n` +
    `on conflict (chave) do nothing;\n` +
    `select chave, jsonb_array_length(dados -> 'itens') as itens from public.documentos where chave like 'custos.catalogo%';\n`);
  console.log(`Gerado data/catalogo-supabase.sql (${cat.itens.length} itens)`);
  n++;
}
if (!n) console.log('Nada a gerar: crie config/organizacao.json e/ou data/catalogo-inicial.json.');
