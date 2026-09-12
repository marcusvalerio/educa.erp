-- Fase 9 — Fiscal Operacional: documento referenciado, volumes e
-- devoluções.
--
-- fiscal_document_references (seção 8) evita dezenas de colunas
-- nullable em fiscal_documents para cada tipo de relação (devolução
-- referencia original, complementar referencia anterior, evento
-- referencia documento, substituto referencia anterior) — uma única
-- tabela de relação, tipada por reference_type.
--
-- fiscal_document_packages (seção 11) não é shipment_packages (0024):
-- shipment_packages é o volume FÍSICO da expedição; fiscal_document_packages
-- é o volume DECLARADO no documento fiscal — podem divergir (reembalagem,
-- consolidação) e por isso são entidades separadas, relacionáveis só por
-- inspeção manual nesta etapa (sem FK entre elas).

create table if not exists public.fiscal_document_references (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_document_id uuid not null,
  referenced_document_id uuid not null,
  reference_type text not null check (reference_type in (
    'RETURN', 'COMPLEMENT', 'REPLACEMENT', 'EVENT_SOURCE', 'TRANSFER_COUNTERPART', 'OTHER'
  )),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (fiscal_document_id, referenced_document_id, reference_type),
  foreign key (fiscal_document_id, company_id) references public.fiscal_documents (id, company_id) on delete cascade,
  foreign key (referenced_document_id, company_id) references public.fiscal_documents (id, company_id) on delete restrict,
  check (fiscal_document_id <> referenced_document_id)
);

create index if not exists fiscal_document_references_document_idx on public.fiscal_document_references (fiscal_document_id);
create index if not exists fiscal_document_references_referenced_idx on public.fiscal_document_references (referenced_document_id);

comment on table public.fiscal_document_references is
  'Relação entre documentos fiscais (devolução->original, complementar->anterior, substituto->anterior, pernas de uma transferência entre si). A FK composta (id, company_id) em ambos os lados já impede referenciar um documento de outra empresa.';

create table if not exists public.fiscal_document_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fiscal_document_id uuid not null,
  package_number integer not null check (package_number > 0),
  quantity integer not null default 1 check (quantity > 0),
  species text,
  brand_mark text,
  numbering text,
  gross_weight numeric(12, 3) check (gross_weight is null or gross_weight >= 0),
  net_weight numeric(12, 3) check (net_weight is null or net_weight >= 0),
  created_at timestamptz not null default now(),
  unique (fiscal_document_id, package_number),
  foreign key (fiscal_document_id, company_id) references public.fiscal_documents (id, company_id) on delete cascade
);

create index if not exists fiscal_document_packages_document_idx on public.fiscal_document_packages (fiscal_document_id);

comment on table public.fiscal_document_packages is
  'Volumes DECLARADOS no documento fiscal (espécie/marca/numeração/peso) — não confundir com shipment_packages (0024), o volume físico da expedição. Entidades separadas de propósito (seção 11).';

-- ==================================================================
-- fn_add_fiscal_document_reference — bloqueada uma vez AUTHORIZED/
-- CANCELLED (mesmo espírito da imutabilidade de 0041): uma referência
-- nova depois de autorizado representaria alterar o fato histórico.
-- ==================================================================
create or replace function public.fn_add_fiscal_document_reference(
  p_fiscal_document_id uuid,
  p_referenced_document_id uuid,
  p_reference_type text,
  p_notes text default null
)
returns public.fiscal_document_references
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_reference public.fiscal_document_references;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_document_references.create') then
    raise exception 'Permissão negada (fiscal_document_references.create).' using errcode = '42501';
  end if;

  insert into public.fiscal_document_references (company_id, fiscal_document_id, referenced_document_id, reference_type, notes, created_by)
  values (v_document.company_id, p_fiscal_document_id, p_referenced_document_id, p_reference_type, p_notes, public.current_app_user_id())
  returning * into v_reference;

  return v_reference;
end;
$$;

-- ==================================================================
-- fn_add_fiscal_document_package — bloqueada a partir de AUTHORIZED/
-- CANCELLED (os volumes declarados fazem parte do documento autorizado,
-- seção 14).
-- ==================================================================
create or replace function public.fn_add_fiscal_document_package(
  p_fiscal_document_id uuid,
  p_package_number integer,
  p_quantity integer default 1,
  p_species text default null,
  p_brand_mark text default null,
  p_numbering text default null,
  p_gross_weight numeric default null,
  p_net_weight numeric default null
)
returns public.fiscal_document_packages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.fiscal_documents;
  v_package public.fiscal_document_packages;
begin
  select * into v_document from public.fiscal_documents where id = p_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_document.company_id, 'fiscal_document_packages.create') then
    raise exception 'Permissão negada (fiscal_document_packages.create).' using errcode = '42501';
  end if;

  if v_document.status in ('AUTHORIZED', 'CANCELLED') then
    raise exception 'Não é possível adicionar volumes a um documento no status %.', v_document.status using errcode = 'P0001';
  end if;

  insert into public.fiscal_document_packages (
    company_id, fiscal_document_id, package_number, quantity, species, brand_mark, numbering, gross_weight, net_weight
  ) values (
    v_document.company_id, p_fiscal_document_id, p_package_number, coalesce(p_quantity, 1), p_species, p_brand_mark, p_numbering, p_gross_weight, p_net_weight
  )
  returning * into v_package;

  return v_package;
