# Contenção v2 em PostgreSQL 17 — branch Neon descartável (12/10/2026)

Branch `valida-contencao-v2-20261012` (`br-quiet-surf-b6ob7mhx`), filha da
`homolog` (`br-icy-cell-b62lgh06`, não alterada), projeto Neon
`old-butterfly-53570465` (alvo futuro, **não** é produção). PostgreSQL 17.11. A
homologação tem o mesmo estado vulnerável da produção, inclusive `MAINTAIN` (`m`) nas ACLs.

A guarda de identidade foi trocada pela da branch (`7689975698837380610`/`neondb`)
só no texto enviado; o arquivo do repositório não muda. O ledger
`supabase_migrations.schema_migrations` foi criado na branch só com a linha 0075.
Executado via conector MCP (`run_sql_transaction` = uma transação).

| passo | resultado |
|---|---|
| verificação antes | `f t t f f f f t t` (igual à produção) |
| script **sem** localizar (identidade da produção) | abortou: `Contenção: banco não é o de produção esperado …`; policy, ACL e opções intactas |
| script localizado | COMMIT (13 instruções, inclusive os dois blocos de pré-condição e verificação) |
| verificação depois (com MAINTAIN incluído) | `t t t t t t t t t` |
| ACL das views depois | `{neondb_owner=arwdDxtm,service_role=arwdDxtm}` + `security_invoker=true` |
| ACL da função depois | `{neondb_owner=X}` |
| `set role anon` → `select` em `v_cash_flow_summary` | `permission denied for view v_cash_flow_summary` |
| `set role authenticated` → `select` em `v_sales_order_item_margin` | `permission denied for view v_sales_order_item_margin` |
| `set role anon` → `fn_resolve_applicable_tax_rules(…)` | `permission denied for function fn_resolve_applicable_tax_rules` |
| `set role service_role` → `fn_resolve_applicable_tax_rules(…)` | `permission denied for function fn_resolve_applicable_tax_rules` |
| `set role service_role` → `select` nas 4 views | ok |
| segunda execução (idempotência) | sem erro; ACLs finais idênticas |

Observação: uma branch Neon herda o `system_identifier` da mãe (cópia física). O
mesmo vale para cópias físicas de produção (restauração física, réplica). Por isso
a guarda combina identificador, nome do banco, ledger e schema, e o operador
confere o ref do projeto no painel antes de executar.

Branch excluída em 12/10/2026, com autorização do responsável, após a validação.
