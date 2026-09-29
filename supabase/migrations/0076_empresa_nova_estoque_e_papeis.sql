-- 0076 — Empresa recém-criada: local de estoque, catálogo de permissões e
-- papéis padrão (E2E NOVA ORBITA, problemas P1, P2 e P3).
--
-- P1. Criar local de estoque falhava com HTTP 500 em qualquer empresa. O
--     formulário gravava só o texto do armazém (coluna depreciada
--     `warehouse`, com opções fixas do protótipo) e nunca o `warehouse_id`,
--     que é NOT NULL desde a 0008. Agora:
--     - o depósito do local precisa ser da MESMA empresa (FK composta; a FK
--       simples aceitava o id de um depósito de outra empresa);
--     - um gatilho resolve o depósito pelo texto legado (código ou nome, só
--       na empresa do local), recusa com mensagem clara quando não há
--       depósito e mantém `warehouse` = código do depósito (compatibilidade
--       com telas que ainda leem o texto).
--
-- P2. Cadastros → Produtos não carregava: a tela lê categorias, marcas e
--     unidades, e a API/RLS exigiam permissões que nunca existiram em nenhum
--     ambiente (product_categories.*, product_brands.*, units.*,
--     unit_conversions.*, product_suppliers.*; a 0005 do repositório as
--     lista, mas a 0005 aplicada em produção é anterior a elas). O catálogo
--     real tem categories.* e brands.* (módulo catalog), já concedidas aos
--     papéis. Agora:
--     - product_categories / product_brands usam categories.* / brands.*;
--     - fornecedores do produto seguem o produto (products.read / .update);
--     - unidades e conversões ganham units.* e unit_conversions.* (módulo
--       catalog), concedidas a quem já tem a mesma ação em categories.*;
--     - a policy units_select_authenticated (USING true, só em produção)
--       deixava qualquer usuário ler unidades de OUTRAS empresas: removida.
--
-- P3. Papéis padrão de empresa nova: Operador e Somente leitura eram
--     montados só por ação read/create/update e ficavam sem as 86 permissões
--     "view" (Estoque, Pedidos, Financeiro, Fiscal...). Agora os cinco papéis
--     vêm de modelos explícitos (fn_role_template_permission_codes):
--     - leitura: consulta (read/view) de todos os módulos, exceto a
--       configuração do provedor fiscal (credenciais de integração);
--     - operador: a mesma consulta + criar/editar (sem excluir, sem
--       governança) + execução de estoque/logística (transferir, contar,
--       requisitar, reservar pedido, concluir separação, expedir, registrar
--       entrega, conferir recebimento). Aprovar, cancelar, ajustar e estornar
--       continuam com Gerente/Administrador;
--     - vendedor: + units.read (a tela de produtos lê unidades).
--     Empresas existentes não têm seus papéis recalculados (um administrador
--     pode ter ajustado os papéis de sistema); recebem só as permissões
--     novas deste arquivo, pela regra acima.

-- ================================================================== P1
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'warehouse_locations_warehouse_company_fk') then
    alter table public.warehouse_locations
      add constraint warehouse_locations_warehouse_company_fk
      foreign key (warehouse_id, company_id) references public.warehouses (id, company_id)
      on delete restrict not valid;
    alter table public.warehouse_locations validate constraint warehouse_locations_warehouse_company_fk;
  end if;
end;
$$;

create or replace function public.fn_warehouse_location_resolve_warehouse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text := nullif(trim(coalesce(NEW.warehouse, '')), '');
  v_code text;
begin
  -- Texto legado (código ou nome) -> depósito da própria empresa do local.
  if NEW.warehouse_id is null and v_text is not null then
    select w.id into NEW.warehouse_id
    from public.warehouses w
    where w.company_id = NEW.company_id
      and (upper(w.code) = upper(v_text) or lower(w.name) = lower(v_text))
    order by (upper(w.code) = upper(v_text)) desc
    limit 1;
  end if;

  if NEW.warehouse_id is null then
    raise exception 'Selecione o depósito do local de estoque.' using errcode = 'P0001';
  end if;

  select w.code into v_code
  from public.warehouses w
  where w.id = NEW.warehouse_id and w.company_id = NEW.company_id;
  if v_code is null then
    raise exception 'Depósito não encontrado nesta empresa.' using errcode = 'P0001';
  end if;

  NEW.warehouse := v_code;
  return NEW;
end;
$$;

comment on function public.fn_warehouse_location_resolve_warehouse() is
  'Local de estoque: exige depósito da mesma empresa (resolvendo o texto legado) e mantém warehouse = código do depósito.';

drop trigger if exists resolve_warehouse on public.warehouse_locations;
create trigger resolve_warehouse
  before insert or update of warehouse_id, warehouse, company_id on public.warehouse_locations
  for each row execute procedure public.fn_warehouse_location_resolve_warehouse();

-- ================================================================== P2
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

