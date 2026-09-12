-- Fase 11 — Controladoria Gerencial: período de competência e
-- fechamento.
--
-- IMPORTANTE (seção "Controladoria ≠ Contabilidade"): esta fase não
-- constrói contabilidade societária/fiscal (plano de contas oficial,
-- SPED, ECD/ECF, razão/diário contábil). "Competência" aqui é um
-- período GERENCIAL — a janela em que a Controladoria considera
-- receitas/custos/despesas "daquele mês" para fins de análise —,
-- independente do regime de caixa (quando o dinheiro efetivamente
-- entra/sai, já coberto por payments/receipts, Financeiro 0034).
--
-- financial_competence_periods é a única tabela nova desta migration:
-- não duplica accounts_payable/accounts_receivable/financial_transactions
-- — é só o controle de "esta janela de tempo está aberta ou fechada
-- para análise gerencial". Nenhuma linha financeira é bloqueada de
-- ser criada por aqui — o que o fechamento protege é a camada
-- gerencial que a Fase 11 constrói por cima (rateios, seção 0046).

create sequence if not exists public.financial_competence_periods_code_seq;

create table if not exists public.financial_competence_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED')),
  closed_at timestamptz,
  closed_by uuid references public.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references public.users(id) on delete set null,
  reopen_reason text,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id),
  check (period_end >= period_start)
);

create trigger set_updated_at before update on public.financial_competence_periods
  for each row execute procedure extensions.moddatetime(updated_at);
create index if not exists financial_competence_periods_company_status_idx on public.financial_competence_periods (company_id, status);
create index if not exists financial_competence_periods_range_idx on public.financial_competence_periods (company_id, period_start, period_end);

comment on table public.financial_competence_periods is
  'Período de competência GERENCIAL (não um exercício contábil oficial). Workflow: OPEN -> CLOSING -> CLOSED, com REOPENED controlado (exige justificativa + auditoria, seção 11.3). Nunca apaga lançamento nenhum — só controla se a camada gerencial (rateios, 0046) pode ser criada/alterada para a janela.';

-- ==================================================================
-- fn_open_competence_period — cria o período (OPEN). Um período por
-- código (ex.: "2026-01"); o próprio código evita sobreposição
-- acidental (não impomos não-overlap de datas — uma empresa pode
-- querer períodos semanais e mensais coexistindo).
-- ==================================================================
create or replace function public.fn_open_competence_period(
  p_company_id uuid,
  p_code text,
  p_period_start date,
  p_period_end date,
  p_notes text default null
)
returns public.financial_competence_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.financial_competence_periods;
begin
  if not public.has_permission(p_company_id, 'controlling.period.manage') then
    raise exception 'Permissão negada (controlling.period.manage).' using errcode = '42501';
  end if;

  if p_period_end < p_period_start then
    raise exception 'Data final do período não pode ser anterior à inicial.' using errcode = '22023';
  end if;

  insert into public.financial_competence_periods (company_id, code, period_start, period_end, notes, created_by)
  values (p_company_id, p_code, p_period_start, p_period_end, p_notes, public.current_app_user_id())
  returning * into v_period;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (p_company_id, public.current_app_user_id(), 'system', 'financial_competence_periods', v_period.id, 'CREATE',
    null, jsonb_build_object('code', p_code, 'period_start', p_period_start, 'period_end', p_period_end));

  return v_period;
end;
$$;

-- ==================================================================
-- fn_start_closing_competence_period — OPEN -> CLOSING (checkpoint
-- antes do fechamento definitivo — permite uma etapa de conferência
-- antes de travar).
-- ==================================================================
create or replace function public.fn_start_closing_competence_period(p_period_id uuid)
returns public.financial_competence_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.financial_competence_periods;
begin
  select * into v_period from public.financial_competence_periods where id = p_period_id for update;
  if not found then
    raise exception 'Período de competência não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_period.company_id, 'controlling.close') then
    raise exception 'Permissão negada (controlling.close).' using errcode = '42501';
  end if;

  if v_period.status <> 'OPEN' then
    raise exception 'Só é possível iniciar o fechamento de um período aberto (status atual: %).', v_period.status using errcode = 'P0001';
  end if;

  update public.financial_competence_periods set status = 'CLOSING' where id = p_period_id
  returning * into v_period;

  return v_period;
end;
$$;

-- ==================================================================
-- fn_close_competence_period — OPEN/CLOSING/REOPENED -> CLOSED.
-- Idempotente por guarda de status (chamar de novo em um período já
-- CLOSED falha claramente, nunca fecha duas vezes "por engano").
-- ==================================================================
create or replace function public.fn_close_competence_period(p_period_id uuid)
returns public.financial_competence_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.financial_competence_periods;
begin
  select * into v_period from public.financial_competence_periods where id = p_period_id for update;
  if not found then
    raise exception 'Período de competência não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_period.company_id, 'controlling.close') then
    raise exception 'Permissão negada (controlling.close).' using errcode = '42501';
  end if;

  if v_period.status not in ('OPEN', 'CLOSING', 'REOPENED') then
    raise exception 'Período no status % não pode ser fechado.', v_period.status using errcode = 'P0001';
  end if;

  update public.financial_competence_periods
  set status = 'CLOSED', closed_at = now(), closed_by = public.current_app_user_id()
  where id = p_period_id
  returning * into v_period;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_period.company_id, public.current_app_user_id(), 'system', 'financial_competence_periods', v_period.id, 'UPDATE',
    null, jsonb_build_object('status', 'CLOSED'));

  return v_period;
