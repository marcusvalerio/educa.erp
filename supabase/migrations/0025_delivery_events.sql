-- Fase 5 — Logística/Expedição: Entrega + preparação de Comprovante de
-- Entrega (POD).
--
-- delivery_events é um LEDGER de eventos (insert-only, como
-- stock_movements/audit_logs) — não uma linha "entrega" mutável. Uma
-- expedição pode ter várias tentativas (ausente, depois entregue; ou
-- recusada, depois devolvida) e nenhuma tentativa anterior é apagada
-- ou sobrescrita para "corrigir" o estado (seção 38: "não apagar
-- histórico para corrigir estado"). O status atual da entrega é
-- sempre o evento mais recente — refletido em shipments.status.
--
-- POD (seção 17): sem armazenamento de arquivo nesta etapa —
-- pod_reference/pod_type são só o ponteiro (nome do recebedor,
-- documento, coordenadas, e uma referência textual para uma futura
-- foto/assinatura), prontos para uma integração de upload futura.
--
-- Devolução (seção 18/23): um evento 'returned' registra o FATO, mas
-- NÃO gera movimentação de estoque automática nesta etapa — logística
-- reversa completa está fora do escopo pedido. O campo reference fica
-- pronto para uma futura fn_post_stock_movement de entrada por
-- devolução (RETURN_IN, vocabulário que já existe desde 0009).

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  shipment_id uuid not null,
  status text not null check (status in ('out_for_delivery', 'delivered', 'failed', 'refused', 'absent', 'returned')),
  occurred_at timestamptz not null default now(),
  recorded_by uuid references public.users(id) on delete set null,
  recipient_name text,
  recipient_document text,
  notes text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  pod_type text check (pod_type is null or pod_type in ('signature', 'photo', 'document')),
  pod_reference text,
  created_at timestamptz not null default now(),
  foreign key (shipment_id, company_id) references public.shipments (id, company_id) on delete restrict
);

create index if not exists delivery_events_shipment_idx on public.delivery_events (shipment_id, occurred_at desc);
create index if not exists delivery_events_company_status_idx on public.delivery_events (company_id, status);

comment on table public.delivery_events is
  'Ledger de ocorrências de entrega de uma expedição — insert-only, nunca atualizado ou apagado. O status da expedição (shipments.status) reflete o evento mais recente. Escrita exclusiva via fn_create_delivery_event/fn_confirm_delivery/fn_fail_delivery.';
comment on column public.delivery_events.pod_reference is
  'Referência textual a um comprovante futuro (nome de arquivo, hash, URL) — nenhum armazenamento de arquivo implementado nesta etapa. Ver docs/LOGISTICS.md §7.';

-- ==================================================================
-- fn_create_delivery_event — uso genérico para 'out_for_delivery'
-- (saída para entrega, shipment vira in_transit).
-- ==================================================================
create or replace function public.fn_create_delivery_event(
  p_shipment_id uuid,
  p_notes text default null
)
returns public.delivery_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
  v_event public.delivery_events;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'deliveries.create') then
    raise exception 'Permissão negada (deliveries.create).' using errcode = '42501';
  end if;

  if v_shipment.status not in ('shipped', 'in_transit') then
    raise exception 'Só é possível registrar saída para entrega de uma expedição expedida (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  insert into public.delivery_events (company_id, shipment_id, status, recorded_by, notes)
  values (v_shipment.company_id, p_shipment_id, 'out_for_delivery', public.current_app_user_id(), p_notes)
  returning * into v_event;

  update public.shipments set status = 'in_transit' where id = p_shipment_id and status = 'shipped';

  return v_event;
end;
$$;

-- ==================================================================
-- fn_confirm_delivery — entrega bem-sucedida (total ou parcial — a
-- quantidade entregue em si fica registrada nas notas/POD; o domínio
-- não rastreia quantidade por item na entrega nesta etapa, só o
-- evento de que a expedição foi entregue). shipment vira 'delivered'.
-- fn_complete_shipment, separada, fecha o ciclo depois.
-- ==================================================================
create or replace function public.fn_confirm_delivery(
  p_shipment_id uuid,
  p_recipient_name text default null,
  p_recipient_document text default null,
  p_notes text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_pod_type text default null,
  p_pod_reference text default null
)
returns public.delivery_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
  v_event public.delivery_events;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'deliveries.confirm') then
    raise exception 'Permissão negada (deliveries.confirm).' using errcode = '42501';
  end if;

  if v_shipment.status not in ('shipped', 'in_transit') then
    raise exception 'Só é possível confirmar entrega de uma expedição expedida (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  insert into public.delivery_events (
    company_id, shipment_id, status, recorded_by, recipient_name, recipient_document, notes,
    latitude, longitude, pod_type, pod_reference
  ) values (
    v_shipment.company_id, p_shipment_id, 'delivered', public.current_app_user_id(), p_recipient_name, p_recipient_document, p_notes,
    p_latitude, p_longitude, p_pod_type, p_pod_reference
  )
  returning * into v_event;

  update public.shipments set status = 'delivered' where id = p_shipment_id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_shipment.company_id, public.current_app_user_id(), 'system', 'shipments', v_shipment.id, 'DELIVER',
    null, jsonb_build_object('status', 'delivered', 'recipient_name', p_recipient_name));

  return v_event;
