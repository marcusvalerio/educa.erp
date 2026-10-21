-- 0103 — A lista de setores (fn_sectors) voltava "permissão negada" para quem
-- está logado: ela lê o catálogo fn_sector_catalog, que é interno (fechado na
-- 0102), e rodava com os direitos de quem chama. Sem a lista, a tela de grupos
-- e a de usuários escondiam o campo Setor. Passa a rodar como dono, devolvendo
-- só código e nome. Pode rodar de novo.

create or replace function public.fn_sectors()
returns table (code text, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select c.code, c.name from public.fn_sector_catalog() c $$;

revoke all on function public.fn_sectors() from public, anon;
grant execute on function public.fn_sectors() to authenticated, service_role;
