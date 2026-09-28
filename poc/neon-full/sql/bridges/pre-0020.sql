-- Ponte: chaves (id, company_id) que a versão de produção criou antes/nesta etapa.
do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'public.customers'::regclass and contype in ('u','p') and pg_get_constraintdef(oid) = 'UNIQUE (id, company_id)') then alter table public.customers add constraint customers_id_company_id_key unique (id, company_id); end if; end $$;
