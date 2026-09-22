-- Fase 23 — Estrutura organizacional do tenant:
--   EMPRESA -> UNIDADE/FILIAL -> SETOR -> CARGO -> USUÁRIO
--
-- branches (unidade/filial) já existe desde a fundação do schema e é
-- reaproveitada como está — nenhuma segunda tabela de "unidade" é criada.
-- users.branch_id também já existe; o que falta (e entra aqui) é setor,
-- cargo e acesso a MÚLTIPLAS unidades.
--
-- users.department (texto livre, legado) permanece intocado: o vínculo
-- estruturado passa a ser users.department_id, e a coluna antiga fica
-- como está para não quebrar dado nem leitura existente.

-- branches precisa da chave composta para as FKs multi-tenant abaixo
-- (mesmo padrão (id, company_id) usado em todo o schema).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'branches_id_company_id_key') then
    alter table public.branches add constraint branches_id_company_id_key unique (id, company_id);
  end if;
end;
$$;

-- ==================================================================
-- DEPARTMENTS (setores) — cadastro da própria empresa, hierárquico.
-- O seed abaixo é só um ponto de partida: a empresa cria, edita e
-- desativa os seus livremente (nada aqui é hardcoded em código).
-- ==================================================================
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  parent_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (parent_id, company_id) references public.departments (id, company_id) on delete set null
);

create trigger set_updated_at before update on public.departments
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists departments_company_status_idx on public.departments (company_id, status);

comment on table public.departments is
  'Setor/área da empresa (Logística, Financeiro, Produção...). Hierárquico por parent_id, com guarda anticiclo — mesma técnica de product_categories (0049) e asset_locations (0056).';

create or replace function public.fn_guard_department_hierarchy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
  v_depth integer := 0;
begin
  if NEW.parent_id is null then
    return NEW;
  end if;
  if NEW.parent_id = NEW.id then
    raise exception 'Um setor não pode ser seu próprio setor pai.' using errcode = 'P0001';
  end if;
  v_current := NEW.parent_id;
  while v_current is not null loop
    if v_current = NEW.id then
      raise exception 'Ciclo de hierarquia detectado em departments.' using errcode = 'P0001';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Hierarquia de setores excede a profundidade máxima suportada (100 níveis).' using errcode = 'P0001';
    end if;
    select parent_id into v_current from public.departments where id = v_current;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists guard_department_hierarchy on public.departments;
create trigger guard_department_hierarchy
  before insert or update of parent_id on public.departments
  for each row execute procedure public.fn_guard_department_hierarchy();

-- ==================================================================
-- POSITIONS (cargos/funções) — também da empresa. department_id é
-- opcional: existem cargos transversais (ex.: Diretor) que não
-- pertencem a um setor só.
-- ==================================================================
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  department_id uuid,
  seniority_level integer,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (department_id, company_id) references public.departments (id, company_id) on delete set null
);

create trigger set_updated_at before update on public.positions
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists positions_company_status_idx on public.positions (company_id, status);

comment on table public.positions is
  'Cargo/função dentro da empresa (Diretor, Gerente, Supervisor, Analista...). seniority_level é uma ordenação opcional para leitura/priorização, nunca uma fonte de autorização — quem autoriza é papel + permissão.';

