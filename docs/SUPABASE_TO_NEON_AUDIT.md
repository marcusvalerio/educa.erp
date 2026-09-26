# EDUCA.ERP — SUPABASE → NEON MIGRATION AUDIT

Data: 2026-09-26 · Branch: `poc/supabase-to-neon` · POC: `poc/neon-full/` (ver README)
Alvo: `Next.js → Backend (rotas/Server) → PostgreSQL Neon → Neon Auth`

**Produção não foi alterada.** Todo acesso a produção nesta auditoria foi leitura
(`select` pelo MCP do Supabase). Tudo o que foi escrito ficou em banco local, no
projeto Neon isolado `educa-neon-poc` ou na branch da POC. Não houve deploy,
mudança de DNS, SMTP, domínio, Vercel, `AUTH_PROVIDER` de produção nem migration
em produção.

---

## 1. Executive Summary

A migração é **tecnicamente viável sem remover a RLS**. A POC roda o EDUCA inteiro
**sem Supabase**: sem PostgREST, sem GoTrue e sem nenhuma variável `SUPABASE_*`. A
cadeia é Neon Auth (identidade) → servidor Next.js → PostgreSQL com o esquema de
produção. O banco continua aplicando RLS, RBAC, funções e gatilhos exatamente como
hoje.

A peça central é `src/lib/database/pg`, uma camada com a mesma forma de uso do
supabase-js (`from/select/eq/or/order/range/insert/upsert/update/delete/single/rpc`).
Em cada chamada ela abre uma transação e fixa `SET LOCAL ROLE authenticated` e
`request.jwt.claims.sub = auth_user_id`, que é o mesmo que o PostgREST faz. Por
isso as **305 chamadas `.from()` literais, a fábrica genérica de 17 cadastros e as
233 `.rpc()` do app não mudaram**. Só mudaram as duas fábricas de cliente e dois
pontos que exigiam `SUPABASE_SERVICE_ROLE_KEY`.

| Área | Resultado | Evidência |
|---|---|---|
| DATABASE | **PASS** | esquema de produção reconstruído (172 tabelas, 330 funções, 328 policies, 171 gatilhos); impressões digitais iguais a produção no PG local e no Neon real |
| AUTH | **PASS** | E2E: primeiro acesso, login, logout, sessão, expiração, recuperação, banimento, CSRF (Neon Auth por dublê do mesmo motor; Neon Auth real 22/22 em `poc/neon-auth-real`) |
| RBAC | **PASS** | E2E + Neon real: papéis admin/operador/leitura, escalada recusada, Owner isolado |
| API | **PASS** | as rotas reais do app sobre PostgreSQL direto; 219/219 RPCs literais resolvem no catálogo; 256/256 nomes `fn_*` existem |
| CRUD | **PASS** | catálogo, estoque, compras, vendas, logística, usuários, empresas (E2E) |
| SECURITY | **PASS** | Neon real 35/35; E2E: cross-tenant, IDOR, injeção, papel de login sem privilégio |
| E2E | **PASS** | **106/106** a partir de ambiente zerado |
| **POC** | **PASS** | |

O ponto aberto é um **BLOQUEIO EXTERNO de ambiente**: este contêiner não alcança
`*.neon.tech`. O app foi provado contra PostgreSQL local com esquema idêntico ao de
produção. O SQL que o adaptador gera e a bateria de RLS foram provados **no Neon
real** pelo MCP. O próximo passo é rodar o mesmo E2E de um ambiente com saída para o
Neon (§15).

## 2. Estado atual (produção, lido em 2026-09-26)

- Supabase `educa.erp` (sa-east-1, PG 17.6): banco de 28 MB, 1.664 linhas em 32 das
  172 tabelas, 1 empresa, 10 usuários de app, 1 usuário em `auth.users` (o Owner,
  com senha no GoTrue) e 1 vínculo `auth_identity_links`.
- Storage: 0 buckets e 0 objetos. Realtime: nenhuma tabela publicada. Vault: instalado,
  0 segredos. `pg_net`/HTTP: nenhuma função usa. Edge Functions: 0.
