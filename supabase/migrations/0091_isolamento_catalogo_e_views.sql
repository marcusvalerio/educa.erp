-- 0091 — Isolamento multiempresa do catálogo de produtos e das views
-- (missão de segurança multiempresa; ver docs/homologacao/
-- RELATORIO-SEGURANCA-MULTIEMPRESA.md).
--
-- Escrita para funcionar nas duas ordens possíveis desta sequência:
--   * só esta linha (0001–0075 + 0089, 0090, 0091);
--   * a sequência integrada (0001–0088 da outra linha + 0089, 0090, 0091).
-- Tudo é idempotente: reaplicar não duplica nada.
--
-- 1. Unidades (incidente): a policy units_select_authenticated (USING true,
--    só existe nos bancos que vieram da produção) somava-se, por ser
--    PERMISSIVE, a units_select e deixava QUALQUER usuário autenticado ler as
--    unidades de TODAS as empresas. units.company_id é NOT NULL e toda
--    unidade é criada por empresa (fn_seed_company_units): não existe unidade
--    global ou de sistema. A policy sai; leitura e escrita ficam só com
--    units.read/create/update/delete NA EMPRESA DA LINHA.
--
-- 2. Permissões do catálogo: as rotas e as policies exigiam códigos que não
--    existem no catálogo de produção (units.*, unit_conversions.*,
--    product_categories.*, product_brands.*, product_suppliers.*). Modelo:
--    - categorias e marcas usam os códigos que já existem e já estão
--      concedidos (categories.*, brands.*): criar product_categories.* seria
--      um sinônimo redundante;
--    - unidades e conversões não têm equivalente: ganham units.* e
--      unit_conversions.* (os mesmos códigos da 0005 do repositório),
--      concedidos a quem já tem a MESMA AÇÃO em categories.* (a família
--      "catálogo" anda junta; leitura nunca vira escrita);
--    - fornecedores e unidades do produto seguem o produto (products.read /
--      products.update), como product_units já fazia.
--    É o mesmo modelo da 0076 da outra linha (auditado); aqui ele não depende
--    dela.
--
-- 3. Referências entre empresas: as FKs do catálogo eram de uma coluna só
--    (produto → unidade, conversão → unidade, produto → categoria/marca/
--    fornecedor...). A API grava com o cliente administrativo e fixa só o
--    company_id da própria linha, então um id de OUTRA empresa era aceito.
--    Novas FKs compostas (coluna, company_id), no padrão que price_list_items
--    e produção já usam. Linhas antigas inconsistentes não são apagadas: a FK
--    só é validada quando não há violação (senão fica NOT VALID — protege as
--    gravações novas — e um WARNING informa a contagem).
--
-- 4. Views: v_cash_flow_summary, v_cash_flow_projection, inventory_valuation e
--    v_sales_order_item_margin rodavam com os direitos do DONO (que não passa
--    pelo RLS) e tinham SELECT para anon e authenticated: qualquer sessão —
--    inclusive sem login — lia os totais de todas as empresas. Passam a
--    security_invoker (RLS de quem consulta) e anon perde o acesso. A API lê
--    essas views com o cliente administrativo e filtro de empresa: nada muda.
--
-- 5. Papéis-modelo (só ajustes pontuais, aplicados sobre a definição
--    existente):
--    - Vendedor: + units.read (a tela de produtos lê unidades), como a 0076, e
--      unit_conversions.read (mesma regra da família catálogo);
--    - Somente leitura: se a 0076 estiver aplicada, o modelo dela concede toda
--      consulta "view", INCLUSIVE o CRM. Dar CRM à Somente leitura é decisão
--      de produto pendente; o modelo volta a excluir os módulos do CRM (regra
--      vigente em produção: Somente leitura não vê o CRM).

-- ================================================================== 1. units
alter table public.units enable row level security;
drop policy if exists units_select_authenticated on public.units;

do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select') then
    create policy units_select on public.units for select to authenticated using (public.has_permission(company_id, 'units.read'));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_insert') then
    create policy units_insert on public.units for insert to authenticated with check (public.has_permission(company_id, 'units.create'));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_update') then
    create policy units_update on public.units for update to authenticated using (public.has_permission(company_id, 'units.update')) with check (public.has_permission(company_id, 'units.update'));
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_delete') then
    create policy units_delete on public.units for delete to authenticated using (public.has_permission(company_id, 'units.delete'));
  end if;
end;
$$;

alter policy units_select on public.units using (public.has_permission(company_id, 'units.read'));
alter policy units_insert on public.units with check (public.has_permission(company_id, 'units.create'));
alter policy units_update on public.units
  using (public.has_permission(company_id, 'units.update')) with check (public.has_permission(company_id, 'units.update'));
