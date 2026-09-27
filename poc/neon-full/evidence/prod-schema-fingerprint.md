# Neon de produção — esquema × Supabase de produção × POC (2026-09-26/27)

Projeto **educa-erp-prod** (`old-butterfly-53570465`, aws-sa-east-1, PostgreSQL 17.11),
branch `main` (`br-lively-darkness-b683lnw7`), banco **`educa`** (ICU `en-US`, igual ao
Supabase). Esquema aplicado pelo pacote do plano equivalente a produção
(`bundle/schema-bundle.json`, sha256 `7a03e1ac…67dc`, commit `490b2d0`): **92/92
arquivos, 2.731 comandos, 0 erro** (registro em `educa_migration.build_runs/build_files`).

| Categoria | Qtde | Neon `educa` | Supabase produção | POC Neon |
|---|---|---|---|---|
| col (normalizado `extensions.`) | 2.153 | `b168fc48…` | `b168fc48…` | `b168fc48…` |
| con | 1.350 | `6baded70…` | `6baded70…` | `6baded70…` |
| idx | 706 | `d443b53e…` | `d443b53e…` | `d443b53e…` |
| trg | 171 | `b3b0f541…` | `b3b0f541…` | `b3b0f541…` |
| pol | 328 | `adce0338…` | `adce0338…` | `adce0338…` |
| rls | 172 | `01e89068…` | `01e89068…` | `01e89068…` |
| tacl | 172 | `472ac385…` | `472ac385…` | `472ac385…` |
| fn | 330 | `e8c586c4…` | `e8c586c4…` | `e8c586c4…` |
| facl | 330 | `b3b682e2…` | `b3b682e2…` | `b3b682e2…` |
| view | 4 | `a37caf86…` | `a37caf86…` | `a37caf86…` |
| seq | 43 | `987e9ee5…` | `987e9ee5…` | — |
| ext | 5 | btree_gist 1.7, ltree **1.3**, moddatetime 1.0, pgcrypto 1.3, uuid-ossp 1.1 @extensions | idem | ltree 1.2 (POC) |
| collation | — | `en_US.UTF-8` ICU 153.120 · ordem `a,Á,a_b,a-b,ab,b,B,é,Z` | ICU 153.121 · mesma ordem | **C.UTF-8** (divergente) |

`auth.uid()/jwt()/role()`: mesma lógica do Supabase (só espaçamento difere).
Coluna `product_categories.path`: o tipo aparece como `extensions.ltree` no Neon e
`ltree` no Supabase (search_path); é o mesmo tipo.

## Divergências encontradas e tratadas

1. **Collation** (nova, também presente na POC): o banco padrão do Neon (`neondb`)
   nasce `C.UTF-8`. O Supabase usa ICU `en-US`. Isso muda todo `ORDER BY` de texto
   (maiúsculas antes, acentos no fim). Correção: banco **`educa`** criado com
   `LOCALE_PROVIDER icu ICU_LOCALE 'en-US'`. O banco `neondb` do projeto ficou com
   o esquema da primeira aplicação e com `CONNECT` revogado de PUBLIC. Remover é
   ação destrutiva e fica para o dono.
2. **Neon Functions** não existem em aws-sa-east-1. O esquema foi aplicado por
   uma função do projeto isolado `educa-neon-poc` (`functions/remoteapply`) pela API
   HTTP do Neon, com a senha do dono **só** no ambiente da função durante a
   aplicação. Depois: gatilho desligado, variável removida e senha do
   `neondb_owner` trocada (reset).
3. `session_replication_role` não é permitido ao dono no Neon. A carga de dados usa
   `ALTER TABLE … DISABLE/ENABLE TRIGGER USER`. As FKs têm ciclos, então
   `migrate/copy-data.sh` guarda, remove e recria as FKs dentro da transação
   (ver `rehearsal-data.md`).

## Papéis

| Papel | LOGIN | INHERIT | BYPASSRLS | Membro de |
|---|---|---|---|---|
| neondb_owner (dono) | sim | sim | sim | neon_superuser; SET (sem INHERIT) em anon/authenticated/service_role (para as sondas) |
| educa_app (app) | sim, **sem senha** até o ambiente ser ligado | **não** | não | anon, authenticated, service_role (SET, sem INHERIT) |
| anon / authenticated | não | não | não | — |
| service_role | não | não | **sim** | — |

`educa_app`: CONNECT em `educa`; nenhum privilégio direto em tabelas; `auth.users`
só para service_role.
