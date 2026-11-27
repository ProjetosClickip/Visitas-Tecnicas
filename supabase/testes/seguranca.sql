-- =====================================================================
-- Testes das regras de segurança, simulando usuários.
-- Roda tudo dentro de um bloco que termina com erro de propósito:
-- o relatório aparece na mensagem e NADA fica gravado no banco.
-- Rodar no SQL Editor do Supabase (ou pela ferramenta execute_sql).
-- =====================================================================
do $teste$
declare
  colab uuid := gen_random_uuid(); sup uuid := gen_random_uuid(); novato uuid := gen_random_uuid();
  r jsonb; v jsonb; p jsonb; rel text := ''; msg text;
begin
  -- contas de teste
  insert into auth.users (id, email, aud, role) values
    (colab, 'colab.teste@exemplo.test', 'authenticated', 'authenticated'),
    (sup, 'sup.teste@exemplo.test', 'authenticated', 'authenticated'),
    (novato, 'novato.teste@exemplo.test', 'authenticated', 'authenticated');
  insert into public.perfis (id, email, nome, papel, trocar_senha) values
    (colab, 'colab.teste@exemplo.test', 'Colaborador Teste', 'colaborador', false),
    (sup, 'sup.teste@exemplo.test', 'Supervisora Teste', 'supervisor', false),
    (novato, 'novato.teste@exemplo.test', 'Novato', 'colaborador', true);

  -- "entrar" como um usuário = definir as claims do JWT e o papel authenticated
  -- 1) acesso direto às tabelas bloqueado
  perform set_config('request.jwt.claims', json_build_object('sub', colab, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform count(*) from public.visitas;
    rel := rel || E'\n' || 'FALHA 1: authenticated leu a tabela visitas diretamente';
  exception when insufficient_privilege then rel := rel || E'\n' || 'ok 1: tabela visitas fechada para acesso direto';
  end;

  -- 2) colaborador cria visita com status forjado
  v := public.visitas_criar('{"id":"v_teste_seg1","type":"cond","status":"done","aprovacao":{"por":"Forjado"},"userId":"x","cli":{"nome":"Cond A"},"photos":[{"src":"data:image/png;base64,AAAA"}]}'::jsonb);
  rel := rel || E'\n' || case when v ->> 'status' = 'draft' and v -> 'aprovacao' is null and v ->> 'userId' = colab::text
                     then 'ok 2: status/aprovação/dono forjados ignorados' else 'FALHA 2: ' || v::text end;

  -- 3) colaborador não aprova
  begin
    perform public.visitas_aprovar('v_teste_seg1', 'x');
    rel := rel || E'\n' || 'FALHA 3: colaborador aprovou';
  exception when others then get stacked diagnostics msg = message_text;
    rel := rel || E'\n' || ('ok 3: colaborador não aprova (' || msg || ')');
  end;
  begin
    perform public.visitas_status('v_teste_seg1', 'done');
    rel := rel || E'\n' || 'FALHA 3b: status done pelo colaborador';
  exception when others then rel := rel || E'\n' || 'ok 3b: status "done" recusado';
  end;

  -- 4) colaborador não lista "todas"
  begin
    perform public.visitas_listar('todas');
    rel := rel || E'\n' || 'FALHA 4: colaborador listou todas';
  exception when others then rel := rel || E'\n' || 'ok 4: lista da equipe restrita à supervisão';
  end;

  -- 5) envio para aprovação
  v := public.visitas_status('v_teste_seg1', 'pending');
  rel := rel || E'\n' || case when v ->> 'status' = 'pending' and v ? 'enviadoEm' then 'ok 5: enviado para aprovação' else 'FALHA 5' end;

  -- 6) supervisão aprova
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  v := public.visitas_aprovar('v_teste_seg1', 'Aprovado no teste');
  rel := rel || E'\n' || case when v ->> 'status' = 'done' and v #>> '{aprovacao,por}' = 'Supervisora Teste' then 'ok 6: supervisão aprova em nome próprio' else 'FALHA 6: ' || v::text end;
  r := public.visitas_listar('todas');
  rel := rel || E'\n' || case when jsonb_array_length(r) >= 1 and (r -> 0 ->> '_lite')::boolean then 'ok 6b: supervisão lista todas (versão resumida)' else 'FALHA 6b' end;
  -- visita da supervisão, para testar acesso cruzado
  perform public.visitas_criar('{"id":"v_teste_sup1","type":"evt","cli":{"evento":"Evento Sup"}}'::jsonb);

  -- 7) colaborador altera visita aprovada -> volta para "Em andamento"
  perform set_config('request.jwt.claims', json_build_object('sub', colab, 'role', 'authenticated')::text, true);
  v := public.visitas_obter('v_teste_seg1');
  r := public.visitas_salvar('v_teste_seg1', v || '{"obs":"mudei"}'::jsonb, (v ->> 'versao')::int);
  rel := rel || E'\n' || case when (r ->> 'statusAlterado')::boolean and r #>> '{visita,status}' = 'draft' then 'ok 7: aprovada + alterada volta para Em andamento' else 'FALHA 7: ' || r::text end;

  -- 8) conflito de versão
  r := public.visitas_salvar('v_teste_seg1', v || '{"obs":"versão velha"}'::jsonb, (v ->> 'versao')::int);
  rel := rel || E'\n' || case when (r ->> 'conflito')::boolean and r #>> '{atual,obs}' = 'mudei' then 'ok 8: versão desatualizada gera conflito sem gravar' else 'FALHA 8: ' || r::text end;

  -- 9) colaborador não vê nem altera visita alheia
  begin
    perform public.visitas_obter('v_teste_sup1');
    rel := rel || E'\n' || 'FALHA 9: colaborador leu visita alheia';
  exception when others then rel := rel || E'\n' || 'ok 9: visita de outra pessoa invisível';
  end;
  begin
    perform public.visitas_excluir('v_teste_sup1');
    rel := rel || E'\n' || 'FALHA 9b: colaborador excluiu visita alheia';
  exception when others then rel := rel || E'\n' || 'ok 9b: não exclui visita alheia';
  end;

  -- 10) assinatura: exige senha recente; invalida se o conteúdo mudar
  perform public.perfil_atualizar('{"assinatura":{"img":"data:image/png;base64,iVBOR","cpf":"123.456.789-01"}}'::jsonb);
  v := public.visitas_obter('v_teste_seg1');
  begin
    perform public.visitas_assinar('v_teste_seg1', (v ->> 'versao')::int);
    rel := rel || E'\n' || 'FALHA 10: assinou sem senha recente';
  exception when others then rel := rel || E'\n' || 'ok 10: assinatura exige senha digitada agora';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', colab, 'role', 'authenticated',
    'amr', json_build_array(json_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, true);
  v := public.visitas_assinar('v_teste_seg1', (v ->> 'versao')::int);
  rel := rel || E'\n' || case when (v #>> '{assinatura,valida}')::boolean and v #>> '{assinatura,cpf}' = '***.456.789-**' and v #>> '{assinatura,codigo}' ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'
                     then 'ok 10b: assinatura registrada pelo banco (CPF mascarado, código)' else 'FALHA 10b: ' || (v -> 'assinatura')::text end;
  r := public.visitas_salvar('v_teste_seg1', v || '{"obs":"depois da assinatura"}'::jsonb || '{"assinatura":{"valida":true,"hash":"forjado"}}'::jsonb, (v ->> 'versao')::int);
  rel := rel || E'\n' || case when (r #>> '{visita,assinatura,valida}')::boolean = false then 'ok 10c: alteração invalida a assinatura' else 'FALHA 10c' end;

  -- 11) imagem com conteúdo malicioso recusada
  begin
    perform public.perfil_atualizar('{"avatar":"data:image/png;base64,AAA\" onerror=\"alert(1)"}'::jsonb);
    rel := rel || E'\n' || 'FALHA 11: imagem maliciosa aceita';
  exception when others then rel := rel || E'\n' || 'ok 11: imagem com HTML injetado recusada';
  end;

  -- 12) custos: aprovação forjada ignorada; colaborador não aprova; supervisão aprova; alteração sinalizada
  p := public.custos_criar_projeto('{"id":"p_teste_seg1","info":{"nome":"Rede X","cliente":"Cliente Sigiloso"},"materiais":[{"nome":"Cabo","quantidade":100,"valorUnitario":2.5}],"servicos":[{"descricao":"Lançamento","quantidade":1,"valorUnitario":300}],"aprovacoes":{"x":{"status":"aprovado"}},"historico":[{"nome":"Diretor","acao":"Projeto aprovado"}]}'::jsonb, '{"Projeto criado"}');
  rel := rel || E'\n' || case when p #> '{projeto,aprovacoes}' = '{}'::jsonb and jsonb_array_length(p #> '{projeto,historico}') = 1 and p #>> '{projeto,historico,0,nome}' = 'Colaborador Teste'
                     then 'ok 12: aprovação e histórico forjados ignorados' else 'FALHA 12: ' || p::text end;
  begin
    perform public.custos_aprovar('p_teste_seg1', '');
    rel := rel || E'\n' || 'FALHA 12b: colaborador aprovou orçamento';
  exception when others then rel := rel || E'\n' || 'ok 12b: colaborador não aprova orçamento';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  p := public.custos_aprovar('p_teste_seg1', 'ok');
  rel := rel || E'\n' || case when p #>> ('{projeto,aprovacoes,' || sup || ',porNome}')::text[] = 'Supervisora Teste' and (p #>> ('{projeto,aprovacoes,' || sup || ',total}')::text[])::numeric = 550
                     then 'ok 12c: supervisão aprova (total R$ 550 calculado no banco)' else 'FALHA 12c: ' || (p #> '{projeto,aprovacoes}')::text end;
  -- tudo aqui roda numa transação só (mesmo horário): recua a aprovação 1 minuto para simular a alteração feita depois
  reset role;
  update public.aprovacoes_custos set em = em - interval '1 minute' where projeto_id = 'p_teste_seg1';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', colab, 'role', 'authenticated')::text, true);
  p := p -> 'projeto';
  r := public.custos_salvar_projeto('p_teste_seg1', p || '{"servicos":[]}'::jsonb, (p ->> 'versao')::int, '{"Serviços alterados"}');
  rel := rel || E'\n' || case when r #>> '{projeto,historico,-1,acao}' = 'Serviços alterados' then 'ok 12d: aprovação não gera conflito; histórico gravado pelo banco' else 'FALHA 12d: ' || r::text end;
  perform set_config('request.jwt.claims', json_build_object('sub', sup, 'role', 'authenticated')::text, true);
  r := public.painel('equipe');
  select x into r from jsonb_array_elements(r -> 'itens') x where x ->> 'id' = 'p_teste_seg1';
  rel := rel || E'\n' || case when (r #>> '{aprov,alterado}')::boolean and r ->> 'status' = 'draft' then 'ok 12e: painel da supervisão marca "alterado após aprovação"' else 'FALHA 12e: ' || coalesce(r::text, 'null') end;

  -- 13) colaborador não vê projeto alheio / supervisão vê
  perform set_config('request.jwt.claims', json_build_object('sub', novato, 'role', 'authenticated')::text, true);
  begin
    perform public.custos_inicial();
    rel := rel || E'\n' || 'FALHA 13: conta com senha provisória acessou dados';
  exception when others then get stacked diagnostics msg = pg_exception_hint;
    rel := rel || E'\n' || ('ok 13: senha provisória bloqueia o acesso (' || msg || ')');
  end;

  -- 14) painel público: desligado por padrão; ligado não expõe valores, clientes nem e-mails
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform public.painel_publico();
    rel := rel || E'\n' || 'FALHA 14: painel público ativo sem configuração';
  exception when others then rel := rel || E'\n' || 'ok 14: painel público desligado por padrão';
  end;
  begin
    perform public.visitas_listar('minhas');
    rel := rel || E'\n' || 'FALHA 14b: anônimo chamou função interna';
  exception when others then rel := rel || E'\n' || 'ok 14b: anônimo não chama funções do sistema';
  end;
  reset role;
  update public.organizacao set dados = dados || '{"painelPublico": true}'::jsonb where id = 1;
  perform set_config('role', 'anon', true);
  r := public.painel_publico();
  rel := rel || E'\n' || case when r::text !~ 'Cliente Sigiloso|"t":|exemplo\.test|"aprov"' and jsonb_array_length(r -> 'itens') >= 2
                     then 'ok 14c: painel público sem valores, clientes ou e-mails' else 'FALHA 14c: ' || r::text end;
  reset role;

  raise exception E'RELATÓRIO DOS TESTES (tudo desfeito):\n%', rel;
end $teste$;
