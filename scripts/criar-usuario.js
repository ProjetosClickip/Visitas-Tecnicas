/**
 * Cria uma conta pela linha de comando (útil para o primeiro supervisor).
 *   npm run usuario:criar -- --email nome@empresa.com.br --nome "Nome Sobrenome" --papel supervisor [--cargo "Cargo"]
 * A senha provisória é gerada e exibida uma única vez; no primeiro acesso a pessoa define a própria senha.
 */
import { parseArgs } from 'node:util';
import { carregarConfig } from '../server/config.js';
import { abrirBanco } from '../server/db.js';
import { senhaProvisoria } from '../server/seguranca.js';
import { criarUsuario } from '../server/lib/usuarios.js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    nome: { type: 'string' },
    cargo: { type: 'string', default: '' },
    papel: { type: 'string', default: 'colaborador' },
  },
});

if (!values.email || !values.nome) {
  console.error('Uso: npm run usuario:criar -- --email nome@empresa.com.br --nome "Nome" [--papel supervisor|colaborador] [--cargo "Cargo"]');
  process.exit(1);
}

const config = carregarConfig();
const db = abrirBanco(config.arquivoBanco);
const senha = senhaProvisoria();
try {
  const u = await criarUsuario(db, { ...values, senha, trocarSenha: true, dominios: config.organizacao.dominiosEmailPermitidos });
  console.log(`\nConta criada: ${u.nome} <${u.email}> – papel: ${u.papel}`);
  console.log(`Senha provisória (anote agora, não será exibida de novo): ${senha}\n`);
} catch (e) {
  console.error('Erro:', e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
