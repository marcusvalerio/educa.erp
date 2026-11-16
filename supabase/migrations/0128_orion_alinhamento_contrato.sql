-- =============================================================================
-- 0128 — Integração ORION: alinhamento do contrato (docs/INTEGRACAO-ATLAS-ORION.md)
--
--   * outbound.line_cancelled / outbound.cancelled com origin = 'atlas' são o
--     eco de um cancelamento que partiu do ATLAS (sales_order.line_cancelled /
--     sales_order.cancelled): o ATLAS registra o estado do armazém mas NÃO
--     soma a quantidade cancelada de novo (contagem dupla) nem reabre o pedido.
--   * receipt.completed: purchase_order_status (snake_case) — o nome antigo
--     purchaseOrderStatus é aceito pela validação de entrada (só informativo).
-- =============================================================================

create or replace function public.fn_orion_apply_outbound_line_cancelled(p_company_id uuid, p_event_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
  v_item public.sales_order_items;
  v_qty numeric := (p_payload ->> 'cancelled_qty')::numeric;
begin
  v_order := public.fn_orion_sales_order(p_company_id, p_payload ->> 'atlas_sales_order_id');
  select * into v_item from public.sales_order_items where id = (p_payload ->> 'atlas_line_id')::uuid and order_id = v_order.id for update;
  if not found then
    perform public.fn_orion_fail('linha ' || coalesce(p_payload ->> 'atlas_line_id', '') || ' não encontrada no pedido');
  end if;
  if coalesce(p_payload ->> 'origin', 'orion') = 'atlas' then
    -- Eco do cancelamento feito no ATLAS: a quantidade já foi descontada aqui.
    update public.sales_orders set
      wms_details = wms_details || jsonb_build_object('last_line_cancel_ack', jsonb_build_object(
        'atlas_line_id', p_payload ->> 'atlas_line_id', 'atlas_event_id', p_payload ->> 'atlas_event_id', 'orion_event_id', p_event_id))
    where id = v_order.id;
    return;
  end if;
  update public.sales_order_items
  set cancelled_quantity = cancelled_quantity + least(v_qty, greatest(ordered_quantity - shipped_quantity - cancelled_quantity, 0))
  where id = v_item.id;
  update public.sales_orders set wms_last_error = 'Armazém cancelou ' || v_qty || ' un. de uma linha: ' || coalesce(p_payload ->> 'reason', '')
  where id = v_order.id;
  perform public.fn_orion_recalc_sales_status(v_order.id);
end;
$$;

create or replace function public.fn_orion_apply_outbound_status(p_company_id uuid, p_event_id uuid, p_type text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.sales_orders;
begin
  v_order := public.fn_orion_sales_order(p_company_id, p_payload ->> 'atlas_sales_order_id');
  if p_type = 'outbound.accepted' then
    update public.sales_orders set wms_status = 'accepted', wms_last_error = null,
      wms_details = wms_details || jsonb_build_object('orion_outbound_code', p_payload ->> 'code')
    where id = v_order.id;
  elsif p_type = 'outbound.picking_started' then
    update public.sales_orders set wms_status = 'picking',
      status = case when status in ('approved','reservation_pending','reserved') then 'picking' else status end,
      wms_details = wms_details || jsonb_build_object('wave', p_payload ->> 'wave')
    where id = v_order.id;
  elsif p_type = 'outbound.ready_to_invoice' then
    update public.sales_orders set wms_status = 'ready_to_invoice',
      status = case when status in ('approved','reservation_pending','reserved','picking') then 'ready_to_ship' else status end,
      wms_details = wms_details || jsonb_build_object('ready_to_invoice', p_payload - 'atlas_sales_order_id')
    where id = v_order.id;
  elsif p_type = 'outbound.cancelled' then
    if v_order.status = 'cancelled' or coalesce(p_payload ->> 'origin', 'orion') = 'atlas' then
      -- Eco do cancelamento do ATLAS: só registra o estado do armazém.
      update public.sales_orders set wms_status = 'cancelled' where id = v_order.id;
    else
      -- Cancelamento partiu do armazém: o pedido comercial continua.
      update public.sales_orders set wms_status = 'cancelled',
        status = case when status in ('reservation_pending','reserved','picking','ready_to_ship') then 'approved' else status end,
        wms_last_error = 'Armazém cancelou a saída: ' || coalesce(p_payload ->> 'reason', 'sem motivo informado')
      where id = v_order.id;
    end if;
  elsif p_type = 'export.packed' then
    update public.sales_orders set wms_details = wms_details || jsonb_build_object('export', p_payload - 'atlas_sales_order_id')
    where id = v_order.id;
  end if;
end;
$$;

-- SSO e checagem de acesso valem também em 'activating' (§6.1 passo 6–9): a
-- equipe ORION (admin) precisa entrar para preparar endereços antes da carga
-- inicial. O ORION já aceitava SSO com o vínculo em ativação.
create or replace function public.fn_orion_access_status(p_company_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_user public.users;
  v_access public.orion_user_access;
  v_int public.orion_integrations;
  v_reason text;
begin
  select * into v_user from public.users where id = p_user_id and company_id = p_company_id;
  select * into v_access from public.orion_user_access where company_id = p_company_id and user_id = p_user_id;
  select * into v_int from public.orion_integrations where company_id = p_company_id;

  if not coalesce((select cm.contracted and cm.enabled_by_company from public.company_modules cm
                   where cm.company_id = p_company_id and cm.module_code = 'orion'), false) then
    v_reason := 'module_disabled';
  elsif not public.fn_company_operational(p_company_id) then
    v_reason := 'company_suspended';
  elsif v_int.company_id is null or v_int.status not in ('active','activating') then
    v_reason := case when v_int.status = 'suspended' then 'company_suspended' else 'module_disabled' end;
  elsif v_user.id is null or v_user.status <> 'active' then
    v_reason := 'user_inactive';
  elsif v_access.user_id is null or v_access.status <> 'active' then
    v_reason := 'access_revoked';
  end if;

  if v_reason is not null then
    return jsonb_build_object('atlas_user_id', p_user_id, 'atlas_company_id', p_company_id, 'active', false,
      'reason', v_reason, 'access_version', coalesce(v_access.version, 0), 'checked_at', public.fn_orion_iso(now()));
  end if;
  return jsonb_build_object('atlas_user_id', p_user_id, 'atlas_company_id', p_company_id, 'active', true,
    'orion_role', v_access.orion_role, 'access_version', v_access.version, 'email', v_user.email, 'name', v_user.name,
    'warehouses', to_jsonb(v_access.warehouses), 'checked_at', public.fn_orion_iso(now()),
    'orion_company_id', v_int.orion_company_id, 'orion_url', v_int.orion_url);
end;
$$;

-- Idempotência (§3.5): o hash cobre só o conteúdo (type, version, aggregate,
-- payload). Antes cobria o envelope inteiro e uma reentrega legítima do ORION
-- (mesmo evento, outros campos de transporte) virava idempotency_conflict.
create or replace function public.fn_orion_receive_event(p_company_id uuid, p_envelope jsonb, p_reprocess boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := (p_envelope ->> 'id')::uuid;
  v_type text := p_envelope ->> 'type';
  v_agg_type text := p_envelope #>> '{aggregate,type}';
  v_agg_id uuid := (p_envelope #>> '{aggregate,id}')::uuid;
  v_seq bigint := (p_envelope #>> '{aggregate,sequence}')::bigint;
  v_payload jsonb := coalesce(p_envelope -> 'payload', '{}'::jsonb);
  v_hash text := md5(jsonb_build_object('type', p_envelope -> 'type', 'version', coalesce(p_envelope -> 'version', '1'::jsonb), 'aggregate', p_envelope -> 'aggregate', 'payload', coalesce(p_envelope -> 'payload', '{}'::jsonb))::text);
  v_existing public.integration_inbox;
  v_last bigint;
  v_result text;
  v_err text;
begin
  if (p_envelope ->> 'atlas_company_id')::uuid is distinct from p_company_id then
    return jsonb_build_object('http', 403, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
      'error', jsonb_build_object('code', 'company_mismatch', 'message', 'Envelope de outra empresa.', 'retryable', false)));
  end if;
  if public.fn_orion_integration_status(p_company_id) is null or public.fn_orion_integration_status(p_company_id) in ('pending','disabled') then
    return jsonb_build_object('http', 403, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
      'error', jsonb_build_object('code', 'company_not_linked', 'message', 'Empresa sem vínculo ativo com o ORION.', 'retryable', false)));
  end if;

  select * into v_existing from public.integration_inbox where event_id = v_id for update;
  if found then
    if v_existing.company_id <> p_company_id or (not p_reprocess and v_existing.envelope_hash is distinct from v_hash) then
      return jsonb_build_object('http', 400, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
        'error', jsonb_build_object('code', 'idempotency_conflict', 'message', 'Mesmo id com conteúdo diferente.', 'retryable', false)));
    end if;
    if v_existing.status in ('applied','ignored') then
      return jsonb_build_object('http', 200, 'body', jsonb_build_object('status', 'accepted', 'event_id', v_id, 'duplicate', true));
    end if;
  end if;

  -- Ordem por agregado (§3.5). O primeiro evento visto de um agregado é
  -- aceito com qualquer sequência (o ORION numera também eventos que não
  -- vêm ao ATLAS); depois disso, lacuna ⇒ out_of_order.
  if v_seq is not null then
    select max(aggregate_seq) into v_last from public.integration_inbox
    where company_id = p_company_id and aggregate_type = v_agg_type and aggregate_id = v_agg_id
      and status in ('applied','ignored') and event_id <> v_id;
    if v_last is not null and v_seq <= v_last then
      insert into public.integration_inbox (event_id, company_id, event_type, aggregate_type, aggregate_id, aggregate_seq, payload, envelope_hash, status, attempts, last_error, applied_at)
      values (v_id, p_company_id, v_type, v_agg_type, v_agg_id, v_seq, v_payload, v_hash, 'ignored', 1, 'obsoleto: sequência ' || v_seq || ' ≤ ' || v_last, now())
      on conflict (event_id) do update set status = 'ignored', last_error = excluded.last_error, applied_at = now();
      return jsonb_build_object('http', 200, 'body', jsonb_build_object('status', 'accepted', 'event_id', v_id, 'duplicate', true));
    end if;
    if v_last is not null and v_seq > v_last + 1 and v_type not in ('stock.balance_snapshot') then
      return jsonb_build_object('http', 409, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
        'error', jsonb_build_object('code', 'out_of_order', 'message', 'Evento fora de ordem para o agregado.', 'retryable', true,
          'expected_sequence', v_last + 1)));
    end if;
  end if;

  insert into public.integration_inbox (event_id, company_id, event_type, aggregate_type, aggregate_id, aggregate_seq, payload, envelope_hash, status, attempts)
  values (v_id, p_company_id, v_type, v_agg_type, v_agg_id, v_seq, v_payload, v_hash, 'received', 1)
  on conflict (event_id) do update set attempts = public.integration_inbox.attempts + 1, status = 'received';

  begin
    perform set_config('app.orion_apply', 'on', true);
    v_result := public.fn_orion_dispatch(p_company_id, v_id, v_type, v_payload);
    perform set_config('app.orion_apply', '', true);
  exception when others then
    perform set_config('app.orion_apply', '', true);
    v_err := sqlerrm;
    update public.integration_inbox set status = 'failed', last_error = left(v_err, 2000) where event_id = v_id;
    insert into public.audit_logs (company_id, actor_label, entity, entity_id, action, new_data)
    values (p_company_id, 'orion.event_failed', 'integration_inbox', v_id, 'FAIL', jsonb_build_object('type', v_type, 'error', left(v_err, 500)));
    return jsonb_build_object('http', 422, 'body', jsonb_build_object('status', 'rejected', 'event_id', v_id,
      'error', jsonb_build_object('code', 'unknown_reference',
        'message', regexp_replace(left(v_err, 500), '^ORION_UNKNOWN_REFERENCE: ', ''), 'retryable', false)));
  end;

  update public.integration_inbox set status = v_result, applied_at = now(), last_error = null where event_id = v_id;
  update public.orion_integrations set last_inbound_success_at = now() where company_id = p_company_id;
  perform public.fn_orion_resume_reconciliations(p_company_id, v_id);
  if v_result = 'ignored' then
    return jsonb_build_object('http', 200, 'body', jsonb_build_object('status', 'ignored', 'event_id', v_id, 'duplicate', false));
  end if;
  return jsonb_build_object('http', 202, 'body', jsonb_build_object('status', 'accepted', 'event_id', v_id, 'duplicate', false));
end;
$$;
