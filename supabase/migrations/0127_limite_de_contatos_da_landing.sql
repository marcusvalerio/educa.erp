-- 0127 — Limite de envios do formulário de contato da landing (reaplicável).
--
-- /api/landing/contato é público. Sem limite, um robô enche landing_leads.
-- O limite fica no banco para valer em todas as instâncias do servidor:
--   * no máximo 3 contatos do mesmo e-mail em 10 minutos;
--   * no máximo 60 contatos no total por minuto.
-- Acima disso o insert falha com SQLSTATE 'P0429' e a rota responde 429.

create or replace function public.fn_landing_leads_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Serializa a contagem entre envios simultâneos.
  perform pg_advisory_xact_lock(hashtext('landing_leads_rate_limit'));

  if (select count(*) from public.landing_leads
      where lower(email) = lower(new.email) and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Muitos envios deste e-mail. Tente novamente mais tarde.' using errcode = 'P0429';
  end if;

  if (select count(*) from public.landing_leads where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'Muitos envios no momento. Tente novamente mais tarde.' using errcode = 'P0429';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_landing_leads_rate_limit() from public, anon, authenticated;

drop trigger if exists trg_landing_leads_rate_limit on public.landing_leads;
create trigger trg_landing_leads_rate_limit
  before insert on public.landing_leads
  for each row execute function public.fn_landing_leads_rate_limit();
