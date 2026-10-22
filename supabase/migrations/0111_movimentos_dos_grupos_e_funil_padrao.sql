-- 0111 — Professor acompanha os movimentos dos grupos; CRM com funil padrão.
--
-- 1. fn_study_activity: linha do tempo dos grupos da turma do professor
--    (cadastros, alterações, aprovações, exclusões — audit_logs — e
--    entradas/saídas de estoque — stock_movements), mais recentes primeiro.
--    Só o Administrador da turma; só os grupos da própria turma.
-- 2. Funil de vendas e origens de lead padrão em toda empresa que ainda não
--    tem (os grupos nasciam sem, e sem funil não há oportunidade). Empresas
--    novas recebem pelo gatilho.

-- ------------------------------------------------------------------ 1. movimentos
create or replace function public.fn_study_activity(p_group_id uuid default null, p_limit integer default 200)
returns table (
  at timestamptz,
  group_id uuid,
  group_name text,
  actor text,
  entity text,
  entity_id uuid,
  action text,
  old_data jsonb,
  new_data jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_prof public.users := public.fn_study_professor_row();
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if v_prof.id is null then
    raise exception 'Só o Administrador da turma acompanha os grupos.' using errcode = '42501';
  end if;
  if p_group_id is not null and not exists (select 1 from public.companies where id = p_group_id and parent_company_id = v_prof.company_id) then
    raise exception 'Grupo não encontrado nesta turma.' using errcode = 'P0002';
  end if;

  return query
  with grupos as (
    select c.id, coalesce(c.group_label, c.name) as label
    from public.companies c
    where c.parent_company_id = v_prof.company_id and (p_group_id is null or c.id = p_group_id)
  ),
  logs as (
    select a.created_at, g.id, g.label, a.actor_label, a.entity, a.entity_id, a.action::text, a.old_data, a.new_data
    from public.audit_logs a
    join grupos g on g.id = a.company_id
    order by a.created_at desc
    limit v_limit
  ),
  estoque as (
    select m.created_at, g.id, g.label, coalesce(u.name, u.email, 'Sistema')::text, 'Movimento de estoque'::text, m.id, m.movement_type,
      null::jsonb,
      jsonb_build_object(
        'produto', coalesce(p.code || ' — ' || p.name, p.name),
        'quantidade', m.quantity,
        'local', l.code,
        'origem', m.reference_type,
        'observacoes', m.notes
      )
    from public.stock_movements m
    join grupos g on g.id = m.company_id
    left join public.products p on p.id = m.product_id
    left join public.warehouse_locations l on l.id = m.location_id
    left join public.users u on u.id = m.created_by
    order by m.created_at desc
    limit v_limit
  )
  select * from (select * from logs union all select * from estoque) t
  order by 1 desc
  limit v_limit;
end;
$$;
revoke all on function public.fn_study_activity(uuid, integer) from public, anon;
grant execute on function public.fn_study_activity(uuid, integer) to authenticated;

-- ------------------------------------------------------------------ 2. funil padrão
create or replace function public.fn_seed_crm_defaults(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pipeline uuid;
begin
  if not exists (select 1 from public.pipelines where company_id = p_company_id) then
    insert into public.pipelines (company_id, code, name) values (p_company_id, 'VENDAS', 'Funil de vendas')
    returning id into v_pipeline;
    insert into public.pipeline_stages (company_id, pipeline_id, code, name, sequence, probability_default, is_won, is_lost)
    values
      (p_company_id, v_pipeline, 'PROSPECCAO', 'Prospecção', 1, 10, false, false),
      (p_company_id, v_pipeline, 'QUALIFICACAO', 'Qualificação', 2, 25, false, false),
      (p_company_id, v_pipeline, 'PROPOSTA', 'Proposta', 3, 50, false, false),
      (p_company_id, v_pipeline, 'NEGOCIACAO', 'Negociação', 4, 75, false, false),
      (p_company_id, v_pipeline, 'GANHO', 'Ganho', 5, 100, true, false),
      (p_company_id, v_pipeline, 'PERDIDO', 'Perdido', 6, 0, false, true);
  end if;
  insert into public.lead_origins (company_id, code, name)
  select p_company_id, v.code, v.name
  from (values ('SITE', 'Site'), ('INDICACAO', 'Indicação'), ('TELEFONE', 'Telefone'), ('REDES', 'Redes sociais'), ('FEIRA', 'Feira/evento'), ('OUTRO', 'Outro')) v(code, name)
  where not exists (select 1 from public.lead_origins o where o.company_id = p_company_id)
  on conflict (company_id, code) do nothing;
end;
$$;
revoke all on function public.fn_seed_crm_defaults(uuid) from public, anon, authenticated;

create or replace function public.fn_companies_seed_crm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_seed_crm_defaults(new.id);
  return new;
end;
$$;
revoke all on function public.fn_companies_seed_crm() from public, anon, authenticated, service_role;

drop trigger if exists seed_crm_defaults on public.companies;
create trigger seed_crm_defaults
  after insert on public.companies
  for each row execute function public.fn_companies_seed_crm();

do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.companies loop
    perform public.fn_seed_crm_defaults(v_id);
  end loop;
end;
$$;
