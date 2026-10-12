# Produção — metadados lidos em 12/10/2026 (somente leitura)

Projeto Supabase `bshvfsxapwwfntowdxyr` (`educa.erp`, `sa-east-1`, PostgreSQL
17.6.1.166, status `ACTIVE_HEALTHY`). Organização no plano **free**. Todas as
consultas foram `select` em catálogo. Nenhuma linha de negócio (saldo, margem,
estoque, dado pessoal) foi lida. Nada foi alterado.

## Identificação

| Item | Valor |
|---|---|
| `pg_control_system().system_identifier` | `7678069749886157684` |
| `current_database()` | `postgres` |
| executor (`current_user`) | `postgres` (não superusuário; dono das views e da função) |
| ledger | 86 registros; contém `20260929165645` (`0075_company_roles_and_user_invites`) |
| ref do projeto em `pg_settings` | **não exposto** (`cluster_name = main`) → o operador confere o ref no painel |

## Pré-imagem exata do que a contenção altera

```
policy units_delete               PERMISSIVE DELETE to authenticated using(has_permission(company_id, 'units.delete'::text))
policy units_insert               PERMISSIVE INSERT to authenticated check(has_permission(company_id, 'units.create'::text))
policy units_select               PERMISSIVE SELECT to authenticated using(has_permission(company_id, 'units.read'::text))
policy units_select_authenticated PERMISSIVE SELECT to authenticated using(true)            ← E1
policy units_update               PERMISSIVE UPDATE to authenticated using/check(has_permission(company_id, 'units.update'::text))
view inventory_valuation       opts=- acl={postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}   ← E2
view v_cash_flow_projection    opts=- acl=(idem)
view v_cash_flow_summary       opts=- acl=(idem)
view v_sales_order_item_margin opts=- acl=(idem)
fn fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date) secdef=true
   acl={postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}                                       ← E3
```

- Todas as concessões têm `postgres` como concedente. Por isso o `REVOKE` executado
  por `postgres` as remove. Um `REVOKE` só remove concessões feitas pelo próprio executor.
- Não há entrada PUBLIC nas ACLs: as concessões são **diretas** a
  anon, authenticated e service_role. Por isso o script nomeia cada papel.
- `m` = MAINTAIN (PG17). A verificação final da contenção confere a ACL crua, o que inclui MAINTAIN.
- Papéis: anon, authenticated e service_role têm `rolinherit = true` e nenhuma
  associação a outros papéis. `authenticator` (NOINHERIT) tem SET para os três.
  Não há caminho indireto de privilégio hoje. A verificação final aborta se surgir um.
- Única chamadora de `fn_resolve_applicable_tax_rules`: `fn_calculate_fiscal_document(uuid)`,
  SECURITY DEFINER, dono `postgres` (= dono da função). Ela continua executando depois da contenção.
- Definições (md5) das 4 views e da função idênticas às do banco local
  equivalente (`crm_base`) — ver `RELATORIO-HOMOLOGACAO-REMOTA.md`.

## `verificacao.sql` v2 (antes)

```
banco = 7678069749886157684/postgres
f t t f f f f t t
```

## Pré-condições da contenção v2 avaliadas como SELECT (sem executar o script)

| pré-condição | resultado |
|---|---|
| identidade (system_identifier + banco) | t |
| ledger com 0075 | t |
| objetos existem | t |
| `units_select` com has_permission | t |
| RLS ligado em units | t |
| service_role com BYPASSRLS e SELECT nas views | t |
| nenhuma chamadora perderia acesso | t |

## Backup (Fase 4)

- O conector não lista backups. Plano da organização: **free**.
- Documentação oficial (supabase.com/docs/guides/platform/backups): backups diários
  automáticos só nos planos Pro/Team/Enterprise; PITR é add-on desses planos. Para o
  plano free a recomendação é exportar com `supabase db dump` e manter cópia fora do Supabase.
- **Backup NÃO confirmado.** Ver pré-condições em `PLANO-PRODUCAO-E-ROLLBACK.md`.
