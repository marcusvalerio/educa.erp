-- 0112 — Nos grupos da turma, o Gerente volta a excluir cadastros, mas só
-- os que já estão INATIVOS. Os demais papéis de aluno seguem sem excluir
-- (0110); o professor (Administrador do grupo) exclui sempre.
--
-- A trava "só inativo" está em dois lugares:
--   * servidor (table.ts): toda exclusão de cadastro pela tela;
--   * banco (gatilho abaixo): exclusão direta pela API do banco com o
--     login do aluno (papel authenticated).

create or replace function public.fn_guard_group_delete_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.fn_is_delete_permission(new.permission_id)
     and exists (
       select 1 from public.roles r join public.companies c on c.id = r.company_id
       where r.id = new.role_id and c.parent_company_id is not null and r.code not in ('admin', 'gerente')
     ) then
    return null; -- ignora em silêncio: só Administrador e Gerente excluem nos grupos
  end if;
  return new;
end;
$$;

-- Devolve ao Gerente dos grupos as exclusões do modelo de Gerente.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.companies c on c.id = r.company_id and c.parent_company_id is not null
join public.permissions p on p.code in (select public.fn_role_template_permission_codes('gerente'))
where r.code = 'gerente'
  and public.fn_is_delete_permission(p.id)
on conflict do nothing;

create or replace function public.fn_guard_group_delete_active()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'active'
     and current_setting('role', true) = 'authenticated'
     and exists (select 1 from public.companies c where c.id = old.company_id and c.parent_company_id is not null)
     and not exists (
       select 1 from public.users u
       where u.auth_user_id = auth.uid() and u.company_id = old.company_id and u.is_supervisor and u.status = 'active'
     ) then
    raise exception 'Inative o cadastro antes de excluir. Nos grupos da turma só se exclui o que já está inativo.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke all on function public.fn_guard_group_delete_active() from public, anon, authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['brands', 'carriers', 'categories', 'customers', 'drivers', 'price_lists', 'product_lots',
    'product_serial_numbers', 'products', 'suppliers', 'vehicles', 'warehouse_locations', 'warehouses']
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'status')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'company_id') then
      execute format('drop trigger if exists guard_group_delete_active on public.%I', v_table);
      execute format('create trigger guard_group_delete_active before delete on public.%I for each row execute function public.fn_guard_group_delete_active()', v_table);
    end if;
  end loop;
end;
$$;
