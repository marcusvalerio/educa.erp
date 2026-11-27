-- 0136 — Inventário por local: a contagem pode abrir só um local do depósito.
-- Troca fn_start_count(uuid, uuid, text) pela versão com p_location_id opcional
-- (null = depósito inteiro, como antes). Nenhum dado existente é alterado.
drop function if exists public.fn_start_count(uuid, uuid, text);

create or replace function public.fn_start_count(p_company_id uuid, p_warehouse_id uuid, p_notes text default null, p_location_id uuid default null)
returns public.stock_counts
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_count public.stock_counts;
begin
  if not public.has_permission(p_company_id, 'stock.count') then
    raise exception 'Permissão negada (stock.count).' using errcode = '42501';
  end if;

  if p_location_id is not null and not exists (
    select 1 from public.warehouse_locations
     where id = p_location_id and company_id = p_company_id and warehouse_id = p_warehouse_id
  ) then
    raise exception 'O local escolhido não pertence a este depósito.' using errcode = 'P0001';
  end if;

  insert into public.stock_counts (company_id, warehouse_id, notes, created_by)
  values (p_company_id, p_warehouse_id, p_notes, public.current_app_user_id())
  returning * into v_count;

  insert into public.stock_count_items (company_id, count_id, product_id, location_id, lot_id, expected_quantity)
  select sb.company_id, v_count.id, sb.product_id, sb.location_id, sb.lot_id, sb.on_hand
  from public.stock_balances sb
  join public.warehouse_locations wl on wl.id = sb.location_id and wl.company_id = sb.company_id
  where sb.company_id = p_company_id
    and wl.warehouse_id = p_warehouse_id
    and (p_location_id is null or sb.location_id = p_location_id)
    and sb.on_hand <> 0;

  return v_count;
end;
$function$;

grant execute on function public.fn_start_count(uuid, uuid, text, uuid) to authenticated;
