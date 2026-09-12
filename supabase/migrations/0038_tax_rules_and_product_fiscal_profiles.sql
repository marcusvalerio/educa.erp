-- Fase 8 — Fiscal: configuração fiscal do produto + regras tributárias.
--
-- product_fiscal_profiles (seção 11): NÃO é uma segunda tabela de
-- produtos — é o detalhamento fiscal de um products já existente,
-- versionado (cada mudança de NCM/CST/origem é uma NOVA linha, nunca
-- uma edição da anterior — mesmo princípio de product_boms, 0027: só
-- um perfil 'active' por produto a qualquer momento, garantido por
-- índice único parcial, nunca apagado).
--
-- tax_rules/tax_rule_items (seções 13-15): motor de regras tributárias
-- extensível, NÃO um motor tributário universal. Uma regra é o
-- CONTEXTO de aplicação (produto/NCM/origem/CFOP/natureza/UF/regime/
-- cliente/fornecedor, todos opcionais); seus itens são os IMPOSTOS que
-- ela produz quando o contexto casa. Múltiplas regras podem casar com
-- o mesmo contexto — resolvidas por prioridade (fn_resolve_applicable_tax_rules),
-- nunca um erro de conflito.

create table if not exists public.product_fiscal_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  ncm_id uuid,
  origin_code text not null default '0' check (origin_code in ('0', '1', '2', '3', '4', '5', '6', '7', '8')),
  icms_cst text,
  icms_csosn text,
  pis_cst text,
  cofins_cst text,
  ipi_cst text,
  tax_framework text,
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'active' check (status in ('active', 'obsolete')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade,
  foreign key (ncm_id, company_id) references public.fiscal_ncms (id, company_id) on delete restrict,
  check (valid_until is null or valid_until >= valid_from)
);

create unique index if not exists product_fiscal_profiles_one_active_per_product
  on public.product_fiscal_profiles (company_id, product_id) where status = 'active';

create index if not exists product_fiscal_profiles_product_idx on public.product_fiscal_profiles (product_id);

comment on table public.product_fiscal_profiles is
  'Configuração fiscal do produto (NCM/origem/CST/CSOSN por imposto/enquadramento), versionada — cada fn_set_product_fiscal_profile cria uma linha NOVA e torna a anterior obsolete na mesma transação, nunca editando NCM/CST de uma linha existente. Escrita exclusiva via fn_set_product_fiscal_profile/fn_update_product_fiscal_profile_notes. origin_code: 0-8, tabela oficial de origem da mercadoria (seção 10) — lista fixa, não é cadastro editável pelo usuário, por isso CHECK e não uma tabela própria.';
comment on column public.product_fiscal_profiles.ncm_id is
  'Referência estruturada (fiscal_ncms) — products.ncm (0002) continua existindo como texto livre depreciado, nunca lido por este módulo.';

-- ==================================================================
-- fn_set_product_fiscal_profile — cria uma NOVA versão já 'active' e
-- torna obsolete a anterior, na mesma transação (nunca um instante com
-- duas ativas nem nenhuma ativa durante a troca — mesma garantia de
-- fn_activate_bom, 0027). Diferente de BOM, não há fase 'draft'
-- separada: um perfil fiscal é uma linha só, sem itens a montar antes
-- de ativar.
-- ==================================================================
create or replace function public.fn_set_product_fiscal_profile(
  p_company_id uuid,
  p_product_id uuid,
  p_ncm_id uuid default null,
  p_origin_code text default '0',
  p_icms_cst text default null,
  p_icms_csosn text default null,
  p_pis_cst text default null,
  p_cofins_cst text default null,
  p_ipi_cst text default null,
  p_tax_framework text default null,
  p_valid_from date default current_date,
  p_notes text default null
)
returns public.product_fiscal_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.product_fiscal_profiles;
begin
  if not public.has_permission(p_company_id, 'product_fiscal_profiles.create') then
    raise exception 'Permissão negada (product_fiscal_profiles.create).' using errcode = '42501';
  end if;

  update public.product_fiscal_profiles
  set status = 'obsolete', valid_until = coalesce(valid_until, p_valid_from - 1)
  where company_id = p_company_id and product_id = p_product_id and status = 'active';

  insert into public.product_fiscal_profiles (
    company_id, product_id, ncm_id, origin_code, icms_cst, icms_csosn, pis_cst, cofins_cst, ipi_cst,
    tax_framework, valid_from, notes, created_by
  ) values (
    p_company_id, p_product_id, p_ncm_id, coalesce(p_origin_code, '0'), p_icms_cst, p_icms_csosn, p_pis_cst, p_cofins_cst, p_ipi_cst,
    p_tax_framework, coalesce(p_valid_from, current_date), p_notes, public.current_app_user_id()
  )
  returning * into v_profile;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'product_fiscal_profiles', v_profile.id, 'CREATE',
    null, jsonb_build_object('product_id', p_product_id, 'ncm_id', p_ncm_id, 'origin_code', v_profile.origin_code));

  return v_profile;