alter policy units_delete on public.units using (public.has_permission(company_id, 'units.delete'));

-- ================================================================== 2. permissões
insert into public.permissions (code, module, action, description, resource)
select v.code, 'catalog', v.action, v.description, 'catalog'
from (
  values
    ('units.read', 'read', 'Consultar unidades de medida'),
    ('units.create', 'create', 'Criar unidades de medida'),
    ('units.update', 'update', 'Editar unidades de medida'),
    ('units.delete', 'delete', 'Excluir unidades de medida'),
    ('unit_conversions.read', 'read', 'Consultar conversões de unidade'),
    ('unit_conversions.create', 'create', 'Criar conversões de unidade'),
    ('unit_conversions.update', 'update', 'Editar conversões de unidade'),
    ('unit_conversions.delete', 'delete', 'Excluir conversões de unidade')
) as v(code, action, description)
on conflict (code) do nothing;

-- Mesma ação em categories.* -> mesma ação em units.* e unit_conversions.*.
insert into public.role_permissions (role_id, permission_id)
select rp.role_id, pn.id
from public.role_permissions rp
join public.permissions pc on pc.id = rp.permission_id and pc.code ~ '^categories\.(read|create|update|delete)$'
join public.permissions pn on pn.code in ('units.' || pc.action, 'unit_conversions.' || pc.action)
on conflict (role_id, permission_id) do nothing;

-- Administrador de sistema: todas as permissões do catálogo (invariante da 0005).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.is_system and r.code = 'admin'
on conflict (role_id, permission_id) do nothing;

-- Módulo contratado: o catálogo segue Cadastros, como produtos.
insert into public.platform_module_permission_map (permission_module, module_code)
select 'catalog', 'cadastros'
where exists (select 1 from public.platform_module_permission_map where permission_module = 'products' and module_code = 'cadastros')
  and not exists (select 1 from public.platform_module_permission_map where permission_module = 'catalog');

alter policy product_categories_select on public.product_categories using (public.has_permission(company_id, 'categories.read'));
alter policy product_categories_insert on public.product_categories with check (public.has_permission(company_id, 'categories.create'));
alter policy product_categories_update on public.product_categories
  using (public.has_permission(company_id, 'categories.update')) with check (public.has_permission(company_id, 'categories.update'));
alter policy product_categories_delete on public.product_categories using (public.has_permission(company_id, 'categories.delete'));

alter policy product_brands_select on public.product_brands using (public.has_permission(company_id, 'brands.read'));
alter policy product_brands_insert on public.product_brands with check (public.has_permission(company_id, 'brands.create'));
alter policy product_brands_update on public.product_brands
  using (public.has_permission(company_id, 'brands.update')) with check (public.has_permission(company_id, 'brands.update'));
alter policy product_brands_delete on public.product_brands using (public.has_permission(company_id, 'brands.delete'));

alter policy product_suppliers_select on public.product_suppliers using (public.has_permission(company_id, 'products.read'));
alter policy product_suppliers_insert on public.product_suppliers with check (public.has_permission(company_id, 'products.update'));
alter policy product_suppliers_update on public.product_suppliers
  using (public.has_permission(company_id, 'products.update')) with check (public.has_permission(company_id, 'products.update'));
alter policy product_suppliers_delete on public.product_suppliers using (public.has_permission(company_id, 'products.update'));

-- ================================================================== 3. FKs por empresa
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_categories_id_company_id_key') then
    alter table public.product_categories add constraint product_categories_id_company_id_key unique (id, company_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'product_brands_id_company_id_key') then
    alter table public.product_brands add constraint product_brands_id_company_id_key unique (id, company_id);
  end if;
end;
$$;

create function pg_temp.fk_mesma_empresa(p_table text, p_column text, p_parent text, p_on_delete text)
returns void
language plpgsql
as $$
declare
  v_name text := p_table || '_' || p_column || '_same_company_fk';
  v_bad bigint;
begin
  if not exists (select 1 from pg_constraint where conname = v_name) then
    execute format(
      'alter table public.%I add constraint %I foreign key (%I, company_id) references public.%I (id, company_id) on delete %s not valid',
      p_table, v_name, p_column, p_parent, p_on_delete);
  end if;
  if exists (select 1 from pg_constraint where conname = v_name and not convalidated) then
    execute format(
      'select count(*) from public.%I c where c.%I is not null and not exists (select 1 from public.%I p where p.id = c.%I and p.company_id = c.company_id)',
      p_table, p_column, p_parent, p_column) into v_bad;
    if v_bad = 0 then
      execute format('alter table public.%I validate constraint %I', p_table, v_name);
    else
      raise warning '0091: %.% tem % linha(s) apontando para outra empresa; % fica NOT VALID (gravações novas já são conferidas).',
        p_table, p_column, v_bad, v_name;
    end if;
  end if;
