-- 0084 — Rodada 2 (48 usuários), R2-10: duas confirmações de entrega
-- simultâneas da MESMA expedição gravavam 2 eventos "entregue" e 2 auditorias
-- (12 expedições assim no banco local). fn_confirm_delivery / fn_fail_delivery
-- liam a expedição sem trava; agora travam a linha (FOR UPDATE) e a 2ª
-- chamada encontra a situação nova e é recusada ("situação atual: Entregue").
-- Eventos duplicados antigos ficam como histórico (não são apagados).

CREATE OR REPLACE FUNCTION public.fn_confirm_delivery(p_shipment_id uuid, p_recipient_name text DEFAULT NULL::text, p_recipient_document text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_pod_type text DEFAULT NULL::text, p_pod_reference text DEFAULT NULL::text)
 RETURNS delivery_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_shipment public.shipments;
  v_event public.delivery_events;
begin
  select * into v_shipment from public.shipments where id = p_shipment_id for update;
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
$function$

;

CREATE OR REPLACE FUNCTION public.fn_fail_delivery(p_shipment_id uuid, p_status text, p_notes text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric)
 RETURNS delivery_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_shipment public.shipments;
  v_event public.delivery_events;
begin
  if p_status not in ('failed', 'refused', 'absent', 'returned') then
    raise exception 'Status de ocorrência inválido: %.', p_status using errcode = '22023';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;
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
$function$

;

