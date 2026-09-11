-- Fase 2c — Estoque/WMS: ledger de movimentações (fonte de verdade) e
-- saldo derivado.
--
-- Arquitetura (contábil, não opcional):
--   stock_movements  — ledger imutável, insert-only. Nenhuma linha é
--                       jamais atualizada ou apagada por um usuário.
--   stock_balances   — cache derivado (on_hand/reserved/available).
--                       NUNCA é escrito diretamente por RLS/API — a
--                       única forma de alterá-lo é public.fn_post_stock_movement,
--                       chamada exclusivamente por outras funções
--                       SECURITY DEFINER (fn_receive_stock, fn_issue_stock,
--                       e as funções de transferência/reserva/ajuste/
--                       contagem criadas nas próximas migrations).
--
-- Por isso stock_balances e stock_movements só recebem policy de SELECT
-- para `authenticated` (gated por stock.view) — não existe policy de
-- insert/update/delete nessas duas tabelas. Isso é o que torna
-- "ajuste sempre gera movimento, nunca mutação direta de saldo" uma
-- garantia estrutural, não uma convenção de código.

-- Pré-requisito para as FKs compostas (product_id, company_id) usadas
-- abaixo — mesma técnica já usada em roles(id, company_id) e
-- warehouse_locations(id, company_id) (0005/0008).
alter table public.products
  add constraint products_id_company_id_key unique (id, company_id);

