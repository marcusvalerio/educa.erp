-- Fase 10 — Custos e Formação de Custo: fundação.
--
-- Princípio central (seção 1): ESTOQUE FÍSICO = stock_movements/
-- stock_balances (0009). CUSTO = este ledger novo (cost_movements) +
-- saldo valorado derivado (product_cost_balances). Nenhuma tabela desta
-- migration é a fonte de verdade de QUANTIDADE física — product_cost_balances.quantity
-- é um espelho interno, necessário só para o cálculo do custo médio
-- móvel (precisa de "quantidade anterior" no mesmo grão do valor
-- anterior); inventory_valuation (a view de consulta, seção 13) lê
-- quantidade de stock_balances, nunca da cópia interna daqui.
--
-- Método implementado nesta etapa (seção 2): CUSTO MÉDIO MÓVEL. FIFO e
-- STANDARD ficam só preparados no vocabulário (cost_method), sem
-- cálculo FIFO/standard fictício — ver docs/COSTS.md.

create table if not exists public.cost_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_movement_id uuid not null references public.stock_movements(id) on delete restrict,
  product_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  movement_type text not null check (movement_type in (
    'RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'RETURN_IN', 'RETURN_OUT', 'PRODUCTION_IN', 'PRODUCTION_OUT', 'SCRAP'
  )),
  cost_method text not null default 'MOVING_AVERAGE' check (cost_method in ('MOVING_AVERAGE', 'FIFO', 'STANDARD')),
  quantity numeric(16, 4) not null check (quantity > 0),
  unit_cost numeric(14, 6) not null check (unit_cost >= 0),
  total_cost numeric(18, 4) not null check (total_cost >= 0),
  average_cost_before numeric(14, 6) not null default 0,
  average_cost_after numeric(14, 6) not null default 0,
  source_type text,
  source_id uuid,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

-- Idempotência estrutural (seção 27): um stock_movement nunca gera mais
-- de um cost_movement — índice único, não só convenção de código.
create unique index if not exists cost_movements_stock_movement_unique on public.cost_movements (stock_movement_id);
create index if not exists cost_movements_product_idx on public.cost_movements (company_id, product_id, location_id, created_at desc);
create index if not exists cost_movements_source_idx on public.cost_movements (source_type, source_id);

comment on table public.cost_movements is
  'Ledger de custo, um-para-um com stock_movements (RESERVATION/RELEASE nunca geram linha aqui — não afetam valor). Imutável — nenhuma linha é atualizada ou apagada; um reprocessamento (seção 15) recalcula o saldo derivado a partir deste ledger, nunca reescreve uma linha existente. unit_cost/total_cost são sempre o custo efetivamente aplicado NAQUELE movimento — nunca relido depois.';
comment on column public.cost_movements.unit_cost is
  'Para movimentos de ENTRADA (RECEIPT/TRANSFER_IN/ADJUSTMENT_IN/RETURN_IN/PRODUCTION_IN): o custo de aquisição/produção informado pelo chamador. Para movimentos de SAÍDA (ISSUE/TRANSFER_OUT/ADJUSTMENT_OUT/RETURN_OUT/PRODUCTION_OUT/SCRAP): sempre o average_cost_before (custo médio vigente no momento da saída) — nunca um valor informado pelo chamador.';

