-- 0101 — Central da plataforma: nome da empresa e quem é o Administrador.
--
-- A Central mostrava cada empresa só por um código ("Empresa e1c70f4c") e
-- o Owner não tinha como saber quem administra cada uma. O limite continua:
-- a plataforma não lê o cadastro nem os dados operacionais da empresa.
-- Passa a ver só:
--   1) o NOME DE EXIBIÇÃO (o mesmo da 0079 da linha Neon: gravado no perfil
--      SaaS, mantido quando a empresa se renomeia);
--   2) nome, e-mail e situação de quem tem o papel Administrador (código
--      'admin'), inclusive convite ainda não aceito — o contato de suporte
--      que o próprio Owner cadastrou ao criar a empresa.
-- Pode rodar de novo.

alter table public.company_platform_profiles
  add column if not exists display_name text;

comment on column public.company_platform_profiles.display_name is
  'Nome de exibição da empresa na Administração Central (companies.name, sincronizado por gatilho).';

create or replace function public.fn_seed_company_platform_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_platform_profiles (company_id, lifecycle_status, display_name)
  values (NEW.id, 'ACTIVE', NEW.name)
  on conflict (company_id) do nothing;

  insert into public.company_modules (company_id, module_code, contracted, enabled_by_company)
  select NEW.id, m.code, true, true from public.platform_modules m
  on conflict (company_id, module_code) do nothing;

  return NEW;
end;
$$;

create or replace function public.fn_sync_company_display_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.company_platform_profiles set display_name = NEW.name where company_id = NEW.id;
  return NEW;
end;
$$;

drop trigger if exists sync_company_display_name on public.companies;
create trigger sync_company_display_name
  after update of name on public.companies
  for each row when (NEW.name is distinct from OLD.name)
  execute procedure public.fn_sync_company_display_name();

update public.company_platform_profiles p
set display_name = c.name
from public.companies c
where c.id = p.company_id and p.display_name is distinct from c.name;

-- Administradores de cada empresa, para o Owner (platform.companies.view).
create or replace function public.fn_platform_company_admins()
returns table (company_id uuid, name text, email text, situation text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_platform_permission('platform.companies.view') then
    raise exception 'Permissão negada (platform.companies.view).' using errcode = '42501';
  end if;
  return query
  select u.company_id, u.name, u.email,
    case
      when u.auth_user_id is not null and u.status = 'active' then 'ativo'
      when exists (select 1 from public.user_invitations i where i.user_id = u.id and i.status = 'pending' and i.expires_at > now()) then 'convite pendente'
      when u.auth_user_id is null then 'sem acesso'
      else 'inativo'
    end
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.roles r on r.id = ur.role_id and r.company_id = u.company_id
  where r.code = 'admin'
  order by u.company_id, u.name;
end;
$$;

revoke all on function public.fn_platform_company_admins() from public, anon;
grant execute on function public.fn_platform_company_admins() to authenticated, service_role;
revoke execute on function public.fn_sync_company_display_name() from public, anon, authenticated;
revoke execute on function public.fn_seed_company_platform_defaults() from public, anon, authenticated;
