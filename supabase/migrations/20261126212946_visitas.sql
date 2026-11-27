-- =====================================================================
-- Visitas técnicas
-- - Colaborador: vê e edita as próprias. Supervisão: todas.
-- - "Concluído" só pela aprovação (supervisão). Fluxo (aprovação, devolução,
--   assinatura) é gravado só aqui, nunca vindo do navegador.
-- - Cada gravação informa a versão carregada; se outra pessoa salvou antes,
--   devolve { conflito: true, atual: ... } sem gravar.
-- =====================================================================

create or replace function public.limpar_visita(d jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(d, '{}'::jsonb) - array['id','userId','type','status','aprovacao','devolucao','enviadoEm','versao',
    'createdAt','updatedAt','atualizadoPor','_lite','importado','assinatura','userName']
$$;

create or replace function public.hash_conteudo(d jsonb) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(d::text, 'UTF8')), 'hex')
$$;

create or replace function public.montar_visita(v public.visitas, lite boolean, nomes jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select (case when lite then public.sem_imagens(v.dados) else v.dados end)
    || jsonb_build_object('id', v.id, 'userId', v.dono_id, 'userName', nomes ->> v.dono_id::text, 'type', v.tipo, 'status', v.status,
         'versao', v.versao, 'createdAt', public.iso(v.criado_em), 'updatedAt', public.iso(v.atualizado_em))
    || jsonb_strip_nulls(jsonb_build_object('aprovacao', v.fluxo -> 'aprovacao', 'devolucao', v.fluxo -> 'devolucao',
         'enviadoEm', v.fluxo -> 'enviadoEm', 'importado', v.fluxo -> 'importado'))
    || case when v.fluxo ? 'assinatura'
         then jsonb_build_object('assinatura', case when lite then (v.fluxo -> 'assinatura') || '{"img": ""}'::jsonb else v.fluxo -> 'assinatura' end)
         else '{}'::jsonb end
    || case when lite then '{"_lite": true}'::jsonb else '{}'::jsonb end
$$;

/** Carrega a visita conferindo a permissão (para editar: dono ou supervisão). */
create or replace function public.visita_permitida(p_id text, u public.perfis, para_editar boolean) returns public.visitas
language plpgsql security definer set search_path = '' as $$
declare v public.visitas;
begin
  select * into v from public.visitas where id = p_id for update;
  if not found then raise exception 'Visita não encontrada.' using errcode = 'PT404'; end if;
  if v.dono_id <> u.id and u.papel <> 'supervisor' then
    if para_editar then raise exception 'Você não pode alterar esta visita.' using errcode = 'PT403';
    else raise exception 'Visita não encontrada.' using errcode = 'PT404'; end if;
  end if;
  return v;
end $$;

revoke execute on function public.limpar_visita(jsonb), public.hash_conteudo(jsonb), public.montar_visita(public.visitas, boolean, jsonb),
  public.visita_permitida(text, public.perfis, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- leitura
create or replace function public.visitas_listar(p_escopo text default 'minhas') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); nomes jsonb := public.mapa_nomes();
begin
  if p_escopo = 'todas' and u.papel <> 'supervisor' then raise exception 'Acesso restrito à supervisão.' using errcode = 'PT403'; end if;
  return coalesce((select jsonb_agg(public.montar_visita(v, true, nomes) order by v.atualizado_em desc)
    from public.visitas v where p_escopo = 'todas' or v.dono_id = u.id), '[]'::jsonb);
end $$;

create or replace function public.visitas_obter(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); v public.visitas;
begin
  v := public.visita_permitida(p_id, u, false);
  return public.montar_visita(v, false, public.mapa_nomes());
end $$;

create or replace function public.visitas_exportar(p_escopo text default 'minhas') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); todas boolean := u.papel = 'supervisor' and p_escopo = 'todas'; nomes jsonb := public.mapa_nomes(); r jsonb;
begin
  select jsonb_build_object('app', 'clickip-visitas', 'v', 3, 'exportadoEm', public.iso(now()),
    'users', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.nome, 'email', p.email, 'role', p.cargo)) from public.perfis p where todas or p.id = u.id), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(public.montar_visita(v, false, nomes)) from public.visitas v where todas or v.dono_id = u.id), '[]'::jsonb))
  into r;
  perform public.auditar(u.id, 'visitas.exportar', null, null, jsonb_build_object('todas', todas));
  return r;
end $$;

