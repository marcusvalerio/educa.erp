# Ensaio de dados Supabase (produção) → Neon (branch de ensaio) — 2026-09-27

Destino: projeto **educa-erp-prod** (`old-butterfly-53570465`, aws-sa-east-1), branch
**`rehearsal-2-educa`** (`br-autumn-sunset-b6j8aw5a`, filha de `main`), banco `educa`
(ICU en-US). A branch `main` **não** recebeu dados. Origem: Supabase de produção
(`bshvfsxapwwfntowdxyr`), somente leitura.

## Como foi feito (e por quê)

Este contêiner não alcança `*.neon.tech` nem a porta 5432 do Supabase, e não há
senha do banco do Supabase para `pg_dump`. Por isso o ensaio usou os dois canais
disponíveis: leitura pelo MCP do Supabase e escrita pelo MCP do Neon.
Sequência:

1. Na branch de ensaio: gatilhos de usuário desligados nas 172 tabelas públicas
   (`ALTER TABLE … DISABLE TRIGGER USER`; `session_replication_role` não é permitido
   no Neon) e `TRUNCATE` de tudo.
2. Cópia tabela a tabela, pais antes de filhos (as FKs continuaram valendo durante
   a carga): as 32 tabelas públicas com dados e `auth.users` (1 linha, só as colunas
   do esquema de compatibilidade, **sem senha**).
3. Gatilhos religados: **171/171 `O`, 0 desligado**.
4. Sequences: as 43 ajustadas pelos valores de produção.
5. Comparação de contagem + md5 por tabela (`migrate/table-hashes.sql`: fuso UTC,
   ordenação `COLLATE "C"`) nos dois lados.

Para o cutover com rede, o mesmo processo está em um script reproduzível,
`migrate/copy-data.sh`: snapshot `REPEATABLE READ` na origem, e no destino uma
única transação com `\copy`, FKs recriadas e comparação automática.

## Resultado: dados iguais

| Verificação | Supabase produção | Neon `rehearsal-2-educa` | |
|---|---|---|---|
| Tabelas comparadas (172 públicas + `auth.users`) | 173 | 173 | PASS |
| Tabelas vazias | 140 | 140 (mesmo conjunto: md5 `88454671…`) | PASS |
| Linhas (1.664 públicas + 1 auth) | 1.665 | 1.665 | PASS |
| md5 do conjunto (tabela=contagem:md5) | `3a89c64e4fe5d550dc52438931c5e350` | `3a89c64e4fe5d550dc52438931c5e350` | PASS |
| Sequences (43, `last_value`) | `f419994acbe9a1272a688aca9e98aac4` | `f419994acbe9a1272a688aca9e98aac4` | PASS |
| Gatilhos habilitados | 171 | 171 | PASS |
| Constraints não validadas | 1 (`customers_segment_check NOT VALID`) | a mesma, e os 20 clientes a respeitam (`segment` nulo) | PASS |
| FKs / CHECK / PK+UK (todas aplicadas durante a carga) | — | 567 / 403 / 379 | PASS |

Por tabela (contagem:md5, idêntico nos dois lados):

| Tabela | Linhas | md5 |
|---|---|---|
| auth.users (colunas mapeadas) | 1 | `8d117e34…` |
| audit_logs | 2 | `c9c6a9ed…` |
| auth_identity_links | 1 | `8e486a07…` |
| carriers | 10 | `bef40ac7…` |
| companies | 1 | `ff116218…` |
| company_modules | 19 | `91ce11a6…` |
| company_platform_profiles | 1 | `0200d348…` |
| customers | 20 | `3a2acba3…` |
| dashboard_focus_areas | 57 | `49d5292e…` |
| dashboard_focus_rules | 72 | `b3640f92…` |
| departments | 15 | `a19ba93d…` |
| drivers | 16 | `60dd6914…` |
| permission_actions | 10 | `7ad4484a…` |
| permissions | 352 | `193674af…` |
| platform_members | 1 | `c55cce7f…` |
| platform_module_permission_map | 103 | `09b78c0f…` |
| platform_modules | 19 | `69f35cf8…` |
| platform_permissions | 14 | `59da4d8e…` |
| platform_role_permissions | 26 | `df7f3b04…` |
| positions | 8 | `7f16c79c…` |
| product_barcodes | 30 | `9d7e5f04…` |
| product_categories | 18 | `54e42300…` |
| product_suppliers | 30 | `ee2e44ee…` |
| products | 30 | `ffe12a18…` |
| role_permissions | 711 | `242b204f…` |
| roles | 3 | `54d87760…` |
| suppliers | 15 | `230a91ee…` |
| system_settings | 7 | `4e156e5f…` |
| units | 13 | `7af39ee9…` |
| users | 10 | `4d9bae60…` |
| vehicles | 15 | `7bc7ccb4…` |
| warehouse_locations | 30 | `b6b7ee56…` |
| warehouses | 5 | `9b1af237…` |

## Identidade, vínculos e acesso (dados reais)

- **Owner:** `auth.users` `527fad15…` (contatomarcusjr@gmail.com) →
  `platform_members` OWNER ativo → `auth_identity_links` (provider `neon`,
  external `33e3fb0b…`). Esse usuário **existe** no Neon Auth de produção
  (projeto `educa-auth-prod`, `young-mode-67474663`, `neon_auth.user`). O Owner entra
  com o Neon Auth **atual**, sem recriar conta nem trocar senha.
