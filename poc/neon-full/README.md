# POC EDUCA-NEON: EDUCA sem Supabase (Neon PostgreSQL + Neon Auth)

```
navegador ─cookie HttpOnly─▶ Next.js (rotas/Server) ─▶ Neon Auth (sessão, JWT EdDSA/JWKS)
                                   │ ponte: vínculo 0073 → auth_user_id
                                   ▼
             src/lib/database/pg (pg + adaptador no formato do supabase-js)
             por chamada: BEGIN; SET LOCAL ROLE anon|authenticated|service_role;
                          set_config('request.jwt.claims', {"sub": auth_user_id}, true)
                                   ▼
             PostgreSQL (Neon) com o esquema de produção: auth.uid() → has_permission() → RLS
```

O app não muda: as 323 chamadas `.from()` e as 233 `.rpc()` seguem iguais. Só a
fábrica do cliente muda (`src/lib/supabase/{server,admin}.ts`). RLS, RBAC,
funções e gatilhos continuam no banco, idênticos aos de produção.

| Variável | Valor | Efeito |
|---|---|---|
| `AUTH_PROVIDER` | `neon` | identidade pelo Neon Auth (camada existente, `src/lib/auth/neon`) |
| `DATA_BACKEND` | `postgres` | dados pelo PostgreSQL direto, sem PostgREST (padrão: `supabase`) |
| `DATABASE_URL` | `postgres://educa_app:…@…/neondb?sslmode=require` | papel de login **sem privilégios próprios** (`sql/10_app_login_role.sql`) |
| `DATABASE_POOL_MAX` | `5` (opcional) | conexões por instância; no Neon, use a URL **pooled** |

Sem `DATA_BACKEND` o app segue exatamente como hoje (Supabase), o que o build e
os 718 testes provam nos dois modos.

## Peças

| Caminho | O quê |
|---|---|
| `src/lib/database/pg/postgrest-compat.ts` | construtor de consultas no formato do supabase-js → SQL parametrizado (select com embutidos por FK, filtros, `.or()`, ordem/faixa/contagem, insert/upsert/update/delete com `returning`, `single`/`maybeSingle`, `rpc` pelo catálogo) |
| `src/lib/database/pg/client.ts` | pool `pg`, preâmbulo da sessão (papel e claims por transação), catálogo (FKs/funções/PKs), `auth.admin` mínimo sobre `auth.users` |
| `src/lib/database/backend.ts` | `DATA_BACKEND` (falha fechada para valor desconhecido) |
| `sql/00_supabase_compat.sql` | papéis `anon`/`authenticated`/`service_role`, `auth.uid()/jwt()/role()`, `auth.users` (sem senha), esquema `extensions` |
| `sql/10_app_login_role.sql` | `educa_app` LOGIN NOINHERIT, só membro dos três papéis |
| `plan-prod-equivalente.txt` + `sql/` | reconstrução do banco **igual a produção** (as migrations do repositório sozinhas não reconstroem; ver relatório §4) |
| `bundle/` + `functions/schemaapply` | pacote verificado por sha256, aplicado no Neon por uma Neon Function (gatilho desativado) |
| `e2e/` | E2E com Playwright (106 verificações), caixa de e-mail local, reinício do ambiente |
| `tools/` | divisor de SQL, gerador do pacote, cobertura das RPCs, SQL do adaptador para o Neon |
| `evidence/` | resultados: E2E 106/106, Neon real 35/35 + 8/8, RPC 219/219 |

## Como rodar (local, sem Supabase e sem segredos no Git)

Pré-requisitos: PostgreSQL 16+ local (porta 55440, `trust` no 127.0.0.1),
`poc/neon-auth` com `npm ci` (dublê do Neon Auth: Better Auth 1.4.18, o mesmo
motor), Playwright/Chromium, e dois arquivos **locais** fora do Git:

- `SECRETS` (dublê): `POC_AUTH_SECRET`, `NEON_AUTH_SERVICE_EMAIL`, `NEON_AUTH_SERVICE_PASSWORD`;
- `.env.local`: `AUTH_PROVIDER=neon`, `DATA_BACKEND=postgres`,
  `DATABASE_URL=postgres://educa_app@127.0.0.1:55440/educa_poc`,
  `NEON_AUTH_BASE_URL=http://localhost:3401/neondb/auth`, `APP_URL=http://localhost:3200`,
  `NEON_AUTH_SERVICE_EMAIL/PASSWORD` (os mesmos do dublê). Os e-mails saem do dublê para a caixa local (`e2e/mail-sink.mjs`, porta 58025).

```bash
SECRETS=/caminho/secrets.env PGDATA_POC=/caminho/pgdata poc/neon-full/e2e/run-all.sh
# → build, banco do zero pelo plano (92 arquivos), dublê, Owner pelo bootstrap oficial, app, E2E
```

Testes do adaptador: `npm test` (puros). Com banco:
`POC_DATABASE_URL=postgres://educa_app@127.0.0.1:55440/educa_poc npm test`.
Cobertura das RPCs: `DATABASE_URL=… npx tsx poc/neon-full/tools/check-rpc-coverage.mts`.

## Neon real (projeto isolado `educa-neon-poc`)

- Esquema: aplicado pela Neon Function `schemaapply` (pacote fixado por commit e sha256).
  As impressões digitais batem com produção.
- Segurança: `sql/neon-security-probes.sql`, resultado em `evidence/neon-real-security.md`.
- **BLOQUEIO EXTERNO:** este contêiner não alcança `*.neon.tech`. Para rodar o app
  contra o Neon, use um ambiente com saída para o Neon, crie a senha do `educa_app`
  (Console → Roles; a senha vai só para a variável `DATABASE_URL` do ambiente) e
  rode o E2E com `DATABASE_URL` apontando para o Neon.