- App: Next.js 16 na Vercel com `AUTH_PROVIDER` ainda `supabase` em produção. O Neon
  Auth de produção existe e tem o Owner vinculado (0073), mas o cutover de auth
  parou no R1 por bloqueio externo (`docs/NEON_AUTH_MIGRATION.md`).

## 3. Dependências Supabase (Fase B)

Contagem em `src/`, `scripts/`, `tests/`, `docs/` (sem `poc/`):

| DEPENDÊNCIA | LOCAL | FINALIDADE | SUPABASE-SPECIFIC | SUBSTITUIÇÃO | ESFORÇO | RISCO |
|---|---|---|---|---|---|---|
| `@supabase/supabase-js` | 9 ocorrências em 6 arquivos | cliente de dados e admin | sim | `src/lib/database/pg` (**feito**) | baixo, 2 fábricas | baixo |
| `@supabase/ssr` | 12 em 7 (`proxy.ts`, `supabase/server.ts`, `supabase/client.ts`) | sessão por cookies do Supabase Auth | sim | Neon Auth + cookie HttpOnly do EDUCA (**já existe**, `src/lib/auth/neon`) | nenhum no modo neon | baixo |
| `createClient(` | 208 em 28 | obter o cliente | não (fábrica local) | **permanece**, a fábrica escolhe o backend | 0 | — |
| `.from(` | 305 literais em 36 arquivos + `table.ts` genérico | CRUD | PostgREST | **permanece**, adaptador | 0 | médio: fidelidade do adaptador (§12) |
| `.rpc(` | 233 em 27 (206 funções distintas) | regras no banco | PostgREST | **permanece**, adaptador (catálogo `pg_proc`) | 0 | baixo, 219/219 resolvem |
| `supabase.auth.*` | 19 em 8 | login/sessão/convite/admin | GoTrue | Neon Auth (**feito**). `auth.admin.listUsers/createUser` reimplementados sobre `auth.users` | 0 | baixo |
| `auth.uid()` | 61 em 23 (17 funções e 2 policies no banco) | identidade no banco | sim (GUC do PostgREST) | **permanece**: `sql/00_supabase_compat.sql` lê o mesmo GUC | 0 | baixo |
| `auth.users` | 42 em 16 (5 funções) | "login sombra" = `auth_user_id` | sim | **permanece** como tabela comum, sem senha | 0 | baixo |
| `service_role` | 90 em 23 | acesso administrativo no servidor | sim | papel `service_role` (BYPASSRLS) via `SET LOCAL ROLE` | 0 | médio: só `educa_app` pode assumi-lo |
| `anon`/`authenticated` | 103 em 18 | papéis da RLS | sim | **permanecem** (compat) | 0 | baixo |
| PostgREST (menções) | 53 em 13 | docs/erros `PGRST*` | sim | códigos `PGRST100/102/116/200/201/202/203` reproduzidos | 0 | baixo |
| `SUPABASE_*` env | 75 em 14 | URL/chaves/JWT secret | sim | `DATABASE_URL` + `NEON_AUTH_*`. No modo postgres nenhuma é lida | baixo | baixo |
| `SUPABASE_SERVICE_ROLE_KEY` como "admin configurado?" | 2 em `onboarding-handlers.ts` | habilita convite por e-mail | sim | `adminAccessConfigured()` (**feito**) | feito | baixo |
| storage | 1 (sem uso real) | — | sim | remover | 0 | nenhum |
| realtime | 4 em 1 arquivo (sem uso em `src`) | — | sim | remover | 0 | nenhum |
| edge functions | 0 | — | — | — | — | — |
| `supabase/migrations` | 74 arquivos | esquema | não | **não reconstroem produção** (§4): usar o plano da POC | médio | alto se ignorado |

Classificação: **permanece** (from/rpc/createClient/auth.uid/auth.users/papéis);
**adaptar** (as duas fábricas, 2 gates de env, `bootstrap-platform-owner.mjs`, todos
feitos); **substituir** (GoTrue → Neon Auth, PostgREST → `src/lib/database/pg`,
feitos); **remover depois do cutover** (`@supabase/ssr`, `@supabase/supabase-js`
como dependência de runtime, `src/lib/supabase/client.ts`, callback
`/auth/callback`, storage/realtime mortos).