- **Mesma visão do Owner nos dois bancos** (`authenticated` + claims do Owner,
  somente leitura): `is_platform_owner`=true, platform_members=1, companies=0,
  products=0, company_modules=19, users=0 → **Supabase = Neon (7/7)**.
- **Usuários do app:** os 10 `public.users` estão **sem `auth_user_id`**, e
  `user_roles` = 0 em produção. Hoje ninguém além do Owner entra na empresa.
  Isso já é assim no Supabase, não foi causado pela migração. Cada um entra pelo
  fluxo de convite/primeiro acesso (senha criada no Neon Auth). Nenhuma senha
  é migrada.

## Segurança sobre os dados migrados: 56/56 PASS

Branch filha descartável **`rehearsal-2-probes`** (`br-calm-truth-b6n0ofna`), para
não alterar a de ensaio. Massa extra: empresa "Probe Beta" com admin; dois
usuários **reais** da ASTRA ligados pelo caminho do convite (thiago.pinto →
admin, debora.alves → leitura). As sondas (`poc_sec.probe/cnt`, SECURITY INVOKER,
subtransação sempre desfeita) são as mesmas de `sql/neon-security-probes.sql`.

| # | Ator / tentativa | Obtido | |
|---|---|---|---|
| P01–P07 | anon: products/users/companies/platform_members=0; `auth.users` e `auth_identity_links` → 42501; insert → RLS 42501 | conforme | PASS |
| P08–P10 | authenticated **sem claims**: products=0, users=0, links → 42501 | conforme | PASS |
| P11 | admin ASTRA: `auth.uid()` = sub | `cc…0001` | PASS |
| P12–P15 | admin ASTRA vê os dados reais: 30 produtos, 20 clientes, 30 endereços; 0 da Beta | conforme | PASS |
| P16–P17 | `has_permission` própria=true, Beta=false | conforme | PASS |
| P18 | admin insere produto na ASTRA | OK rows=1 (desfeito) | PASS |
| P19–P22 | admin insere/altera/exclui na Beta, move produto p/ Beta | 42501 / 0 / 0 / 42501 | PASS |
| P23 | admin troca o próprio `auth_user_id` | 42501 "só pelo aceite de convite" | PASS |
| P24–P25 | admin vira Platform Owner / `is_platform_owner` | 42501 / false | PASS |
| P26–P27 | admin vê users=10, audit_logs=0 (logs de plataforma) | conforme política | PASS |
| P28–P31 | leitura: lê 30; insert 42501; update/delete 0 linhas | conforme | PASS |
| P32–P34 | leitura se promove (update/insert em `user_roles`), dá permissão ao próprio papel | 0 / 42501 / 42501 | PASS |
| P35–P40 | admin Beta: vê 1 produto, 0 da ASTRA, 1 usuário; altera ASTRA=0; cria usuário/papel na ASTRA → 42501 | conforme | PASS |
| P41–P46 | Owner: owner=true, pm=1, companies=0, products=0, company_modules=38 (19+19 Beta); vincular login a outro usuário = 0 linhas | conforme | PASS |
| P47–P49 | sub forjado: products=0, users=0, owner=false | conforme | PASS |
| P50–P52 | service_role: 31 produtos (BYPASSRLS); troca de vínculo → 42501; auth.users=4 | conforme | PASS |
| P53–P56 | estado final: 31 produtos, 3 vínculos, 3 papéis, 1 owner | intacto | PASS |

## Script reproduzível testado (`migrate/copy-data.sh`)

Teste local (PostgreSQL 16): origem = banco do E2E, destino = banco novo com o
mesmo esquema.

- A 1ª versão **falhou** (`purchase_request_items_…_fkey`). Ordenar as tabelas
  não basta: o grafo de FKs tem ciclos (users↔departments, users↔positions,
  workflow_instances↔workflow_instance_steps).
- Correção: na mesma transação, as definições das FKs são guardadas e as FKs
  removidas. Depois da carga, são recriadas com a mesma definição, e recriar
  valida todas as linhas. Também foi corrigida a leitura de sequences
  (`pg_sequences` não tem `is_called`).
- Resultado: `DADOS IGUAIS: 173 tabelas (contagem + md5), 43 sequences`.
  Constraints iguais antes/depois: 1.350, md5 `289ab638…`. Segunda execução sobre
  o destino já carregado também passou. As travas recusam destino `supabase` e
  `CONFIRM_TARGET` divergente (saída 2).
- Ainda **não executado contra Neon/Supabase reais** a partir de um ambiente com
  rede: depende da senha do banco do Supabase e de saída de rede.

## Divergências

| # | Divergência | Impacto | Tratamento |
|---|---|---|---|
| D1 | Nenhuma nos dados (173/173, sequences 43/43) | — | — |
| D2 | Neon Auth de produção fica em `educa-auth-prod` (aws-us-east-1); o banco fica em aws-sa-east-1 | latência só nas chamadas de autenticação | aceito; mover o Auth exigiria recriar contas (fora do escopo) |
| D3 | 10 usuários sem login e `user_roles`=0 (já assim no Supabase) | só o Owner entra até convidar | convites/primeiro acesso no pós-cutover |
| D4 | Owner com `emailVerified=false` no Neon Auth | recuperação de senha depende de e-mail | conferir no Console antes do cutover |
