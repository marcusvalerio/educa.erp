-- Fase 6 — Produção/PCP: BOM (estrutura de produto).
--
-- Uma BOM representa COMO um produto é fabricado — não é estoque, não é
-- ordem de produção. Suporta múltiplas versões por produto; "ativar"
-- uma versão nova torna a anterior obsolete automaticamente (nunca
-- apagada — seção 6 do pedido: "não apagar BOM antiga"). Só uma BOM
-- pode estar 'active' por produto a qualquer momento — garantido por
-- índice único parcial, não só por convenção de função.
--
-- O snapshot para rastreabilidade (seção 7 — "uma ordem antiga não pode
-- mudar retroativamente") não é feito aqui: é responsabilidade de
-- fn_create_production_order (0028), que copia os itens da BOM ativa
-- para production_order_materials no momento da criação da ordem.
-- product_boms/product_bom_items continuam existindo como a "receita"
-- atual — a ordem nunca lê a BOM de novo depois de criada.

create sequence if not exists public.product_boms_code_seq;

create table if not exists public.product_boms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  product_id uuid not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'obsolete')),
  reference_quantity numeric(16, 4) not null default 1 check (reference_quantity > 0),
  unit_id uuid not null,
  valid_from date,
  valid_until date,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  unique (company_id, product_id, version),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (unit_id, company_id) references public.units (id, company_id) on delete restrict
);

-- Só uma BOM 'active' por produto a qualquer momento — o requisito de
-- "somente uma versão pode estar ativa" (seção 6) é estrutural, não uma
-- convenção que uma função poderia deixar de respeitar.
create unique index if not exists product_boms_one_active_per_product
  on public.product_boms (company_id, product_id) where status = 'active';

create trigger set_code before insert on public.product_boms
  for each row execute procedure public.fn_generate_code('BOM', 'public.product_boms_code_seq');
create trigger set_updated_at before update on public.product_boms
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists product_boms_company_status_idx on public.product_boms (company_id, status);
create index if not exists product_boms_product_idx on public.product_boms (product_id);

comment on table public.product_boms is
  'Estrutura de produto (receita de fabricação), versionada. Apenas uma versão pode estar active por produto (índice único parcial). Nunca apagada — uma nova ativação marca a anterior obsolete. Escrita exclusiva via fn_create_bom/fn_add_bom_item/fn_remove_bom_item/fn_activate_bom/fn_obsolete_bom.';
comment on column public.product_boms.reference_quantity is
  'Quantidade do produto acabado (em unit_id) que esta receita produz — ex.: "esta BOM produz 10 unidades". Os itens (product_bom_items.quantity) são proporcionais a esta referência, não a 1 unidade fixa.';

create table if not exists public.product_bom_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bom_id uuid not null,
  component_product_id uuid not null,
  quantity numeric(16, 4) not null check (quantity > 0),
  unit_id uuid not null,
  scrap_percentage numeric(5, 2) not null default 0 check (scrap_percentage >= 0 and scrap_percentage < 100),
  sequence integer not null default 10 check (sequence > 0),
  is_optional boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (bom_id, component_product_id),
  unique (id, company_id),
  foreign key (bom_id, company_id) references public.product_boms (id, company_id) on delete cascade,
  foreign key (component_product_id, company_id) references public.products (id, company_id) on delete restrict,
  foreign key (unit_id, company_id) references public.units (id, company_id) on delete restrict
);

create index if not exists product_bom_items_bom_idx on public.product_bom_items (bom_id);
create index if not exists product_bom_items_component_idx on public.product_bom_items (component_product_id);

comment on table public.product_bom_items is
  'Componentes de uma BOM. quantity é proporcional a product_boms.reference_quantity (ex.: reference_quantity=1 "Mesa", item "4 pernas" -> 4 pernas por mesa). scrap_percentage é a perda esperada desse componente especificamente (ex.: corte de madeira), aplicada ao calcular a necessidade de uma ordem de produção (0028).';

