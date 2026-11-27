-- A Edge Function admin-usuarios usa a chave de serviço (service_role), que nesta versão do
-- Supabase não recebe acesso às tabelas novas automaticamente. Concede só o necessário:
-- ler/criar/alterar perfis, ler a configuração da organização e registrar auditoria.
grant select, insert, update on table public.perfis to service_role;
grant select on table public.organizacao to service_role;
grant insert on table public.auditoria to service_role;
