-- 0125 — Contatos deixados na landing (/nova): diagnóstico e calculadora.
--
-- Quem não é cliente deixa nome e e-mail para receber o diagnóstico. A
-- gravação é feita só pelo servidor (rota /api/landing/contato, com a chave
-- de serviço); a tabela tem RLS ligada e nenhuma política, então nenhum
-- usuário do ERP nem visitante lê ou altera estes dados pelo navegador.
-- A Administração Central consulta pela função fn_platform_landing_leads.
-- Pode rodar de novo.

create table if not exists public.landing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (length(name) between 2 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  company text check (length(company) <= 160),
  phone text check (length(phone) <= 40),
  monthly_revenue numeric check (monthly_revenue >= 0),
  people integer check (people >= 0),
  monthly_leak numeric check (monthly_leak >= 0),
  maturity_score integer check (maturity_score between 0 and 100),
  pains text[] not null default '{}',
  consent boolean not null check (consent),
  source text not null default 'nova',
  user_agent text check (length(user_agent) <= 400)
);

create index if not exists landing_leads_created_idx on public.landing_leads (created_at desc);
create index if not exists landing_leads_email_idx on public.landing_leads (lower(email));

alter table public.landing_leads enable row level security;
revoke all on public.landing_leads from public, anon, authenticated;

comment on table public.landing_leads is 'Contatos da landing (/nova). Gravação só pelo servidor; leitura pela Administração Central (fn_platform_landing_leads). 0125.';

-- Leitura para a Administração Central (membros da plataforma com acesso a empresas).
create or replace function public.fn_platform_landing_leads(p_limit integer default 200)
returns setof public.landing_leads
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_platform_permission('platform.companies.view') then
    raise exception 'Permissão negada (platform.companies.view).' using errcode = '42501';
  end if;
  return query
  select * from public.landing_leads
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

revoke all on function public.fn_platform_landing_leads(integer) from public, anon;
grant execute on function public.fn_platform_landing_leads(integer) to authenticated;
