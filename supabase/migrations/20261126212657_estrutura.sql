-- =====================================================================
-- Plataforma de Projetos – estrutura do banco (Supabase / Postgres)
-- As tabelas NÃO são acessíveis diretamente pelo navegador: RLS ligado,
-- sem políticas e sem privilégios para anon/authenticated. Todo acesso
-- passa pelas funções (RPC) das próximas migrações, que aplicam as regras.
-- =====================================================================

create table public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null unique,
  nome          text not null,
  cargo         text not null default '',
  papel         text not null check (papel in ('colaborador', 'supervisor')),
  ativo         boolean not null default true,
  trocar_senha  boolean not null default true,
  perfil        jsonb not null default '{}'::jsonb,   -- avatar, banner, assinatura {img, cpf}, prefs
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultimo_acesso timestamptz
);

create table public.visitas (
  id             text primary key,
  dono_id        uuid not null references public.perfis (id),
  tipo           text not null check (tipo in ('cond', 'corp', 'evt')),
  status         text not null default 'draft' check (status in ('draft', 'pending', 'done')),
  dados          jsonb not null default '{}'::jsonb,  -- formulário da visita
  fluxo          jsonb not null default '{}'::jsonb,  -- aprovacao, devolucao, enviadoEm, assinatura (só o banco grava)
  versao         integer not null default 1,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id)
);
create index visitas_dono on public.visitas (dono_id);

create table public.projetos_custos (
  id                   text primary key,
  dono_id              uuid not null references public.perfis (id),
  dados                jsonb not null default '{}'::jsonb,
  versao               integer not null default 1,
  conteudo_alterado_em timestamptz,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  atualizado_por       uuid references public.perfis (id)
);
create index projetos_custos_dono on public.projetos_custos (dono_id);

create table public.aprovacoes_custos (
  projeto_id text not null references public.projetos_custos (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id),
  em         timestamptz not null default now(),
  obs        text not null default '',
  total      numeric not null default 0,
  primary key (projeto_id, usuario_id)
);

create table public.prestadoras (
  id             text primary key,
  dados          jsonb not null default '{}'::jsonb,
  versao         integer not null default 1,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id)
);

-- documentos únicos compartilhados: 'custos.catalogo', 'custos.config', 'custos.catalogo_inicial'
create table public.documentos (
  chave          text primary key,
  dados          jsonb not null,
  versao         integer not null default 1,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id)
);

create table public.preferencias (
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  chave      text not null,
  dados      jsonb,
  primary key (usuario_id, chave)
);

-- configuração da organização (CNPJs, empresas do grupo, domínios de e-mail, revisores, painel público).
-- Os valores reais são gravados direto no banco, NUNCA em arquivo do repositório.
create table public.organizacao (
  id    integer primary key default 1 check (id = 1),
  dados jsonb not null default '{}'::jsonb
);
insert into public.organizacao (id, dados) values (1, '{"painelPublico": false}'::jsonb);

create table public.auditoria (
  id          bigint generated always as identity primary key,
  em          timestamptz not null default now(),
  usuario_id  uuid,
  acao        text not null,
  entidade    text,
  entidade_id text,
  detalhe     jsonb
);
create index auditoria_entidade on public.auditoria (entidade, entidade_id);

-- ---------------------------------------------------------------------
-- Bloqueio total de acesso direto às tabelas
-- ---------------------------------------------------------------------
alter table public.perfis            enable row level security;
alter table public.visitas           enable row level security;
alter table public.projetos_custos   enable row level security;
alter table public.aprovacoes_custos enable row level security;
alter table public.prestadoras       enable row level security;
alter table public.documentos        enable row level security;
alter table public.preferencias      enable row level security;
alter table public.organizacao       enable row level security;
alter table public.auditoria         enable row level security;

revoke all on table
  public.perfis, public.visitas, public.projetos_custos, public.aprovacoes_custos, public.prestadoras,
  public.documentos, public.preferencias, public.organizacao, public.auditoria
from anon, authenticated;
revoke all on sequence public.auditoria_id_seq from anon, authenticated;