end;
$$;

-- ==================================================================
-- fn_reopen_competence_period — CLOSED -> REOPENED. Exige justificativa
-- (seção 11.3) e é sempre auditada. Nunca apaga o que já foi fechado —
-- só destrava a janela para uma nova rodada de análise/correção
-- gerencial (ex.: um novo rateio), preservando o histórico de quem
-- fechou e quando.
-- ==================================================================
create or replace function public.fn_reopen_competence_period(p_period_id uuid, p_reason text)
returns public.financial_competence_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period public.financial_competence_periods;
begin
  select * into v_period from public.financial_competence_periods where id = p_period_id for update;
  if not found then
    raise exception 'Período de competência não encontrado.' using errcode = 'P0002';
  end if;

  if not public.has_permission(v_period.company_id, 'controlling.reopen') then
    raise exception 'Permissão negada (controlling.reopen).' using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Informe a justificativa para reabrir o período.' using errcode = '22023';
  end if;

  if v_period.status <> 'CLOSED' then
    raise exception 'Só é possível reabrir um período fechado (status atual: %).', v_period.status using errcode = 'P0001';
  end if;

  update public.financial_competence_periods
  set status = 'REOPENED', reopened_at = now(), reopened_by = public.current_app_user_id(), reopen_reason = p_reason
  where id = p_period_id
  returning * into v_period;

  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (v_period.company_id, public.current_app_user_id(), 'system', 'financial_competence_periods', v_period.id, 'UPDATE',
    jsonb_build_object('status', 'CLOSED'), jsonb_build_object('status', 'REOPENED', 'reason', p_reason));

  return v_period;
end;
$$;

-- ==================================================================
-- fn_assert_competence_period_open — helper interno (sem grant),
-- usado por fn_create_cost_allocation (0046) para bloquear alteração
-- gerencial retroativa em período CLOSED (seção 11.20). Quando
-- p_period_id é nulo (rateio sem período associado), não bloqueia —
-- competência é opcional, não obrigatória.
-- ==================================================================
create or replace function public.fn_assert_competence_period_open(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if p_period_id is null then
    return;
  end if;

  select status into v_status from public.financial_competence_periods where id = p_period_id;
  if v_status is null then
    raise exception 'Período de competência não encontrado.' using errcode = 'P0002';
  end if;

  if v_status = 'CLOSED' then
    raise exception 'Período de competência fechado — reabra (fn_reopen_competence_period) antes de alterar dados gerenciais desta janela.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.fn_open_competence_period(uuid, text, date, date, text) from public;
revoke all on function public.fn_start_closing_competence_period(uuid) from public;
revoke all on function public.fn_close_competence_period(uuid) from public;
revoke all on function public.fn_reopen_competence_period(uuid, text) from public;
revoke all on function public.fn_assert_competence_period_open(uuid) from public;
grant execute on function public.fn_open_competence_period(uuid, text, date, date, text) to authenticated;
grant execute on function public.fn_start_closing_competence_period(uuid) to authenticated;
grant execute on function public.fn_close_competence_period(uuid) to authenticated;
grant execute on function public.fn_reopen_competence_period(uuid, text) to authenticated;

-- ==================================================================
-- PERMISSIONS
-- ==================================================================
insert into public.permissions (code, module, action, description)
select v.code, v.module, v.action, v.description
from (
  values
    ('controlling.view', 'controlling', 'view', 'Consultar controladoria gerencial (DRE, margens, KPIs, resultado por centro)'),
    ('controlling.period.manage', 'controlling', 'period.manage', 'Abrir períodos de competência gerencial — necessária além da lista sugerida: abrir um período é um pré-requisito estrutural para fechar/reabrir, sem função própria não haveria como criar o primeiro período'),
    ('controlling.close', 'controlling', 'close', 'Iniciar/concluir o fechamento de um período de competência gerencial'),
    ('controlling.reopen', 'controlling', 'reopen', 'Reabrir um período de competência gerencial fechado (exige justificativa)'),
    ('controlling.allocate', 'controlling', 'allocate', 'Criar e cancelar rateios gerenciais de custo/despesa por centro de custo'),
    ('controlling.budget.view', 'controlling_budget', 'view', 'Consultar orçamentos gerenciais'),
    ('controlling.budget.create', 'controlling_budget', 'create', 'Criar orçamento gerencial'),
    ('controlling.budget.update', 'controlling_budget', 'update', 'Aprovar/encerrar orçamento gerencial'),
    ('controlling.forecast.view', 'controlling_forecast', 'view', 'Consultar projeção gerencial (forecast)')
) as v(code, module, action, description)
on conflict (code) do nothing;

do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.fn_seed_company_rbac(c.id);
  end loop;
end;
$$;

-- ==================================================================
-- RLS — select-only; toda escrita via função.
-- ==================================================================
alter table public.financial_competence_periods enable row level security;

drop policy if exists financial_competence_periods_select on public.financial_competence_periods;
create policy financial_competence_periods_select on public.financial_competence_periods
  for select to authenticated using (public.has_permission(company_id, 'controlling.view'));