-- ==================================================================
-- fn_create_bom — cria sempre em draft. version é o próximo número
-- para aquele produto (max(version)+1), nunca reaproveitado mesmo que
-- versões antigas tenham sido tornadas obsolete (rastreabilidade:
-- version é um identificador histórico, não um contador reciclável).
-- ==================================================================
create or replace function public.fn_create_bom(
  p_company_id uuid,
  p_product_id uuid,
  p_reference_quantity numeric,
  p_unit_id uuid,
  p_valid_from date default null,
  p_valid_until date default null,
  p_notes text default null
)
returns public.product_boms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bom public.product_boms;
  v_next_version integer;
begin
  if not public.has_permission(p_company_id, 'production_boms.create') then
    raise exception 'Permissão negada (production_boms.create).' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.product_boms where company_id = p_company_id and product_id = p_product_id;

  insert into public.product_boms (
    company_id, product_id, version, reference_quantity, unit_id, valid_from, valid_until, notes, created_by
  ) values (
    p_company_id, p_product_id, v_next_version, p_reference_quantity, p_unit_id, p_valid_from, p_valid_until, p_notes, public.current_app_user_id()
  )
  returning * into v_bom;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'product_boms', v_bom.id, 'CREATE', null, jsonb_build_object('version', v_next_version));

  return v_bom;
end;
$$;

-- ==================================================================
-- fn_add_bom_item — só enquanto a BOM está em draft (uma vez active,
-- a receita não muda mais; qualquer alteração exige uma nova versão
-- via fn_create_bom). Bloqueia o próprio produto como componente de
-- si mesmo (ciclo trivial de nível 1).
-- ==================================================================
create or replace function public.fn_add_bom_item(
  p_bom_id uuid,
  p_component_product_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_scrap_percentage numeric default 0,
  p_sequence integer default 10,
  p_is_optional boolean default false,
  p_notes text default null
)
returns public.product_bom_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bom public.product_boms;
  v_item public.product_bom_items;
begin
  select * into v_bom from public.product_boms where id = p_bom_id;
  if not found then
    raise exception 'BOM não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_bom.company_id, 'production_boms.update') then
    raise exception 'Permissão negada (production_boms.update).' using errcode = '42501';
  end if;

  if v_bom.status <> 'draft' then
    raise exception 'Só é possível adicionar componentes a uma BOM em rascunho (status atual: %). Crie uma nova versão.', v_bom.status using errcode = 'P0001';
  end if;

  if p_component_product_id = v_bom.product_id then
    raise exception 'Um produto não pode ser componente de sua própria BOM.' using errcode = 'P0001';
  end if;

  insert into public.product_bom_items (
    company_id, bom_id, component_product_id, quantity, unit_id, scrap_percentage, sequence, is_optional, notes
  ) values (
    v_bom.company_id, p_bom_id, p_component_product_id, p_quantity, p_unit_id, p_scrap_percentage, p_sequence, p_is_optional, p_notes
  )
  returning * into v_item;

  return v_item;
end;
$$;