end;
$$;

create or replace function public.fn_update_product_fiscal_profile_notes(p_profile_id uuid, p_notes text)
returns public.product_fiscal_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.product_fiscal_profiles;
begin
  select * into v_profile from public.product_fiscal_profiles where id = p_profile_id;
  if not found then
    raise exception 'Perfil fiscal de produto não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_profile.company_id, 'product_fiscal_profiles.update') then
    raise exception 'Permissão negada (product_fiscal_profiles.update).' using errcode = '42501';
  end if;

  -- Só observações — qualquer mudança de classificação fiscal exige
  -- uma nova versão via fn_set_product_fiscal_profile (rastreabilidade,
  -- seção 4: nunca editar em lugar o que já pode ter sido usado em um
  -- documento fiscal histórico).
  update public.product_fiscal_profiles set notes = p_notes where id = p_profile_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.fn_set_product_fiscal_profile(uuid, uuid, uuid, text, text, text, text, text, text, text, date, text) from public;
revoke all on function public.fn_update_product_fiscal_profile_notes(uuid, text) from public;
grant execute on function public.fn_set_product_fiscal_profile(uuid, uuid, uuid, text, text, text, text, text, text, text, date, text) to authenticated;
grant execute on function public.fn_update_product_fiscal_profile_notes(uuid, text) to authenticated;

-- ==================================================================
-- TAX_RULES — o CONTEXTO de aplicação. Todas as dimensões são
-- opcionais (null = "qualquer") — uma regra pode ser tão genérica ou
-- tão específica quanto necessário.
-- ==================================================================
create sequence if not exists public.tax_rules_code_seq;

create table if not exists public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  product_id uuid,
  ncm_id uuid,
  origin_code text check (origin_code is null or origin_code in ('0', '1', '2', '3', '4', '5', '6', '7', '8')),
  cfop_id uuid,
  operation_nature_id uuid,
  origin_uf text,
  destination_uf text,
  tax_regime text check (tax_regime is null or tax_regime in ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI')),
  customer_id uuid,
  supplier_id uuid,
  priority integer not null default 0,
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive')),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (valid_until is null or valid_until >= valid_from),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete set null,
  foreign key (ncm_id, company_id) references public.fiscal_ncms (id, company_id) on delete set null,
  foreign key (cfop_id, company_id) references public.fiscal_cfops (id, company_id) on delete set null,
  foreign key (operation_nature_id, company_id) references public.fiscal_operation_natures (id, company_id) on delete set null,
  foreign key (customer_id, company_id) references public.customers (id, company_id) on delete set null,
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id) on delete set null
);

create trigger set_code before insert on public.tax_rules
  for each row execute procedure public.fn_generate_code('TRIB', 'public.tax_rules_code_seq');
create trigger set_updated_at before update on public.tax_rules
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists tax_rules_company_status_idx on public.tax_rules (company_id, status);
create index if not exists tax_rules_product_idx on public.tax_rules (product_id);
create index if not exists tax_rules_ncm_idx on public.tax_rules (ncm_id);
create index if not exists tax_rules_cfop_idx on public.tax_rules (cfop_id);

