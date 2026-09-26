create or replace function public.fn_upsert_setting(
  p_company_id uuid,
  p_establishment_id uuid,
  p_module text,
  p_key text,
  p_value_type text,
  p_value_string text default null,
  p_value_integer bigint default null,
  p_value_decimal numeric default null,
  p_value_boolean boolean default null,
  p_value_date date default null,
  p_value_json jsonb default null,
  p_description text default null,
  p_valid_from date default null,
  p_valid_until date default null
)
returns public.system_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.system_settings;
  v_setting public.system_settings;
  v_scope_key uuid;
  v_check_company_id uuid;
begin
  select id into v_existing
  from public.system_settings
  where module = p_module and key = p_key
    and coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_establishment_id, '00000000-0000-0000-0000-000000000000'::uuid);

  if p_establishment_id is not null then
    if p_company_id is null then
      raise exception 'Configuração de estabelecimento exige company_id.' using errcode = '22023';
    end if;
    v_check_company_id := p_company_id;
    if not public.has_permission(v_check_company_id, 'settings.establishment.update') then
      raise exception 'Permissão negada (settings.establishment.update).' using errcode = '42501';
    end if;
  elsif p_company_id is not null then
    v_check_company_id := p_company_id;
    if not public.has_permission(v_check_company_id, 'settings.company.update') then
      raise exception 'Permissão negada (settings.company.update).' using errcode = '42501';
    end if;
  else
    v_check_company_id := coalesce(p_company_id, (select company_id from public.users where id = public.current_app_user_id()));
    if v_existing is null then
      if not public.has_permission(v_check_company_id, 'settings.create') then
        raise exception 'Permissão negada (settings.create).' using errcode = '42501';
      end if;
    else
      if not public.has_permission(v_check_company_id, 'settings.update') then
        raise exception 'Permissão negada (settings.update).' using errcode = '42501';
      end if;
    end if;
  end if;

  insert into public.system_settings (
    company_id, establishment_id, module, key, value_type,
    value_string, value_integer, value_decimal, value_boolean, value_date, value_json,
    description, valid_from, valid_until, created_by
  ) values (
    p_company_id, p_establishment_id, p_module, p_key, p_value_type,
    p_value_string, p_value_integer, p_value_decimal, p_value_boolean, p_value_date, p_value_json,
    p_description, p_valid_from, p_valid_until, public.current_app_user_id()
  )
  on conflict (module, key, (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(establishment_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set
    value_type = excluded.value_type, value_string = excluded.value_string, value_integer = excluded.value_integer,
    value_decimal = excluded.value_decimal, value_boolean = excluded.value_boolean, value_date = excluded.value_date,
    value_json = excluded.value_json, description = coalesce(excluded.description, public.system_settings.description),
    valid_from = excluded.valid_from, valid_until = excluded.valid_until
  returning * into v_setting;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'system_settings', v_setting.id,
    case when v_existing is null then 'CREATE' else 'UPDATE' end,
    case when v_existing is not null then jsonb_build_object('module', p_module, 'key', p_key) else null end,
    jsonb_build_object('module', p_module, 'key', p_key, 'value_type', p_value_type));

  return v_setting;
end;
$$;
