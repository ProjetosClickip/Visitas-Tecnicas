/**
 * Cria as contas listadas em config/usuarios-iniciais.json (arquivo fora do git).
 *   npm run usuarios:semear
 * Contas que já existem são mantidas. Para cada conta nova é gerada uma senha provisória,
 * exibida uma única vez; no primeiro acesso a pessoa define a própria senha.
 */
import fs from 'node:fs';
import { carregarConfig } from '../server/config.js';
import { abrirBanco } from '../server/db.js';
import { senhaProvisoria } from '../server/seguranca.js';
import { buscarPorEmail, criarUsuario } from '../server/lib/usuarios.js';

const config = carregarConfig();
const arq = config.arquivoUsuariosIniciais;
if (!fs.existsSync(arq)) {
  console.error(`Arquivo não encontrado: ${arq}\nCopie config/usuarios-iniciais.example.json para config/usuarios-iniciais.json e preencha.`);
  process.exit(1);
}

const { usuarios = [] } = JSON.parse(fs.readFileSync(arq, 'utf8'));
const db = abrirBanco(config.arquivoBanco);
const criados = [];
for (const item of usuarios) {
  if (buscarPorEmail(db, item.email)) {
    console.log(`= já existe: ${item.email}`);
    continue;
  }
  const senha = senhaProvisoria();
  try {
    await criarUsuario(db, { email: item.email, nome: item.nome, cargo: item.cargo, papel: item.papel || 'colaborador', senha, trocarSenha: true, dominios: config.organizacao.dominiosEmailPermitidos });
    criados.push({ email: item.email, papel: item.papel || 'colaborador', senha });
  } catch (e) {
    console.error(`! ${item.email}: ${e.message}`);
  }
}
db.close();

if (criados.length) {
  console.log('\nContas criadas – entregue cada senha provisória à pessoa (não será exibida de novo):\n');
  for (const c of criados) console.log(`  ${c.email.padEnd(40)} ${c.papel.padEnd(12)} ${c.senha}`);
  console.log('');
} else {
  console.log('Nenhuma conta nova.');
}