create or replace function public.fn_remove_bom_item(p_bom_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.product_bom_items;
  v_bom public.product_boms;
begin
  select * into v_item from public.product_bom_items where id = p_bom_item_id;
  if not found then
    raise exception 'Item de BOM não encontrado.' using errcode = 'P0002';
  end if;

  select * into v_bom from public.product_boms where id = v_item.bom_id;

  if not public.has_permission(v_bom.company_id, 'production_boms.update') then
    raise exception 'Permissão negada (production_boms.update).' using errcode = '42501';
  end if;

  if v_bom.status <> 'draft' then
    raise exception 'Só é possível remover componentes de uma BOM em rascunho (status atual: %).', v_bom.status using errcode = 'P0001';
  end if;

  delete from public.product_bom_items where id = p_bom_item_id;
end;
$$;

-- ==================================================================
-- fn_activate_bom — exige ao menos 1 componente. Torna obsolete
-- qualquer outra BOM ativa do MESMO produto antes de ativar esta (na
-- mesma transação — nunca um instante com duas BOMs ativas, nem um
-- instante sem nenhuma cobrindo a troca). A BOM antiga nunca é apagada.
-- ==================================================================
create or replace function public.fn_activate_bom(p_bom_id uuid)
returns public.product_boms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bom public.product_boms;
  v_item_count integer;
begin
  select * into v_bom from public.product_boms where id = p_bom_id for update;
  if not found then
    raise exception 'BOM não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_bom.company_id, 'production_boms.approve') then
    raise exception 'Permissão negada (production_boms.approve).' using errcode = '42501';
  end if;

  if v_bom.status <> 'draft' then
    raise exception 'Só é possível ativar uma BOM em rascunho (status atual: %).', v_bom.status using errcode = 'P0001';
  end if;

  select count(*) into v_item_count from public.product_bom_items where bom_id = p_bom_id;
  if v_item_count = 0 then
    raise exception 'A BOM precisa de ao menos um componente para ser ativada.' using errcode = 'P0001';
  end if;

  update public.product_boms
  set status = 'obsolete'
  where company_id = v_bom.company_id and product_id = v_bom.product_id and status = 'active' and id <> p_bom_id;

  update public.product_boms set status = 'active' where id = p_bom_id
  returning * into v_bom;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_bom.company_id, public.current_app_user_id(), 'system', 'product_boms', v_bom.id, 'APPROVE',
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'active', 'version', v_bom.version));

  return v_bom;
end;
$$;

create or replace function public.fn_obsolete_bom(p_bom_id uuid)
returns public.product_boms
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bom public.product_boms;
begin
  select * into v_bom from public.product_boms where id = p_bom_id;
  if not found then
    raise exception 'BOM não encontrada.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_bom.company_id, 'production_boms.approve') then
    raise exception 'Permissão negada (production_boms.approve).' using errcode = '42501';
  end if;

  if v_bom.status <> 'active' then
    raise exception 'Só é possível tornar obsoleta uma BOM ativa (status atual: %).', v_bom.status using errcode = 'P0001';
  end if;

  update public.product_boms set status = 'obsolete' where id = p_bom_id
  returning * into v_bom;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_bom.company_id, public.current_app_user_id(), 'system', 'product_boms', v_bom.id, 'APPROVE',
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'obsolete'));

  return v_bom;
end;
$$;

revoke all on function public.fn_create_bom(uuid, uuid, numeric, uuid, date, date, text) from public;
revoke all on function public.fn_add_bom_item(uuid, uuid, numeric, uuid, numeric, integer, boolean, text) from public;
revoke all on function public.fn_remove_bom_item(uuid) from public;
revoke all on function public.fn_activate_bom(uuid) from public;
revoke all on function public.fn_obsolete_bom(uuid) from public;
grant execute on function public.fn_create_bom(uuid, uuid, numeric, uuid, date, date, text) to authenticated;
grant execute on function public.fn_add_bom_item(uuid, uuid, numeric, uuid, numeric, integer, boolean, text) to authenticated;
grant execute on function public.fn_remove_bom_item(uuid) to authenticated;
grant execute on function public.fn_activate_bom(uuid) to authenticated;
grant execute on function public.fn_obsolete_bom(uuid) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('production_boms.view', 'production_boms', 'view', 'Consultar estruturas de produto (BOM)'),
    ('production_boms.create', 'production_boms', 'create', 'Criar novas versões de BOM'),
    ('production_boms.update', 'production_boms', 'update', 'Adicionar/remover componentes de uma BOM em rascunho'),
    ('production_boms.approve', 'production_boms', 'approve', 'Ativar ou tornar obsoleta uma versão de BOM')
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
alter table public.product_boms enable row level security;
alter table public.product_bom_items enable row level security;

drop policy if exists product_boms_select on public.product_boms;
create policy product_boms_select on public.product_boms
  for select to authenticated using (public.has_permission(company_id, 'production_boms.view'));

drop policy if exists product_bom_items_select on public.product_bom_items;
create policy product_bom_items_select on public.product_bom_items
  for select to authenticated using (public.has_permission(company_id, 'production_boms.view'));
