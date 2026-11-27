# Plataforma de Projetos Click IP

Visitas Técnicas e Mensuração de Custos do time de Engenharia / Projetos.

- **Banco de dados e login:** Supabase (Postgres + Supabase Auth).
- **Site:** estático (HTML/CSS/JS gerado pelo Vite), publicado na Vercel ou em qualquer hospedagem estática.
- **Sem servidor próprio para manter.**

## Como a segurança funciona

- **Tabelas fechadas.** As tabelas não podem ser lidas nem gravadas diretamente pelo site. Tudo passa por **funções no banco** (`supabase/migrations`), que conferem quem está logado e o que essa pessoa pode fazer.
- **Fluxo de aprovação no banco.** Aprovar, devolver, assinar, o histórico de alterações, o "Concluído" e os totais dos orçamentos são decididos e gravados pelo banco. O navegador não consegue forjar nada disso.
- **Papéis guardados no banco.** Colaborador ou supervisão fica no banco. Contas são criadas só pela supervisão, pela função `admin-usuarios`, que usa a chave de serviço do lado do Supabase e nunca no site.
- **Senha provisória.** Toda conta nova começa com senha provisória, e a troca é obrigatória no primeiro acesso. A assinatura eletrônica exige digitar a senha na hora.
- **Controle de versão.** Se duas pessoas editam a mesma visita ou orçamento, quem salvar por último é avisado e escolhe qual versão fica.
- **Política de segurança (CSP).** O site roda sem script inline (`vercel.json`), e todas as bibliotecas (Excel, PDF, OCR, gráficos) são servidas pelo próprio site, sem CDN.
- **Testes de segurança.** O arquivo `supabase/testes/seguranca.sql` testa as regras simulando colaborador, supervisão e visitante. Ele roda sem deixar dados no banco.

## O que fica fora do git

O repositório é público, então nada sensível entra nele:

| Arquivo | O que tem |
|---|---|
| `.env.local` | URL do Supabase e chave publicável (a chave publicável pode ficar no site; a chave secreta nunca) |
| `config/organizacao.json` | empresas do grupo, CNPJs, domínio de e-mail, revisores do relatório |
| `data/catalogo-inicial.json` | tabela de preços |
| `data/*.sql` | SQL gerado com os dados acima, para colar no Supabase |

## Estrutura

```
supabase/
  migrations/              banco: tabelas, regras e funções (aplicadas pela integração GitHub ↔ Supabase)
  functions/admin-usuarios/  criar conta, redefinir senha, mudar papel, desativar (somente supervisão)
  config.toml              configuração da integração
  primeiro-supervisor.sql  modelo para criar o primeiro supervisor
  testes/seguranca.sql     testes das regras de segurança
web/
  index.html, custos.html  páginas
  src/shared/api.js        ponte entre as telas e o Supabase
  src/shared/supabase.js   cliente do Supabase
  src/portal/              portal e Visitas Técnicas
  src/custos/              Mensuração de Custos
  css/, public/img/        estilos e imagens
scripts/                   copiar arquivos do OCR, gerar SQL dos dados privados
test/                      teste dos cálculos e teste no navegador (e2e)
vercel.json                publicação na Vercel + cabeçalhos de segurança
```

## Colocar no ar (primeira vez)

### 1. Supabase

1. Crie o projeto. Se for novo, de preferência na região **South America (São Paulo)**.
2. Integre com o GitHub em **Project Settings → Integrations → GitHub**:
   - repositório: este;
   - **Working directory:** `.`;
   - **Production branch:** `main`;
   - marque **Deploy to production**.

   A partir daí, as migrações de `supabase/migrations` e a função `admin-usuarios` são aplicadas sozinhas a cada push na `main`.
3. Em **Authentication → Sign In / Providers**:
   - desligue **Allow new users to sign up**, porque as contas são criadas só pela supervisão;
   - em **Email**, exija senha com **mínimo de 8 caracteres** e **letras e números**.
4. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço do site (ex.: o da Vercel).
5. Carregue os dados privados. No seu computador, com `config/organizacao.json` e `data/catalogo-inicial.json` preenchidos, gere os arquivos SQL:

```bash
npm run sql:privado
```

   Depois cole `data/organizacao-supabase.sql` e `data/catalogo-supabase.sql` no **SQL Editor** e rode.
6. Crie o primeiro supervisor seguindo `supabase/primeiro-supervisor.sql`.

### 2. Vercel (site)

1. **Add New → Project →** importe este repositório. As configurações já vêm do `vercel.json`.
2. Em **Environment Variables**, cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (os valores estão em **Supabase → Project Settings → API**).
3. Clique em **Deploy**. A cada push na `main`, o site é atualizado sozinho.

### 3. Equipe

O supervisor entra no site e vai em **Ambiente da supervisão → Equipe → + Nova conta**. Cada pessoa recebe uma senha provisória e define a própria senha no primeiro acesso.

## Migrar os dados da versão antiga (HTML)

- **Visitas:** cada colaborador exporta o backup (.json) na versão antiga e importa em **Configurações → Banco de dados**. A supervisão pode importar os backups da equipe de uma vez em **Ambiente da supervisão**: cada visita vai para a conta com o mesmo e-mail.
- **Orçamentos:** na Mensuração de Custos, **Configurações → Importar projetos (JSON da versão antiga)**.

## Desenvolvimento

Instale as dependências e crie o `.env.local` a partir do `.env.example`:

```bash
npm ci
```

```bash
cp .env.example .env.local
```

Suba o site em modo de desenvolvimento (abre em `http://localhost:5173`):

```bash
npm run dev
```

Para gerar o site para publicação (pasta `web/dist`):

```bash
npm run build
```

Para rodar o teste dos cálculos (81 casos, iguais à versão antiga):

```bash
npm test
```

Para o teste no navegador, use contas de **teste**:

```bash
E2E_SUP_EMAIL=... E2E_SUP_SENHA=... E2E_COLAB_EMAIL=... npm run test:e2e
```

Mudanças no banco entram como uma nova migração em `supabase/migrations/` (arquivo `AAAAMMDDHHMMSS_nome.sql`). Ela é aplicada ao chegar na `main`.

## Limitações conhecidas

- **Sem conexão:** a página avisa e reenvia as alterações quando a rede volta, mas para entrar é preciso internet.
- **Fotos das visitas:** continuam dentro do registro da visita. Se o volume crescer, o próximo passo é movê-las para o Supabase Storage.
- **Plano grátis do Supabase:** o projeto é pausado após 7 dias sem nenhum acesso (os dados não se perdem; é só reativar no painel).
- **Login com Google Workspace:** ainda não implementado. O Supabase Auth suporta, e dá para ligar depois.

  
