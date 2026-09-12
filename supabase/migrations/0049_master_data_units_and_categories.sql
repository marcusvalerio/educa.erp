-- Fase 13 — Cadastros Mestres Avançados: unidades de medida, conversões
-- e categorias de produto.
--
-- IMPORTANTE (seção "antes de codificar"): units/product_categories/
-- product_brands/unit_conversions JÁ EXISTEM desde 0007 (Fase 2b) —
-- esta migration só os EVOLUI (alter table aditivo), nunca recria.
-- Nenhuma tabela nova nesta migration.

-- ==================================================================
-- UNITS — evolução (seção 13.1): tipo, símbolo, casas decimais,
-- unidade base. Nenhuma coluna existente (code/name/fractionable/status)
-- é removida ou renomeada.
-- ==================================================================
alter table public.units
  add column if not exists symbol text,
  add column if not exists unit_type text,
  add column if not exists decimal_places integer not null default 0,
  add column if not exists base_unit_id uuid references public.units(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_unit_type_check') then
    alter table public.units
      add constraint units_unit_type_check
      check (unit_type is null or unit_type in ('COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA', 'TIME', 'OTHER'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_decimal_places_check') then
    alter table public.units add constraint units_decimal_places_check check (decimal_places >= 0 and decimal_places <= 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_base_unit_not_self_check') then
    alter table public.units add constraint units_base_unit_not_self_check check (base_unit_id is null or base_unit_id <> id);
  end if;
end;
$$;

comment on column public.units.unit_type is
  'Classificação dimensional (COUNT/WEIGHT/VOLUME/LENGTH/AREA/TIME/OTHER) — usada para agrupar unidades comparáveis (ex.: KG/G são WEIGHT) e para orientar qual base_unit_id faz sentido. Nunca usada para calcular conversão sozinha — o fator continua vindo de unit_conversions.';
comment on column public.units.base_unit_id is
  'Unidade de referência do seu unit_type (ex.: KG é a base de peso; G referencia KG). Só informativo/organizacional nesta etapa — fn_convert_unit_quantity sempre resolve pelo grafo de unit_conversions, nunca assume a base como atalho de cálculo.';
comment on column public.units.decimal_places is
  'Casas decimais para exibição/arredondamento desta unidade (ex.: UN=0, KG=3). Puramente de apresentação — stock_movements/cost_movements continuam usando a precisão numeric da coluna, nunca truncada por aqui.';

-- ==================================================================
-- UNIT_CONVERSIONS — evolução (seção 13.2): vigência + conversão
-- específica por produto (quando a conversão não é universal — ex.:
-- "1 CAIXA = 12 UN" para o produto A, "1 CAIXA = 24 UN" para o produto
-- B). A unicidade original (company_id, from_unit_id, to_unit_id)
-- impediria conversões específicas coexistirem com a global do mesmo
-- par de unidades — substituída por um índice único por expressão que
-- trata product_id nulo como "global" (mesmo padrão de
-- stock_balances.lot_id, 0009).
-- ==================================================================
alter table public.unit_conversions
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists valid_from date,
  add column if not exists valid_until date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'unit_conversions_valid_range_check') then
    alter table public.unit_conversions
      add constraint unit_conversions_valid_range_check
      check (valid_from is null or valid_until is null or valid_from <= valid_until);
  end if;
end;
$$;

alter table public.unit_conversions drop constraint if exists unit_conversions_company_id_from_unit_id_to_unit_id_key;

create unique index if not exists unit_conversions_grain_key on public.unit_conversions (
  company_id, from_unit_id, to_unit_id, (coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

create index if not exists unit_conversions_product_idx on public.unit_conversions (product_id);

comment on column public.unit_conversions.product_id is
  'Nulo = conversão global (vale para qualquer produto entre essas duas unidades). Preenchido = conversão específica deste produto, resolvida com prioridade sobre a global (seção 13.2/13.3) — nunca as duas ambíguas para o mesmo produto: o índice único trata NULL como um "produto" próprio (coalesce), não como "qualquer".';

-- ==================================================================
-- fn_convert_unit_quantity — conversão determinística (seção 13.2/
-- 13.3): resolve primeiro uma conversão específica do produto
-- informado (quando houver e estiver vigente), senão a conversão
-- global. Tenta o par direto (from->to) e, se ausente, o inverso
-- (to->from, dividindo pelo fator) — nunca "adivinha" um fator.
-- Ciclos multi-hop (A->B->C->A) não são detectados nesta etapa (seção
-- 13.2: "evitar quando possível") — o guard estrutural aqui cobre o
-- caso direto (from_unit_id <> to_unit_id, já um CHECK desde 0007) e a
-- ambiguidade produto/global (acima); um grafo de conversões
-- transitivas fica como evolução futura, documentada em
-- docs/MASTER_DATA.md.
-- ==================================================================
create or replace function public.fn_convert_unit_quantity(
  p_company_id uuid,
  p_from_unit_id uuid,
  p_to_unit_id uuid,
  p_quantity numeric,
  p_product_id uuid default null,
  p_reference_date date default current_date
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_factor numeric;
begin
  if p_from_unit_id = p_to_unit_id then
    return p_quantity;
  end if;

  if p_product_id is not null then
    select factor into v_factor from public.unit_conversions
    where company_id = p_company_id and from_unit_id = p_from_unit_id and to_unit_id = p_to_unit_id
      and product_id = p_product_id and status = 'active'
      and (valid_from is null or valid_from <= p_reference_date)
      and (valid_until is null or valid_until >= p_reference_date);
    if found then
      return p_quantity * v_factor;
    end if;

    select factor into v_factor from public.unit_conversions
    where company_id = p_company_id and from_unit_id = p_to_unit_id and to_unit_id = p_from_unit_id
      and product_id = p_product_id and status = 'active'
      and (valid_from is null or valid_from <= p_reference_date)
      and (valid_until is null or valid_until >= p_reference_date);
    if found then
      return p_quantity / v_factor;
    end if;
  end if;

  select factor into v_factor from public.unit_conversions
  where company_id = p_company_id and from_unit_id = p_from_unit_id and to_unit_id = p_to_unit_id
    and product_id is null and status = 'active'
    and (valid_from is null or valid_from <= p_reference_date)
    and (valid_until is null or valid_until >= p_reference_date);
  if found then
    return p_quantity * v_factor;
  end if;

  select factor into v_factor from public.unit_conversions
  where company_id = p_company_id and from_unit_id = p_to_unit_id and to_unit_id = p_from_unit_id
    and product_id is null and status = 'active'
    and (valid_from is null or valid_from <= p_reference_date)
    and (valid_until is null or valid_until >= p_reference_date);
  if found then
    return p_quantity / v_factor;
  end if;

  raise exception 'Conversão não encontrada entre as unidades informadas (nem global, nem específica do produto).' using errcode = 'P0002';
end;
$$;

revoke all on function public.fn_convert_unit_quantity(uuid, uuid, uuid, numeric, uuid, date) from public;
grant execute on function public.fn_convert_unit_quantity(uuid, uuid, uuid, numeric, uuid, date) to authenticated;

-- ==================================================================
-- PRODUCT_CATEGORIES — evolução (seção 13.4): descrição + prevenção
-- de ciclo de hierarquia. O CHECK (parent_id <> id) de 0007 já impede
-- o caso trivial (categoria = seu próprio pai); o trigger abaixo
-- impede o caso profundo (A -> B -> C -> A), percorrendo a cadeia de
-- ancestrais antes de aceitar um novo parent_id.
-- ==================================================================
alter table public.product_categories add column if not exists description text;

create or replace function public.fn_guard_product_category_hierarchy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
  v_depth integer := 0;
begin
  if NEW.parent_id is null then
    return NEW;
  end if;

  if NEW.parent_id = NEW.id then
    raise exception 'Uma categoria não pode ser sua própria categoria pai.' using errcode = 'P0001';
  end if;

  v_current := NEW.parent_id;
  while v_current is not null loop
    if v_current = NEW.id then
      raise exception 'Ciclo de hierarquia detectado: % não pode ser ancestral de si mesma.', NEW.code using errcode = 'P0001';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 100 then
      raise exception 'Hierarquia de categorias excede a profundidade máxima suportada (100 níveis).' using errcode = 'P0001';
    end if;
    select parent_id into v_current from public.product_categories where id = v_current;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists guard_category_hierarchy on public.product_categories;
create trigger guard_category_hierarchy
  before insert or update of parent_id on public.product_categories
  for each row execute procedure public.fn_guard_product_category_hierarchy();

-- ==================================================================
-- PRODUCT_BRANDS — evolução (seção 13.6): código próprio + descrição.
-- Continua a mesma tabela — nenhuma tabela "brands" paralela criada.
-- code é opcional (nullable) para não quebrar marcas já cadastradas
-- sem código; quando informado, único por empresa.
-- ==================================================================
alter table public.product_brands
  add column if not exists code text,
  add column if not exists description text;

create unique index if not exists product_brands_code_key on public.product_brands (company_id, code) where code is not null;

comment on table public.product_brands is
  'Marca de produto (seção 13.6 chama de "brands" — mesma entidade desde 0007, evoluída aqui, nunca duplicada). code é opcional: marcas antigas continuam válidas sem ele.';