-- ==================================================================
-- Contexto organizacional do usuário. branch_id já existia; setor e
-- cargo entram como colunas aditivas e nuláveis (nenhum usuário atual
-- precisa ser atualizado para o sistema continuar funcionando).
-- ==================================================================
alter table public.users add column if not exists department_id uuid;
alter table public.users add column if not exists position_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_department_id_company_id_fkey') then
    alter table public.users
      add constraint users_department_id_company_id_fkey
      foreign key (department_id, company_id) references public.departments (id, company_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_position_id_company_id_fkey') then
    alter table public.users
      add constraint users_position_id_company_id_fkey
      foreign key (position_id, company_id) references public.positions (id, company_id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_branch_id_company_id_fkey') then
    alter table public.users
      add constraint users_branch_id_company_id_fkey
      foreign key (branch_id, company_id) references public.branches (id, company_id) on delete set null;
  end if;
end;
$$;

create index if not exists users_department_idx on public.users (company_id, department_id);
create index if not exists users_position_idx on public.users (company_id, position_id);

comment on column public.users.department_id is
  'Setor do usuário (estruturado). Substitui conceitualmente users.department (texto livre, legado) — a coluna antiga não foi alterada nem migrada automaticamente para não mexer em dado existente.';

-- ==================================================================
-- USER_BRANCH_ACCESS — multi-unidade. A regra de resolução está em
-- fn_user_has_branch_access e é deliberadamente explícita:
--   1) tem linhas aqui  -> acessa SOMENTE essas unidades
--   2) sem linhas, com users.branch_id -> somente a unidade do cadastro
--   3) sem linhas e sem branch_id      -> todas as unidades da empresa
-- Assim ninguém ganha unidade por omissão depois que o acesso passa a
-- ser administrado, e nenhum usuário atual perde acesso hoje.
-- ==================================================================
create table if not exists public.user_branch_access (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  branch_id uuid not null,
  is_primary boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, branch_id),
  foreign key (user_id, company_id) references public.users (id, company_id) on delete cascade,
  foreign key (branch_id, company_id) references public.branches (id, company_id) on delete cascade
);

create index if not exists user_branch_access_user_idx on public.user_branch_access (user_id);
create index if not exists user_branch_access_branch_idx on public.user_branch_access (company_id, branch_id);
create unique index if not exists user_branch_access_one_primary
  on public.user_branch_access (user_id) where is_primary = true;

comment on table public.user_branch_access is
  'Unidades/filiais que um usuário pode acessar. A FK composta com company_id impede, no próprio banco, conceder a um usuário uma unidade de outra empresa.';

create or replace function public.fn_user_has_branch_access(p_company_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_permission(p_company_id, 'branches.manage')
    or exists (
      select 1
      from public.user_branch_access uba
      join public.users u on u.id = uba.user_id
      where u.auth_user_id = auth.uid()
        and u.company_id = p_company_id
        and u.status = 'active'
        and uba.branch_id = p_branch_id
    )
    or (
      not exists (
        select 1
        from public.user_branch_access uba
        join public.users u on u.id = uba.user_id
        where u.auth_user_id = auth.uid() and u.company_id = p_company_id
      )
      and coalesce((
        select u.branch_id is null or u.branch_id = p_branch_id
        from public.users u
        where u.auth_user_id = auth.uid() and u.company_id = p_company_id and u.status = 'active'
        limit 1
      ), false)
    );
$$;

comment on function public.fn_user_has_branch_access(uuid, uuid) is
  'Resolve o acesso do usuário autenticado a uma unidade: linhas explícitas em user_branch_access restringem; sem linhas cai em users.branch_id; sem nenhum dos dois, acesso amplo às unidades da própria empresa. branches.manage enxerga todas.';

create or replace function public.fn_user_branch_ids(p_company_id uuid)
returns table (branch_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from public.branches b
  where b.company_id = p_company_id
    and b.status = 'active'
    and public.fn_user_has_branch_access(p_company_id, b.id);
$$;

-- ==================================================================
-- Escrita do contexto organizacional — sempre via função auditada, e
-- sempre validando que usuário/unidade/setor/cargo são da MESMA
-- empresa (a FK composta já garante, a função dá a mensagem correta).
-- ==================================================================
create or replace function public.fn_set_user_org_context(
  p_user_id uuid,
  p_branch_id uuid default null,
  p_department_id uuid default null,
  p_position_id uuid default null
)
returns public.users
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_old jsonb;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_user.company_id, 'org.assign') then
    raise exception 'Permissão negada (org.assign).' using errcode = '42501';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches where id = p_branch_id and company_id = v_user.company_id
  ) then
    raise exception 'Unidade não pertence à empresa do usuário.' using errcode = '22023';
  end if;

  if p_department_id is not null and not exists (
    select 1 from public.departments where id = p_department_id and company_id = v_user.company_id
  ) then
    raise exception 'Setor não pertence à empresa do usuário.' using errcode = '22023';
  end if;

  if p_position_id is not null and not exists (
    select 1 from public.positions where id = p_position_id and company_id = v_user.company_id
  ) then
    raise exception 'Cargo não pertence à empresa do usuário.' using errcode = '22023';
  end if;

  v_old := jsonb_build_object('branch_id', v_user.branch_id, 'department_id', v_user.department_id, 'position_id', v_user.position_id);

  update public.users
  set branch_id = p_branch_id,
      department_id = p_department_id,
      position_id = p_position_id
  where id = p_user_id
  returning * into v_user;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'system', 'users', v_user.id, 'ASSIGN', v_old,
    jsonb_build_object('branch_id', p_branch_id, 'department_id', p_department_id, 'position_id', p_position_id));

  return v_user;