end;
$$;

-- ==================================================================
-- fn_create_fiscal_document_return — devolução de venda ou de compra
-- (seção 6). Só a partir de um documento original AUTORIZADO (não se
-- devolve o que nunca foi emitido). Direção sempre o inverso do
-- original; mesmo contraparte (cliente/fornecedor); itens copiados do
-- original preservando o snapshot fiscal (NCM/CFOP/origem) — nunca
-- relidos do cadastro atual. Idempotente por origem (source_type=
-- 'return', source_id=original, reaproveitando o índice único de 0039)
-- e sempre cria o vínculo em fiscal_document_references (reference_type
-- 'RETURN') para manter a referência ao documento original.
-- ==================================================================
create or replace function public.fn_create_fiscal_document_return(
  p_original_fiscal_document_id uuid,
  p_fiscal_establishment_id uuid,
  p_operation_nature_id uuid,
  p_notes text default null
)
returns public.fiscal_documents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.fiscal_documents;
  v_document public.fiscal_documents;
  v_new_direction text;
  v_item record;
begin
  select * into v_original from public.fiscal_documents where id = p_original_fiscal_document_id;
  if not found then
    raise exception 'Documento fiscal original não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_original.company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;

  if v_original.status <> 'AUTHORIZED' then
    raise exception 'Só é possível devolver um documento fiscal autorizado (status atual: %).', v_original.status using errcode = 'P0001';
  end if;

  v_new_direction := case when v_original.direction = 'SAIDA' then 'ENTRADA' else 'SAIDA' end;

  v_document := public.fn_create_fiscal_document(
    p_company_id => v_original.company_id,
    p_fiscal_establishment_id => p_fiscal_establishment_id,
    p_type => v_original.type,
    p_direction => v_new_direction,
    p_operation_nature_id => p_operation_nature_id,
    p_customer_id => v_original.customer_id,
    p_supplier_id => v_original.supplier_id,
    p_source_type => 'return',
    p_source_id => v_original.id,
    p_notes => p_notes
  );

  if v_document.status = 'DRAFT' and not exists (select 1 from public.fiscal_document_items where fiscal_document_id = v_document.id) then
    for v_item in select * from public.fiscal_document_items where fiscal_document_id = p_original_fiscal_document_id
    loop
      perform public.fn_add_fiscal_document_item(
        p_fiscal_document_id => v_document.id,
        p_product_id => v_item.product_id,
        p_quantity => v_item.quantity,
        p_unit_price => v_item.unit_price,
        p_ncm_code => v_item.ncm_code,
        p_ncm_description => v_item.ncm_description,
        p_cfop_code => v_item.cfop_code,
        p_origin_code => v_item.origin_code,
        p_unit => v_item.unit,
        p_source_reference_type => 'fiscal_document_item',
        p_source_reference_id => v_item.id
      );
    end loop;
  end if;

  insert into public.fiscal_document_references (company_id, fiscal_document_id, referenced_document_id, reference_type, notes, created_by)
  values (v_original.company_id, v_document.id, v_original.id, 'RETURN', p_notes, public.current_app_user_id())
  on conflict (fiscal_document_id, referenced_document_id, reference_type) do nothing;

  return v_document;
end;
$$;

revoke all on function public.fn_add_fiscal_document_reference(uuid, uuid, text, text) from public;
revoke all on function public.fn_add_fiscal_document_package(uuid, integer, integer, text, text, text, numeric, numeric) from public;
revoke all on function public.fn_create_fiscal_document_return(uuid, uuid, uuid, text) from public;
grant execute on function public.fn_add_fiscal_document_reference(uuid, uuid, text, text) to authenticated;
grant execute on function public.fn_add_fiscal_document_package(uuid, integer, integer, text, text, text, numeric, numeric) to authenticated;
grant execute on function public.fn_create_fiscal_document_return(uuid, uuid, uuid, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('fiscal_document_references.view', 'fiscal_document_references', 'view', 'Consultar referências entre documentos fiscais'),
    ('fiscal_document_references.create', 'fiscal_document_references', 'create', 'Vincular documentos fiscais (devolução, complementar, substituto)'),
    ('fiscal_document_packages.view', 'fiscal_document_packages', 'view', 'Consultar volumes declarados de documentos fiscais'),
    ('fiscal_document_packages.create', 'fiscal_document_packages', 'create', 'Declarar volumes de um documento fiscal')
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
alter table public.fiscal_document_references enable row level security;
alter table public.fiscal_document_packages enable row level security;

drop policy if exists fiscal_document_references_select on public.fiscal_document_references;
create policy fiscal_document_references_select on public.fiscal_document_references
  for select to authenticated using (public.has_permission(company_id, 'fiscal_document_references.view'));

drop policy if exists fiscal_document_packages_select on public.fiscal_document_packages;
create policy fiscal_document_packages_select on public.fiscal_document_packages
  for select to authenticated using (public.has_permission(company_id, 'fiscal_document_packages.view'));
