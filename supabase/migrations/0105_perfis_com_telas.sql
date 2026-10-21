-- 0105 — Perfis personalizados com lista de telas.
--
-- O professor cria, em cada grupo, perfis com um nome e as telas marcadas
-- (ex.: "Comercial e Financeiro": Orçamentos, Pedidos de venda, Contas a
-- pagar...). O perfil:
--   * guarda as telas em roles.screens — o menu de quem tem SÓ perfis com
--     telas mostra apenas essas telas (Início e Aparência sempre);
--   * recebe as permissões para trabalhar nelas (os módulos de cada tela),
--     mais a consulta comum aos cadastros básicos.
-- Quem tem algum perfil sem lista de telas (Gerente, Operador...) continua
-- vendo o menu pelas permissões, como antes. Pode rodar de novo.

alter table public.roles add column if not exists screens text[];
comment on column public.roles.screens is
  'Telas (href do menu) que o perfil mostra. Nulo = menu pelas permissões (perfis de sempre).';

-- Catálogo de telas e os módulos de permissão que cada uma usa.
create or replace function public.fn_screen_catalog()
returns table (href text, area text, label text, modules text[])
language sql
immutable
set search_path = public, pg_temp
as $$
  values
    ('/app/comercial/orcamentos', 'Comercial', 'Orçamentos', array['sales_quotes','customers','price_lists','payment_terms']),
    ('/app/comercial/pedidos-venda', 'Comercial', 'Pedidos de venda', array['sales_orders','customers','price_lists','payment_terms','accounts_receivable']),
    ('/app/comercial/faturamento', 'Comercial', 'Faturamento', array['fiscal_documents','fiscal_document_events','fiscal_document_files','sales_orders']),
    ('/app/crm/leads', 'CRM', 'Leads', array['leads','lead_origins']),
    ('/app/crm/pipeline', 'CRM', 'Pipeline', array['opportunities','pipelines']),
    ('/app/crm/oportunidades', 'CRM', 'Oportunidades', array['opportunities','pipelines']),
    ('/app/crm/atividades', 'CRM', 'Atividades', array['activities']),
    ('/app/suprimentos/solicitacao-compra', 'Suprimentos', 'Solicitações de compra', array['purchase_requests']),
    ('/app/suprimentos/cotacoes', 'Suprimentos', 'Cotações', array['purchase_quotes','suppliers']),
    ('/app/suprimentos/pedidos-compra', 'Suprimentos', 'Pedidos de compra', array['purchase_orders','suppliers','payment_terms']),
    ('/app/suprimentos/agendamentos', 'Suprimentos', 'Agendamentos', array['purchase_receipts']),
    ('/app/logistica/recebimento', 'Logística e Estoque', 'Recebimento', array['purchase_receipts','stock']),
    ('/app/logistica/estoque', 'Logística e Estoque', 'Estoque', array['stock','product_lots','product_serial_numbers','inventory']),
    ('/app/logistica/movimentacoes', 'Logística e Estoque', 'Movimentações', array['stock']),
    ('/app/logistica/transferencias', 'Logística e Estoque', 'Transferências', array['stock']),
    ('/app/logistica/inventario', 'Logística e Estoque', 'Inventário', array['stock','inventory']),
    ('/app/logistica/enderecamento', 'Logística e Estoque', 'Endereçamento', array['warehouse_locations','warehouses']),
    ('/app/logistica/almoxarifado', 'Logística e Estoque', 'Almoxarifado', array['stock']),
    ('/app/logistica/picking', 'Logística e Estoque', 'Picking', array['pick_lists']),
    ('/app/logistica/packing', 'Logística e Estoque', 'Packing', array['shipments']),
    ('/app/logistica/expedicao', 'Logística e Estoque', 'Expedição', array['shipments','deliveries']),
    ('/app/logistica/transportes', 'Logística e Estoque', 'Transportes', array['shipments','deliveries','carriers','drivers','vehicles']),
    ('/app/logistica/devolucoes', 'Logística e Estoque', 'Devoluções', array['stock']),
    ('/app/producao/ordens', 'Produção', 'Ordens de produção', array['production_orders','production_materials','production_operations','production_scrap']),
    ('/app/producao/estruturas', 'Produção', 'Estruturas (BOM)', array['production_boms']),
    ('/app/financeiro/contas-pagar', 'Financeiro', 'Contas a pagar', array['accounts_payable','payments','financial_accounts','financial_categories']),
    ('/app/financeiro/contas-receber', 'Financeiro', 'Contas a receber', array['accounts_receivable','receipts','financial_accounts','financial_categories']),
    ('/app/financeiro/fluxo-caixa', 'Financeiro', 'Fluxo de caixa', array['financial_transactions','financial_accounts']),
    ('/app/financeiro/centro-custos', 'Financeiro', 'Centros de custo', array['cost_centers']),
    ('/app/fiscal/notas-fiscais', 'Fiscal', 'Notas fiscais', array['fiscal_documents','fiscal_document_events','fiscal_document_files','fiscal_document_packages','fiscal_document_references']),
    ('/app/fiscal/nfe', 'Fiscal', 'NF-e', array['fiscal_documents','fiscal_document_events','fiscal_document_files']),
    ('/app/fiscal/ncm', 'Fiscal', 'NCM', array['fiscal_ncms','product_fiscal_profiles']),
    ('/app/fiscal/cfop', 'Fiscal', 'CFOP', array['fiscal_cfops']),
    ('/app/fiscal/impostos', 'Fiscal', 'Regras tributárias', array['tax_rules','fiscal_tax_codes']),
    ('/app/fiscal/configuracao', 'Fiscal', 'Configuração NF-e', array['fiscal_establishments','fiscal_operation_natures','fiscal_cfops','fiscal_ncms']),
    ('/app/projetos/lista', 'Projetos e Serviços', 'Projetos', array['projects']),
    ('/app/projetos/tarefas', 'Projetos e Serviços', 'Tarefas', array['project_tasks']),
    ('/app/projetos/apontamentos', 'Projetos e Serviços', 'Apontamentos', array['time_entries']),
    ('/app/projetos/ordens-servico', 'Projetos e Serviços', 'Ordens de serviço', array['service_orders']),
    ('/app/qualidade/nao-conformidades', 'Qualidade', 'Não conformidades', array['nonconformities']),
    ('/app/qualidade/inspecoes', 'Qualidade', 'Inspeções', array['quality_inspections']),
    ('/app/qualidade/acoes', 'Qualidade', 'Ações', array['quality_actions']),
    ('/app/qualidade/checklists', 'Qualidade', 'Checklists', array['quality_checklists']),
    ('/app/ativos/lista', 'Ativos e Manutenção', 'Ativos', array['assets']),
    ('/app/ativos/ordens-manutencao', 'Ativos e Manutenção', 'Ordens de manutenção', array['maintenance_orders']),
    ('/app/ativos/planos-manutencao', 'Ativos e Manutenção', 'Planos de manutenção', array['maintenance_plans']),
    ('/app/ativos/categorias', 'Ativos e Manutenção', 'Categorias', array['asset_categories']),
    ('/app/ativos/locais', 'Ativos e Manutenção', 'Locais', array['asset_locations']),
    ('/app/cadastros/produtos', 'Cadastros', 'Produtos', array['products','categories','brands','product_attributes']),
    ('/app/cadastros/clientes', 'Cadastros', 'Clientes', array['customers','party_addresses','party_contacts']),
    ('/app/cadastros/fornecedores', 'Cadastros', 'Fornecedores', array['suppliers','party_addresses','party_contacts']),
    ('/app/cadastros/transportadoras', 'Cadastros', 'Transportadoras', array['carriers']),
    ('/app/cadastros/motoristas', 'Cadastros', 'Motoristas', array['drivers']),
    ('/app/cadastros/veiculos', 'Cadastros', 'Veículos', array['vehicles']),
    ('/app/cadastros/locais-estoque', 'Cadastros', 'Locais de estoque', array['warehouse_locations','warehouses']),
    ('/app/gestao/relatorios', 'Gestão', 'Relatórios', array['reports'])
