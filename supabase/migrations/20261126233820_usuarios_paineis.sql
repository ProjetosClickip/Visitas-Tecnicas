-- =====================================================================
-- Sessão, perfil, equipe, preferências, organização e painéis
-- (criar contas / redefinir senha / mudar papel ficam na Edge Function
--  admin-usuarios, que usa a chave de serviço do Supabase no servidor)
-- =====================================================================

/** Usuário logado (inclui quem ainda precisa trocar a senha provisória). Registra o acesso. */
create or replace function public.sessao_eu() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis;
begin
  if auth.uid() is null then return jsonb_build_object('usuario', null); end if;
  update public.perfis set ultimo_acesso = now() where id = auth.uid() and ativo returning * into u;
  if not found then return jsonb_build_object('usuario', null, 'semPerfil', true); end if;
  return jsonb_build_object('usuario', public.usuario_publico(u));
end $$;

/** Marca a troca da senha provisória como concluída (o site acabou de trocar a senha no Supabase Auth). */
create or replace function public.sessao_concluir_troca_senha() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis;
begin
  if not public.senha_recente() then raise exception 'Entre novamente para trocar a senha.' using errcode = 'PT400'; end if;
  update public.perfis set trocar_senha = false, atualizado_em = now() where id = auth.uid() and ativo returning * into u;
  if not found then raise exception 'Conta sem acesso à plataforma.' using errcode = 'PT403'; end if;
  perform public.auditar(u.id, 'auth.trocar_senha');
  return jsonb_build_object('usuario', public.usuario_publico(u));
end $$;

create or replace function public.usuarios_listar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); sup boolean := u.papel = 'supervisor';
begin
  return jsonb_build_object('usuarios', coalesce((select jsonb_agg(public.usuario_publico(p, sup or p.id = u.id) order by p.nome)
    from public.perfis p where sup or p.ativo), '[]'::jsonb));
end $$;

create or replace function public.perfil_resposta(u public.perfis) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('usuario', public.usuario_publico(u), 'perfil', jsonb_build_object(
    'avatar', coalesce(u.perfil ->> 'avatar', ''), 'banner', coalesce(u.perfil ->> 'banner', ''),
    'assinatura', u.perfil -> 'assinatura', 'prefs', coalesce(u.perfil -> 'prefs', '{}'::jsonb)))
$$;
revoke execute on function public.perfil_resposta(public.perfis) from public, anon, authenticated;

create or replace function public.perfil_obter() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return public.perfil_resposta(public.exigir_usuario());
end $$;

