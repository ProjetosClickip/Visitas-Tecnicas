# Plataforma de Projetos Click IP

Visitas Técnicas e Mensuração de Custos do time de Engenharia / Projetos.
Esta versão substitui o arquivo HTML único (dados no navegador de cada pessoa) por um **servidor
central** com login, permissões e banco de dados. A interface é a mesma, agora dividida em módulos.

## O que mudou

| Antes (arquivo único) | Agora |
|---|---|
| Dados no navegador de cada computador (IndexedDB/localStorage); a supervisão só via o que estava no próprio navegador | Banco central (SQLite) no servidor; todos veem os mesmos dados, de qualquer computador |
| "Supervisão" = quem digitasse um dos 4 e-mails fixos no código ao criar a conta | Papel guardado no servidor; contas criadas só pela supervisão ou por script |
| Senha do portal com hash simples de 53 bits e salt fixo; PIN de 4 caracteres; pergunta de segurança | scrypt com salt por usuário; mínimo de 8 caracteres com letras e números; senha provisória obrigatória no 1º acesso; redefinição pela supervisão |
| Aprovação e assinatura gravadas pelo navegador (editáveis pelo DevTools) | Aprovar/devolver/assinar são rotas do servidor que conferem o papel e registram quem/quando; a assinatura é invalidada pelo servidor se o conteúdo mudar |
| "Banco compartilhado" por arquivo .json no Drive (a última gravação apagava edições simultâneas) | Controle de versão: se outra pessoa salvou antes, a tela pergunta se recarrega ou mantém a sua versão |
| E-mails, CNPJs, revisores e **tabela de preços (1.823 itens)** dentro do HTML | Fora do código e do git (`config/*.json`, `data/`); o catálogo só é entregue a usuários logados |
| Mensuração de Custos dentro de uma string JavaScript de 444 KB | Página própria (`custos.html`) em 34 módulos, com a mesma sessão do portal |
| Bibliotecas de CDN sem verificação (SheetJS 0.18.5 com CVE-2023-30533, PDF.js 3.11 com CVE-2024-4367, jsPDF 2.5.1) | Instaladas pelo npm e servidas pelo próprio servidor: SheetJS 0.20.3, PDF.js 6 (com `isEvalSupported:false`), jsPDF 4, Chart.js 4, Tesseract 7 (OCR com arquivos locais) |
| Scripts e `onclick` inline | Política de segurança (CSP) sem script inline; proteção CSRF; cookie `HttpOnly` + `SameSite=Strict` |
| Histórico de alterações escrito pelo navegador | Histórico escrito pelo servidor (autor = conta logada, horário do servidor) + trilha de auditoria |

Os **cálculos de dimensionamento** (CTOs, APs, rack, eventos) foram só movidos para módulos: o teste
`test/calculos.test.js` confere 81 casos contra o resultado do código original.

## Estrutura

```
server/            API (Node + Express + SQLite embutido do Node)
  routes/          auth, usuários, visitas, custos, painéis
  lib/             regras de negócio (visitas, custos, usuários, importação)
  http.js          sessão, papéis, CSRF, CSP, limite de tentativas
  seguranca.js     scrypt, tokens
web/               interface (Vite)
  index.html       portal: ambientes público / colaborador / supervisão, Visitas Técnicas
  custos.html      Mensuração de Custos (aberta dentro do portal)
  src/shared/      cliente da API
  src/portal/      29 módulos do portal
  src/custos/      34 módulos da Mensuração de Custos
  css/             estilos (extraídos do original)
scripts/           criar contas, importar dados antigos, backup, copiar arquivos do OCR
config/            *.example.json (os .json reais ficam fora do git)
data/              banco SQLite, catálogo inicial e backups (fora do git)
test/              testes do servidor, dos cálculos, da importação e de navegador
```

## O que fica fora do git

O `.gitignore` exclui:

- `.env`: porta, pasta de dados, cookie seguro, proxy. Modelo: `.env.example`.
- `config/organizacao.json`: nome, cidade, empresas do grupo e CNPJs, domínios de e-mail aceitos, revisores do relatório. Modelo: `config/organizacao.example.json`.
- `config/usuarios-iniciais.json`: contas iniciais (e-mail, nome, cargo, papel), **sem senha**. Modelo: `config/usuarios-iniciais.example.json`.
- `data/`: banco (`plataforma.sqlite`), `catalogo-inicial.json` (tabela de preços) e backups.

Nenhuma senha fica em arquivo: as senhas provisórias são geradas na hora e exibidas uma única vez.

## Instalação

Requisitos: **Node.js 22.13 ou mais novo** (usa o SQLite embutido do Node). Funciona em Windows, Linux e macOS.

