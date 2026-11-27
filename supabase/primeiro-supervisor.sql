-- =====================================================================
-- Criar o PRIMEIRO supervisor (só é preciso uma vez).
-- Depois disso, as demais contas são criadas pela própria plataforma
-- (Ambiente da supervisão → Equipe → + Nova conta).
--
-- 1) No Supabase: Authentication → Users → Add user → Create new user
--    preencha e-mail e senha e marque "Auto Confirm User".
-- 2) Troque os três valores abaixo e rode no SQL Editor.
-- =====================================================================
insert into public.perfis (id, email, nome, cargo, papel, trocar_senha)
select id, email, 'NOME COMPLETO', 'CARGO', 'supervisor', false
from auth.users
where email = 'seu.email@clickip.com.br'
on conflict (id) do update set papel = 'supervisor', ativo = true;

select email, nome, papel from public.perfis;