end;
$$;

-- ==================================================================
-- fn_fail_delivery — tentativa sem sucesso. 'returned' fecha a
-- expedição como cancelled (a mercadoria está voltando — logística
-- reversa completa fica para uma etapa futura, ver comentário no topo
-- do arquivo); os demais status permitem nova tentativa (shipment
-- permanece in_transit).
-- ==================================================================
create or replace function public.fn_fail_delivery(
  p_shipment_id uuid,
  p_status text,
  p_notes text default null,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns public.delivery_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
  v_event public.delivery_events;
begin
  if p_status not in ('failed', 'refused', 'absent', 'returned') then
    raise exception 'Status de ocorrência inválido: %.', p_status using errcode = '22023';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'deliveries.fail') then
    raise exception 'Permissão negada (deliveries.fail).' using errcode = '42501';
  end if;

  if v_shipment.status not in ('shipped', 'in_transit') then
    raise exception 'Só é possível registrar ocorrência de entrega de uma expedição expedida (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  insert into public.delivery_events (company_id, shipment_id, status, recorded_by, notes, latitude, longitude)
  values (v_shipment.company_id, p_shipment_id, p_status, public.current_app_user_id(), p_notes, p_latitude, p_longitude)
  returning * into v_event;

  if p_status = 'returned' then
    update public.shipments set status = 'cancelled' where id = p_shipment_id;
  else
    update public.shipments set status = 'in_transit' where id = p_shipment_id and status = 'shipped';
  end if;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_shipment.company_id, public.current_app_user_id(), 'system', 'shipments', v_shipment.id,
    case when p_status = 'returned' then 'RETURN' else 'FAIL' end,
    null, jsonb_build_object('delivery_status', p_status));

  return v_event;
end;
$$;

create or replace function public.fn_complete_shipment(p_shipment_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shipment public.shipments;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id;
  if not found then
    raise exception 'Expedição não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_shipment.company_id, 'shipments.update') then
    raise exception 'Permissão negada (shipments.update).' using errcode = '42501';
  end if;

  if v_shipment.status <> 'delivered' then
    raise exception 'Só é possível encerrar uma expedição entregue (status atual: %).', v_shipment.status using errcode = 'P0001';
  end if;

  update public.shipments set status = 'completed' where id = p_shipment_id
  returning * into v_shipment;

  return v_shipment;
end;
$$;

revoke all on function public.fn_create_delivery_event(uuid, text) from public;
revoke all on function public.fn_confirm_delivery(uuid, text, text, text, numeric, numeric, text, text) from public;
revoke all on function public.fn_fail_delivery(uuid, text, text, numeric, numeric) from public;
revoke all on function public.fn_complete_shipment(uuid) from public;
grant execute on function public.fn_create_delivery_event(uuid, text) to authenticated;
grant execute on function public.fn_confirm_delivery(uuid, text, text, text, numeric, numeric, text, text) to authenticated;
grant execute on function public.fn_fail_delivery(uuid, text, text, numeric, numeric) to authenticated;
grant execute on function public.fn_complete_shipment(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('deliveries.view', 'deliveries', 'view', 'Consultar ocorrências de entrega'),
    ('deliveries.create', 'deliveries', 'create', 'Registrar saída para entrega'),
    ('deliveries.update', 'deliveries', 'update', 'Editar/encerrar expedições entregues'),
    ('deliveries.confirm', 'deliveries', 'confirm', 'Confirmar entrega e registrar comprovante'),
    ('deliveries.fail', 'deliveries', 'fail', 'Registrar entrega falha, recusada, ausente ou devolução')
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
-- RLS
-- ==================================================================
alter table public.delivery_events enable row level security;

drop policy if exists delivery_events_select on public.delivery_events;
create policy delivery_events_select on public.delivery_events
  for select to authenticated using (public.has_permission(company_id, 'deliveries.view'));