```bash
npm ci
```

```bash
cp .env.example .env
cp config/organizacao.example.json config/organizacao.json
cp config/usuarios-iniciais.example.json config/usuarios-iniciais.json
```

1. Edite `config/organizacao.json` e `config/usuarios-iniciais.json` com os dados reais.
2. Coloque a tabela de preços em `data/catalogo-inicial.json`, no formato de `config/catalogo.example.json`. Ela é carregada no banco na primeira execução.
3. Crie as contas iniciais. O comando mostra a senha provisória de cada uma; entregue-as às pessoas.

```bash
npm run usuarios:semear
```

4. Gere a interface e suba o servidor:

```bash
npm run build
```

```bash
npm start
```

Acesse `http://servidor:3000`. Contas avulsas também podem ser criadas por linha de comando:

```bash
npm run usuario:criar -- --email nome@empresa.com.br --nome "Nome Sobrenome" --papel supervisor
```

Depois disso, a supervisão cria e gerencia as contas em **Ambiente da supervisão → Equipe**.

### Produção

- Coloque o servidor atrás de HTTPS (nginx, IIS, Caddy ou Cloudflare Tunnel) e use `COOKIE_SECURE=true` no `.env`. Atrás de proxy, ajuste também `TRUST_PROXY=1`.
- Mantenha o processo rodando com um serviço (systemd, NSSM no Windows ou pm2).
- Faça backup diário do banco (pode rodar com o servidor ligado) e copie a pasta `data/backups` para outro local:

```bash
npm run backup
```

## Migrar os dados da versão antiga

Os dados antigos estão no navegador de cada pessoa. Primeiro crie as contas (o dono de cada registro é encontrado pelo e-mail).

1. **Visitas**: cada colaborador exporta em *Configurações → Banco de dados → Exportar backup* na versão antiga, ou a supervisão usa *Exportar base completa*.
2. **Custos**: use o arquivo do "banco compartilhado" (.json) ou *Configurações → Exportar backup dos meus projetos*.
3. Importe no servidor. `--dono` atribui a uma conta os registros sem e-mail correspondente; `--catalogo` também importa o catálogo do banco compartilhado.

```bash
npm run importar:legado -- backup_visitas.json base_custos.json --dono supervisor@empresa.com.br
```

Também dá para importar pela tela: colaborador em *Configurações*, supervisão em *Ambiente da supervisão*.

- Aprovações antigas de visitas são mantidas e marcadas como "importada". Quando o colaborador importa pela tela, "Concluído" volta para "Em andamento", porque não dá para confirmar a aprovação antiga.
- Aprovações antigas de orçamentos são ligadas ao supervisor de mesmo nome. As que não tiverem correspondente são listadas no relatório da importação.

## Desenvolvimento

```bash
npm run dev
```

A API sobe em `:3000` e a interface em `http://localhost:5173`, com recarga automática.

Para rodar os testes:

```bash
npm test
```

Os testes cobrem servidor e segurança, regressão dos cálculos e importação (24 testes).

Para o teste de fumaça no navegador, instale o Playwright uma vez:

```bash
npm i -D playwright && npx playwright install chromium
```

Depois gere a interface e rode o teste:

```bash
npm run build
```

```bash
npm run test:e2e
```

## Permissões

| Ação | Colaborador | Supervisão |
|---|---|---|
| Ver/editar visitas e orçamentos | próprios | todos |
| Enviar visita para aprovação | ✔ | ✔ |
| Aprovar/devolver visita, aprovar orçamento | – | ✔ (em nome próprio) |
| Criar contas, redefinir senha, mudar papel, desativar | – | ✔ |
| Ver valores dos orçamentos da equipe | – | ✔ |
| Restaurar o catálogo inicial | – | ✔ |
| Painel público (sem login) | só nome da demanda, responsável, tipo, status e data; nenhum valor, contato ou e-mail. Desligue com `"painelPublico": false` | |

As telas escondem o que a pessoa não pode fazer, mas **quem garante as permissões é o servidor**.

## Limitações conhecidas / próximos passos

- **Login com Google Workspace** não foi implementado. Hoje o login é por e-mail e senha do próprio sistema. Dá para acrescentar depois sem mudar o resto.
- **Sem conexão**: a página avisa e reenvia as alterações quando a rede volta, mas é preciso entrar com a rede disponível e não fechar a aba enquanto houver pendências. O modo totalmente offline da versão antiga não existe mais.
- O **OCR** roda localmente; a precisão continua dependendo da qualidade do documento escaneado.
- **FiberControl** continua como "em breve".