-- Mesma ação em categories.* -> mesma ação em units.* e unit_conversions.*
-- (a família "catálogo" anda junta). Vale para qualquer papel, de sistema
-- ou personalizado; o Administrador tem categories.* e recebe tudo.
insert into public.role_permissions (role_id, permission_id)
select rp.role_id, pn.id
from public.role_permissions rp
join public.permissions pc on pc.id = rp.permission_id and pc.code ~ '^categories\.'
join public.permissions pn on pn.code in ('units.' || pc.action, 'unit_conversions.' || pc.action)
on conflict (role_id, permission_id) do nothing;

-- Administrador de sistema: todas as permissões do catálogo (invariante da 0005).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.is_system and r.code = 'admin'
on conflict (role_id, permission_id) do nothing;

-- Módulo contratado/habilitado: o catálogo segue Cadastros, como produtos.
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

drop policy if exists units_select_authenticated on public.units;

-- ================================================================== P3
create or replace function public.fn_role_template_permission_codes(p_template text)
returns setof text
language sql
stable
set search_path = public, pg_temp
as $$
  select p.code from public.permissions p
  where case p_template
    when 'gerente' then
      p.code !~ '^roles\.'
      and p.code !~ '^users\.(create|update|delete)$'
      and p.code !~ '^org\.assign$'
      and p.code !~ '^company_modules\.manage$'
      and p.code !~ '^branches\.manage$'
      and p.code !~ '^departments\.(create|update)$'
      and p.code !~ '^positions\.(create|update)$'
      and p.code !~ '^document_sequences\.(create|update)$'
      and p.code !~ '^settings\.(create|update|company\.update|establishment\.update)$'
      and p.code !~ '^fiscal_provider_configs\.manage$'
      and p.code !~ '^dashboard\.configure$'
    when 'vendedor' then
      p.code = any (array[
        'dashboard.view',
        'customers.read', 'customers.create', 'customers.update',
        'party_contacts.view', 'party_contacts.create', 'party_contacts.update',
        'party_addresses.view', 'party_addresses.create', 'party_addresses.update',
        'products.read', 'categories.read', 'brands.read', 'units.read', 'price_lists.read',
        'payment_terms.view', 'sales_representatives.read', 'stock.view',
        'sales_quotes.view', 'sales_quotes.create', 'sales_quotes.update',
        'sales_orders.view', 'sales_orders.create', 'sales_orders.update',
        'leads.view', 'leads.create', 'leads.update', 'leads.convert',
        'opportunities.view', 'opportunities.create', 'opportunities.update', 'opportunities.move_stage', 'opportunities.convert',
        'activities.view', 'activities.create', 'activities.update',
        'pipelines.view', 'lead_origins.view',
        'commercial_reports.view', 'crm_reports.view'
      ])
    when 'leitura' then
      p.action in ('read', 'view')
      and p.code <> 'fiscal_provider_configs.view'
    when 'operador' then
      (
        (p.action in ('read', 'view') and p.code <> 'fiscal_provider_configs.view')
        or (
          p.action in ('create', 'update')
          and p.module <> 'rbac'
          and p.code !~ '^roles\.'
          and p.code !~ '^users\.'
          and p.code !~ '^departments\.'
          and p.code !~ '^positions\.'
          and p.code !~ '^document_sequences\.'
          and p.code !~ '^settings\.'
        )
        or p.code = any (array[
          'stock.transfer', 'stock.count', 'stock.request',
          'sales_orders.reserve',
          'pick_lists.complete',
          'shipments.ship',
          'deliveries.confirm', 'deliveries.fail',
          'purchase_receipts.confirm'
        ])
      )
    else false
  end;
$$;

comment on function public.fn_role_template_permission_codes(text) is
  'Permissões dos papéis de sistema Gerente, Vendedor, Operador e Somente leitura (0075/0076), calculadas sobre o catálogo atual.';

create or replace function public.fn_seed_default_roles_for_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_operador_id uuid;
  v_leitura_id uuid;
begin
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'admin', 'Administrador', 'Acesso total às funcionalidades existentes da empresa.', true)
  returning id into v_admin_id;
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'operador', 'Operador', 'Consulta todos os módulos, cria e edita registros e executa estoque e logística; sem excluir, aprovar ou administrar.', true)
  returning id into v_operador_id;
  insert into public.roles (company_id, code, name, description, is_system)
  values (p_company_id, 'leitura', 'Somente leitura', 'Consulta os módulos da empresa; não cria, edita, aprova nem exclui.', true)
  returning id into v_leitura_id;
  insert into public.role_permissions (role_id, permission_id)
  select v_admin_id, id from public.permissions;
  insert into public.role_permissions (role_id, permission_id)
  select v_operador_id, p.id from public.permissions p
  where p.code in (select public.fn_role_template_permission_codes('operador'));
  insert into public.role_permissions (role_id, permission_id)
  select v_leitura_id, p.id from public.permissions p
  where p.code in (select public.fn_role_template_permission_codes('leitura'));
  perform public.fn_seed_operational_roles_for_company(p_company_id);
end;
$$;

-- Vendedor existente: units.read, que o modelo passou a incluir.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.code = 'units.read'
where r.is_system and r.code = 'vendedor'
on conflict (role_id, permission_id) do nothing;
