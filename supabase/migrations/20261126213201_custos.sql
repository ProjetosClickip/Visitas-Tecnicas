-- =====================================================================
-- Mensuração de Custos
-- - Projetos: colaborador vê os próprios; supervisão vê todos (com valores).
-- - Aprovação: registrada aqui em nome do supervisor logado.
-- - Histórico: escrito aqui a partir das ações informadas pelo navegador.
-- - Prestadoras, catálogo e configurações: compartilhados, com controle de versão.
-- =====================================================================

create or replace function public.limpar_projeto(d jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare r jsonb := coalesce(d, '{}'::jsonb) - array['id','ownerId','criadoPor','aprovacoes','conteudoAlteradoEm','alteradoPor','versao','excluido','atualizadoEm','historico'];
begin
  if jsonb_typeof(r -> 'info') is distinct from 'object' then r := r || '{"info": {}}'::jsonb; end if;
  if jsonb_typeof(r -> 'materiais') is distinct from 'array' then r := r || '{"materiais": []}'::jsonb; end if;
  if jsonb_typeof(r -> 'servicos') is distinct from 'array' then r := r || '{"servicos": []}'::jsonb; end if;
  if jsonb_typeof(r -> 'importacoes') is distinct from 'array' then r := r || '{"importacoes": []}'::jsonb; end if;
  return r;
end $$;

/** Acrescenta ações ao histórico (autor = usuário da sessão); repetidas em menos de 3 min são agrupadas. */
create or replace function public.registrar_acoes(hist jsonb, acoes text[], u public.perfis) returns jsonb
language plpgsql stable set search_path = '' as $$
declare h jsonb := coalesce(hist, '[]'::jsonb); a text; ult jsonb; n int; agora text := public.iso(now());
begin
  if jsonb_typeof(h) <> 'array' then h := '[]'::jsonb; end if;
  foreach a in array coalesce(acoes, array[]::text[]) loop
    a := left(trim(a), 300);
    continue when a = '';
    n := jsonb_array_length(h);
    ult := case when n > 0 then h -> (n - 1) end;
    if ult is not null and ult ->> 'uid' = u.id::text and ult ->> 'acao' = a
       and now() - (ult ->> 'em')::timestamptz < interval '3 minutes' then
      h := jsonb_set(h, array[(n - 1)::text], ult || jsonb_build_object('em', agora, 'n', coalesce((ult ->> 'n')::int, 1) + 1));
    else
      h := h || jsonb_build_array(jsonb_build_object('em', agora, 'uid', u.id, 'nome', u.nome, 'acao', a));
    end if;
  end loop;
  n := jsonb_array_length(h);
  if n > 500 then
    select jsonb_agg(x order by o) into h from jsonb_array_elements(h) with ordinality t(x, o) where o > n - 500;
  end if;
  return h;
end $$;

create or replace function public.mapa_aprovacoes(p_projeto text, nomes jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(a.usuario_id::text, jsonb_build_object('status', 'aprovado', 'em', public.iso(a.em), 'porUid', a.usuario_id,
    'porNome', nomes ->> a.usuario_id::text, 'obs', a.obs, 'total', a.total)), '{}'::jsonb)
  from public.aprovacoes_custos a where a.projeto_id = p_projeto
$$;

create or replace function public.situacao_aprovacao(p_projeto text, conteudo_alterado_em timestamptz, nomes jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  with regs as (select a.usuario_id, a.em from public.aprovacoes_custos a where a.projeto_id = p_projeto),
  info as (select count(*) n, min(em) primeira from regs)
  select jsonb_build_object(
    'regs', coalesce((select jsonb_agg(jsonb_build_object('usuarioId', r.usuario_id, 'nome', nomes ->> r.usuario_id::text, 'em', public.iso(r.em)) order by r.em) from regs r), '[]'::jsonb),
    'n', i.n,
    'alterado', coalesce(i.primeira is not null and conteudo_alterado_em > i.primeira, false),
    'status', case when i.n > 0 and not coalesce(conteudo_alterado_em > i.primeira, false) then 'done' else 'draft' end)
  from info i
$$;

create or replace function public.montar_projeto(p public.projetos_custos, nomes jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select p.dados || jsonb_build_object(
    'id', p.id, 'ownerId', p.dono_id, 'criadoPor', jsonb_build_object('uid', p.dono_id, 'nome', nomes ->> p.dono_id::text),
    'criadoEm', coalesce(p.dados ->> 'criadoEm', public.iso(p.criado_em)), 'atualizadoEm', public.iso(p.atualizado_em),
    'conteudoAlteradoEm', public.iso(p.conteudo_alterado_em),
    'alteradoPor', case when p.atualizado_por is not null then jsonb_build_object('uid', p.atualizado_por, 'nome', nomes ->> p.atualizado_por::text) end,
    'aprovacoes', public.mapa_aprovacoes(p.id, nomes), 'versao', p.versao)
$$;

create or replace function public.projeto_permitido(p_id text, u public.perfis) returns public.projetos_custos
language plpgsql security definer set search_path = '' as $$
declare p public.projetos_custos;
begin
  select * into p from public.projetos_custos where id = p_id for update;
  if not found or (p.dono_id <> u.id and u.papel <> 'supervisor') then raise exception 'Projeto não encontrado.' using errcode = 'PT404'; end if;
  return p;
end $$;

create or replace function public.projeto_vazio(d jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_array_length(coalesce(d -> 'materiais', '[]'::jsonb)) = 0 and jsonb_array_length(coalesce(d -> 'servicos', '[]'::jsonb)) = 0
     and coalesce(d #>> '{info,cliente}', '') = '' and coalesce(nullif(d #>> '{info,nome}', ''), 'Novo projeto') = 'Novo projeto'
$$;

create or replace function public.ler_documento(p_chave text, padrao jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('dados', d.dados, 'versao', d.versao, 'atualizadoEm', public.iso(d.atualizado_em)) from public.documentos d where d.chave = p_chave),
    jsonb_build_object('dados', padrao, 'versao', 0, 'atualizadoEm', null))
$$;

revoke execute on function public.limpar_projeto(jsonb), public.registrar_acoes(jsonb, text[], public.perfis), public.mapa_aprovacoes(text, jsonb),
  public.situacao_aprovacao(text, timestamptz, jsonb), public.montar_projeto(public.projetos_custos, jsonb), public.projeto_permitido(text, public.perfis),
  public.projeto_vazio(jsonb), public.ler_documento(text, jsonb)
from public, anon, authenticated;

-- ---------------------------------------------------------------- carga inicial
create or replace function public.custos_inicial() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); nomes jsonb := public.mapa_nomes(); org jsonb;
begin
  select dados into org from public.organizacao where id = 1;
  return jsonb_build_object(
    'projetos', coalesce((select jsonb_agg(public.montar_projeto(p, nomes) order by p.atualizado_em desc) from public.projetos_custos p
                          where u.papel = 'supervisor' or p.dono_id = u.id), '[]'::jsonb),
    'prestadoras', coalesce((select jsonb_agg(p.dados || jsonb_build_object('id', p.id, 'versao', p.versao)) from public.prestadoras p), '[]'::jsonb),
    'catalogo', public.ler_documento('custos.catalogo', '{"itens": [], "fonte": ""}'::jsonb),
    'config', public.ler_documento('custos.config', '{}'::jsonb),
    'aprovadores', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'cargo', p.cargo) order by p.nome) from public.perfis p
                             where p.papel = 'supervisor' and p.ativo), '[]'::jsonb),
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object('id', k, 'nome', v)) from jsonb_each_text(nomes) e(k, v)), '[]'::jsonb),
    'organizacao', jsonb_build_object('nome', org -> 'nome', 'cidade', org -> 'cidade', 'setor', org -> 'setor',
                                      'empresaResponsavel', org -> 'empresaResponsavel', 'empresasGrupo', coalesce(org -> 'empresasGrupo', '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------- projetos
create or replace function public.custos_criar_projeto(p_projeto jsonb, p_acoes text[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); pid text := p_projeto ->> 'id'; d jsonb; p public.projetos_custos;
begin
  if not public.id_valido(pid) or exists (select 1 from public.projetos_custos where id = pid) then pid := public.novo_id('p'); end if;
  d := public.limpar_projeto(p_projeto) || jsonb_build_object('criadoEm', public.iso(now()));
  d := d || jsonb_build_object('historico', public.registrar_acoes('[]'::jsonb,
         array['Projeto criado'] || array(select x from unnest(coalesce(p_acoes, '{}')) x where x <> 'Projeto criado'), u));
  insert into public.projetos_custos (id, dono_id, dados, conteudo_alterado_em, atualizado_por) values (pid, u.id, d, now(), u.id) returning * into p;
  perform public.auditar(u.id, 'custos.projeto_criar', 'projeto', pid);
  return jsonb_build_object('projeto', public.montar_projeto(p, public.mapa_nomes()));
end $$;

create or replace function public.custos_salvar_projeto(p_id text, p_projeto jsonb, p_versao integer, p_acoes text[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); p public.projetos_custos; d jsonb; mudou boolean;
begin
  if p_projeto is null or jsonb_typeof(p_projeto) <> 'object' then raise exception 'Projeto ausente.' using errcode = 'PT400'; end if;
  p := public.projeto_permitido(p_id, u);
  if p_versao is distinct from p.versao then
    return jsonb_build_object('conflito', true, 'atual', public.montar_projeto(p, public.mapa_nomes()));
  end if;
  d := public.limpar_projeto(p_projeto) || jsonb_build_object('criadoEm', coalesce(p.dados ->> 'criadoEm', public.iso(p.criado_em)));
  mudou := (d - 'criadoEm') <> (public.limpar_projeto(p.dados) - 'criadoEm');
  d := d || jsonb_build_object('historico', public.registrar_acoes(p.dados -> 'historico', case when mudou then p_acoes else '{}' end, u));
  update public.projetos_custos set dados = d, versao = versao + 1,
      conteudo_alterado_em = case when mudou then now() else conteudo_alterado_em end, atualizado_em = now(), atualizado_por = u.id
    where id = p_id returning * into p;
  return jsonb_build_object('projeto', public.montar_projeto(p, public.mapa_nomes()));
end $$;

create or replace function public.custos_excluir_projeto(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); p public.projetos_custos;
begin
  p := public.projeto_permitido(p_id, u);
  delete from public.projetos_custos where id = p_id;
  perform public.auditar(u.id, 'custos.projeto_excluir', 'projeto', p_id, jsonb_build_object('nome', p.dados #>> '{info,nome}'));
  return '{"ok": true}'::jsonb;
end $$;

-- ---------------------------------------------------------------- aprovação (não muda a versão do conteúdo)
create or replace function public.custos_aprovar(p_id text, p_obs text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_supervisor(); p public.projetos_custos; v_total numeric;
begin
  p := public.projeto_permitido(p_id, u);
  v_total := (public.totais_projeto(p.dados) ->> 'total')::numeric;
  insert into public.aprovacoes_custos (projeto_id, usuario_id, em, obs, total) values (p_id, u.id, now(), left(trim(coalesce(p_obs, '')), 2000), v_total)
    on conflict (projeto_id, usuario_id) do update set em = excluded.em, obs = excluded.obs, total = excluded.total;
  update public.projetos_custos set dados = jsonb_set(dados, '{historico}', public.registrar_acoes(dados -> 'historico',
      array['Projeto aprovado por ' || u.nome || case when u.cargo <> '' then ' (' || u.cargo || ')' else '' end], u)), atualizado_em = now()
    where id = p_id returning * into p;
  perform public.auditar(u.id, 'custos.aprovar', 'projeto', p_id, jsonb_build_object('total', v_total));
  return jsonb_build_object('projeto', public.montar_projeto(p, public.mapa_nomes()));
end $$;

create or replace function public.custos_revogar(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_supervisor(); p public.projetos_custos;
begin
  p := public.projeto_permitido(p_id, u);
  delete from public.aprovacoes_custos where projeto_id = p_id and usuario_id = u.id;
  if not found then raise exception 'Você não aprovou este projeto.' using errcode = 'PT400'; end if;
  update public.projetos_custos set dados = jsonb_set(dados, '{historico}', public.registrar_acoes(dados -> 'historico',
      array['Aprovação revogada por ' || u.nome || case when u.cargo <> '' then ' (' || u.cargo || ')' else '' end], u)), atualizado_em = now()
    where id = p_id returning * into p;
  perform public.auditar(u.id, 'custos.revogar', 'projeto', p_id);
  return jsonb_build_object('projeto', public.montar_projeto(p, public.mapa_nomes()));
end $$;

-- ---------------------------------------------------------------- prestadoras (compartilhadas)
create or replace function public.custos_salvar_prestadora(p_id text, p_prestadora jsonb, p_versao integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); atual integer; r public.prestadoras;
begin
  if not public.id_valido(p_id) then raise exception 'Identificador inválido.' using errcode = 'PT400'; end if;
  select versao into atual from public.prestadoras where id = p_id for update;
  if coalesce(atual, 0) <> coalesce(p_versao, 0) then
    raise exception 'Esta prestadora foi alterada por outra pessoa. Recarregue a página.' using errcode = 'PT409', hint = 'CONFLITO';
  end if;
  insert into public.prestadoras (id, dados, atualizado_por) values (p_id, coalesce(p_prestadora, '{}'::jsonb) - 'id' - 'versao', u.id)
    on conflict (id) do update set dados = excluded.dados, versao = public.prestadoras.versao + 1, atualizado_em = now(), atualizado_por = u.id
    returning * into r;
  perform public.auditar(u.id, 'custos.prestadora_gravar', 'prestadora', p_id);
  return jsonb_build_object('prestadora', r.dados || jsonb_build_object('id', r.id, 'versao', r.versao));
end $$;

create or replace function public.custos_excluir_prestadora(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario();
begin
  delete from public.prestadoras where id = p_id;
  perform public.auditar(u.id, 'custos.prestadora_excluir', 'prestadora', p_id);
  return '{"ok": true}'::jsonb;
end $$;

-- ---------------------------------------------------------------- catálogo e configurações (compartilhados)
create or replace function public.custos_salvar_documento(p_chave text, p_dados jsonb, p_versao integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_usuario(); atual integer;
begin
  if p_chave not in ('custos.catalogo', 'custos.config') then raise exception 'Documento inválido.' using errcode = 'PT400'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Dados inválidos.' using errcode = 'PT400'; end if;
  if p_chave = 'custos.catalogo' and jsonb_typeof(p_dados -> 'itens') is distinct from 'array' then raise exception 'Lista de itens ausente.' using errcode = 'PT400'; end if;
  select versao into atual from public.documentos where chave = p_chave for update;
  if coalesce(atual, 0) <> coalesce(p_versao, 0) then
    raise exception 'Outra pessoa alterou estes dados. Recarregue a página.' using errcode = 'PT409', hint = 'CONFLITO';
  end if;
  insert into public.documentos (chave, dados, atualizado_por) values (p_chave, p_dados, u.id)
    on conflict (chave) do update set dados = excluded.dados, versao = public.documentos.versao + 1, atualizado_em = now(), atualizado_por = u.id;
  perform public.auditar(u.id, 'documento.gravar', 'documento', p_chave);
  return public.ler_documento(p_chave, null);
end $$;

/** Restaura o catálogo a partir do catálogo inicial guardado no banco. Somente supervisão. */
create or replace function public.custos_restaurar_catalogo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u public.perfis := public.exigir_supervisor(); ini jsonb;
begin
  select dados into ini from public.documentos where chave = 'custos.catalogo_inicial';
  if ini is null then raise exception 'Catálogo inicial não cadastrado no banco.' using errcode = 'PT404'; end if;
  insert into public.documentos (chave, dados, atualizado_por) values ('custos.catalogo', ini, u.id)
    on conflict (chave) do update set dados = excluded.dados, versao = public.documentos.versao + 1, atualizado_em = now(), atualizado_por = u.id;
  perform public.auditar(u.id, 'custos.catalogo_restaurar', 'documento', 'custos.catalogo');
  return public.ler_documento('custos.catalogo', null);
end $$;

revoke execute on function public.custos_inicial(), public.custos_criar_projeto(jsonb, text[]), public.custos_salvar_projeto(text, jsonb, integer, text[]),
  public.custos_excluir_projeto(text), public.custos_aprovar(text, text), public.custos_revogar(text), public.custos_salvar_prestadora(text, jsonb, integer),
  public.custos_excluir_prestadora(text), public.custos_salvar_documento(text, jsonb, integer), public.custos_restaurar_catalogo()
from public, anon;
grant execute on function public.custos_inicial(), public.custos_criar_projeto(jsonb, text[]), public.custos_salvar_projeto(text, jsonb, integer, text[]),
  public.custos_excluir_projeto(text), public.custos_aprovar(text, text), public.custos_revogar(text), public.custos_salvar_prestadora(text, jsonb, integer),
  public.custos_excluir_prestadora(text), public.custos_salvar_documento(text, jsonb, integer), public.custos_restaurar_catalogo()
to authenticated;