end;
$$;

create or replace function public.fn_grant_user_branch_access(
  p_user_id uuid,
  p_branch_id uuid,
  p_is_primary boolean default false
)
returns public.user_branch_access
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_row public.user_branch_access;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_user.company_id, 'org.assign') then
    raise exception 'Permissão negada (org.assign).' using errcode = '42501';
  end if;

  if not exists (select 1 from public.branches where id = p_branch_id and company_id = v_user.company_id) then
    raise exception 'Unidade não pertence à empresa do usuário.' using errcode = '22023';
  end if;

  if p_is_primary then
    update public.user_branch_access set is_primary = false where user_id = p_user_id and is_primary = true;
  end if;

  insert into public.user_branch_access (company_id, user_id, branch_id, is_primary, created_by)
  values (v_user.company_id, p_user_id, p_branch_id, coalesce(p_is_primary, false), public.current_app_user_id())
  on conflict (user_id, branch_id) do update set is_primary = excluded.is_primary
  returning * into v_row;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'system', 'user_branch_access', v_row.id, 'GRANT', null,
    jsonb_build_object('user_id', p_user_id, 'branch_id', p_branch_id, 'is_primary', coalesce(p_is_primary, false)));

  return v_row;
end;
$$;

create or replace function public.fn_revoke_user_branch_access(p_user_id uuid, p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_row public.user_branch_access;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_user.company_id, 'org.assign') then
    raise exception 'Permissão negada (org.assign).' using errcode = '42501';
  end if;

  select * into v_row from public.user_branch_access where user_id = p_user_id and branch_id = p_branch_id;
  if not found then
    return;
  end if;

  delete from public.user_branch_access where id = v_row.id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_user.company_id, public.current_app_user_id(), 'system', 'user_branch_access', v_row.id, 'REVOKE',
    jsonb_build_object('user_id', p_user_id, 'branch_id', p_branch_id), null);
end;
$$;

