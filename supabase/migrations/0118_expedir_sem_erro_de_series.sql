-- 0118 — "Expedir" e "Confirmar recebimento" sem o erro
-- "cannot get array length of a scalar".
--
-- A tela gravava os números de série dos itens como JSON null (e não como
-- vazio de verdade); as funções contavam as séries com jsonb_array_length,
-- que falha em null. Resultado: a expedição criada pelo botão "Gerar
-- expedição" não podia ser expedida (o estoque não baixava).
--   1) Itens já gravados com JSON null passam a vazio de verdade.
--   2) fn_ship_shipment e fn_confirm_purchase_receipt só contam séries quando
--      o campo é de fato uma lista. O resto das funções não muda.
-- Pode rodar de novo.

do $$
declare
  r record;
begin
  for r in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'serial_numbers' and c.data_type = 'jsonb'
      and exists (select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name = c.table_name and t.table_type = 'BASE TABLE')
  loop
    execute format('update public.%I set serial_numbers = null where jsonb_typeof(serial_numbers) = ''null''', r.table_name);
  end loop;
end;
$$;

do $$
declare
  v_fn record;
  v_def text;
begin
  for v_fn in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('fn_ship_shipment', 'fn_confirm_purchase_receipt')
      and p.prosrc ~ 'jsonb_array_length\(\s*v_\w+\.serial_numbers\s*\)'
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    v_def := regexp_replace(v_def, 'jsonb_array_length\(\s*(v_\w+)\.serial_numbers\s*\)',
      'jsonb_array_length(case when jsonb_typeof(\1.serial_numbers) = ''array'' then \1.serial_numbers else ''[]''::jsonb end)', 'g');
    execute v_def;
  end loop;
end;
$$;
