# POC — Plano A: Neon Auth → Postgres do Supabase (RLS intacta)

Prova de conceito isolada. **Não faz parte do app**: fica fora do build, do
`tsc` (`tsconfig.json` exclui `poc/`) e usa `node_modules` próprio.

## O que a POC prova

```
Better Auth 1.4.18 (motor do Neon Auth) ── login, sessão, JWT EdDSA + JWKS
        │ token do provedor (verificado no servidor)
        ▼
src/lib/auth/neon-bridge.ts ── assinatura/iss/aud/exp/algoritmo → vínculo 0073 → token curto do banco
        │ sub = auth_user_id, role = authenticated, ≤ 300 s
        ▼
PostgREST + Postgres (réplica do Supabase) ── auth.uid() → current_app_user_id() → has_permission() → RLS
```

Resultado: **56/56** verificações (identidade, multi-tenancy A/B, RBAC,
escalada, ponte, desativação, primeiro acesso, recuperação, login/logout).

## Limites

- O identity provider é o **Better Auth local na mesma versão** do Neon Auth
  gerenciado, não o serviço Neon (sem acesso de rede à Neon neste ambiente).
- O banco é a **réplica local** do banco de produção, não produção.
- O app (rotas, `createClient()`, `proxy.ts`) **ainda não** usa a ponte.

## Como rodar

Pré-requisitos: réplica local no ar (Postgres em `54322`, PostgREST em
`53000`) e um banco separado para a identidade (`create database neon_auth_poc`).

```bash
cd poc/neon-auth && npm install
export POC_AUTH_DB='postgres://…/neon_auth_poc?options=-c%20search_path%3Dpublic'
export POC_AUTH_SECRET='<aleatório, ≥ 32 bytes>'
export POC_OUTBOX=/tmp/outbox.jsonl
export REPLICA_SERVICE_KEY='<service_role da réplica>' REPLICA_JWT_SECRET='<segredo JWT da réplica>' REPLICA_PGPASS='<senha postgres da réplica>'
node auth-server.mjs &                        # identidade em http://localhost:3400
cd ../.. && node --import tsx poc/neon-auth/run-poc.mjs
```

A POC cria fixtures **somente na réplica** ("POC Empresa A/B", A1 admin,
A2 leitura, B1 admin, B2 operador, um Owner) e aplica a 0073 na réplica.
Nenhum segredo fica no código.