-- ==================================================================
-- STOCK_BALANCES — saldo por produto/local/lote. lot_id nullable: usa
-- índice único por expressão (coalesce) porque UNIQUE de coluna trata
-- NULL como distinto, o que permitiria múltiplas linhas "sem lote"
-- para o mesmo produto/local.
-- ==================================================================
create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  on_hand numeric(16, 4) not null default 0 check (on_hand >= 0),
  reserved numeric(16, 4) not null default 0 check (reserved >= 0 and reserved <= on_hand),
  available numeric(16, 4) generated always as (on_hand - reserved) stored,
  updated_at timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create unique index if not exists stock_balances_grain_key on public.stock_balances (
  company_id, product_id, location_id, (coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
create index if not exists stock_balances_product_idx on public.stock_balances (company_id, product_id);
create index if not exists stock_balances_location_idx on public.stock_balances (company_id, location_id);

comment on table public.stock_balances is
  'Saldo derivado (cache) por produto/local/lote. Nunca escrito diretamente — sempre recalculado por public.fn_post_stock_movement a partir de stock_movements.';
comment on column public.stock_balances.available is
  'on_hand - reserved. Coluna gerada — sempre consistente com o restante da linha, nunca gravada diretamente.';

-- ==================================================================
-- STOCK_MOVEMENTS — ledger imutável. Vocabulário de movement_type:
--   RECEIPT/ISSUE                 entrada/saída manual direta
--   TRANSFER_OUT/TRANSFER_IN      saída na origem / entrada no destino
--   ADJUSTMENT_IN/ADJUSTMENT_OUT  ajuste positivo/negativo (sempre via
--                                  documento de ajuste ou contagem)
--   RETURN_IN/RETURN_OUT          devolução de cliente / a fornecedor
--   PRODUCTION_IN/PRODUCTION_OUT  reservado para integração futura com
--                                  produção (sem função emissora ainda
--                                  nesta etapa — vocabulário já existe
--                                  para não exigir migration de schema
--                                  quando o módulo de produção chegar)
--   RESERVATION/RELEASE           reserva/liberação (afeta `reserved`,
--                                  não `on_hand`)
-- ==================================================================
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  movement_type text not null check (movement_type in (
    'RECEIPT', 'ISSUE',
    'TRANSFER_OUT', 'TRANSFER_IN',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'RETURN_IN', 'RETURN_OUT',
    'PRODUCTION_IN', 'PRODUCTION_OUT',
    'RESERVATION', 'RELEASE'
  )),
  quantity numeric(16, 4) not null check (quantity > 0),
  unit_cost numeric(14, 4) check (unit_cost is null or unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  notes text,
  idempotency_key text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (location_id, company_id) references public.warehouse_locations (id, company_id) on delete restrict,
  foreign key (lot_id, company_id) references public.product_lots (id, company_id) on delete restrict
);

create unique index if not exists stock_movements_idempotency_key
  on public.stock_movements (company_id, idempotency_key) where idempotency_key is not null;
create index if not exists stock_movements_product_idx on public.stock_movements (company_id, product_id, created_at desc);
create index if not exists stock_movements_location_idx on public.stock_movements (company_id, location_id, created_at desc);
create index if not exists stock_movements_reference_idx on public.stock_movements (reference_type, reference_id);

comment on table public.stock_movements is
  'Ledger imutável de movimentações de estoque — fonte de verdade contábil. Insert-only; nenhuma policy de update/delete existe para authenticated.';

-- ==================================================================
-- fn_post_stock_movement — ÚNICO ponto de escrita de stock_balances.
-- Não é exposta diretamente (revoke de public/authenticated abaixo) —
-- só é chamável por outras funções SECURITY DEFINER do mesmo owner
-- (fn_receive_stock, fn_issue_stock, e as funções de transferência/
-- reserva/ajuste/contagem das próximas migrations), que decidem qual
-- permissão RBAC exigir para cada operação de negócio.
--
-- Concorrência: garante a linha de stock_balances (insert idempotente
-- + select ... for update) antes de aplicar o delta, travando a linha
-- pelo restante da transação — duas chamadas concorrentes para o mesmo
-- grão (produto/local/lote) serializam corretamente.
--
-- Idempotência: se p_idempotency_key já foi usada por um movimento
-- anterior da mesma empresa, retorna esse movimento sem reaplicar o
-- delta (nova tentativa de uma operação que já teve sucesso não duplica
-- o efeito). O tratamento de unique_violation cobre a corrida entre
-- "verificar" e "inserir" quando duas requisições com a mesma chave
-- chegam ao mesmo tempo.
-- ==================================================================
create or replace function public.fn_post_stock_movement(
  p_company_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_unit_cost numeric default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_created_by uuid default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lot_key uuid := coalesce(p_lot_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_existing public.stock_movements;
  v_movement public.stock_movements;
  v_on_hand numeric;
  v_reserved numeric;
  v_delta_on_hand numeric := 0;
  v_delta_reserved numeric := 0;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantidade do movimento deve ser maior que zero.' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.stock_movements
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  case p_movement_type
    when 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'RETURN_IN', 'PRODUCTION_IN' then
      v_delta_on_hand := p_quantity;
    when 'ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT', 'RETURN_OUT', 'PRODUCTION_OUT' then
      v_delta_on_hand := -p_quantity;
    when 'RESERVATION' then
      v_delta_reserved := p_quantity;
    when 'RELEASE' then
      v_delta_reserved := -p_quantity;
    else
      raise exception 'Tipo de movimento inválido: %', p_movement_type using errcode = '22023';
  end case;

  -- Garante a existência da linha de saldo (idempotente) e trava-a.
  insert into public.stock_balances (company_id, product_id, location_id, lot_id, on_hand, reserved)
  values (p_company_id, p_product_id, p_location_id, p_lot_id, 0, 0)
  on conflict (company_id, product_id, location_id, (coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do nothing;

  select on_hand, reserved into v_on_hand, v_reserved
  from public.stock_balances
  where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key
  for update;

  if v_delta_on_hand < 0 and (v_on_hand + v_delta_on_hand) < 0 then
    raise exception 'Saldo insuficiente: disponível % em estoque, solicitado %.', v_on_hand, p_quantity using errcode = 'P0001';
  end if;

  -- Saída não pode derrubar on_hand abaixo do que já está reservado
  -- (reserved <= on_hand é também um CHECK da tabela — esta validação
  -- só existe para devolver uma mensagem clara em vez do erro genérico
  -- de constraint).
  if v_delta_on_hand < 0 and (v_on_hand + v_delta_on_hand) < v_reserved then
    raise exception 'Saída de % bloqueada: % unidade(s) estão reservadas neste local e não podem ser comprometidas.', p_quantity, v_reserved using errcode = 'P0001';
  end if;

  if v_delta_reserved > 0 and (v_reserved + v_delta_reserved) > (v_on_hand + v_delta_on_hand) then
    raise exception 'Reserva de % excede o saldo disponível.', p_quantity using errcode = 'P0001';
  end if;

  if v_delta_reserved < 0 and (v_reserved + v_delta_reserved) < 0 then
    raise exception 'Liberação de % excede a quantidade reservada (%).', p_quantity, v_reserved using errcode = 'P0001';
  end if;

  update public.stock_balances
  set on_hand = on_hand + v_delta_on_hand,
      reserved = reserved + v_delta_reserved,
      updated_at = now()
  where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
    and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key;

  begin
    insert into public.stock_movements (
      company_id, product_id, location_id, lot_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, notes, idempotency_key, created_by
    ) values (
      p_company_id, p_product_id, p_location_id, p_lot_id, p_movement_type, p_quantity, p_unit_cost,
      p_reference_type, p_reference_id, p_notes, p_idempotency_key, p_created_by
    )
    returning * into v_movement;
  exception
    when unique_violation then
      -- Corrida de idempotência: outra transação concorrente já usou
      -- esta chave entre a checagem inicial e este insert. O saldo já
      -- foi ajustado acima nesta transação — desfaz revertendo o delta
      -- e devolve o movimento existente (nenhum efeito duplicado).
      update public.stock_balances
      set on_hand = on_hand - v_delta_on_hand,
          reserved = reserved - v_delta_reserved,
          updated_at = now()
      where company_id = p_company_id and product_id = p_product_id and location_id = p_location_id
        and coalesce(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_lot_key;

      select * into v_existing from public.stock_movements
      where company_id = p_company_id and idempotency_key = p_idempotency_key;
      if found then
        return v_existing;
      end if;
      raise;
  end;

  return v_movement;
end;
$$;

revoke all on function public.fn_post_stock_movement(
  uuid, uuid, uuid, text, numeric, uuid, numeric, text, uuid, text, text, uuid
) from public;

-- ==================================================================
-- fn_receive_stock / fn_issue_stock — movimentações manuais diretas
-- (fora de um documento de transferência/ajuste/contagem). Entrada
-- exige stock.create (menor risco); saída exige stock.adjust (mexer
-- em estoque para menos fora de um fluxo documentado é uma correção,
-- mesma permissão usada pelos ajustes).
-- ==================================================================
create or replace function public.fn_receive_stock(
  p_company_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_unit_cost numeric default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'stock.create') then
    raise exception 'Permissão negada (stock.create).' using errcode = '42501';
  end if;

  return public.fn_post_stock_movement(
    p_company_id => p_company_id,
    p_product_id => p_product_id,
    p_location_id => p_location_id,
    p_movement_type => 'RECEIPT',
    p_quantity => p_quantity,
    p_lot_id => p_lot_id,
    p_unit_cost => p_unit_cost,
    p_reference_type => 'manual',
    p_notes => p_notes,
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );
end;
$$;

create or replace function public.fn_issue_stock(
  p_company_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_lot_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(p_company_id, 'stock.adjust') then
    raise exception 'Permissão negada (stock.adjust).' using errcode = '42501';
  end if;

  return public.fn_post_stock_movement(
    p_company_id => p_company_id,
    p_product_id => p_product_id,
    p_location_id => p_location_id,
    p_movement_type => 'ISSUE',
    p_quantity => p_quantity,
    p_lot_id => p_lot_id,
    p_reference_type => 'manual',
    p_notes => p_notes,
    p_idempotency_key => p_idempotency_key,
    p_created_by => public.current_app_user_id()
  );
end;
$$;

grant execute on function public.fn_receive_stock(uuid, uuid, uuid, numeric, uuid, numeric, text, text) to authenticated;
grant execute on function public.fn_issue_stock(uuid, uuid, uuid, numeric, uuid, text, text) to authenticated;

-- ==================================================================
-- PERMISSIONS — vocabulário completo do módulo stock, usado por esta
-- e pelas próximas migrations (transferências/reservas/ajustes/
-- contagens). stock.approve é a etapa de aprovação separada de
-- criação — quem cria um ajuste/contagem (stock.adjust/stock.count)
-- não necessariamente pode efetivá-lo contra o saldo.
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('stock.view', 'stock', 'view', 'Consultar saldos e movimentações de estoque'),
    ('stock.create', 'stock', 'create', 'Registrar entradas de estoque e criar documentos (transferência, reserva)'),
    ('stock.update', 'stock', 'update', 'Editar documentos de estoque em rascunho; liberar/consumir reservas'),
    ('stock.transfer', 'stock', 'transfer', 'Expedir, receber e cancelar transferências entre locais'),
    ('stock.adjust', 'stock', 'adjust', 'Registrar saídas manuais e criar ajustes de estoque'),
    ('stock.count', 'stock', 'count', 'Criar contagens de inventário e registrar quantidades contadas'),
    ('stock.approve', 'stock', 'approve', 'Aprovar/efetivar ajustes e fechar contagens de inventário contra o saldo')
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
-- RLS — somente leitura para authenticated. Nenhuma policy de
-- insert/update/delete: toda escrita passa pelas funções acima.
-- ==================================================================
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists stock_balances_select on public.stock_balances;
create policy stock_balances_select on public.stock_balances
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (public.has_permission(company_id, 'stock.view'));
