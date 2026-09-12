-- Fase 6 — Produção/PCP: fundação.
--
-- Mesmo princípio de toda etapa anterior: PRODUÇÃO NÃO CRIA UM SEGUNDO
-- ESTOQUE. Continua usando warehouses/warehouse_locations/stock_balances/
-- stock_movements/stock_reservations/product_lots/product_serial_numbers
-- tal como estão. O Almoxarifado Operacional (0013) já previu
-- warehouse_locations.purpose = 'PRODUCTION' e stock_movements.movement_type
-- in ('PRODUCTION_IN', 'PRODUCTION_OUT') exatamente para esta etapa —
-- nenhum vocabulário novo de movimento é necessário.
--
-- Esta migration agrupa, como 0022 fez para Logística, os ajustes
-- aditivos que as migrations seguintes (0027-0030) vão precisar, mais a
-- infraestrutura "cadastro" simples (centro de trabalho / roteiro).

-- ==================================================================
-- 1) Pré-requisitos de FK composta — bug da mesma classe já corrigido
--    em 0009/0022 para outras tabelas: units nunca recebeu
--    unique(id, company_id), e product_boms/production_orders (0027/
--    0028) precisam referenciá-la assim.
-- ==================================================================
alter table public.units
  add constraint units_id_company_id_key unique (id, company_id);

-- ==================================================================
-- 2) audit_logs.action — amplia para o vocabulário desta etapa
--    (RELEASE/START/CONSUME/COMPLETE/SCRAP). CREATE/UPDATE/APPROVE/
--    CANCEL/RETURN já existem desde 0003/0017/0022.
-- ==================================================================
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.audit_logs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%action%';

  if v_conname is not null then
    execute format('alter table public.audit_logs drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'INACTIVATE',
    'APPROVE', 'CANCEL', 'RECEIVE', 'CONFIRM', 'REJECT',
    'PICK', 'PACK', 'SHIP', 'DELIVER', 'FAIL', 'RETURN',
    'RELEASE', 'START', 'CONSUME', 'COMPLETE', 'SCRAP'
  ));

comment on column public.audit_logs.action is
  'Vocabulário: CREATE/UPDATE/DELETE/ACTIVATE/INACTIVATE + APPROVE/CANCEL/RECEIVE/CONFIRM/REJECT (Compras, 0017) + PICK/PACK/SHIP/DELIVER/FAIL/RETURN (Logística, 0022) + RELEASE/START/CONSUME/COMPLETE/SCRAP (Produção/PCP, 0026). Ampliar aqui sempre que um novo módulo precisar, nunca criar uma segunda tabela de auditoria.';

-- ==================================================================
-- 3) product_serial_numbers.status — amplia com 'consumed' (série de
--    matéria-prima consumida em uma ordem de produção). Não é uma
--    tabela nova: mesma rastreabilidade unitária de 0008, só mais um
--    estado no ciclo de vida já existente.
-- ==================================================================
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.product_serial_numbers'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';

  if v_conname is not null then
    execute format('alter table public.product_serial_numbers drop constraint %I', v_conname);
  end if;
end;
$$;

alter table public.product_serial_numbers
  add constraint product_serial_numbers_status_check
  check (status in ('in_stock', 'reserved', 'shipped', 'returned', 'scrapped', 'consumed'));

comment on column public.product_serial_numbers.status is
  'Ciclo de vida do item serializado. consumed (0026) = número de série de matéria-prima baixado em uma ordem de produção (fn_consume_production_material). Séries de produto acabado produzidas nascem em in_stock, igual a qualquer entrada.';

-- ==================================================================
-- 4) PRODUTO FABRICADO — nem todo produto precisa ser fabricado; o
--    mesmo produto pode futuramente ser comprado, fabricado e vendido.
--    Coluna aditiva, sem tabela paralela de "produtos fabricados".
-- ==================================================================
alter table public.products
  add column if not exists production_type text not null default 'purchased'
  check (production_type in ('purchased', 'manufactured', 'both'));

comment on column public.products.production_type is
  'purchased (padrão) = só comprado. manufactured = só fabricado internamente (via product_boms). both = pode ser comprado OU fabricado. Não segrega produto — o mesmo registro em products serve para compra, fabricação e venda.';

create index if not exists products_production_type_idx on public.products (company_id, production_type);