comment on table public.tax_rules is
  'Contexto de uma regra tributária — não um único campo tax_rate (seção 13). Várias regras "active" podem casar com o mesmo documento; priority (maior vence) resolve conflito, nunca um erro (seção 15). Escrita exclusiva via fn_create_tax_rule/fn_add_tax_rule_item/fn_remove_tax_rule_item/fn_approve_tax_rule/fn_deactivate_tax_rule.';

create table if not exists public.tax_rule_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tax_rule_id uuid not null,
  tax_type text not null check (tax_type in ('ICMS', 'ICMS_ST', 'IPI', 'PIS', 'COFINS', 'ISS', 'FCP', 'DIFAL', 'OTHER')),
  cst text,
  csosn text,
  rate numeric(7, 4) not null check (rate >= 0),
  reduction_percentage numeric(5, 2) not null default 0 check (reduction_percentage >= 0 and reduction_percentage <= 100),
  notes text,
  created_at timestamptz not null default now(),
  unique (tax_rule_id, tax_type),
  unique (id, company_id),
  foreign key (tax_rule_id, company_id) references public.tax_rules (id, company_id) on delete cascade
);

create index if not exists tax_rule_items_rule_idx on public.tax_rule_items (tax_rule_id);

comment on table public.tax_rule_items is
  'Os impostos que uma tax_rule produz quando seu contexto casa — um item por tax_type (seção 13: uma operação pode envolver ICMS+IPI+PIS+COFINS+FCP simultaneamente, cada um com sua própria base/alíquota/CST).';

create or replace function public.fn_create_tax_rule(
  p_company_id uuid,
  p_name text,
  p_product_id uuid default null,
  p_ncm_id uuid default null,
  p_origin_code text default null,
  p_cfop_id uuid default null,
  p_operation_nature_id uuid default null,
  p_origin_uf text default null,
  p_destination_uf text default null,
  p_tax_regime text default null,
  p_customer_id uuid default null,
  p_supplier_id uuid default null,
  p_priority integer default 0,
  p_valid_from date default current_date,
  p_valid_until date default null,
  p_notes text default null
)
returns public.tax_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.tax_rules;
begin
  if not public.has_permission(p_company_id, 'tax_rules.create') then
    raise exception 'Permissão negada (tax_rules.create).' using errcode = '42501';
  end if;

  insert into public.tax_rules (
    company_id, name, product_id, ncm_id, origin_code, cfop_id, operation_nature_id,
    origin_uf, destination_uf, tax_regime, customer_id, supplier_id, priority, valid_from, valid_until, notes, created_by
  ) values (
    p_company_id, p_name, p_product_id, p_ncm_id, p_origin_code, p_cfop_id, p_operation_nature_id,
    p_origin_uf, p_destination_uf, p_tax_regime, p_customer_id, p_supplier_id, coalesce(p_priority, 0),
    coalesce(p_valid_from, current_date), p_valid_until, p_notes, public.current_app_user_id()
  )
  returning * into v_rule;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'tax_rules', v_rule.id, 'CREATE', null, jsonb_build_object('name', p_name));

  return v_rule;
end;
$$;

create or replace function public.fn_add_tax_rule_item(
  p_tax_rule_id uuid,
  p_tax_type text,
  p_rate numeric,
  p_cst text default null,
  p_csosn text default null,
  p_reduction_percentage numeric default 0,
  p_notes text default null
)
returns public.tax_rule_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.tax_rules;
  v_item public.tax_rule_items;
