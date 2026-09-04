-- Fase 2 — Banco de dados definitivo
-- Auditoria persistente (substitui o localStorage da Fase 4).
--
-- Sem autenticação real ainda (Fase 3), então não há um usuário
-- autenticado para gravar em `user_id`. Usamos `actor_label` como
-- identificador de sistema/desenvolvimento explícito e documentado
-- (ver src/lib/database/constants.ts DEV_ACTOR_LABEL), mantendo
-- `user_id` nullable e pronto para ser preenchido a partir da sessão
-- real na Fase 3.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  actor_label text not null default 'dev-system',
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'INACTIVATE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index if not exists audit_logs_company_idx on public.audit_logs (company_id, created_at desc);

comment on table public.audit_logs is
  'Histórico de auditoria persistente. Nunca é apagado quando um registro é inativado ou excluído.';
