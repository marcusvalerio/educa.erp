-- 0102 — Setores com permissões e nova senha provisória para quem já tem acesso.
--
-- 1) SETOR DEFINE O ACESSO. Catálogo fixo de setores (Comercial, Compras,
--    Estoque, Logística, Produção, Financeiro, Fiscal, Qualidade, Manutenção,
--    Projetos e Diretoria). Ao colocar uma pessoa num setor:
--      * o setor (departments) é criado na empresa se ainda não existir;
--      * o perfil do setor ("Setor: Compras", código setor_compras) é criado
--        com as permissões dos módulos daquele setor e vira o perfil da
--        pessoa (Diretoria usa o perfil Gerente que já existe);
--      * só isso é criado: nenhum produto, cliente ou outro cadastro.
--    Quem pode: o Administrador da empresa (users.update + roles.manage) e,
--    no Modo Estudo, o Administrador da turma para os alunos dos grupos.
--    O Administrador não muda de setor por aqui (não perde o acesso).
--
-- 2) NOVA SENHA PROVISÓRIA PARA QUEM JÁ TEM ACESSO (esqueceu a senha). O
--    banco só AUTORIZA e registra na auditoria: quem pede administra a pessoa
--    (mesma empresa; ou professor da turma do grupo), a pessoa está ativa e
--    com login, e o login não é da plataforma. A senha é gerada no servidor
--    e gravada só no Supabase Auth, com troca obrigatória no próximo login.
-- Pode rodar de novo.

-- ------------------------------------------------------------------ catálogo
create or replace function public.fn_sector_catalog()
returns table (code text, name text, modules text[])
language sql
immutable
set search_path = public, pg_temp
as $$
  values
    ('DIRETORIA',  'Diretoria/Gestão',  array[]::text[]),
    ('COMERCIAL',  'Comercial',         array['customers','sales_quotes','sales_orders','price_lists','sales_representatives','payment_terms','party_addresses','party_contacts','commercial_reports','leads','lead_origins','opportunities','activities','pipelines','crm_reports']),
    ('COMPRAS',    'Compras',           array['suppliers','purchase_requests','purchase_quotes','purchase_orders','purchase_receipts','purchase_reports','products','categories','brands','product_attributes','payment_terms','party_addresses','party_contacts']),
    ('ESTOQUE',    'Estoque/Almoxarifado', array['stock','warehouses','warehouse_locations','product_lots','product_serial_numbers','inventory','inventory_reports','purchase_receipts','pick_lists']),
    ('LOGISTICA',  'Logística',         array['shipments','deliveries','pick_lists','carriers','drivers','vehicles','logistics_reports']),
    ('PRODUCAO',   'Produção',          array['production_boms','production_materials','production_operations','production_orders','production_scrap','production_reports','standard_costs','costs']),
    ('FINANCEIRO', 'Financeiro',        array['accounts_payable','accounts_receivable','payments','receipts','financial_accounts','financial_categories','financial_transactions','financial_reports','bank_reconciliation','cost_centers','payment_terms','controlling']),
    ('FISCAL',     'Fiscal',            array['fiscal_cfops','fiscal_document_events','fiscal_document_files','fiscal_document_packages','fiscal_document_references','fiscal_documents','fiscal_establishments','fiscal_ncms','fiscal_operation_natures','fiscal_reports','fiscal_tax_codes','product_fiscal_profiles','tax_rules']),
    ('QUALIDADE',  'Qualidade',         array['quality_actions','quality_checklists','quality_inspections','quality_reports','nonconformities']),
    ('MANUTENCAO', 'Manutenção',        array['assets','asset_categories','asset_locations','maintenance_orders','maintenance_plans']),
    ('PROJETOS',   'Projetos/Serviços', array['projects','project_tasks','time_entries','service_orders'])
$$;

-- Leitura comum a todos os setores: painel, relatórios e consulta aos
-- cadastros básicos (sem alterar) e aos documentos de outras áreas.
create or replace function public.fn_sector_common_permissions()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array[
    'dashboard.view', 'reports.view', 'org.view', 'departments.view', 'positions.view',
    'products.read', 'categories.read', 'brands.read', 'customers.read', 'suppliers.read',
    'warehouses.read', 'warehouse_locations.read', 'stock.view', 'sales_orders.view', 'purchase_orders.view',
    'fiscal_documents.view', 'payment_terms.view', 'cost_centers.view', 'document_sequences.view'
  ]