-- ---------------------------------------------------------------- criação e edição
create or replace function public.visitas_criar(p_doc jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); vid text; v public.visitas;
begin
  if coalesce(p_doc ->> 'type', '') not in ('cond', 'corp', 'evt') then raise exception 'Tipo de visita inválido.' using errcode = 'PT400'; end if;
  vid := p_doc ->> 'id';
  if not public.id_valido(vid) or exists (select 1 from public.visitas where id = vid) then vid := public.novo_id('v'); end if;
  insert into public.visitas (id, dono_id, tipo, status, dados, fluxo, atualizado_por)
    values (vid, u.id, p_doc ->> 'type', 'draft', public.limpar_visita(p_doc), '{}'::jsonb, u.id) returning * into v;
  perform public.auditar(u.id, 'visita.criar', 'visita', vid);
  return public.montar_visita(v, false, public.mapa_nomes());
end $$;

create or replace function public.visitas_salvar(p_id text, p_doc jsonb, p_versao integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); v public.visitas; v_dados jsonb; v_fluxo jsonb; v_st text; mudou boolean; status_alterado boolean := false;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then raise exception 'Documento ausente.' using errcode = 'PT400'; end if;
  if (p_doc ->> '_lite')::boolean is true then raise exception 'Documento incompleto (versão resumida) não pode ser salvo.' using errcode = 'PT400'; end if;
  v := public.visita_permitida(p_id, u, true);
  if p_versao is distinct from v.versao then
    return jsonb_build_object('conflito', true, 'atual', public.montar_visita(v, false, public.mapa_nomes()));
  end if;
  v_dados := public.limpar_visita(p_doc);
  v_fluxo := v.fluxo; v_st := v.status;
  mudou := v_dados <> v.dados;
  -- relatório aprovado alterado pelo colaborador volta para "Em andamento"
  if mudou and v_st = 'done' and u.papel <> 'supervisor' then v_st := 'draft'; v_fluxo := v_fluxo - 'aprovacao'; status_alterado := true; end if;
  if mudou and v_fluxo ? 'assinatura' and v_fluxo #>> '{assinatura,hash}' is distinct from public.hash_conteudo(v_dados) then
    v_fluxo := jsonb_set(v_fluxo, '{assinatura,valida}', 'false'::jsonb);
  end if;
  update public.visitas set dados = v_dados, status = v_st, fluxo = v_fluxo, versao = versao + 1, atualizado_em = now(), atualizado_por = u.id
    where id = p_id returning * into v;
  return jsonb_build_object('visita', public.montar_visita(v, false, public.mapa_nomes()), 'statusAlterado', status_alterado);
end $$;

create or replace function public.visitas_excluir(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); v public.visitas;
begin
  v := public.visita_permitida(p_id, u, true);
  delete from public.visitas where id = p_id;
  perform public.auditar(u.id, 'visita.excluir', 'visita', p_id, jsonb_build_object('dono', v.dono_id, 'tipo', v.tipo));
  return '{"ok": true}'::jsonb;
end $$;