$$;

-- Professor cria ou altera um perfil com telas num grupo da turma.
create or replace function public.fn_study_save_profile(p_group_id uuid, p_role_id uuid, p_name text, p_screens text[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_group public.companies := public.fn_study_group_of_actor(p_group_id, v_actor);
  v_role public.roles;
  v_name text := trim(coalesce(p_name, ''));
  v_screens text[];
  v_modules text[];
  v_code text;
begin
  if v_name = '' or length(v_name) > 80 then
    raise exception 'Informe o nome do perfil (até 80 caracteres).' using errcode = '22023';
  end if;
  select array_agg(distinct s) into v_screens from unnest(coalesce(p_screens, '{}')) s where s in (select c.href from public.fn_screen_catalog() c);
  if v_screens is null or array_length(v_screens, 1) is null then
    raise exception 'Marque ao menos uma tela.' using errcode = '22023';
  end if;
  select array_agg(distinct m) into v_modules from public.fn_screen_catalog() c, unnest(c.modules) m where c.href = any (v_screens);

  if p_role_id is null then
    if exists (select 1 from public.roles r where r.company_id = v_group.id and lower(r.name) = lower(v_name)) then
      raise exception 'Já existe um perfil com este nome neste grupo.' using errcode = 'P0001';
    end if;
    v_code := 'perfil_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.roles (company_id, code, name, description, is_system, status, screens)
    values (v_group.id, v_code, v_name, 'Perfil com telas definido pelo professor.', false, 'active', v_screens)
    returning * into v_role;
  else
    select * into v_role from public.roles r where r.id = p_role_id and r.company_id = v_group.id;
    if not found then
      raise exception 'Perfil não encontrado neste grupo.' using errcode = 'P0002';
    end if;
    if v_role.is_system or v_role.screens is null then
      raise exception 'Só perfis com telas podem ser alterados aqui.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.roles r where r.company_id = v_group.id and lower(r.name) = lower(v_name) and r.id <> v_role.id) then
      raise exception 'Já existe um perfil com este nome neste grupo.' using errcode = 'P0001';
    end if;
    update public.roles set name = v_name, screens = v_screens where id = v_role.id returning * into v_role;
    delete from public.role_permissions where role_id = v_role.id;
  end if;

  insert into public.role_permissions (role_id, permission_id)
  select v_role.id, p.id from public.permissions p
  where split_part(p.code, '.', 1) = any (v_modules)
     or p.code = any (public.fn_sector_common_permissions())
  on conflict do nothing;

  update public.users u set role = v_role.name
  where exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.role_id = v_role.id);

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_group.id, null, coalesce(v_actor.name, v_actor.email) || ' (professor)', 'roles', v_role.id,
    case when p_role_id is null then 'CREATE' else 'UPDATE' end, null,
    jsonb_build_object('name', v_name, 'screens', v_screens));

  return jsonb_build_object('role_id', v_role.id, 'name', v_role.name, 'screens', v_screens);
end;
$$;

-- Catálogo para a tela do professor.
create or replace function public.fn_screens()
returns table (href text, area text, label text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select c.href, c.area, c.label from public.fn_screen_catalog() c $$;

-- Papéis do grupo agora trazem as telas (perfis personalizados).
drop function if exists public.fn_study_group_roles(uuid);
create function public.fn_study_group_roles(p_group_id uuid)
returns table (id uuid, code text, name text, screens text[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_group public.companies := public.fn_study_group_of_actor(p_group_id, v_actor);
begin
  return query
  select r.id, r.code::text, r.name::text, r.screens from public.roles r
  where r.company_id = v_group.id and r.status = 'active'
  order by r.is_system desc, r.name;
end;
$$;

revoke all on function public.fn_screen_catalog() from public, anon, authenticated;
revoke all on function public.fn_screens() from public, anon;
revoke all on function public.fn_study_save_profile(uuid, uuid, text, text[]) from public, anon;
revoke all on function public.fn_study_group_roles(uuid) from public, anon;
grant execute on function public.fn_screens() to authenticated;
grant execute on function public.fn_study_save_profile(uuid, uuid, text, text[]) to authenticated;
grant execute on function public.fn_study_group_roles(uuid) to authenticated;
