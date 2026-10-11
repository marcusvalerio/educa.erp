-- 0079 — Nome da empresa na Administração Central (E2E NOVA ORBITA, P11).
--
-- A Central mostrava "Empresa e1c70f4c": a policy de public.companies só
-- expõe a linha aos membros da própria empresa, e a plataforma enxerga cada
-- empresa pelo perfil SaaS (company_platform_profiles). Esse limite continua:
-- a plataforma não passa a ler o cadastro da empresa. O perfil SaaS ganha só
-- o NOME DE EXIBIÇÃO — o mesmo nome que o Owner digita em "Nova empresa" —,
-- gravado na criação e mantido quando a empresa renomeia a si mesma. Razão
-- social, documento, endereço e dados operacionais continuam fora da Central.

alter table public.company_platform_profiles
  add column if not exists display_name text;

comment on column public.company_platform_profiles.display_name is
  'Nome de exibição da empresa na Administração Central (companies.name, sincronizado por gatilho; 0079).';

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

-- Empresas existentes.
update public.company_platform_profiles p
set display_name = c.name
from public.companies c
where c.id = p.company_id and p.display_name is distinct from c.name;