$$;

-- Garante setor e perfil do setor na empresa; devolve os dois.
create or replace function public.fn_ensure_sector(p_company_id uuid, p_code text)
returns table (department_id uuid, role_id uuid, sector_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sector record;
  v_department uuid;
  v_role uuid;
  v_role_code text := 'setor_' || lower(p_code);
begin
  select * into v_sector from public.fn_sector_catalog() c where c.code = upper(trim(p_code));
  if not found then
    raise exception 'Setor desconhecido: %.', p_code using errcode = '22023';
  end if;

  select d.id into v_department from public.departments d where d.company_id = p_company_id and d.code = v_sector.code;
  if v_department is null then
    insert into public.departments (company_id, code, name, status)
    values (p_company_id, v_sector.code, v_sector.name, 'active')
    returning id into v_department;
  end if;

  if v_sector.code = 'DIRETORIA' then
    select r.id into v_role from public.roles r where r.company_id = p_company_id and r.code = 'gerente';
    if v_role is null then
      raise exception 'O perfil Gerente não existe nesta empresa.' using errcode = 'P0002';
    end if;
  else
    select r.id into v_role from public.roles r where r.company_id = p_company_id and r.code = v_role_code;
    if v_role is null then
      insert into public.roles (company_id, code, name, description, is_system, status, department_id)
      values (p_company_id, v_role_code, 'Setor: ' || v_sector.name,
        'Perfil do setor ' || v_sector.name || ': módulos do setor completos e consulta às demais áreas.', false, 'active', v_department)
      returning id into v_role;
    end if;
    -- Permissões do setor (só acrescenta; o Administrador pode ajustar depois).
    insert into public.role_permissions (role_id, permission_id)
    select v_role, p.id from public.permissions p
    where split_part(p.code, '.', 1) = any (v_sector.modules)
       or p.code = any (public.fn_sector_common_permissions())
    on conflict do nothing;
  end if;

  return query select v_department, v_role, v_sector.name;
end;
$$;

-- Aplica o setor a uma pessoa (o chamador já foi autorizado).
create or replace function public.fn_apply_user_sector(p_user public.users, p_code text, p_actor_label text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sector record;
  v_old_roles jsonb;
begin
  if exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_user.id and r.code = 'admin') then
    raise exception 'O Administrador não muda de setor por aqui (perderia o acesso de administração).' using errcode = 'P0001';
  end if;
  select * into v_sector from public.fn_ensure_sector(p_user.company_id, p_code);

  select coalesce(jsonb_agg(ur.role_id), '[]'::jsonb) into v_old_roles from public.user_roles ur where ur.user_id = p_user.id;
  delete from public.user_roles ur where ur.user_id = p_user.id and ur.role_id <> v_sector.role_id;
  insert into public.user_roles (user_id, role_id) values (p_user.id, v_sector.role_id) on conflict do nothing;
  update public.users
     set department_id = v_sector.department_id,
         department = v_sector.sector_name,
         role = (select r.name from public.roles r where r.id = v_sector.role_id)
   where id = p_user.id;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_user.company_id, null, p_actor_label, 'users', p_user.id, 'ASSIGN',
    jsonb_build_object('department_id', p_user.department_id, 'roles', v_old_roles),
    jsonb_build_object('sector', upper(p_code), 'department_id', v_sector.department_id, 'role_id', v_sector.role_id));

  return jsonb_build_object('user_id', p_user.id, 'sector', upper(p_code), 'sector_name', v_sector.sector_name, 'role_id', v_sector.role_id);
end;
$$;

-- Lista para as telas (sem dados de empresa).
create or replace function public.fn_sectors()
returns table (code text, name text)
language sql
stable
set search_path = public, pg_temp
as $$ select c.code, c.name from public.fn_sector_catalog() c $$;

