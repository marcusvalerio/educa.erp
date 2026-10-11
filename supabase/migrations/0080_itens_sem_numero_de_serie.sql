-- 0080 — Expedir item sem número de série (novo problema do E2E NOVA ORBITA).
--
-- O reteste do E2E chegou pela primeira vez à expedição de uma empresa nova
-- (antes bloqueada pela falta de local de estoque) e fn_ship_shipment falhou
-- com "cannot get array length of a scalar": a API cria o item da expedição
-- com serial_numbers = JSON null (um escalar jsonb), não SQL NULL, e a
-- função testa "is not null and jsonb_array_length(...)". Qualquer item sem
-- número de série — o caso comum — travava a expedição.
--
-- Correção na origem, sem reescrever as funções: os itens que guardam
-- números de série passam a normalizar JSON null (ou lista vazia) para SQL
-- NULL ao serem gravados. Vale para expedição, separação, recebimento de
-- compra e materiais de produção (as funções dessas tabelas usam o mesmo
-- teste). Linhas existentes são normalizadas.

create or replace function public.fn_normalize_serial_numbers()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if NEW.serial_numbers is not null
     and (jsonb_typeof(NEW.serial_numbers) = 'null'
          or (jsonb_typeof(NEW.serial_numbers) = 'array' and jsonb_array_length(NEW.serial_numbers) = 0)) then
    NEW.serial_numbers := null;
  end if;
  return NEW;
end;
$$;

comment on function public.fn_normalize_serial_numbers() is
  'Itens com números de série: JSON null ou lista vazia viram SQL NULL (0080).';

do $$
declare
  t text;
begin
  foreach t in array array['shipment_items', 'pick_list_items', 'purchase_receipt_items', 'production_order_materials'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'serial_numbers') then
      execute format('drop trigger if exists normalize_serial_numbers on public.%I', t);
      execute format('create trigger normalize_serial_numbers before insert or update of serial_numbers on public.%I for each row execute procedure public.fn_normalize_serial_numbers()', t);
      execute format('update public.%I set serial_numbers = null where serial_numbers is not null and (jsonb_typeof(serial_numbers) = ''null'' or (jsonb_typeof(serial_numbers) = ''array'' and jsonb_array_length(serial_numbers) = 0))', t);
    end if;
  end loop;
end;
$$;