-- ==================================================================
-- PRODUCT_COST_BALANCES — saldo valorado, mesmo grão de stock_balances
-- (company/product/location/lot, coalesce de lot_id para NULL=distinto).
-- quantity aqui é um espelho interno (ver cabeçalho) — nunca exposto
-- como "o" saldo físico fora desta migration.
-- ==================================================================
create table if not exists public.product_cost_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  quantity numeric(16, 4) not null default 0 check (quantity >= 0),
  total_value numeric(18, 4) not null default 0 check (total_value >= 0),
  average_unit_cost numeric(14, 6) generated always as (case when quantity > 0 then round(total_value / quantity, 6) else 0 end) stored,
  updated_at timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create unique index if not exists product_cost_balances_grain_key on public.product_cost_balances (
  company_id, product_id, location_id, (coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
create index if not exists product_cost_balances_product_idx on public.product_cost_balances (company_id, product_id);

comment on table public.product_cost_balances is
  'Saldo valorado derivado (cache), mesmo princípio de stock_balances (0009) — nunca escrito diretamente, só por public.fn_register_cost_movement. average_unit_cost é coluna gerada, sempre consistente com quantity/total_value.';

-- ==================================================================
-- fn_register_cost_movement — ÚNICO ponto de escrita de
-- product_cost_balances/cost_movements. Primitivo interno (revoke de
-- public/authenticated abaixo, mesmo padrão de fn_post_stock_movement,
-- 0009) — só chamável por outras funções SECURITY DEFINER do mesmo
-- owner, que decidem a permissão RBAC da operação de negócio (recebimento
-- confirmado, expedição, consumo de produção etc.).
--
-- Concorrência (seção 26): trava a linha de product_cost_balances (for
-- update) antes de ler/calcular/escrever — duas entradas concorrentes
-- no mesmo grão serializam aqui.
--
-- Idempotência (seção 27): se já existe um cost_movement para este
-- stock_movement_id, devolve-o sem reaplicar o delta. O tratamento de
-- unique_violation cobre a corrida entre "verificar" e "inserir".
--
-- Saída (ISSUE/TRANSFER_OUT/ADJUSTMENT_OUT/RETURN_OUT/PRODUCTION_OUT/
-- SCRAP): sempre usa o custo médio ATUAL do grão (p_unit_cost é
-- ignorado) — é assim que o custo de saída nunca é "inventado" pelo
-- chamador, só o que o ledger já sabe.
-- Entrada: usa p_unit_cost informado; se nulo, usa o custo médio atual
-- (entrada sem custo conhecido não altera o custo médio, só a
-- quantidade — ex.: ajuste positivo sem origem de compra).
-- ==================================================================
create or replace function public.fn_register_cost_movement(
  p_stock_movement_id uuid,
  p_unit_cost numeric default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_cost_method text default 'MOVING_AVERAGE'
)
returns public.cost_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_movement public.stock_movements;
  v_existing public.cost_movements;
  v_lot_key uuid;
  v_balance public.product_cost_balances;
  v_is_entry boolean;
  v_unit_cost numeric;
  v_total_cost numeric;
  v_new_quantity numeric;
  v_new_total_value numeric;
  v_cost_movement public.cost_movements;
begin
  select * into v_existing from public.cost_movements where stock_movement_id = p_stock_movement_id;
  if found then
    return v_existing;
  end if;

  select * into v_movement from public.stock_movements where id = p_stock_movement_id;
  if not found then
    raise exception 'Movimento de estoque não encontrado.' using errcode = 'P0002';
  end if;

  if v_movement.movement_type in ('RESERVATION', 'RELEASE') then
    return null;
  end if;

  v_is_entry := v_movement.movement_type in ('RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN_IN', 'PRODUCTION_IN');
  v_lot_key := coalesce(v_movement.lot_id, '00000000-0000-0000-0000-000000000000'::uuid);

  insert into public.product_cost_balances (company_id, product_id, location_id, lot_id, quantity, total_value)
  values (v_movement.company_id, v_movement.product_id, v_movement.location_id, v_movement.lot_id, 0, 0)
  on conflict (company_id, product_id, location_id, (coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do nothing;

  select * into v_balance from public.product_cost_balances
  where company_id = v_movement.company_id and product_id = v_movement.product_id and location_id = v_movement.location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key
  for update;

  if v_is_entry then
    v_unit_cost := coalesce(p_unit_cost, v_balance.average_unit_cost, 0);
    if v_unit_cost < 0 then
      raise exception 'Custo unitário não pode ser negativo.' using errcode = '22023';
    end if;
    v_total_cost := round(v_movement.quantity * v_unit_cost, 4);
    v_new_quantity := v_balance.quantity + v_movement.quantity;
    v_new_total_value := v_balance.total_value + v_total_cost;
  else
    v_unit_cost := v_balance.average_unit_cost;
    v_total_cost := round(v_movement.quantity * v_unit_cost, 4);
    v_new_quantity := greatest(v_balance.quantity - v_movement.quantity, 0);
    v_new_total_value := greatest(v_balance.total_value - v_total_cost, 0);
  end if;

  begin
    insert into public.cost_movements (
      company_id, stock_movement_id, product_id, location_id, lot_id, movement_type, cost_method,
      quantity, unit_cost, total_cost, average_cost_before, average_cost_after, source_type, source_id, created_by
    ) values (
      v_movement.company_id, v_movement.id, v_movement.product_id, v_movement.location_id, v_movement.lot_id,
      v_movement.movement_type, coalesce(p_cost_method, 'MOVING_AVERAGE'),
      v_movement.quantity, v_unit_cost, v_total_cost, v_balance.average_unit_cost,
      case when v_new_quantity > 0 then round(v_new_total_value / v_new_quantity, 6) else 0 end,
      p_source_type, p_source_id, v_movement.created_by
    )
    returning * into v_cost_movement;
  exception
    when unique_violation then
      select * into v_existing from public.cost_movements where stock_movement_id = p_stock_movement_id;
      if found then
        return v_existing;
      end if;
      raise;
  end;

  update public.product_cost_balances
  set quantity = v_new_quantity, total_value = v_new_total_value, updated_at = now()
  where id = v_balance.id;

  return v_cost_movement;
end;
$$;

revoke all on function public.fn_register_cost_movement(uuid, numeric, text, uuid, text) from public;

-- ==================================================================
-- fn_reprocess_product_cost — reprocessamento explícito (seção 15):
-- NUNCA silencioso. Recalcula product_cost_balances a partir da soma
-- do próprio ledger (cost_movements) — nunca reescreve uma linha do
-- ledger, nunca "adivinha" um custo novo para movimentos antigos
-- (seção 14: histórico preservado). Idempotente por natureza (somar o
-- mesmo ledger sempre produz o mesmo resultado) e sempre auditado.
-- ==================================================================
create or replace function public.fn_reprocess_product_cost(
  p_company_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_lot_id uuid default null,
  p_reason text default null
)
returns public.product_cost_balances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lot_key uuid := coalesce(p_lot_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_balance public.product_cost_balances;
  v_old_quantity numeric;
  v_old_total_value numeric;
  v_entries numeric;
  v_entries_value numeric;
  v_exits numeric;
  v_exits_value numeric;
begin
  if not public.has_permission(p_company_id, 'costs.reprocess') then
    raise exception 'Permissão negada (costs.reprocess).' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Informe o motivo do reprocessamento.' using errcode = '22023';
  end if;

  insert into public.product_cost_balances (company_id, product_id, location_id, lot_id, quantity, total_value)
  values (p_company_id, p_product_id, p_location_id, p_lot_id, 0, 0)
  on conflict (company_id, product_id, location_id, (coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do nothing;

  select * into v_balance from public.product_cost_balances
  where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key
  for update;

  v_old_quantity := v_balance.quantity;
  v_old_total_value := v_balance.total_value;

  select coalesce(sum(quantity), 0), coalesce(sum(total_cost), 0) into v_entries, v_entries_value
  from public.cost_movements
  where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key
    and movement_type in ('RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN_IN', 'PRODUCTION_IN');

  select coalesce(sum(quantity), 0), coalesce(sum(total_cost), 0) into v_exits, v_exits_value
  from public.cost_movements
  where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key
    and movement_type in ('ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'RETURN_OUT', 'PRODUCTION_OUT', 'SCRAP');

  update public.product_cost_balances
  set quantity = greatest(v_entries - v_exits, 0), total_value = greatest(v_entries_value - v_exits_value, 0), updated_at = now()
  where id = v_balance.id
  returning * into v_balance;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'product_cost_balances', v_balance.id, 'UPDATE',
    jsonb_build_object('quantity', v_old_quantity, 'total_value', v_old_total_value),
    jsonb_build_object('quantity', v_balance.quantity, 'total_value', v_balance.total_value, 'reason', p_reason));

  return v_balance;
end;
$$;

revoke all on function public.fn_reprocess_product_cost(uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.fn_reprocess_product_cost(uuid, uuid, uuid, uuid, text) to authenticated;

-- ==================================================================
-- INVENTORY_VALUATION — view de consulta (seção 13), nunca um campo
-- mutável. Quantidade sempre de stock_balances (a fonte de verdade
-- física, seção 1); custo unitário de product_cost_balances. Lida pela
-- API com o cliente admin, permissão checada na camada de API (mesmo
-- padrão de v_cash_flow_summary/v_cash_flow_projection, 0035).
-- ==================================================================
create or replace view public.inventory_valuation as
select
  sb.company_id,
  sb.product_id,
  sb.location_id,
  sb.lot_id,
  sb.on_hand as quantity,
  coalesce(cb.average_unit_cost, 0) as unit_cost,
  round(sb.on_hand * coalesce(cb.average_unit_cost, 0), 4) as total_value
from public.stock_balances sb
left join public.product_cost_balances cb
  on cb.company_id = sb.company_id and cb.product_id = sb.product_id and cb.location_id = sb.location_id
  and coalesce(cb.lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(sb.lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
where sb.on_hand <> 0;

comment on view public.inventory_valuation is
  'Estoque valorado: quantidade de stock_balances.on_hand (física, nunca duplicada aqui), custo unitário de product_cost_balances.average_unit_cost (valorização). total_value = quantidade × custo médio. Grãos sem saldo de custo (cb nulo) aparecem com unit_cost/total_value = 0 — ex.: produto recebido por um meio ainda não integrado ao custo.';

-- ==================================================================
-- PRODUCT_STANDARD_COSTS — preparado para custo padrão futuro (seção
-- 16), NÃO substitui o custo médio móvel. Mesmo padrão de versionamento
-- de product_fiscal_profiles (0038): índice único parcial garante uma
-- única versão ativa por produto; ativar uma nova obsoleta a anterior
-- na mesma transação.
-- ==================================================================
create table if not exists public.product_standard_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  cost numeric(14, 6) not null check (cost >= 0),
  version integer not null default 1 check (version > 0),
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'active' check (status in ('active', 'obsolete')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  check (valid_until is null or valid_until >= valid_from)
);

create unique index if not exists product_standard_costs_one_active_per_product
  on public.product_standard_costs (company_id, product_id) where status = 'active';
create index if not exists product_standard_costs_product_idx on public.product_standard_costs (company_id, product_id);

comment on table public.product_standard_costs is
  'Custo padrão preparado (seção 16) — estrutura de versão/vigência pronta, mas nenhuma função de custo desta fase lê esta tabela para valorar estoque. O custo médio móvel (product_cost_balances) continua sendo o método operacional.';

create or replace function public.fn_set_product_standard_cost(
  p_company_id uuid,
  p_product_id uuid,
  p_cost numeric,
  p_valid_from date default current_date,
  p_notes text default null
)
returns public.product_standard_costs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.product_standard_costs;
  v_new public.product_standard_costs;
begin
  if not public.has_permission(p_company_id, 'standard_costs.create') then
    raise exception 'Permissão negada (standard_costs.create).' using errcode = '42501';
  end if;

  if p_cost is null or p_cost < 0 then
    raise exception 'Custo padrão deve ser maior ou igual a zero.' using errcode = '22023';
  end if;

  select * into v_previous from public.product_standard_costs
  where company_id = p_company_id and product_id = p_product_id and status = 'active';

  if found then
    update public.product_standard_costs
    set status = 'obsolete', valid_until = coalesce(valid_until, p_valid_from)
    where id = v_previous.id;
  end if;

  insert into public.product_standard_costs (company_id, product_id, cost, version, valid_from, notes, created_by)
  values (p_company_id, p_product_id, p_cost, coalesce(v_previous.version, 0) + 1, coalesce(p_valid_from, current_date), p_notes, public.current_app_user_id())
  returning * into v_new;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'product_standard_costs', v_new.id, 'CREATE',
    case when v_previous.id is not null then jsonb_build_object('previous_version', v_previous.version, 'previous_cost', v_previous.cost) else null end,
    jsonb_build_object('version', v_new.version, 'cost', v_new.cost));

  return v_new;
end;
$$;

revoke all on function public.fn_set_product_standard_cost(uuid, uuid, numeric, date, text) from public;
grant execute on function public.fn_set_product_standard_cost(uuid, uuid, numeric, date, text) to authenticated;

-- ==================================================================
-- fn_update_product_standard_cost_notes — edição SÓ de observações
-- (mesmo padrão de fn_update_product_fiscal_profile_notes, 0038):
-- custo/versão/vigência nunca são editáveis depois de criados (seção
-- 14 — histórico preservado), só uma nova versão via fn_set_product_standard_cost.
-- ==================================================================
create or replace function public.fn_update_product_standard_cost_notes(
  p_standard_cost_id uuid,
  p_notes text default null
)
returns public.product_standard_costs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.product_standard_costs;
begin
  select * into v_row from public.product_standard_costs where id = p_standard_cost_id;
  if not found then
    raise exception 'Custo padrão não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_row.company_id, 'standard_costs.update') then
    raise exception 'Permissão negada (standard_costs.update).' using errcode = '42501';
  end if;

  update public.product_standard_costs set notes = p_notes where id = p_standard_cost_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.fn_update_product_standard_cost_notes(uuid, text) from public;
grant execute on function public.fn_update_product_standard_cost_notes(uuid, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('costs.view', 'costs', 'view', 'Consultar movimentos de custo e saldos valorados'),
    ('costs.reprocess', 'costs', 'reprocess', 'Reprocessar o saldo de custo de um produto/local a partir do ledger'),
    ('inventory.valuation.view', 'inventory_valuation', 'view', 'Consultar o estoque valorado (quantidade × custo médio)'),
    ('standard_costs.view', 'standard_costs', 'view', 'Consultar custos padrão de produtos'),
    ('standard_costs.create', 'standard_costs', 'create', 'Definir uma nova versão de custo padrão de um produto'),
    ('standard_costs.update', 'standard_costs', 'update', 'Editar observações de um custo padrão (nunca o valor/versão)')
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
-- RLS — select-only; toda escrita via função.
-- ==================================================================
alter table public.cost_movements enable row level security;
alter table public.product_cost_balances enable row level security;
alter table public.product_standard_costs enable row level security;

drop policy if exists cost_movements_select on public.cost_movements;
create policy cost_movements_select on public.cost_movements
  for select to authenticated using (public.has_permission(company_id, 'costs.view'));

drop policy if exists product_cost_balances_select on public.product_cost_balances;
create policy product_cost_balances_select on public.product_cost_balances
  for select to authenticated using (public.has_permission(company_id, 'costs.view'));

drop policy if exists product_standard_costs_select on public.product_standard_costs;
create policy product_standard_costs_select on public.product_standard_costs
  for select to authenticated using (public.has_permission(company_id, 'standard_costs.view'));
