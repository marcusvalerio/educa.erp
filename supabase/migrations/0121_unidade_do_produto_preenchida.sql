-- 0121 — "Unidade (catálogo)" do produto preenchida sozinha.
--
-- No cadastro de produto, "Unidade (catálogo)" é opcional ("em branco, o
-- sistema usa a unidade de medida acima"), mas a produção compara essa
-- unidade com a da estrutura: produto sem ela travava a ordem de produção
-- ("unidade do item não coincide com a unidade de estoque do produto").
-- Agora, sem unidade de catálogo, vale a da unidade de medida (UN, KG...):
-- um gatilho preenche ao salvar e os produtos existentes são acertados.
-- Pode rodar de novo.

create or replace function public.fn_fill_product_unit_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.unit_id is null and new.unit is not null then
    select id into new.unit_id from public.units where company_id = new.company_id and code = new.unit;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_fill_product_unit_id() from public, anon, authenticated;

drop trigger if exists fill_product_unit_id on public.products;
create trigger fill_product_unit_id
  before insert or update of unit, unit_id on public.products
  for each row execute function public.fn_fill_product_unit_id();

update public.products p
set unit_id = u.id
from public.units u
where p.unit_id is null and u.company_id = p.company_id and u.code = p.unit;