end;
$$;

do $$
begin
  perform pg_temp.fk_mesma_empresa('units', 'base_unit_id', 'units', 'set null (base_unit_id)');
  perform pg_temp.fk_mesma_empresa('unit_conversions', 'from_unit_id', 'units', 'cascade');
  perform pg_temp.fk_mesma_empresa('unit_conversions', 'to_unit_id', 'units', 'cascade');
  perform pg_temp.fk_mesma_empresa('unit_conversions', 'product_id', 'products', 'cascade');
  perform pg_temp.fk_mesma_empresa('products', 'unit_id', 'units', 'restrict');
  perform pg_temp.fk_mesma_empresa('products', 'purchase_unit_id', 'units', 'set null (purchase_unit_id)');
  perform pg_temp.fk_mesma_empresa('products', 'sale_unit_id', 'units', 'set null (sale_unit_id)');
  perform pg_temp.fk_mesma_empresa('products', 'production_unit_id', 'units', 'set null (production_unit_id)');
  perform pg_temp.fk_mesma_empresa('products', 'category_id', 'product_categories', 'restrict');
  perform pg_temp.fk_mesma_empresa('products', 'brand_id', 'product_brands', 'restrict');
  perform pg_temp.fk_mesma_empresa('products', 'supplier_id', 'suppliers', 'restrict');
  perform pg_temp.fk_mesma_empresa('product_categories', 'parent_id', 'product_categories', 'restrict');
  perform pg_temp.fk_mesma_empresa('product_suppliers', 'product_id', 'products', 'cascade');
  perform pg_temp.fk_mesma_empresa('product_suppliers', 'supplier_id', 'suppliers', 'restrict');
  perform pg_temp.fk_mesma_empresa('product_units', 'product_id', 'products', 'cascade');
  perform pg_temp.fk_mesma_empresa('product_variants', 'product_id', 'products', 'cascade');
  perform pg_temp.fk_mesma_empresa('product_barcodes', 'product_id', 'products', 'cascade');
  perform pg_temp.fk_mesma_empresa('product_attribute_assignments', 'product_id', 'products', 'cascade');
end;
$$;

drop function pg_temp.fk_mesma_empresa(text, text, text, text);

-- ================================================================== 4. views
alter view public.v_cash_flow_summary set (security_invoker = true);
alter view public.v_cash_flow_projection set (security_invoker = true);
alter view public.inventory_valuation set (security_invoker = true);
alter view public.v_sales_order_item_margin set (security_invoker = true);
revoke all on public.v_cash_flow_summary, public.v_cash_flow_projection,
  public.inventory_valuation, public.v_sales_order_item_margin from anon;

-- ================================================================== 5. papéis-modelo
do $$
declare
  v_def text := pg_get_functiondef('public.fn_role_template_permission_codes(text)'::regprocedure);
  v_new text := v_def;
  v_leitura text := E'when ''leitura'' then\n      p.action in (''read'', ''view'')';
begin
  if position('''units.read''' in v_new) = 0 then
    v_new := replace(v_new, '''brands.read'', ''price_lists.read''', '''brands.read'', ''units.read'', ''price_lists.read''');
  end if;
  -- Mesma regra da família catálogo (categories.read -> unit_conversions.read).
  if position('''unit_conversions.read''' in v_new) = 0 then
    v_new := replace(v_new, '''units.read'', ''price_lists.read''', '''units.read'', ''unit_conversions.read'', ''price_lists.read''');
  end if;
  if position(v_leitura in v_new) > 0 and position('0091: sem CRM' in v_new) = 0 then
    v_new := replace(v_new, v_leitura, v_leitura || E'\n      -- 0091: sem CRM (decisão de produto pendente)\n      and p.module not in (''leads'', ''opportunities'', ''activities'', ''pipelines'', ''lead_origins'', ''crm_reports'')');
  end if;
  if v_new <> v_def then
    execute v_new;
  end if;
  if position('''unit_conversions.read''' in pg_get_functiondef('public.fn_role_template_permission_codes(text)'::regprocedure)) = 0 then
    raise exception '0091: modelo do Vendedor sem units.read/unit_conversions.read (definição inesperada de fn_role_template_permission_codes).';
  end if;
end;
$$;

-- Vendedor existente: units.read e unit_conversions.read, que o modelo passou a incluir.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code in ('units.read', 'unit_conversions.read')
where r.is_system and r.code = 'vendedor'
on conflict (role_id, permission_id) do nothing;
