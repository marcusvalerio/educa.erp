-- 0085 — Rodada 2 (48 usuários), B18: o item do pedido/orçamento não herdava a
-- unidade do produto. Produto cadastrado em "CX" gerava item com unidade NULA
-- (a NF-e e a separação ficavam sem unidade). Gatilho BEFORE INSERT/UPDATE:
-- quando o item tem produto e não informa unidade, usa a do produto. Itens
-- antigos sem unidade são completados pelo mesmo critério.

create or replace function public.fn_item_unit_from_product()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.product_id is not null and nullif(trim(coalesce(NEW.unit, '')), '') is null then
    select p.unit into NEW.unit from public.products p where p.id = NEW.product_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists item_unit_from_product on public.sales_order_items;
create trigger item_unit_from_product before insert or update of product_id, unit on public.sales_order_items
  for each row execute function public.fn_item_unit_from_product();

drop trigger if exists item_unit_from_product on public.sales_quote_items;
create trigger item_unit_from_product before insert or update of product_id, unit on public.sales_quote_items
  for each row execute function public.fn_item_unit_from_product();

update public.sales_order_items i set unit = p.unit
from public.products p
where p.id = i.product_id and nullif(trim(coalesce(i.unit, '')), '') is null and p.unit is not null;

update public.sales_quote_items i set unit = p.unit
from public.products p
where p.id = i.product_id and nullif(trim(coalesce(i.unit, '')), '') is null and p.unit is not null;