-- Administrador da empresa: setor de uma pessoa da própria empresa.
create or replace function public.fn_set_user_sector(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_actor public.users;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if not (public.has_permission(v_user.company_id, 'users.update') and public.has_permission(v_user.company_id, 'roles.manage')) then
    raise exception 'Permissão negada (users.update e roles.manage).' using errcode = '42501';
  end if;
  select * into v_actor from public.users where id = public.current_app_user_id();
  return public.fn_apply_user_sector(v_user, p_code, coalesce(v_actor.name, v_actor.email, 'administrador'));
end;
$$;

-- Professor: setor de um aluno de um grupo da turma.
create or replace function public.fn_study_set_member_sector(p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
begin
  return public.fn_apply_user_sector(v_user, p_code, coalesce(v_actor.name, v_actor.email) || ' (professor)');
end;
$$;

-- Membros do grupo agora trazem o setor.
drop function if exists public.fn_study_group_members(uuid);
create function public.fn_study_group_members(p_group_id uuid)
returns table (
  id uuid,
  name text,
  email text,
  status text,
  has_login boolean,
  roles text,
  invitation_status text,
  invitation_expires_at timestamptz,
  sector_code text,
  sector_name text,
  is_admin boolean
)
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
  select u.id, u.name::text, u.email::text, u.status::text, u.auth_user_id is not null,
    (select string_agg(r.name, ', ' order by r.name) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id)::text,
    (select case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end
       from public.user_invitations i where i.user_id = u.id order by i.created_at desc limit 1)::text,
    (select i.expires_at from public.user_invitations i where i.user_id = u.id order by i.created_at desc limit 1),
    d.code::text, d.name::text,
    exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id and r.code = 'admin')
  from public.users u
  left join public.departments d on d.id = u.department_id
  where u.company_id = v_group.id
  order by u.name;
end;
$$;

-- ------------------------------------------------------------------ 2) nova senha
-- Confere quem pode e devolve o login; o servidor gera e grava a senha no Auth.
create or replace function public.fn_password_reset_target(p_user public.users, p_actor_label text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user.status <> 'active' then
    raise exception 'Este usuário está inativo.' using errcode = 'P0001';
  end if;
  if p_user.auth_user_id is null then
    raise exception 'Esta pessoa ainda não ativou o acesso: use "Gerar senha provisória".' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.platform_members m where m.auth_user_id = p_user.auth_user_id) then
    raise exception 'Este login também é da administração da plataforma; a senha não é trocada por aqui.' using errcode = '42501';
  end if;
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_user.company_id, null, p_actor_label, 'users', p_user.id, 'UPDATE', null, jsonb_build_object('password_reset', true));
  return jsonb_build_object('user_id', p_user.id, 'auth_user_id', p_user.auth_user_id, 'email', p_user.email, 'name', p_user.name);
end;
$$;

create or replace function public.fn_authorize_password_reset(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.users;
  v_actor public.users;
begin
  select * into v_user from public.users where id = p_user_id;
  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_user.company_id, 'users.update') then
    raise exception 'Permissão negada (users.update).' using errcode = '42501';
  end if;
  select * into v_actor from public.users where id = public.current_app_user_id();
  return public.fn_password_reset_target(v_user, coalesce(v_actor.name, v_actor.email, 'administrador'));
end;
$$;

create or replace function public.fn_study_authorize_member_password_reset(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.users := public.fn_study_actor();
  v_user public.users := public.fn_study_member_of_actor(p_user_id, v_actor);
begin
  return public.fn_password_reset_target(v_user, coalesce(v_actor.name, v_actor.email) || ' (professor)');
end;
$$;

-- ------------------------------------------------------------------ acesso
revoke all on function public.fn_sector_catalog() from public, anon, authenticated;
revoke all on function public.fn_sector_common_permissions() from public, anon, authenticated;
revoke all on function public.fn_ensure_sector(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_apply_user_sector(public.users, text, text) from public, anon, authenticated;
revoke all on function public.fn_password_reset_target(public.users, text) from public, anon, authenticated;
revoke all on function public.fn_sectors() from public, anon;
revoke all on function public.fn_set_user_sector(uuid, text) from public, anon;
revoke all on function public.fn_study_set_member_sector(uuid, text) from public, anon;
revoke all on function public.fn_study_group_members(uuid) from public, anon;
revoke all on function public.fn_authorize_password_reset(uuid) from public, anon;
revoke all on function public.fn_study_authorize_member_password_reset(uuid) from public, anon;
grant execute on function public.fn_sectors() to authenticated;
grant execute on function public.fn_set_user_sector(uuid, text) to authenticated;
grant execute on function public.fn_study_set_member_sector(uuid, text) to authenticated;
grant execute on function public.fn_study_group_members(uuid) to authenticated;
grant execute on function public.fn_authorize_password_reset(uuid) to authenticated;
grant execute on function public.fn_study_authorize_member_password_reset(uuid) to authenticated;