begin
  select * into v_rule from public.tax_rules where id = p_tax_rule_id;
  if not found then
    raise exception 'Regra tributária não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_rule.company_id, 'tax_rules.update') then
    raise exception 'Permissão negada (tax_rules.update).' using errcode = '42501';
  end if;

  if v_rule.status <> 'draft' then
    raise exception 'Só é possível adicionar impostos a uma regra em rascunho (status atual: %). Crie uma nova regra.', v_rule.status using errcode = 'P0001';
  end if;

  insert into public.tax_rule_items (company_id, tax_rule_id, tax_type, cst, csosn, rate, reduction_percentage, notes)
  values (v_rule.company_id, p_tax_rule_id, p_tax_type, p_cst, p_csosn, p_rate, coalesce(p_reduction_percentage, 0), p_notes)
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.fn_remove_tax_rule_item(p_tax_rule_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.tax_rule_items;
  v_rule public.tax_rules;
begin
  select * into v_item from public.tax_rule_items where id = p_tax_rule_item_id;
  if not found then
    raise exception 'Item de regra tributária não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_rule from public.tax_rules where id = v_item.tax_rule_id;

  if not public.has_permission(v_rule.company_id, 'tax_rules.update') then
    raise exception 'Permissão negada (tax_rules.update).' using errcode = '42501';
  end if;

  if v_rule.status <> 'draft' then
    raise exception 'Só é possível remover impostos de uma regra em rascunho (status atual: %).', v_rule.status using errcode = 'P0001';
  end if;

  delete from public.tax_rule_items where id = p_tax_rule_item_id;
end;
$$;

create or replace function public.fn_approve_tax_rule(p_tax_rule_id uuid)
returns public.tax_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.tax_rules;
  v_item_count integer;
begin
  select * into v_rule from public.tax_rules where id = p_tax_rule_id for update;
  if not found then
    raise exception 'Regra tributária não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_rule.company_id, 'tax_rules.approve') then
    raise exception 'Permissão negada (tax_rules.approve).' using errcode = '42501';
  end if;

  if v_rule.status <> 'draft' then
    raise exception 'Só é possível ativar uma regra em rascunho (status atual: %).', v_rule.status using errcode = 'P0001';
  end if;

  select count(*) into v_item_count from public.tax_rule_items where tax_rule_id = p_tax_rule_id;
  if v_item_count = 0 then
    raise exception 'A regra precisa de ao menos um imposto para ser ativada.' using errcode = 'P0001';
  end if;

  update public.tax_rules set status = 'active' where id = p_tax_rule_id
  returning * into v_rule;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_rule.company_id, public.current_app_user_id(), 'system', 'tax_rules', v_rule.id, 'APPROVE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'active'));

  return v_rule;
end;
$$;

create or replace function public.fn_deactivate_tax_rule(p_tax_rule_id uuid)
returns public.tax_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.tax_rules;
begin
  select * into v_rule from public.tax_rules where id = p_tax_rule_id for update;
  if not found then
    raise exception 'Regra tributária não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_rule.company_id, 'tax_rules.approve') then
    raise exception 'Permissão negada (tax_rules.approve).' using errcode = '42501';
  end if;

  if v_rule.status <> 'active' then
    raise exception 'Só é possível desativar uma regra ativa (status atual: %).', v_rule.status using errcode = 'P0001';
  end if;

  update public.tax_rules set status = 'inactive' where id = p_tax_rule_id
  returning * into v_rule;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_rule.company_id, public.current_app_user_id(), 'system', 'tax_rules', v_rule.id, 'APPROVE',
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'inactive'));

  return v_rule;
end;
$$;