## 4. Banco (Fase A)

**Inventário** (produção = PG local reconstruído = Neon POC; iguais por impressão
digital):

| Objeto | Quantidade |
|---|---|
| esquemas de app | `public`, `auth` (compat), `extensions` |
| extensões | btree_gist 1.7, ltree 1.2, moddatetime 1.0, pgcrypto 1.3, uuid-ossp 1.1 (todas no Neon, mesmas versões) |
| tabelas | 172 (todas com RLS; nenhuma sem) |
| colunas | 2.153 (11 geradas) |
| PK / FK / UNIQUE / CHECK / EXCLUDE | 172 / 567 (266 `on delete cascade`) / 207 / 403 / 1 |
| índices | 706 |
| sequences | 43 |
| enums / matviews / procedures | 0 / 0 / 0 |
| views | 4 |
| gatilhos | 171 |
| funções | 330 (310 `SECURITY DEFINER`) |
| policies | 328 |

**Matriz** (resumo por classe de objeto):

| OBJETO | EXISTE NO REPO | EXISTE NO SUPABASE | COMPATÍVEL COM NEON | AÇÃO |
|---|---|---|---|---|
| tabelas/colunas/constraints/índices | sim, mas divergente em 52 das 72 migrations comparáveis | sim | sim | aplicar pelo **plano equivalente a produção** |
| `units` antes de 0006b | não (repo falha em 0006b) | sim | sim | histórico real de produção (17 corpos em `sql/prod-history`) |
| `unique (id, company_id)` exigidas por FKs de 0015/0018/0020/0060 | não na ordem certa | sim (criadas em outro passo) | sim | pontes `sql/bridges/pre-*.sql` |
| 0022 (unique duplicada), 0057/0059 (`FILTER` inválido), 0058 (CASE), 0060 (`user_companies` inexistente), 0061 | **com erro** | versão corrigida | sim | cópias corrigidas `sql/patched/` (funções com hash igual a produção) |
| papéis `anon`/`authenticated`/`service_role` | não (vêm do Supabase) | sim | sim (BYPASSRLS permitido ao `neondb_owner`) | `sql/00_supabase_compat.sql` |
| `auth.uid()/jwt()/role()`, `auth.users` | não | sim (GoTrue) | sim | compat: mesmas definições; `auth.users` sem senha |
| `supabase_vault`, `pg_stat_statements` | não | sim | vault não existe no Neon | **não migrar** (0 segredos, 0 usos) |
| ACL/default privileges | parcial | sim | sim | compat replica o padrão do Supabase |

**Dá para reconstruir o banco só com as migrations do repositório? Não.** A
execução para em 0006b, e três migrations têm erro de sintaxe. Com o plano da POC
(`plan-prod-equivalente.txt`: 92 arquivos, 2.731 comandos) o banco sai idêntico a
produção. As categorias con, idx, pol, trg, rls, facl, view e fn têm impressão
digital idêntica no PG 16 local. No Neon real, 9 de 10 categorias batem; colunas
diferem só na exibição `ltree` vs `extensions.ltree`, o mesmo tipo.

## 5. Auth

Cadeia: **Neon Auth** (Better Auth, sessão + JWT EdDSA/JWKS) → servidor do EDUCA
confere a sessão no Neon a cada resolução (cache de 10 s) → ponte verifica
assinatura, `iss`/`aud`/`exp` e `emailVerified` e resolve o **vínculo 0073**
(`auth_identity_links`, invisível para `authenticated`) → `auth_user_id` (UUID do
EDUCA) → `SET LOCAL ROLE authenticated` + `sub` → `auth.uid()` no banco.

- No Neon não existe GoTrue. `auth.users` vira tabela comum com a identidade
  "sombra": id, e-mail, `email_confirmed_at`, sem senha. `auth.admin.createUser/
  listUsers` do app foram reimplementados em SQL e só funcionam com `service_role`.
- Fluxos cobertos pelo E2E: primeiro acesso por link (uso único, token fora da
  barra), login, logout com revogação no provedor, cookie forjado, sessão expirada,
  recuperação de senha (revoga todas as sessões, link único), troca de senha,
  desativação no EDUCA, banimento no Neon, identidade sem vínculo recusada, e-mail
  não confirmado recusado, cadastro público recusado, CSRF, redirect externo.
