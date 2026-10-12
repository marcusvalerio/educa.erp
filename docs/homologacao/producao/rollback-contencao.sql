-- ROLLBACK TÉCNICO da contenção emergencial (contencao-emergencial.sql v2).
--
-- ATENÇÃO — REABRE RISCO DE SEGURANÇA. Usar só se a contenção quebrar uma
-- função legítima comprovada que não possa esperar correção, e pelo menor
-- tempo possível. Plano: docs/homologacao/PLANO-PRODUCAO-E-ROLLBACK.md.
--
-- Escopo: restaura SOMENTE o necessário para reverter tecnicamente cada efeito
-- da contenção sobre papéis LEGÍTIMOS (usuário logado e servidor do app). Não
-- devolve nada a anon: nenhum consumidor legítimo usa anon nessas views ou na
-- função (sem login não há empresa a consultar). Cada seção é independente —
-- antes de executar, APAGUE as seções que não correspondem à quebra
-- comprovada. Risco que cada seção reabre:
--   R1  policy units_select_authenticated USING (true) → E1 reaberta: todo
--       usuário logado lê unidades e ids de todas as empresas.
--   R2  views sem security_invoker → voltam a rodar com os direitos do dono
--       (ignoram RLS). Sozinha não expõe nada (anon/authenticated seguem sem
--       privilégio); com R3, E2 reaberta para usuários logados.
--   R3  SELECT nas 4 views para authenticated → com R2, qualquer usuário logado
--       lê totais de todas as empresas; sem R2, o RLS limita à empresa dele.
--   R4  EXECUTE de fn_resolve_applicable_tax_rules para service_role → só o
--       servidor do app (chave secreta) volta a chamá-la por RPC; não reabre E3
--       para usuários nem anon.
--   R5  (comentada) restauração INTEGRAL do estado anterior: ALL para anon e
--       authenticated nas views e EXECUTE para anon/authenticated na função →
--       reabre E2 e E3 para QUALQUER PESSOA NA INTERNET. Só com decisão
--       explícita e registrada; nunca como primeira opção.
--
-- Não há dados envolvidos: tudo é catálogo e o efeito é imediato.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684
     or current_database() <> 'postgres' then
    raise exception 'Rollback: banco não é o de produção esperado. Nada foi alterado.';
  end if;
end;
$$;

-- ------------------------------------------------------------------ R1
do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select_authenticated') then
    create policy units_select_authenticated on public.units for select to authenticated using (true);
  end if;
end;
$$;

-- ------------------------------------------------------------------ R2
alter view public.v_cash_flow_summary reset (security_invoker);
alter view public.v_cash_flow_projection reset (security_invoker);
alter view public.inventory_valuation reset (security_invoker);
alter view public.v_sales_order_item_margin reset (security_invoker);

-- ------------------------------------------------------------------ R3
grant select on public.v_cash_flow_summary, public.v_cash_flow_projection,
  public.inventory_valuation, public.v_sales_order_item_margin to authenticated;

-- ------------------------------------------------------------------ R4
grant execute on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
  to service_role;

-- ------------------------------------------------------------------ R5 (NÃO executar sem decisão explícita)
-- grant all on public.v_cash_flow_summary, public.v_cash_flow_projection,
--   public.inventory_valuation, public.v_sales_order_item_margin to anon, authenticated;
-- grant execute on function public.fn_resolve_applicable_tax_rules(uuid, uuid, uuid, text, uuid, uuid, text, text, text, uuid, uuid, date)
--   to anon, authenticated;

-- ------------------------------------------------------------------ conferência
-- Sem R5, anon continua sem acesso algum e service_role continua lendo as
-- views. (Se R5 for executada por decisão explícita, apagar a 1ª checagem.)
do $$
begin
  if exists (select 1 from pg_class c, aclexplode(c.relacl) x
             where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
               and (x.grantee = 0 or x.grantee = 'anon'::regrole))
     or has_function_privilege('anon', 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)', 'execute') then
    raise exception 'Rollback: anon/PUBLIC voltou a ter acesso sem a seção R5. Nada foi alterado.';
  end if;
  if not (has_table_privilege('service_role', 'public.v_cash_flow_summary', 'SELECT')
          and has_table_privilege('service_role', 'public.v_cash_flow_projection', 'SELECT')
          and has_table_privilege('service_role', 'public.inventory_valuation', 'SELECT')
          and has_table_privilege('service_role', 'public.v_sales_order_item_margin', 'SELECT')) then
    raise exception 'Rollback: service_role sem SELECT nas views. Nada foi alterado.';
  end if;
end;
$$;

commit;
