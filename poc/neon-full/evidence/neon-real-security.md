# Neon REAL — segurança (RLS/RBAC) e SQL do adaptador

Projeto **educa-neon-poc** (`dry-rain-79108059`, ramo `br-crimson-queen-b8b73ab0`,
aws-us-east-1, PostgreSQL 17.11), banco `neondb`. Não é produção. Esquema criado
pelo plano equivalente a produção (`plan-prod-equivalente.txt`, 92 arquivos,
2.731 comandos). As impressões digitais batem com produção em 9 das 10 categorias; a
diferença está só na exibição de `ltree` como `extensions.ltree`.

Execução em 2026-09-26 pelo MCP do Neon (`run_sql_transaction`: uma transação por
bloco). Papel e claims são aplicados com `SET LOCAL`/`set_config(..., true)`, igual
ao que o adaptador `src/lib/database/pg` faz em cada chamada. SQL completo e massa de
teste em `poc/neon-full/sql/neon-security-probes.sql`. As sondas rodam dentro de uma
subtransação que é sempre desfeita, então nada persiste.

Atores: **A1** = admin da Alfa, **A2** = leitura da Alfa, **B1** = admin da Beta,
**sub forjado** = UUID sem usuário no EDUCA.

## 1. Bateria de segurança: 35/35 PASS

| # | Tentativa | Esperado | Obtido | |
|---|---|---|---|---|
| S01 | anon lê `products` | nada | `0` | PASS |
| S02 | anon lê `auth.users` | negado | `ERR 42501 permission denied for table users` | PASS |
| S03 | anon insere produto | negado | `ERR 42501 new row violates row-level security policy` | PASS |
| S04 | authenticated **sem claims** lê `products` | nada | `0` | PASS |
| S05 | authenticated lê `auth.users` | negado | `ERR 42501` | PASS |
| S06 | authenticated lê `auth_identity_links` (0073) | negado | `ERR 42501` | PASS |
| S07 | A1: `auth.uid()` | sub das claims | `aa000000-…0001` | PASS |
| S08 | A1 vê produtos da Alfa | 1 | `1` | PASS |
| S09 | A1 vê produtos da Beta | 0 | `0` | PASS |
| S10 | A1 sem filtro: total visível | só a Alfa | `1` | PASS |
| S11 | `has_permission(Alfa, products.create)` para A1 | true | `true` | PASS |
| S12 | `has_permission(Beta, products.read)` para A1 | false | `false` | PASS |
| S13 | A1 insere produto na Alfa | permitido | `OK rows=1` (desfeito) | PASS |
| S14 | A1 insere produto na Beta | negado | `ERR 42501 … row-level security` | PASS |
| S15 | A1 altera produto da Beta | 0 linhas | `OK rows=0` | PASS |
| S16 | A1 exclui produto da Beta | 0 linhas | `OK rows=0` | PASS |
| S17 | A1 move produto próprio para a Beta (troca `company_id`) | negado | `ERR 42501 … row-level security` | PASS |
| S18 | A1 troca o próprio `auth_user_id` | negado | `ERR 42501 O vínculo de login (auth_user_id) só é definido pelo aceite de convite.` | PASS |
| S19 | A1 se dá papel da Beta (sem ver os papéis) | 0 linhas | `OK rows=0` | PASS |
| S19b | A1 se dá papel admin da Beta (id literal) | negado | `ERR 42501 … policy for table "user_roles"` | PASS |
| S20 | A1 cria usuário na Beta | negado | `ERR 42501 … policy for table "users"` | PASS |
| S21b | A1 vira Platform Owner | negado | `ERR 42501 … policy for table "platform_members"` | PASS |
| S21c | A1 lê `platform_members` | nada | `0` | PASS |
| S22 | A1 `is_platform_owner()` | false | `false` | PASS |
| S23 | A1 lê `auth_identity_links` | negado | `ERR 42501` | PASS |
| S24 | A2 (leitura) lê produtos da Alfa | 1 | `1` | PASS |
| S25 | A2 (leitura) insere produto | negado | `ERR 42501 … row-level security` | PASS |
| S26 | A2 (leitura) altera produto | 0 linhas | `OK rows=0` | PASS |
| S27 | A2 se promove (update em `user_roles`) | 0 linhas | `OK rows=0` | PASS |
| S27b | A2 insere papel admin da Alfa para si | negado | `ERR 42501 … policy for table "user_roles"` | PASS |
| S28 | sub forjado lê `products` | nada | `0` | PASS |
| S29 | sub forjado lê `users` | nada | `0` | PASS |
| S30 | service_role (BYPASSRLS) vê as duas empresas | 2 | `2` | PASS |
| S31 | service_role troca `auth_user_id` | negado (guarda do convite vale até para service_role) | `ERR 42501 O vínculo de login …` | PASS |
| S32/S33 | estado final | intacto | 2 produtos; A1 com o próprio `auth_user_id`; 2 vínculos de papel; 0 owners | PASS |

