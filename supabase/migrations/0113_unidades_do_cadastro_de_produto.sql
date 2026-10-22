-- 0113 — Unidades que a tela de produto oferece passam a existir no banco.
--
-- O cadastro de produto oferecia PC, KIT e T, que não estavam no catálogo
-- de unidades das empresas: o produto não era salvo (chave estrangeira
-- products → units) e a tela mostrava uma mensagem errada. Agora toda
-- empresa tem também Peça, Par, Kit, Pacote, Tonelada e Rolo, e empresas
-- novas recebem pelo gatilho.

create or replace function public.fn_seed_extra_units(p_company_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.units (company_id, code, name, fractionable)
  values
    (p_company_id, 'PC', 'Peça', false),
    (p_company_id, 'PAR', 'Par', false),
    (p_company_id, 'KIT', 'Kit', false),
    (p_company_id, 'PCT', 'Pacote', false),
    (p_company_id, 'T', 'Tonelada', true),
    (p_company_id, 'RL', 'Rolo', false)
  on conflict (company_id, code) do nothing;
$$;
revoke all on function public.fn_seed_extra_units(uuid) from public, anon, authenticated;

create or replace function public.fn_companies_seed_extra_units()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_seed_extra_units(new.id);
  return new;
end;
$$;
revoke all on function public.fn_companies_seed_extra_units() from public, anon, authenticated, service_role;

drop trigger if exists seed_extra_units on public.companies;
create trigger seed_extra_units
  after insert on public.companies
  for each row execute function public.fn_companies_seed_extra_units();

do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.companies loop
    perform public.fn_seed_extra_units(v_id);
  end loop;
end;
$$;