-- ==================================================================
-- WORK_CENTERS — centro de trabalho (setor/máquina/linha/célula).
-- Estrutura "cadastro": sem workflow, RLS com CRUD completo via
-- generic factory, mesmo padrão de warehouses/carriers/drivers.
-- Preparação para capacidade futura — nenhum APS implementado aqui.
-- ==================================================================
create table if not exists public.work_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null default 'sector' check (type in ('machine', 'line', 'cell', 'sector')),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create trigger set_updated_at before update on public.work_centers
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists work_centers_company_status_idx on public.work_centers (company_id, status);

comment on table public.work_centers is
  'Centro de trabalho (setor/máquina/linha/célula produtiva) — ex.: CORTE-01, MONTAGEM-01. Preparação estrutural para capacidade/APS futuro; nenhum cálculo de capacidade nesta etapa.';

-- ==================================================================
-- PRODUCTION_ROUTINGS / PRODUCTION_ROUTING_OPERATIONS — roteiro de
-- produção. Fundação simples pedida explicitamente ("NÃO criar MES
-- completo") — também estrutura "cadastro", sem workflow de aprovação
-- própria (diferente de product_boms, que tem rastreabilidade crítica
-- e por isso usa funções dedicadas — ver 0027).
-- ==================================================================
create sequence if not exists public.production_routings_code_seq;

create table if not exists public.production_routings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  product_id uuid,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'active', 'obsolete')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict
);

create trigger set_code before insert on public.production_routings
  for each row execute procedure public.fn_generate_code('ROTEIRO', 'public.production_routings_code_seq');
create trigger set_updated_at before update on public.production_routings
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists production_routings_company_status_idx on public.production_routings (company_id, status);
create index if not exists production_routings_product_idx on public.production_routings (product_id);

comment on table public.production_routings is
  'Roteiro de produção (sequência de operações) — opcionalmente ligado a um produto. Estrutura simples, sem apontamento de máquina complexo (ver production_operation_logs, 0030, para apontamento básico).';

create table if not exists public.production_routing_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  routing_id uuid not null,
  sequence integer not null check (sequence > 0),
  name text not null,
  description text,
  work_center_id uuid,
  planned_time_minutes numeric(10, 2) check (planned_time_minutes is null or planned_time_minutes >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (routing_id, sequence),
  unique (id, company_id),
  foreign key (routing_id, company_id) references public.production_routings (id, company_id) on delete cascade,
  foreign key (work_center_id, company_id) references public.work_centers (id, company_id) on delete set null
);

create index if not exists production_routing_operations_routing_idx on public.production_routing_operations (routing_id);
create index if not exists production_routing_operations_work_center_idx on public.production_routing_operations (work_center_id);

comment on table public.production_routing_operations is
  'Operações de um roteiro (ex.: 10-Corte, 20-Montagem, 30-Pintura, 40-Inspeção), em sequência. work_center_id opcional — nem toda operação precisa de um centro de trabalho definido ainda.';

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('production_operations.view', 'production_operations', 'view', 'Consultar centros de trabalho e roteiros de produção'),
    ('production_operations.create', 'production_operations', 'create', 'Criar centros de trabalho, roteiros, operações e apontamentos'),
    ('production_operations.update', 'production_operations', 'update', 'Editar centros de trabalho, roteiros e operações')
) as v(code, module, action, description)
on conflict (code) do nothing;

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_rbac(c.id);
  end loop;
end;
$$;

-- ==================================================================
-- RLS — CRUD completo via has_permission direto (padrão "cadastro",
-- sem função dedicada — mesmo de warehouses/product_lots, 0008).
-- Todas as três tabelas reaproveitam production_operations.{view,
-- create,update}, sem granularidade própria por tabela (pedido
-- explícito: "não criar granularidade excessiva"). Sem policy de
-- delete — mesmo padrão de sales_representatives (0019): exclusão só
-- via service_role, não exposta à sessão do usuário.
-- ==================================================================
alter table public.work_centers enable row level security;
alter table public.production_routings enable row level security;
alter table public.production_routing_operations enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values ('work_centers'), ('production_routings'), ('production_routing_operations')) as x(table_name)
  loop
    execute format('drop policy if exists %I_select on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'production_operations.view'
    );
    execute format('drop policy if exists %I_insert on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'production_operations.create'
    );
    execute format('drop policy if exists %I_update on public.%I', t.table_name, t.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.has_permission(company_id, %L)) with check (public.has_permission(company_id, %L))',
      t.table_name, t.table_name, 'production_operations.update', 'production_operations.update'
    );
  end loop;
end;
$$;
