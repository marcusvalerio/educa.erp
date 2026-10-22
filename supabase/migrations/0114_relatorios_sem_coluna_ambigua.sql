-- 0114 — Relatórios de Estoque, Produção e Fiscal voltam a funcionar.
--
-- Nestas funções, o nome de uma coluna do resultado (total_value,
-- produced_quantity, taxes_amount...) é igual ao de uma coluna das tabelas
-- consultadas, e o PostgreSQL recusava a consulta ("column reference ... is
-- ambiguous") — os painéis e relatórios dessas áreas falhavam sempre.
-- A diretiva #variable_conflict use_column manda usar a coluna da tabela,
-- que é o que o corpo de cada função pretende. O resto do corpo não muda.
-- Pode rodar de novo.

do $$
declare
  v_fn record;
  v_def text;
begin
  for v_fn in
    select p.oid
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('fn_report_inventory', 'fn_report_production', 'fn_report_fiscal', 'fn_crm_opportunities_by_stage', 'fn_industrial_cost_summary')
      and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and position('#variable_conflict' in p.prosrc) = 0
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    v_def := regexp_replace(v_def, 'AS \$function\$', E'AS $function$\n#variable_conflict use_column');
    execute v_def;
  end loop;
end;
$$;