revoke all on function public.fn_set_user_org_context(uuid, uuid, uuid, uuid) from public;
revoke all on function public.fn_grant_user_branch_access(uuid, uuid, boolean) from public;
revoke all on function public.fn_revoke_user_branch_access(uuid, uuid) from public;
grant execute on function public.fn_set_user_org_context(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.fn_grant_user_branch_access(uuid, uuid, boolean) to authenticated;
grant execute on function public.fn_revoke_user_branch_access(uuid, uuid) to authenticated;
grant execute on function public.fn_user_has_branch_access(uuid, uuid) to authenticated;
grant execute on function public.fn_user_branch_ids(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS desta camada.
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('departments.view', 'departments', 'view', 'Consultar setores'),
    ('departments.create', 'departments', 'create', 'Criar setores'),
    ('departments.update', 'departments', 'update', 'Editar/desativar setores'),
    ('positions.view', 'positions', 'view', 'Consultar cargos/funções'),
    ('positions.create', 'positions', 'create', 'Criar cargos/funções'),
    ('positions.update', 'positions', 'update', 'Editar/desativar cargos/funções'),
    ('org.view', 'org', 'view', 'Consultar o contexto organizacional dos usuários'),
    ('org.assign', 'org', 'assign', 'Atribuir unidade, setor e cargo a um usuário e conceder acesso a unidades')
) as v(code, module, action, description)
on conflict (code) do nothing;

insert into public.platform_module_permission_map (permission_module, module_code)
values ('departments', 'core'), ('positions', 'core'), ('org', 'core')
on conflict (permission_module) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'admin' and p.module in ('departments', 'positions', 'org')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'operador' and p.module in ('departments', 'positions', 'org') and p.action in ('view', 'create', 'update')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'leitura' and p.module in ('departments', 'positions', 'org') and p.action = 'view'
on conflict (role_id, permission_id) do nothing;

-- ==================================================================
-- SEED — setores e cargos iniciais por empresa (sugestão editável).
-- ==================================================================
insert into public.departments (company_id, code, name, description)
select c.id, v.code, v.name, v.description
from public.companies c
cross join (
  values
    ('DIRETORIA', 'Diretoria/Gestão', 'Direção, gestão executiva e indicadores consolidados'),
    ('TI', 'TI', 'Tecnologia da informação e administração do sistema'),
    ('FINANCEIRO', 'Financeiro', 'Contas a pagar/receber, tesouraria e fluxo de caixa'),
    ('FISCAL', 'Fiscal', 'Documentos fiscais, tributação e obrigações'),
    ('CONTROLADORIA', 'Contabilidade/Controladoria', 'Custos, orçamento, rateios e resultado gerencial'),
    ('COMERCIAL', 'Comercial', 'Vendas, orçamentos, pedidos e metas'),
    ('COMPRAS', 'Compras', 'Suprimentos, cotações e pedidos de compra'),
    ('ESTOQUE', 'Estoque', 'Saldos, inventário, lotes e movimentações'),
    ('ALMOXARIFADO', 'Almoxarifado', 'Requisições internas e materiais de consumo'),
    ('LOGISTICA', 'Logística', 'Separação, expedição, entregas e transporte'),
    ('PRODUCAO', 'Produção', 'Ordens de produção, apontamentos e capacidade'),
    ('QUALIDADE', 'Qualidade', 'Inspeções, não conformidades e ações corretivas'),
    ('MANUTENCAO', 'Manutenção', 'Planos, ordens de manutenção e ativos'),
    ('ATENDIMENTO', 'CRM/Atendimento', 'Leads, oportunidades e relacionamento com clientes'),
    ('PROJETOS', 'Projetos/Serviços', 'Projetos, ordens de serviço e apontamento de horas')
) as v(code, name, description)
on conflict (company_id, code) do nothing;

insert into public.positions (company_id, code, name, description, seniority_level)
select c.id, v.code, v.name, v.description, v.seniority_level
from public.companies c
cross join (
  values
    ('DIRETOR', 'Diretor', 'Direção da empresa', 10),
    ('GERENTE', 'Gerente', 'Gestão de área', 20),
    ('COORDENADOR', 'Coordenador', 'Coordenação de equipe', 30),
    ('SUPERVISOR', 'Supervisor', 'Supervisão operacional', 40),
    ('ANALISTA', 'Analista', 'Execução analítica', 50),
    ('ASSISTENTE', 'Assistente', 'Apoio administrativo/operacional', 60),
    ('OPERADOR', 'Operador', 'Execução operacional', 70),
    ('TECNICO', 'Técnico', 'Execução técnica especializada', 70)
) as v(code, name, description, seniority_level)
on conflict (company_id, code) do nothing;

-- ==================================================================
-- RLS — cadastro simples (CRUD via has_permission), tudo por empresa.
-- ==================================================================
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.user_branch_access enable row level security;

do $$
declare
  t record;
begin
  for t in select * from (values ('departments'), ('positions')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.view');
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.create');
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, t.table_name || '.update', t.table_name || '.update');
  end loop;
end;
$$;

drop policy if exists user_branch_access_select on public.user_branch_access;
create policy user_branch_access_select on public.user_branch_access
  for select to authenticated
  using (
    public.has_permission(company_id, 'org.view')
    or user_id = public.current_app_user_id()
  );

comment on policy user_branch_access_select on public.user_branch_access is
  'Escrita exclusivamente via fn_grant_user_branch_access/fn_revoke_user_branch_access (auditadas) — nenhuma policy de insert/update/delete direto.';

-- ==================================================================
-- branches — o SELECT passa a respeitar o acesso por unidade. Quem
-- administra unidades (branches.manage) continua enxergando todas.
-- ==================================================================
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches
  for select to authenticated
  using (
    public.has_permission(company_id, 'branches.read')
    and public.fn_user_has_branch_access(company_id, id)
  );

comment on policy branches_select on public.branches is
  'Permissão de leitura E acesso à unidade. Um usuário restrito a uma filial não enxerga as demais nem consultando a tabela diretamente.';
