/**
 * Sobe um servidor isolado para os testes de navegador: banco temporário, catálogo de exemplo
 * e contas de teste (supervisor e colaborador) com senha conhecida.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { carregarConfig, RAIZ } from '../../server/config.js';
import { abrirBanco } from '../../server/db.js';
import { criarApp, semearCatalogo } from '../../server/app.js';
import { criarUsuario } from '../../server/lib/usuarios.js';

export const SENHA_TESTE = 'senhaTeste123';

export async function subirServidorTeste() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cip-e2e-'));
  const config = carregarConfig({
    dataDir: dir,
    arquivoBanco: path.join(dir, 'teste.sqlite'),
    porta: 0,
    cookieSeguro: false,
    arquivoCatalogoInicial: path.join(RAIZ, 'config', 'catalogo.example.json'),
    organizacao: {
      nome: 'Grupo Teste', cidade: 'Cidade/UF', setor: 'Engenharia / Projetos', painelPublico: true, dominiosEmailPermitidos: [],
      empresaResponsavel: { nome: 'EMPRESA RESPONSÁVEL TESTE', cnpj: '00.000.000/0001-00' },
      empresasGrupo: [{ id: 'emp1', nome: 'EMPRESA 1 LTDA', cnpj: '00.000.000/0001-00', tabelaCatalogo: '01' }],
      revisoresPadrao: ['Revisor Teste - Diretor'],
    },
  });
  const db = abrirBanco(config.arquivoBanco);
  semearCatalogo(db, config);
  await criarUsuario(db, { email: 'supervisora@teste.com', nome: 'Supervisora Teste', cargo: 'Supervisão', papel: 'supervisor', senha: SENHA_TESTE, trocarSenha: false });
  await criarUsuario(db, { email: 'colaborador@teste.com', nome: 'Colaborador Teste', cargo: 'Projetos', papel: 'colaborador', senha: SENHA_TESTE, trocarSenha: false });
  const app = criarApp({ db, config });
  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const url = `http://127.0.0.1:${servidor.address().port}`;
  return {
    url, db,
    fechar() {
      servidor.close();
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