/** Atualiza o próprio perfil: nome, cargo, avatar, banner, assinatura {img, cpf}, prefs. */
create or replace function public.perfil_atualizar(p_campos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); pf jsonb := u.perfil;
begin
  if p_campos ? 'avatar' then pf := pf || jsonb_build_object('avatar', public.imagem_valida(p_campos ->> 'avatar', 'avatar')); end if;
  if p_campos ? 'banner' then pf := pf || jsonb_build_object('banner', public.imagem_valida(p_campos ->> 'banner', 'banner')); end if;
  if p_campos ? 'assinatura' then
    pf := pf || jsonb_build_object('assinatura', case when jsonb_typeof(p_campos -> 'assinatura') = 'object'
      then jsonb_build_object('img', public.imagem_valida(p_campos #>> '{assinatura,img}', 'assinatura'),
                              'cpf', left(regexp_replace(coalesce(p_campos #>> '{assinatura,cpf}', ''), '\D', '', 'g'), 11))
      else null end);
  end if;
  if p_campos ? 'prefs' then
    if length((p_campos -> 'prefs')::text) > 20000 then raise exception 'Preferências grandes demais.' using errcode = 'PT413'; end if;
    pf := pf || jsonb_build_object('prefs', coalesce(p_campos -> 'prefs', '{}'::jsonb));
  end if;
  update public.perfis set
      nome = coalesce(nullif(trim(p_campos ->> 'nome'), ''), nome),
      cargo = case when p_campos ? 'cargo' then trim(coalesce(p_campos ->> 'cargo', '')) else cargo end,
      perfil = pf, atualizado_em = now()
    where id = u.id returning * into u;
  return public.perfil_resposta(u);
end $$;

create or replace function public.preferencias_obter(p_chave text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario();
begin
  if p_chave !~ '^(visitas|custos|portal)\.[a-z0-9_.-]{1,40}$' then raise exception 'Chave inválida.' using errcode = 'PT400'; end if;
  return jsonb_build_object('dados', (select dados from public.preferencias where usuario_id = u.id and chave = p_chave));
end $$;

create or replace function public.preferencias_salvar(p_chave text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario();
begin
  if p_chave !~ '^(visitas|custos|portal)\.[a-z0-9_.-]{1,40}$' then raise exception 'Chave inválida.' using errcode = 'PT400'; end if;
  if length(coalesce(p_dados::text, '')) > 200000 then raise exception 'Preferências grandes demais.' using errcode = 'PT413'; end if;
  insert into public.preferencias (usuario_id, chave, dados) values (u.id, p_chave, p_dados)
    on conflict (usuario_id, chave) do update set dados = excluded.dados;
  return '{"ok": true}'::jsonb;
end $$;

create or replace function public.organizacao_obter() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o jsonb;
begin
  perform public.exigir_usuario();
  select dados into o from public.organizacao where id = 1;
  return jsonb_build_object('organizacao', jsonb_build_object('nome', o -> 'nome', 'unidade', o -> 'unidade', 'cidade', o -> 'cidade', 'setor', o -> 'setor',
    'empresaResponsavel', o -> 'empresaResponsavel', 'empresasGrupo', coalesce(o -> 'empresasGrupo', '[]'::jsonb),
    'revisoresPadrao', coalesce(o -> 'revisoresPadrao', '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- painéis
/** Itens dos dois sistemas. com_valores = totais e aprovação dos orçamentos (nunca no painel público). */
create or replace function public.coletar_itens(p_dono uuid, com_valores boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare nomes jsonb := public.mapa_nomes(); itens jsonb; custos jsonb; clientes int;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'sys', 'visitas', 'k', v.tipo, 'id', v.id,
      'nome', case when v.tipo = 'evt' then coalesce(nullif(v.dados #>> '{cli,evento}', ''), nullif(v.dados #>> '{cli,nome}', ''), '(evento sem nome)')
                   else coalesce(nullif(v.dados #>> '{cli,nome}', ''), '(sem nome)') end,
      'userId', v.dono_id, 'userName', coalesce(nomes ->> v.dono_id::text, 'Usuário'), 'status', v.status,
      'data', coalesce(nullif(v.dados #>> '{cli,data}', ''), to_char(v.criado_em, 'YYYY-MM-DD')), 'atualizado', public.iso(v.atualizado_em))), '[]'::jsonb)
    into itens from public.visitas v where p_dono is null or v.dono_id = p_dono;
  select coalesce(jsonb_agg(jsonb_build_object(
      'sys', 'custos', 'k', 'custo', 'id', p.id, 'nome', coalesce(nullif(p.dados #>> '{info,nome}', ''), '(projeto sem nome)'),
      'tipo', case p.dados #>> '{info,tipo}' when 'rede' then 'Projeto de rede' when 'backbone' then 'Projeto de backbone' when 'cliente' then 'Projeto de cliente'
                  when 'evento' then 'Evento' when 'condominio' then 'Condomínio' else '' end,
      'userId', p.dono_id, 'userName', coalesce(nomes ->> p.dono_id::text, 'Usuário'),
      'status', public.situacao_aprovacao(p.id, p.conteudo_alterado_em, nomes) ->> 'status',
      'data', left(coalesce(nullif(p.dados #>> '{info,data}', ''), to_char(p.criado_em, 'YYYY-MM-DD')), 10), 'atualizado', public.iso(p.atualizado_em))
      || case when com_valores then jsonb_build_object('cliente', coalesce(p.dados #>> '{info,cliente}', ''), 't', public.totais_projeto(p.dados),
                                                      'aprov', public.situacao_aprovacao(p.id, p.conteudo_alterado_em, nomes)) else '{}'::jsonb end), '[]'::jsonb)
    into custos from public.projetos_custos p where (p_dono is null or p.dono_id = p_dono) and not public.projeto_vazio(p.dados);
  select count(distinct lower(x)) into clientes from (
    select coalesce(nullif(v.dados #>> '{cli,evento}', ''), v.dados #>> '{cli,nome}', '') x from public.visitas v where p_dono is null or v.dono_id = p_dono
    union all
    select coalesce(nullif(p.dados #>> '{info,cliente}', ''), p.dados #>> '{info,nome}', '') from public.projetos_custos p
      where (p_dono is null or p.dono_id = p_dono) and not public.projeto_vazio(p.dados)) t;
  return jsonb_build_object('itens', itens || custos, 'clientes', clientes);
end $$;
revoke execute on function public.coletar_itens(uuid, boolean) from public, anon, authenticated;

/** Painel público (sem login): só nome da demanda, responsável, tipo, status e data. Liga em organizacao.dados.painelPublico. */
create or replace function public.painel_publico() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not coalesce((select (dados ->> 'painelPublico')::boolean from public.organizacao where id = 1), false) then
    raise exception 'Painel público desabilitado.' using errcode = 'PT404';
  end if;
  r := public.coletar_itens(null, false);
  return r || jsonb_build_object('usuarios', coalesce((select jsonb_agg(distinct jsonb_build_object('id', x ->> 'userId', 'name', x ->> 'userName'))
    from jsonb_array_elements(r -> 'itens') x), '[]'::jsonb));
end $$;

create or replace function public.painel(p_escopo text default 'meu') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario();
begin
  if p_escopo = 'equipe' then
    if u.papel <> 'supervisor' then raise exception 'Acesso restrito à supervisão.' using errcode = 'PT403'; end if;
    return public.coletar_itens(null, true);
  end if;
  return public.coletar_itens(u.id, true);
end $$;

revoke execute on function public.sessao_eu(), public.sessao_concluir_troca_senha(), public.usuarios_listar(), public.perfil_obter(),
  public.perfil_atualizar(jsonb), public.preferencias_obter(text), public.preferencias_salvar(text, jsonb), public.organizacao_obter(),
  public.painel(text), public.painel_publico()
from public, anon;
grant execute on function public.sessao_eu(), public.sessao_concluir_troca_senha(), public.usuarios_listar(), public.perfil_obter(),
  public.perfil_atualizar(jsonb), public.preferencias_obter(text), public.preferencias_salvar(text, jsonb), public.organizacao_obter(),
  public.painel(text), public.painel_publico()
to authenticated;
grant execute on function public.painel_publico() to anon;

-- ---------------------------------------------------------------- uso exclusivo da Edge Function (chave de serviço)
/** Encerra todas as sessões de um usuário (senha redefinida ou conta desativada). */
create or replace function public.admin_encerrar_sessoes(p_usuario uuid) returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = p_usuario
$$;
revoke execute on function public.admin_encerrar_sessoes(uuid) from public, anon, authenticated;
grant execute on function public.admin_encerrar_sessoes(uuid) to service_role;
