-- Ponte: chaves (id, company_id) que a versão de produção criou antes/nesta etapa.
do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'public.suppliers'::regclass and contype in ('u','p') and pg_get_constraintdef(oid) = 'UNIQUE (id, company_id)') then alter table public.suppliers add constraint suppliers_id_company_id_key unique (id, company_id); end if; end $$;
