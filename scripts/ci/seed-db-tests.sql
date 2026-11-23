-- Dados mínimos para os testes de banco (tests/*-db.test.ts) no CI.
-- Os testes entram como o administrador da empresa da réplica (auth
-- 9126ce02…), que no banco de homologação já existe. Aqui ele é criado.
insert into auth.users (id, email, email_confirmed_at)
values ('9126ce02-9fdd-468b-955b-4b47becc0fea', 'admin.ci@example.com', now())
on conflict (id) do nothing;

-- O gatilho fn_guard_users_auth_link só aceita o vínculo pelo fluxo de convite.
select set_config('educa.auth_link', 'invitation', false);

insert into public.users (company_id, code, name, email, login, auth_user_id, status)
values ('00000000-0000-0000-0000-000000000001', 'USR-CI', 'Administrador CI', 'admin.ci@example.com', 'admin.ci', '9126ce02-9fdd-468b-955b-4b47becc0fea', 'active')
on conflict do nothing;

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from public.users u
join public.roles r on r.company_id = u.company_id and r.code = 'admin'
where u.auth_user_id = '9126ce02-9fdd-468b-955b-4b47becc0fea'
on conflict do nothing;

-- Um cliente e um endereço de estoque (os testes de reserva e de venda usam
-- o primeiro de cada da empresa).
insert into public.customers (company_id, code, name, document, type, status)
select '00000000-0000-0000-0000-000000000001', 'CLI-CI', 'Cliente CI', '11222333000181', 'company', 'active'
where not exists (select 1 from public.customers where company_id = '00000000-0000-0000-0000-000000000001');

insert into public.warehouses (company_id, code, name, type, status)
select '00000000-0000-0000-0000-000000000001', 'DEP-CI', 'Depósito CI', 'standard', 'active'
where not exists (select 1 from public.warehouses where company_id = '00000000-0000-0000-0000-000000000001');

insert into public.warehouse_locations (company_id, code, warehouse_id, purpose, status)
select w.company_id, 'END-CI', w.id, 'STOCK', 'active'
from public.warehouses w
where w.company_id = '00000000-0000-0000-0000-000000000001'
  and not exists (select 1 from public.warehouse_locations where company_id = w.company_id and warehouse_id is not null)
order by w.code
limit 1;