- **Senhas:** o GoTrue guarda bcrypt; o Neon Auth (Better Auth) usa scrypt. Não há
  importação de hash suportada. Produção tem **1** usuário com senha (o Owner).
  Estratégia: **não migrar senhas**. O Owner (e qualquer usuário futuro) define a
  senha pelo fluxo de primeiro acesso ou recuperação, já provado.

## 6. RBAC

`auth_user_id` → `users` (empresa) / `platform_members` (Owner) → `user_roles` →
`roles` → `role_permissions` → `permissions` (352 códigos) → `has_permission(company,
code)` → policies (328) → API (`requireAccess` em 22 módulos de handlers). Nada disso
mudou: está no banco, que é o mesmo.

Achados de **linha de base (iguais em produção, não causados pela POC)**:
- não existem permissões `product_categories.*` nem `units.*`; as rotas
  `/api/product-categories` e `/api/units` respondem 403 para todos;
- `POST /api/warehouse-locations` falha em produção: o mapper não preenche
  `warehouse_id` (NOT NULL);
- a busca genérica (`table.ts`) remove `%`/`_`, mas não vírgulas, então o termo
  entra no `.or()` como condições extras. A RLS impede vazamento entre empresas
  (provado), mas a resposta é 500 genérico.

## 7. Segurança (Fase C)

| Critério | A: RLS preservada | B: autorização só no backend | C: híbrida (escolhida) |
|---|---|---|---|
| Segurança | forte: o banco barra mesmo com bug na API | depende de cada rota estar certa (233 RPCs, 305 queries) | mais forte: API (`requireAccess`) **e** RLS |
| Complexidade | baixa: nada muda no banco | alta: reescrever 328 policies em código | baixa |
| Performance | igual a hoje (1 transação + 2 `set_config` por chamada) | ligeiramente melhor | igual a A |
| Manutenção | regras num lugar só (SQL) | duplicação e deriva | igual a hoje |
| Risco | baixo | alto (regressão silenciosa de isolamento) | baixo |
| Compatibilidade | total: `auth.uid()` e funções `SECURITY DEFINER` intactas | quebra 17 funções e 2 policies com `auth.uid()` | total |
| Impacto no código | 2 fábricas | todo handler | 2 fábricas |

**Decisão: C.** A RLS foi preservada integralmente; a camada da API já existia.
Controles novos:
- **papel de login `educa_app`**: LOGIN NOINHERIT, sem privilégio próprio, só
  `SET ROLE` para `anon`/`authenticated`/`service_role`. Não assume dono nem
  superusuário (E2E);
- papel e claims são **LOCAL à transação**, então uma conexão devolvida ao pool não
  carrega identidade; `sub` é validado como UUID; os papéis vêm de lista branca;
- toda entrada vira parâmetro `$n`. Identificadores são validados (`^[a-z_][a-z0-9_]*$`)
  e citados. Erro de montagem vira `{ error }` (como no supabase-js), nunca SQL
  concatenado;
- `service_role` só em `createAdminClient()` (server-only). Um teste garante que
  só módulos `server-only` importam a camada pg.

Neon real (`evidence/neon-real-security.md`): **35/35**. Cobre anon,
authenticated sem claims, cross-tenant (ler/inserir/alterar/excluir/mover
`company_id`), troca de `auth_user_id` (recusada até para `service_role`), autopromoção
de papel, virar Owner, sub forjado, `auth.users`/vínculo 0073 invisíveis e
`service_role` BYPASSRLS.

## 8. Código (Fase D)

