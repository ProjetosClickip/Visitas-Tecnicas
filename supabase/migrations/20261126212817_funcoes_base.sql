-- =====================================================================
-- Funções auxiliares (internas: não são chamáveis pelo navegador).
-- Erros usam SQLSTATE 'PTnnn': o Supabase devolve o status HTTP nnn.
-- =====================================================================

create or replace function public.iso(t timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function public.novo_id(prefixo text) returns text
language sql volatile set search_path = '' as $$
  select prefixo || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)
$$;

create or replace function public.id_valido(id text) returns boolean
language sql immutable set search_path = '' as $$
  select id is not null and id ~ '^[A-Za-z0-9_-]{4,64}$'
$$;

/** Usuário logado, ativo e sem senha provisória pendente. */
create or replace function public.exigir_usuario() returns public.perfis
language plpgsql stable security definer set search_path = '' as $$
declare u public.perfis;
begin
  if auth.uid() is null then
    raise exception 'Sessão expirada. Entre novamente.' using errcode = 'PT401', hint = 'SEM_SESSAO';
  end if;
  select * into u from public.perfis where id = auth.uid();
  if not found or not u.ativo then
    raise exception 'Conta sem acesso à plataforma.' using errcode = 'PT403', hint = 'SEM_PERMISSAO';
  end if;
  if u.trocar_senha then
    raise exception 'Defina uma nova senha para continuar.' using errcode = 'PT403', hint = 'TROCAR_SENHA';
  end if;
  return u;
end $$;

create or replace function public.exigir_supervisor() returns public.perfis
language plpgsql stable security definer set search_path = '' as $$
declare u public.perfis;
begin
  u := public.exigir_usuario();
  if u.papel <> 'supervisor' then
    raise exception 'Acesso restrito à supervisão.' using errcode = 'PT403', hint = 'SEM_PERMISSAO';
  end if;
  return u;
end $$;

create or replace function public.auditar(p_usuario uuid, p_acao text, p_entidade text default null, p_entidade_id text default null, p_detalhe jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, detalhe) values (p_usuario, p_acao, p_entidade, p_entidade_id, p_detalhe)
$$;

/** { "<id>": "<nome>" } de todos os usuários. */
create or replace function public.mapa_nomes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(id::text, nome), '{}'::jsonb) from public.perfis
$$;

create or replace function public.usuario_publico(u public.perfis, com_email boolean default true) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', u.id, 'nome', u.nome, 'email', case when com_email then u.email end, 'cargo', u.cargo, 'papel', u.papel,
    'supervisor', u.papel = 'supervisor', 'ativo', u.ativo, 'trocarSenha', u.trocar_senha,
    'avatar', coalesce(u.perfil ->> 'avatar', ''), 'ultimoAcesso', public.iso(u.ultimo_acesso), 'criadoEm', public.iso(u.criado_em))
$$;

/** Cópia sem imagens grandes (data: URLs > 2 KB) para listas e painéis. */
create or replace function public.sem_imagens(v jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare r jsonb; k text; e jsonb;
begin
  case jsonb_typeof(v)
    when 'string' then
      if left(v #>> '{}', 5) = 'data:' and length(v #>> '{}') > 2048 then return to_jsonb(''::text); end if;
      return v;
    when 'array' then
      select coalesce(jsonb_agg(public.sem_imagens(x) order by o), '[]'::jsonb) into r from jsonb_array_elements(v) with ordinality as t(x, o);
      return r;
    when 'object' then
      r := '{}'::jsonb;
      for k, e in select * from jsonb_each(v) loop r := r || jsonb_build_object(k, public.sem_imagens(e)); end loop;
      return r;
    else return v;
  end case;
end $$;

/** Imagem enviada pelo navegador: só data:image base64 (impede injetar HTML/CSS). */
create or replace function public.imagem_valida(v text, campo text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or v = '' then return ''; end if;
  if length(v) > 1572864 then raise exception 'Imagem muito grande em %.', campo using errcode = 'PT413'; end if;
  if v !~ '^data:image/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Imagem inválida em %.', campo using errcode = 'PT400'; end if;
  return v;
end $$;

/** Senha digitada há menos de 5 minutos (reautenticação) – usada para assinar e concluir a troca de senha. */
create or replace function public.senha_recente() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' = 'password' and (a ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 300)
$$;

/** Valores (quantidade × unitário) de um orçamento. */
create or replace function public.totais_projeto(d jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare obra numeric := 0; ativ numeric := 0; serv numeric := 0; x jsonb; q numeric; vu numeric;
begin
  for x in select * from jsonb_array_elements(coalesce(d -> 'materiais', '[]'::jsonb)) loop
    q := coalesce(nullif(x ->> 'quantidade', '')::numeric, 0);
    vu := case when nullif(x ->> 'valorUnitario', '') is not null then (x ->> 'valorUnitario')::numeric
               when q <> 0 then coalesce(nullif(x ->> 'valorTotal', '')::numeric, 0) / q else 0 end;
    if x ->> 'categoria' = 'ativacao' then ativ := ativ + q * vu; else obra := obra + q * vu; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(d -> 'servicos', '[]'::jsonb)) loop
    q := coalesce(nullif(x ->> 'quantidade', '')::numeric, 0);
    vu := case when nullif(x ->> 'valorUnitario', '') is not null then (x ->> 'valorUnitario')::numeric
               when q <> 0 then coalesce(nullif(x ->> 'valorTotal', '')::numeric, 0) / q else 0 end;
    serv := serv + q * vu;
  end loop;
  obra := round(obra, 2); ativ := round(ativ, 2); serv := round(serv, 2);
  return jsonb_build_object('obra', obra, 'ativ', ativ, 'mat', obra + ativ, 'serv', serv, 'total', obra + ativ + serv,
    'nMat', jsonb_array_length(coalesce(d -> 'materiais', '[]'::jsonb)), 'nServ', jsonb_array_length(coalesce(d -> 'servicos', '[]'::jsonb)));
exception when invalid_text_representation then
  raise exception 'Valor numérico inválido no orçamento.' using errcode = 'PT400';
end $$;

-- nenhuma destas funções é chamável diretamente pelo navegador
revoke execute on function
  public.iso(timestamptz), public.novo_id(text), public.id_valido(text), public.exigir_usuario(), public.exigir_supervisor(),
  public.auditar(uuid, text, text, text, jsonb), public.mapa_nomes(), public.usuario_publico(public.perfis, boolean),
  public.sem_imagens(jsonb), public.imagem_valida(text, text), public.senha_recente(), public.totais_projeto(jsonb)
from public, anon, authenticated;
