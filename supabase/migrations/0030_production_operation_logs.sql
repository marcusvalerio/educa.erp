-- Fase 6 — Produção/PCP: apontamento básico (seção 24).
--
-- Base para futuramente registrar início/fim de uma operação, operador,
-- quantidade produzida/rejeitada naquela operação específica — NÃO um
-- sistema de ponto/HR, NÃO um MES completo. Ligado à ordem de produção
-- e, opcionalmente, a uma operação de roteiro e a um centro de
-- trabalho (nenhum dos dois é obrigatório: uma empresa pode querer só
-- apontar "operador X trabalhou na ordem Y de HH:MM a HH:MM" sem ter
-- cadastrado um roteiro formal ainda).

create table if not exists public.production_operation_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  production_order_id uuid not null,
  routing_operation_id uuid,
  work_center_id uuid,
  operator_user_id uuid references public.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  produced_quantity numeric(16, 4) not null default 0 check (produced_quantity >= 0),
  rejected_quantity numeric(16, 4) not null default 0 check (rejected_quantity >= 0),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (started_at is null or finished_at is null or finished_at >= started_at),
  foreign key (production_order_id, company_id) references public.production_orders (id, company_id) on delete cascade,
  foreign key (routing_operation_id, company_id) references public.production_routing_operations (id, company_id) on delete set null,
  foreign key (work_center_id, company_id) references public.work_centers (id, company_id) on delete set null
);

create index if not exists production_operation_logs_order_idx on public.production_operation_logs (production_order_id);
create index if not exists production_operation_logs_routing_operation_idx on public.production_operation_logs (routing_operation_id);
create index if not exists production_operation_logs_work_center_idx on public.production_operation_logs (work_center_id);

comment on table public.production_operation_logs is
  'Apontamento básico de produção — início/fim, operador, quantidade produzida/rejeitada naquela operação. Ledger insert-only (nenhuma função de update/delete); não altera production_orders.produced_quantity/rejected_quantity (isso é fn_register_production_output, 0029) — é um registro de chão de fábrica complementar, não a fonte de verdade de estoque. Base para MES/apontamento de máquina futuro; nenhum apontamento complexo implementado aqui.';

-- ==================================================================
-- fn_log_production_operation — inserção simples, sem workflow. Exige
-- a ordem não estar cancelled/completed (apontar contra uma ordem já
-- encerrada não tem sentido operacional).
-- ==================================================================
create or replace function public.fn_log_production_operation(
  p_production_order_id uuid,
  p_routing_operation_id uuid default null,
  p_work_center_id uuid default null,
  p_operator_user_id uuid default null,
  p_started_at timestamptz default null,
  p_finished_at timestamptz default null,
  p_produced_quantity numeric default 0,
  p_rejected_quantity numeric default 0,
  p_notes text default null
)
returns public.production_operation_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.production_orders;
  v_log public.production_operation_logs;
begin
  select * into v_order from public.production_orders where id = p_production_order_id;
  if not found then
    raise exception 'Ordem de produção não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_order.company_id, 'production_operations.create') then
    raise exception 'Permissão negada (production_operations.create).' using errcode = '42501';
  end if;

  if v_order.status in ('completed', 'cancelled') then
    raise exception 'Não é possível registrar apontamento em uma ordem %.', v_order.status using errcode = 'P0001';
  end if;

  insert into public.production_operation_logs (
    company_id, production_order_id, routing_operation_id, work_center_id, operator_user_id,
    started_at, finished_at, produced_quantity, rejected_quantity, notes, created_by
  ) values (
    v_order.company_id, p_production_order_id, p_routing_operation_id, p_work_center_id, p_operator_user_id,
    p_started_at, p_finished_at, coalesce(p_produced_quantity, 0), coalesce(p_rejected_quantity, 0), p_notes, public.current_app_user_id()
  )
  returning * into v_log;

  return v_log;
end;
$$;

revoke all on function public.fn_log_production_operation(uuid, uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, text) from public;
grant execute on function public.fn_log_production_operation(uuid, uuid, uuid, uuid, timestamptz, timestamptz, numeric, numeric, text) to authenticated;

-- ==================================================================
-- RLS — select gated por production_operations.view (mesma permissão
-- de work_centers/routings, 0026 — nenhuma granularidade nova);
-- escrita exclusiva via fn_log_production_operation.
-- ==================================================================
alter table public.production_operation_logs enable row level security;

drop policy if exists production_operation_logs_select on public.production_operation_logs;
create policy production_operation_logs_select on public.production_operation_logs
  for select to authenticated using (public.has_permission(company_id, 'production_operations.view'));
