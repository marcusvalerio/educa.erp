-- 0116 — NF de entrada no recebimento da compra.
--
-- Na compra, a nota é emitida pelo fornecedor; quem compra a ESCRITURA
-- (registra a NF de entrada) ao receber a mercadoria. O banco já sabia
-- gerar o documento de entrada a partir do recebimento
-- (fn_create_fiscal_document_from_purchase_receipt), mas nada chamava.
--   1) Toda empresa ganha os CFOPs 1102/2102 (compra) e 5102/6102 (venda) e
--      as naturezas "Compra para comercialização" e "Venda de mercadoria",
--      se ainda não tiver natureza de entrada/saída. Empresas novas também.
--   2) fn_register_purchase_entry_invoice(recebimento): cria a NF de entrada
--      (itens e valores do recebimento, número/série/chave da nota do
--      fornecedor nas observações), calcula e deixa conferida. Idempotente.
--   3) Recebimento confirmado chama a função sozinho, se quem confirma pode
--      lançar documento fiscal e a empresa tem estabelecimento fiscal.
--      Falhar aqui nunca impede a entrada no estoque (fica o botão).
-- Pode rodar de novo.

-- ------------------------------------------------------------------ 1
create or replace function public.fn_seed_fiscal_defaults(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfop uuid;
begin
  insert into public.fiscal_cfops (company_id, code, description, direction, scope)
  select p_company_id, v.code, v.descr, v.dir, v.scope
  from (values
    ('1102', 'Compra para comercialização', 'ENTRADA', 'INTERNAL'),
    ('2102', 'Compra para comercialização (outro estado)', 'ENTRADA', 'INTERSTATE'),
    ('5102', 'Venda de mercadoria adquirida de terceiros', 'SAIDA', 'INTERNAL'),
    ('6102', 'Venda de mercadoria adquirida de terceiros (outro estado)', 'SAIDA', 'INTERSTATE')
  ) as v(code, descr, dir, scope)
  where not exists (select 1 from public.fiscal_cfops c where c.company_id = p_company_id and c.code = v.code);

  if not exists (select 1 from public.fiscal_operation_natures where company_id = p_company_id and direction = 'ENTRADA') then
    select id into v_cfop from public.fiscal_cfops where company_id = p_company_id and code = '1102';
    insert into public.fiscal_operation_natures (company_id, code, name, direction, default_cfop_id)
    values (p_company_id, 'COMPRA-UF', 'Compra para comercialização', 'ENTRADA', v_cfop)
    on conflict do nothing;
  end if;
  if not exists (select 1 from public.fiscal_operation_natures where company_id = p_company_id and direction = 'SAIDA') then
    select id into v_cfop from public.fiscal_cfops where company_id = p_company_id and code = '5102';
    insert into public.fiscal_operation_natures (company_id, code, name, direction, default_cfop_id)
    values (p_company_id, 'VENDA-UF', 'Venda de mercadoria', 'SAIDA', v_cfop)
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function public.fn_seed_fiscal_defaults(uuid) from public, anon, authenticated;

create or replace function public.fn_companies_seed_fiscal_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_seed_fiscal_defaults(new.id);
  return new;
end;
$$;
revoke all on function public.fn_companies_seed_fiscal_defaults() from public, anon, authenticated, service_role;

drop trigger if exists seed_fiscal_defaults on public.companies;
create trigger seed_fiscal_defaults
  after insert on public.companies
  for each row execute function public.fn_companies_seed_fiscal_defaults();

do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.companies loop
    perform public.fn_seed_fiscal_defaults(v_id);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ 2
create or replace function public.fn_register_purchase_entry_invoice(p_receipt_id uuid)
returns public.fiscal_documents
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_receipt public.purchase_receipts;
  v_doc public.fiscal_documents;
  v_est uuid;
  v_nat uuid;
  v_note text;
begin
  select * into v_receipt from public.purchase_receipts where id = p_receipt_id;
  if not found then
    raise exception 'Recebimento não encontrado.' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_receipt.company_id, 'fiscal_documents.create') then
    raise exception 'Permissão negada (fiscal_documents.create).' using errcode = '42501';
  end if;
  if v_receipt.status <> 'confirmed' then
    raise exception 'Confirme o recebimento antes de lançar a NF de entrada.' using errcode = 'P0001';
  end if;

  select * into v_doc from public.fiscal_documents
  where company_id = v_receipt.company_id and source_type = 'purchase_receipt' and source_id = v_receipt.id and status <> 'CANCELLED'
  order by created_at desc limit 1;
  if found then
    return v_doc;
  end if;

  select id into v_est from public.fiscal_establishments where company_id = v_receipt.company_id and status = 'active' order by created_at limit 1;
  if v_est is null then
    raise exception 'Cadastre o estabelecimento fiscal da empresa (Fiscal › Configuração) para lançar a NF de entrada.' using errcode = 'P0001';
  end if;
  select id into v_nat from public.fiscal_operation_natures
  where company_id = v_receipt.company_id and direction = 'ENTRADA' and status = 'active'
  order by (code = 'COMPRA-UF') desc, created_at limit 1;
  if v_nat is null then
    raise exception 'Cadastre uma natureza de operação de ENTRADA (Fiscal › Configuração).' using errcode = 'P0001';
  end if;

  v_note := 'NF do fornecedor'
    || coalesce(' nº ' || nullif(v_receipt.document_number, ''), '')
    || coalesce(' série ' || nullif(v_receipt.document_series, ''), '')
    || coalesce(' — chave ' || nullif(v_receipt.access_key, ''), '')
    || ' — recebimento ' || v_receipt.code;

  v_doc := public.fn_create_fiscal_document_from_purchase_receipt(v_receipt.id, v_est, v_nat, v_note);
  if v_doc.status = 'DRAFT' and public.has_permission(v_receipt.company_id, 'fiscal_documents.calculate') then
    v_doc := public.fn_calculate_fiscal_document(v_doc.id);
  end if;
  if v_doc.status = 'CALCULATED' and public.has_permission(v_receipt.company_id, 'fiscal_documents.ready') then
    v_doc := public.fn_mark_fiscal_document_ready(v_doc.id);
  end if;
  return v_doc;
end;
$$;
revoke all on function public.fn_register_purchase_entry_invoice(uuid) from public, anon;
grant execute on function public.fn_register_purchase_entry_invoice(uuid) to authenticated;

-- ------------------------------------------------------------------ 3
create or replace function public.fn_trg_entry_invoice_on_receipt_confirmed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'confirmed' and OLD.status is distinct from 'confirmed'
     and public.has_permission(NEW.company_id, 'fiscal_documents.create')
     and exists (select 1 from public.fiscal_establishments where company_id = NEW.company_id and status = 'active') then
    begin
      perform public.fn_register_purchase_entry_invoice(NEW.id);
    exception when others then
      -- A NF de entrada não pode travar a entrada no estoque: fica o botão.
      raise notice 'NF de entrada não lançada para o recebimento %: %', NEW.code, sqlerrm;
    end;
  end if;
  return NEW;
end;
$$;
revoke all on function public.fn_trg_entry_invoice_on_receipt_confirmed() from public, anon, authenticated;

drop trigger if exists entry_invoice_on_receipt_confirmed on public.purchase_receipts;
create trigger entry_invoice_on_receipt_confirmed
  after update of status on public.purchase_receipts
  for each row execute procedure public.fn_trg_entry_invoice_on_receipt_confirmed();