| MÓDULO | QUERIES (`.from` literais) | RPC | AUTH | RLS | COMPLEXIDADE |
|---|---|---|---|---|---|
| Plataforma/onboarding/sessão (`platform`, `onboarding`, `company`, `session`, `auth/*`) | 23 | 22 | Neon Auth + ponte | sim | alta, **coberto E2E** |
| Admin de usuários + RBAC (`admin`, `rbac`) | 45 | 10 | requireAccess | sim | média, **coberto E2E** |
| Cadastros genéricos (`table.ts`, 17 entidades) | dinâmico | 0 | requireAccess | sim | baixa, **coberto E2E** |
| Estoque/WMS | 22 | 14 | requireAccess | sim | alta, **coberto E2E** (entrada idempotente) |
| Compras | 13 | 12 | requireAccess | sim | alta, **coberto E2E** (solicitação + envio) |
| Comercial/Vendas | 9 | 6 | requireAccess | sim | média, **coberto E2E** (pedido, coluna gerada) |
| Logística | 8 | 9 | requireAccess | sim | média, **coberto E2E** (transportadoras) |
| Produção/PCP | 22 | 12 | requireAccess | sim | alta, estático |
| Financeiro | 27 | 19 | requireAccess | sim | alta, estático |
| Fiscal + Operações fiscais | 30 | 27 | requireAccess | sim | alta, estático |
| CRM | 19 | 6 | requireAccess | sim | média, estático |
| Controladoria + Custos | 13 | 18 | requireAccess | sim | média, estático |
| Ativos/Manutenção | 17 | 5 | requireAccess | sim | média, estático |
| Qualidade | 11 | 7 | requireAccess | sim | média, estático |
| Projetos/Serviços | 14 | 7 | requireAccess | sim | média, estático |
| Workflow + governança | 6 | 13 | requireAccess | sim | alta, parcial E2E (envio p/ aprovação) |
| Importação/Exportação | 9 | 21 | requireAccess | sim | média, estático |
| Configurações + Master data | 15 | 12 | requireAccess | sim | baixa, estático |
| Relatórios, auditoria | 1 + dinâmico | dinâmico | requireAccess | sim | baixa, auditoria E2E |

"Estático" significa que o módulo não é exercitado pelo E2E. A cobertura dele vem
de:
- os métodos do construtor que o app usa, todos implementados (`eq, neq, gt, gte,
  lt, lte, like, ilike, in, is, not, or, order, limit, range, single, maybeSingle,
  select{count, head}, insert, upsert, update, delete`). Sem uso no app:
  `contains`, `textSearch`, `filter`, `match`, `csv`;
- **219/219** chamadas `.rpc("nome", {args})` resolvendo para exatamente uma função
  pelo nome e pelos argumentos (`evidence/rpc-coverage.json`);
- **256/256** nomes `fn_*` citados no código existindo no catálogo. As 14 RPCs com
  nome dinâmico saem desse conjunto.

Sem PostgREST, cada chamada vira SQL parametrizado numa transação com papel e
claims. Embutidos (`rel(...)`, `alias:rel!fk(...)`, até 3 níveis, FKs compostas)
viram subconsultas `json_agg/row_to_json` por FK do catálogo. As RPCs são tipadas
por `pg_proc`, em quatro formas: conjunto, composta, escalar e void. O JSON sai do
próprio Postgres, então numéricos voltam como número, como no PostgREST.

## 9. Infraestrutura (Fase E5)

| Item | Hoje | Alvo | Ação |
|---|---|---|---|
| Vercel | app + env Supabase | mesmo projeto | env novas: `DATA_BACKEND=postgres`, `DATABASE_URL` (pooled, papel `educa_app`), `NEON_AUTH_*`, `AUTH_PROVIDER=neon`; remover `SUPABASE_*` depois |
| Neon | Auth de produção criado | + banco de produção (projeto/branch novo, região perto da Vercel, sa-east-1) | aplicar o plano, criar `educa_app` com senha só no env da Vercel |
| Conexões | PostgREST (HTTP) | `pg` + pooler do Neon (PgBouncer em transaction mode) | compatível: só `SET LOCAL`/`set_config(...,true)`, sem estado de sessão |
| DNS/domínio | inalterado | inalterado | nenhuma |
| SMTP | e-mails do Supabase Auth | e-mails do Neon Auth (já configurados no Console) | conferir remetente/templates |
| Cron | nenhum no banco | — | nenhuma |
| Storage/uploads | 0 objetos | — | nenhuma (se surgir: Vercel Blob/S3) |
| Logs | Supabase logs | Neon (queries/slow queries) + Vercel | `pg_stat_statements` do Neon |
| Backups | Supabase PITR | Neon PITR/branches | snapshot antes do cutover |

