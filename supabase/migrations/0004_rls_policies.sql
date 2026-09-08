-- Fase 2 — Row Level Security
--
-- POLÍTICA NESTA FASE (documentar — ver docs/SUPABASE.md):
--   Row Level Security fica HABILITADA em todas as tabelas de negócio,
--   mas nenhuma policy é criada para os papéis `anon`/`authenticated`.
--   Sem policy correspondente, o Postgres nega por padrão — ou seja,
--   ninguém consegue ler ou escrever essas tabelas usando a anon key
--   (browser) nem uma sessão de usuário comum.
--
--   Toda a leitura/escrita desta fase passa pelas rotas /api/* do
--   Next.js, que usam o cliente administrativo (service_role via
--   src/lib/supabase/admin.ts). O papel `service_role` do Supabase
--   ignora RLS por definição — por isso a API funciona mesmo sem
--   nenhuma policy de `anon`/`authenticated` aqui.
--
-- O QUE MUDA NA FASE 3:
--   Quando o Supabase Auth entrar em cena, cada usuário autenticado
--   passará a ter um JWT com claims (ex.: company_id). Nessa fase serão
--   criadas policies como:
--     using (company_id = (auth.jwt() ->> 'company_id')::uuid)
--   permitindo acesso direto do browser (via anon key + sessão) sem
--   depender só da API, quando fizer sentido — e as rotas /api/*
--   passarão a rodar no contexto do usuário (não mais só service_role).

alter table public.companies enable row level security;
alter table public.suppliers enable row level security;
alter table public.carriers enable row level security;
alter table public.drivers enable row level security;
alter table public.vehicles enable row level security;
alter table public.warehouse_locations enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.users enable row level security;
alter table public.audit_logs enable row level security;