-- ==================================================================
-- fn_resolve_applicable_tax_rules — interna (nunca exposta
-- diretamente). Para cada tax_type, escolhe a regra ATIVA cujo
-- contexto casa com os parâmetros informados (cada dimensão null na
-- regra = "qualquer"), com maior priority (empate: valid_from mais
-- recente). Usada por fn_calculate_fiscal_document (0039) — a
-- resolução em si não decide nada sobre o documento, só devolve as
-- linhas de imposto que se aplicariam.
-- ==================================================================
create or replace function public.fn_resolve_applicable_tax_rules(
  p_company_id uuid,
  p_product_id uuid,
  p_ncm_id uuid,
  p_origin_code text,
  p_cfop_id uuid,
  p_operation_nature_id uuid,
  p_origin_uf text,
  p_destination_uf text,
  p_tax_regime text,
  p_customer_id uuid,
  p_supplier_id uuid,
  p_reference_date date
)
returns table (
  tax_rule_id uuid,
  tax_type text,
  cst text,
  csosn text,
  rate numeric,
  reduction_percentage numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (tri.tax_type)
    tr.id, tri.tax_type, tri.cst, tri.csosn, tri.rate, tri.reduction_percentage
  from public.tax_rules tr
  join public.tax_rule_items tri on tri.tax_rule_id = tr.id
  where tr.company_id = p_company_id
    and tr.status = 'active'
    and tr.valid_from <= p_reference_date
    and (tr.valid_until is null or tr.valid_until >= p_reference_date)
    and (tr.product_id is null or tr.product_id = p_product_id)
    and (tr.ncm_id is null or tr.ncm_id = p_ncm_id)
    and (tr.origin_code is null or tr.origin_code = p_origin_code)
    and (tr.cfop_id is null or tr.cfop_id = p_cfop_id)
    and (tr.operation_nature_id is null or tr.operation_nature_id = p_operation_nature_id)
    and (tr.origin_uf is null or tr.origin_uf = p_origin_uf)
    and (tr.destination_uf is null or tr.destination_uf = p_destination_uf)
    and (tr.tax_regime is null or tr.tax_regime = p_tax_regime)
    and (tr.customer_id is null or tr.customer_id = p_customer_id)
    and (tr.supplier_id is null or tr.supplier_id = p_supplier_id)
  order by tri.tax_type, tr.priority desc, tr.valid_from desc;
$$;

revoke all on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date) from public;

revoke all on function public.fn_create_tax_rule(uuid, text, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, integer, date, date, text) from public;
revoke all on function public.fn_add_tax_rule_item(uuid, text, numeric, text, text, numeric, text) from public;
revoke all on function public.fn_remove_tax_rule_item(uuid) from public;
revoke all on function public.fn_approve_tax_rule(uuid) from public;
revoke all on function public.fn_deactivate_tax_rule(uuid) from public;
grant execute on function public.fn_create_tax_rule(uuid, text, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, integer, date, date, text) to authenticated;
grant execute on function public.fn_add_tax_rule_item(uuid, text, numeric, text, text, numeric, text) to authenticated;
grant execute on function public.fn_remove_tax_rule_item(uuid) to authenticated;
grant execute on function public.fn_approve_tax_rule(uuid) to authenticated;
grant execute on function public.fn_deactivate_tax_rule(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('product_fiscal_profiles.view', 'product_fiscal_profiles', 'view', 'Consultar perfis fiscais de produto'),
    ('product_fiscal_profiles.create', 'product_fiscal_profiles', 'create', 'Criar nova versão de perfil fiscal de produto'),
    ('product_fiscal_profiles.update', 'product_fiscal_profiles', 'update', 'Editar observações do perfil fiscal de produto (não a classificação)'),
    ('tax_rules.view', 'tax_rules', 'view', 'Consultar regras tributárias'),
    ('tax_rules.create', 'tax_rules', 'create', 'Criar regras tributárias'),
    ('tax_rules.update', 'tax_rules', 'update', 'Adicionar/remover impostos de uma regra em rascunho'),
    ('tax_rules.approve', 'tax_rules', 'approve', 'Ativar ou desativar uma regra tributária')
) as v(code, module, action, description)
on conflict (code) do nothing;

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_rbac(c.id);
  end loop;
end;
$$;

-- ==================================================================
-- RLS — select-only; toda escrita via função.
-- ==================================================================
alter table public.product_fiscal_profiles enable row level security;
alter table public.tax_rules enable row level security;
alter table public.tax_rule_items enable row level security;

drop policy if exists product_fiscal_profiles_select on public.product_fiscal_profiles;
create policy product_fiscal_profiles_select on public.product_fiscal_profiles
  for select to authenticated using (public.has_permission(company_id, 'product_fiscal_profiles.view'));

drop policy if exists tax_rules_select on public.tax_rules;
create policy tax_rules_select on public.tax_rules
  for select to authenticated using (public.has_permission(company_id, 'tax_rules.view'));

drop policy if exists tax_rule_items_select on public.tax_rule_items;
create policy tax_rule_items_select on public.tax_rule_items
  for select to authenticated using (public.has_permission(company_id, 'tax_rules.view'));