## 10. POC (Fase F)

- **F1 DB:** PG 16 local e Neon real (`educa-neon-poc`, PG 17.11) com o esquema de
  produção pelo plano; Neon Function aplicou o pacote verificado por sha256.
- **F2 Auth:** Neon Auth por dublê local (Better Auth 1.4.18, o mesmo motor e
  contrato). Fluxos com o Neon Auth **real** já provados 22/22 no projeto de teste
  (`poc/neon-auth-real`).
- **F3 RBAC:** papéis, permissões e policies de produção, sem mudança.
- **F4 CRUD:** app real (`next start`), `DATA_BACKEND=postgres`, sem Supabase.
- **F5/F6:** baterias em §11.

Código da POC nesta branch:
- `src/lib/database/pg/*` e `src/lib/database/backend.ts`;
- ajustes em `supabase/server.ts`, `supabase/admin.ts`, `auth/neon/server.ts`,
  `api/onboarding-handlers.ts` e `scripts/bootstrap-platform-owner.mjs`;
- `poc/neon-full/**`;
- `tests/pg-postgrest-compat.test.ts`.

## 11. Testes

| Bateria | Resultado | Onde |
|---|---|---|
| E2E navegador → app → Neon Auth (dublê) → PostgreSQL (AUTH, SESSION, RECOVERY, ADMIN, RBAC, CRUD, MULTI-TENANCY, SECURITY) | **106/106 PASS** | `poc/neon-full/evidence/e2e-postgres-local.log` |
| Neon real: RLS/RBAC/escalada por SQL com papel e claims | **35/35 PASS** | `evidence/neon-real-security.md` §1 |
| Neon real: SQL gerado pelo adaptador (embutidos, `.or`, count, upsert, update, RPC conjunto/escalar/composta) | **8/8 PASS** | idem §2 |
| Cobertura de RPC (catálogo) | **219/219** + 256/256 nomes | `evidence/rpc-coverage.json` |
| `npm test` (todo o repositório, inclui `tests/pg-postgrest-compat.test.ts`: geração de SQL, parâmetros, erros, RPC, sessão, invariantes; integração opcional com `POC_DATABASE_URL`) | **718/718 PASS** | — |
| `tsc --noEmit`, `eslint` | 0 erros (1 aviso em arquivo da POC) | — |
| `next build` modo Supabase (padrão) e modo postgres | **PASS / PASS** | — |

Durante as rodadas, os erros encontrados foram classificados antes de corrigir:
- adaptador: erro de montagem lançava em vez de voltar `{ error }`; dica `!fk`
  ignorada nos embutidos. Os dois foram corrigidos e testados;
- linha de base de produção: permissões ausentes, `warehouse_id`, `.or` da busca.
  Documentado, sem mascarar;
- teste: sessões revogadas por seções anteriores, nome de coluna.

## 12. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Diferença sutil adaptador × PostgREST num módulo sem E2E (Financeiro, Fiscal, Produção…) | média | médio | cobertura estática feita; antes do cutover, estender o E2E por módulo ou rodar em homologação com tráfego real |
| Latência Vercel → Neon (região) | média | médio | Neon em sa-east-1; pooler; 1 ida por chamada (2 com `count`) |
| Pool esgotado em serverless | baixa | alto | URL pooled do Neon, `DATABASE_POOL_MAX` baixo, idle 10 s; ouvinte de erro no pool |
| Esquema reconstruído pelas migrations do repo em vez do plano | alta se ignorado | alto | usar **só** o plano da POC; corrigir o repo (0057/0058/0059/0060 e pontes) numa tarefa separada |
| Senhas não migráveis | certa | baixo (1 usuário) | primeiro acesso/recuperação |
| `service_role` via `educa_app` = superpoder do servidor | — | alto se vazar | senha só no env da Vercel; mesma superfície da service key de hoje |
| Neon Auth de produção com divergência de configuração (`email_password`) | conhecida | médio | conferir no Console antes do cutover |
| Bugs de linha de base expostos ao testar | certa | baixo | correções pequenas separadas (§15) |