create or replace function public.visitas_duplicar(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); v public.visitas; n public.visitas; d jsonb;
begin
  v := public.visita_permitida(p_id, u, false);
  d := jsonb_set(v.dados, '{cli}', coalesce(v.dados -> 'cli', '{}'::jsonb) || jsonb_build_object('nome', coalesce(v.dados #>> '{cli,nome}', '') || ' (cópia)'));
  insert into public.visitas (id, dono_id, tipo, status, dados, fluxo, atualizado_por)
    values (public.novo_id('v'), u.id, v.tipo, 'draft', d, '{}'::jsonb, u.id) returning * into n;
  perform public.auditar(u.id, 'visita.duplicar', 'visita', n.id, jsonb_build_object('origem', p_id));
  return public.montar_visita(n, false, public.mapa_nomes());
end $$;

-- ---------------------------------------------------------------- fluxo de aprovação
-- Mudanças de fluxo não alteram o conteúdo: a versão não muda (quem está editando não recebe conflito falso).
create or replace function public.visitas_status(p_id text, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); v public.visitas; f jsonb;
begin
  if p_status not in ('draft', 'pending') then raise exception 'Status inválido (a conclusão é feita pela aprovação da supervisão).' using errcode = 'PT400'; end if;
  v := public.visita_permitida(p_id, u, true);
  f := v.fluxo - 'aprovacao';
  if p_status = 'pending' then f := (f - 'devolucao') || jsonb_build_object('enviadoEm', public.iso(now())); end if;
  update public.visitas set status = p_status, fluxo = f, atualizado_em = now(), atualizado_por = u.id where id = p_id returning * into v;
  perform public.auditar(u.id, case when p_status = 'pending' then 'visita.enviar' else 'visita.reabrir' end, 'visita', p_id);
  return public.montar_visita(v, false, public.mapa_nomes());
end $$;

create or replace function public.visitas_aprovar(p_id text, p_obs text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_supervisor(); v public.visitas; f jsonb;
begin
  v := public.visita_permitida(p_id, u, false);
  f := (v.fluxo - 'devolucao') || jsonb_build_object('aprovacao', jsonb_build_object('por', u.nome, 'usuarioId', u.id, 'email', u.email,
        'cargo', u.cargo, 'em', public.iso(now()), 'obs', left(trim(coalesce(p_obs, '')), 2000)));
  update public.visitas set status = 'done', fluxo = f, atualizado_em = now(), atualizado_por = u.id where id = p_id returning * into v;
  perform public.auditar(u.id, 'visita.aprovar', 'visita', p_id);
  return public.montar_visita(v, false, public.mapa_nomes());
end $$;

create or replace function public.visitas_devolver(p_id text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_supervisor(); v public.visitas; f jsonb;
begin
  if trim(coalesce(p_motivo, '')) = '' then raise exception 'Informe o motivo da devolução.' using errcode = 'PT400'; end if;
  v := public.visita_permitida(p_id, u, false);
  f := (v.fluxo - 'aprovacao') || jsonb_build_object('devolucao', jsonb_build_object('por', u.nome, 'usuarioId', u.id, 'em', public.iso(now()), 'motivo', left(trim(p_motivo), 2000)));
  update public.visitas set status = 'draft', fluxo = f, atualizado_em = now(), atualizado_por = u.id where id = p_id returning * into v;
  perform public.auditar(u.id, 'visita.devolver', 'visita', p_id);
  return public.montar_visita(v, false, public.mapa_nomes());
end $$;

-- ---------------------------------------------------------------- assinatura eletrônica
-- Exige que a senha tenha sido digitada há menos de 5 minutos (o site faz login de novo antes de chamar).
create or replace function public.visitas_assinar(p_id text, p_versao integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); v public.visitas; sg jsonb := u.perfil -> 'assinatura'; h text; em text := public.iso(now()); cpf text;
begin
  if not public.senha_recente() then raise exception 'Confirme a sua senha para assinar.' using errcode = 'PT400'; end if;
  if sg is null or coalesce(sg ->> 'img', '') = '' then raise exception 'Cadastre a sua assinatura em Perfil antes de assinar.' using errcode = 'PT400'; end if;
  v := public.visita_permitida(p_id, u, true);
  if p_versao is distinct from v.versao then raise exception 'Salve ou recarregue a visita antes de assinar.' using errcode = 'PT409', hint = 'CONFLITO'; end if;
  h := public.hash_conteudo(v.dados);
  cpf := regexp_replace(coalesce(sg ->> 'cpf', ''), '\D', '', 'g');
  update public.visitas set fluxo = fluxo || jsonb_build_object('assinatura', jsonb_build_object(
      'userId', u.id, 'nome', u.nome, 'cargo', u.cargo, 'em', em, 'img', sg ->> 'img', 'hash', h, 'valida', true,
      'cpf', case when length(cpf) = 11 then '***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**' else '' end,
      'codigo', (select string_agg(substr(c, i, 4), '-' order by i) from (select upper(encode(sha256(convert_to(h || '|' || u.id || '|' || em, 'UTF8')), 'hex')) c) x, generate_series(1, 9, 4) i ))),
    atualizado_em = now(), atualizado_por = u.id
    where id = p_id returning * into v;
  perform public.auditar(u.id, 'visita.assinar', 'visita', p_id, jsonb_build_object('hash', h));
  return public.montar_visita(v, false, public.mapa_nomes());
end $$;

create or replace function public.visitas_remover_assinatura(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); v public.visitas;
begin
  v := public.visita_permitida(p_id, u, true);
  update public.visitas set fluxo = fluxo - 'assinatura', atualizado_em = now(), atualizado_por = u.id where id = p_id returning * into v;
  perform public.auditar(u.id, 'visita.remover_assinatura', 'visita', p_id);
  return public.montar_visita(v, false, public.mapa_nomes());
end $$;

-- ---------------------------------------------------------------- importação da versão antiga
-- Colaborador: tudo para a própria conta e "Concluído" vira "Em andamento".
-- Supervisão: dono pelo e-mail do backup; mantém o status (aprovação marcada como importada).
create or replace function public.visitas_importar(p_backup jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u public.perfis := public.exigir_usuario(); sup boolean := u.papel = 'supervisor';
  usuarios jsonb := coalesce(p_backup -> 'users', case when p_backup ? 'user' then jsonb_build_array(p_backup -> 'user') end, '[]'::jsonb);
  doc jsonb; bu jsonb; dono uuid; ex public.visitas; st text; f jsonb; vid text;
  importadas int := 0; atualizadas int := 0; ignoradas int := 0; sem_conta jsonb := '[]'::jsonb; v_email text;
begin
  if jsonb_typeof(p_backup -> 'visits') is distinct from 'array' then raise exception 'Arquivo de backup inválido (sem lista de visitas).' using errcode = 'PT400'; end if;
  for doc in select * from jsonb_array_elements(p_backup -> 'visits') loop
    if coalesce(doc ->> 'type', '') not in ('cond', 'corp', 'evt') then ignoradas := ignoradas + 1; continue; end if;
    dono := u.id;
    if sup then
      bu := null; dono := null;
      select x into bu from jsonb_array_elements(usuarios) x where x ->> 'id' = doc ->> 'userId' limit 1;
      if bu is null and jsonb_array_length(usuarios) = 1 then bu := usuarios -> 0; end if;
      v_email := lower(trim(coalesce(bu ->> 'email', '')));
      select p.id into dono from public.perfis p where v_email <> '' and lower(p.email) = v_email;
      if dono is null then
        v_email := coalesce(nullif(v_email, ''), '(sem e-mail no backup)');
        if not sem_conta ? v_email then sem_conta := sem_conta || to_jsonb(v_email); end if;
        ignoradas := ignoradas + 1; continue;
      end if;
    end if;
    select * into ex from public.visitas where id = doc ->> 'id';
    if found and ex.dono_id <> dono and not sup then ignoradas := ignoradas + 1; continue; end if;
    if found and coalesce(doc ->> 'updatedAt', '') <= public.iso(ex.atualizado_em) then ignoradas := ignoradas + 1; continue; end if;
    st := case when doc ->> 'status' in ('draft', 'pending', 'done') then doc ->> 'status' else 'draft' end;
    if st = 'done' and not sup then st := 'draft'; end if;
    f := jsonb_build_object('importado', jsonb_build_object('em', public.iso(now()), 'por', u.id));
    if st = 'done' and doc ? 'aprovacao' then f := f || jsonb_build_object('aprovacao', (doc -> 'aprovacao') || '{"importada": true}'::jsonb); end if;
    if st = 'pending' and doc ? 'enviadoEm' then f := f || jsonb_build_object('enviadoEm', doc -> 'enviadoEm'); end if;
    if st = 'draft' and doc ? 'devolucao' then f := f || jsonb_build_object('devolucao', doc -> 'devolucao'); end if;
    if ex.id is not null then
      update public.visitas set dados = public.limpar_visita(doc), status = st, fluxo = f, versao = versao + 1, atualizado_em = now(), atualizado_por = u.id where id = ex.id;
      atualizadas := atualizadas + 1;
    else
      vid := case when public.id_valido(doc ->> 'id') then doc ->> 'id' else public.novo_id('v') end;
      insert into public.visitas (id, dono_id, tipo, status, dados, fluxo, criado_em, atualizado_por)
        values (vid, dono, doc ->> 'type', st, public.limpar_visita(doc), f, coalesce((doc ->> 'createdAt')::timestamptz, now()), u.id);
      importadas := importadas + 1;
    end if;
  end loop;
  perform public.auditar(u.id, 'visitas.importar', null, null, jsonb_build_object('importadas', importadas, 'atualizadas', atualizadas, 'ignoradas', ignoradas));
  return jsonb_build_object('importadas', importadas, 'atualizadas', atualizadas, 'ignoradas', ignoradas, 'semConta', sem_conta);
end $$;

revoke execute on function
  public.visitas_listar(text), public.visitas_obter(text), public.visitas_exportar(text), public.visitas_criar(jsonb),
  public.visitas_salvar(text, jsonb, integer), public.visitas_excluir(text), public.visitas_duplicar(text), public.visitas_status(text, text),
  public.visitas_aprovar(text, text), public.visitas_devolver(text, text), public.visitas_assinar(text, integer),
  public.visitas_remover_assinatura(text), public.visitas_importar(jsonb)
from public, anon;
grant execute on function
  public.visitas_listar(text), public.visitas_obter(text), public.visitas_exportar(text), public.visitas_criar(jsonb),
  public.visitas_salvar(text, jsonb, integer), public.visitas_excluir(text), public.visitas_duplicar(text), public.visitas_status(text, text),
  public.visitas_aprovar(text, text), public.visitas_devolver(text, text), public.visitas_assinar(text, integer),
  public.visitas_remover_assinatura(text), public.visitas_importar(jsonb)
to authenticated;