A primeira versão de S21 usou uma coluna inexistente (`role`; a coluna real é
`platform_role`). O erro `42703` era da sonda, não do banco, e a sonda foi
refeita em S21b. S19 mostrou apenas que A1 não enxerga os papéis da Beta, por isso
S19b repetiu o teste com o id literal.

## 2. SQL gerado pelo adaptador, executado no Neon real: 8/8 PASS

O SQL veio do próprio adaptador (`poc/neon-full/tools/adapter-sql-for-neon.mts`).
Os parâmetros foram embutidos como literais citados porque o canal do MCP não aceita
parâmetros. A execução foi como **A1** (`authenticated` + claims). O lote completo
está em `adapter-sql-neon.json`.

| # | Consulta (forma supabase-js) | Resultado no Neon | |
|---|---|---|---|
| Q1 | `from("products").select("id, code, name, unidade:units!products_unit_company_id_fkey(name)", {count:"exact"}).eq(company).or("code.ilike.*ALFA*,name.ilike.*Alfa*").order("code").range(0,9)` | `[{"code":"P-ALFA-1","name":"Produto Alfa","unidade":{"name":"Unidade"}}]`, count `1` | PASS |
| Q2 | `from("sales_orders").select("id, customers(name), sales_order_items(*)").limit(5)`: FKs compostas (id, company_id) | `[]` (sem pedidos; SQL válido no catálogo do Neon) | PASS |
| Q3 | `upsert({...}, {onConflict:"company_id,code"}).select("id, code, name")` | linha criada e devolvida | PASS |
| Q4 | `update({name}).eq(...).eq(...).select("code, name")` | `[{"code":"P-NEON-ADAPTER","name":"Via adaptador (editado)"}]` | PASS |
| R1 | `rpc("current_user_company_ids")`, função que retorna conjunto | `["0a000000-…000a"]` (só a Alfa) | PASS |
| R2 | `rpc("has_permission", {p_company_id, p_code})`, função escalar | `true` | PASS |
| R3 | `rpc("fn_activate_bom", {p_bom_id: <inexistente>})`, função composta | `ERR P0002 BOM não encontrada.` (erro do banco preservado) | PASS |
| — | preâmbulo `set local role authenticated` + `set_config(request.jwt.claims…)` | `auth.uid()` = sub | PASS |

A linha `P-NEON-ADAPTER` ficou gravada na Alfa do banco de teste, de propósito,
como prova de escrita pelo adaptador.

## 3. BLOQUEIO EXTERNO: rede do contêiner → Neon

O contêiner desta sessão bloqueia `*.neon.tech` (portas 443 e 5432). Por isso, o
app (`next start`) com `DATABASE_URL` apontando para o Neon **não pôde ser executado
daqui**. A prova foi feita em duas partes que se completam:

1. **App → adaptador → PostgreSQL**: E2E completo, 106/106, contra PostgreSQL local
   com o esquema idêntico ao de produção (`e2e-postgres-local.log`).
2. **Adaptador → Neon real**: o mesmo SQL que o adaptador gera, mais a mesma bateria
   de RLS, executados no Neon (seções 1 e 2).

Para rodar o E2E com o Neon diretamente, basta um ambiente com saída para
`*.neon.tech`: `DATABASE_URL=<string do papel educa_app>` e
`poc/neon-full/README.md` §E2E.