## 13. Esforço estimado

| Etapa | Esforço |
|---|---|
| E1 esquema no Neon de produção (plano pronto) | 0,5 dia |
| E2 dados: 1.664 linhas, ordem por FK com gatilhos desligados (`session_replication_role=replica`), `setval` das 43 sequences, conferência por contagem/hash | 1 dia |
| E3 auth: Owner já vinculado; demais pelo convite | 0,5 dia |
| E4 app: pronto na POC. Resta ampliar E2E por módulo e revisão | 3–5 dias |
| E5 infra: env da Vercel, preview apontando para Neon, snapshot, janela | 1 dia |
| Cutover + observação | 0,5 dia + 1 semana de monitoramento |
| **Total** | **~7–9 dias úteis** |

## 14. O que foi realmente implementado

- Camada de dados PostgreSQL direta no formato supabase-js
  (`src/lib/database/pg/postgrest-compat.ts`, `client.ts`), com catálogo, RPC
  tipada, embutidos por FK/dica, erros `PGRST*` e códigos SQLSTATE preservados.
- Seleção de backend `DATA_BACKEND` (padrão Supabase, sem mudança de comportamento);
  exigência de `AUTH_PROVIDER=neon` no modo postgres.
- `auth.admin` mínimo sobre `auth.users` (bootstrap do Owner e convites sem GoTrue).
- Papel de login `educa_app` sem privilégios.
- Compatibilidade Supabase para PG puro/Neon; plano equivalente a produção; pacote
  e Neon Function.
- E2E de 106 verificações, caixa de e-mail local, `run-all.sh`; senhas de teste
  geradas por execução (nenhuma no Git).
- Testes do adaptador, cobertura de RPC e SQL do adaptador para o Neon.
- Evidências do Neon real e este relatório.

## 15. O que ainda falta (para o cutover)

1. **BLOQUEIO EXTERNO de rede:** rodar `run-all.sh` com `DATABASE_URL` no Neon a
   partir de um ambiente com saída para `*.neon.tech` (preview da Vercel ou máquina
   local). Precisa de senha para `educa_app`, criada no Console e colocada só no env.
2. Criar o banco de **produção** no Neon (projeto/branch novo, sa-east-1) e aplicar o
   plano. Não usar `educa-neon-poc` nem o projeto de teste.
3. Script de cópia de dados (E2) e ensaio completo num branch do Neon.
4. Ampliar o E2E para Financeiro, Fiscal, Produção, CRM, Qualidade, Projetos,
   Workflow e Importação.
5. Correções de linha de base, separadas desta migração: permissões
   `product_categories.*`/`units.*`, `warehouse_id` no mapper de locais, escapar
   vírgula/parênteses na busca de `table.ts`.
6. Depois de estável: remover `@supabase/ssr`, `supabase/client.ts`, callback, envs
   `SUPABASE_*`; trocar o tipo `SupabaseClient` por uma interface própria.
7. Corrigir as migrations do repositório para reconstruírem produção (ou adotar o
   plano como fonte).

## 16. Recomendação técnica

Seguir para o cutover pela **opção C (RLS preservada + autorização na API)**, com a
camada `src/lib/database/pg`. O risco está concentrado na fidelidade do adaptador em
módulos sem E2E, e isso se resolve com testes, não com redesenho. Ordem:
1. (§15.1) E2E contra o Neon real a partir de um ambiente com rede;
2. banco de produção no Neon + ensaio de dados num branch;
3. preview da Vercel com `DATA_BACKEND=postgres` apontando para o ensaio;
4. janela curta: congelar escrita, copiar dados, conferir contagens, trocar env,
   deploy, smoke test;
5. manter o Supabase **intacto e só leitura** por 2 semanas como caminho de volta.
   O rollback é voltar as env para `DATA_BACKEND=supabase`/`AUTH_PROVIDER=supabase`.

---

DATABASE: **PASS**
AUTH: **PASS**
RBAC: **PASS**
API: **PASS**
CRUD: **PASS**
SECURITY: **PASS**
E2E: **PASS** (106/106)

POC: **PASS**

PRODUÇÃO: **INTACTA**
