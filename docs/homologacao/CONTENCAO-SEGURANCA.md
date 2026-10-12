# Contenção de segurança — exposições multiempresa

Branch `claude/atlas-neon-ux-crm` / `claude/atlas-integracao-0076-0093` ·
12/10/2026.

> **Situação em produção (Supabase `bshvfsxapwwfntowdxyr`), 12/10/2026, só
> metadados:** as exposições **continuam ativas**. A policy
> `units_select_authenticated` existe; as 4 views seguem sem
> `security_invoker`, com SELECT para `anon`; o ledger está em 0075 (86
> registros). Nada foi aplicado em produção.

## 1. Exposições comprovadas

| # | Exposição | Quem alcança | Comprovação |
|---|---|---|---|
| E1 | `units_select_authenticated USING (true)`: unidades e `company_id` de **todas** as empresas | qualquer usuário autenticado (JWT do Supabase/PostgREST) | local (33 unidades de 3 empresas); Neon homolog (10 unidades da Beta sintética); produção: policy presente (catálogo) |
| E2 | `v_cash_flow_summary`, `v_cash_flow_projection`, `inventory_valuation`, `v_sales_order_item_margin` sem `security_invoker`, dono com `bypassrls`, SELECT para `anon`: saldos, a receber/a pagar, valor de estoque e margem de **todas** as empresas | **sem login**, com a chave pública | local e Neon homolog (anon leu 3 empresas); produção: configuração presente (catálogo) e apontada pelo linter do Supabase (`security_definer_view`, ERROR, as mesmas 4 views) |
| E3 | `fn_resolve_applicable_tax_rules` SECURITY DEFINER sem checagem, EXECUTE para `anon`/`authenticated`: regras fiscais (CST, alíquotas) de qualquer empresa pelo id | sem login, conhecendo o id da empresa (que E1 expunha) | local (anon leu a regra sintética); produção: grant presente (catálogo) |

Não há leitura de conteúdo financeiro real em nenhuma comprovação: dados
sintéticos (local e Neon) e metadados/contagens (produção).

## 2. Consumidores legítimos verificados

| Objeto | Consumidor | Efeito da contenção |
|---|---|---|
| 4 views | `finance-handlers.ts` (`/api/cash-flow-*`), `cost-handlers.ts` (valorização) — **cliente administrativo** (`service_role`, `bypassrls`) com filtro `company_id` da sessão; no modo Neon, `set local role service_role` | nenhum (service_role continua lendo; comprovado na homologação Neon) |
| 4 views | `fn_margin_by_*`, `fn_report_executive/finance/inventory` — SECURITY DEFINER (rodam como dono) e conferem `has_permission(p_company_id, …)` | nenhum (dono ignora RLS; checagem própria mantida — testes recusam outra empresa e anon) |
| `units` | API `/api/units` com cliente administrativo; o código em produção exige `units.read`, **inexistente** no catálogo de produção → já responde 403 hoje | nenhum para o app. Acesso **direto** ao banco por usuários fica sem leitura de `units` até a 0091 criar `units.read` |
| `fn_resolve_applicable_tax_rules` | só funções SECURITY DEFINER (0039, 0041); o app não chama por RPC | nenhum |

Logs da API em produção (24/09–11/10) mostram as views lidas **só** por
`service_role` e nenhuma chamada REST de usuário a `units` — ver
`RELATORIO-INVESTIGACAO-LOGS.md`.

## 3. Estratégia (contenção × sequência definitiva)

- **Contenção** = `docs/homologacao/producao/contencao-emergencial.sql`:
  subconjunto **literal** das migrations 0091 (§1 drop da policy; §4 views) e
  0093 (revoke da função). Não cria permissões, não muda papéis nem dados.
  Transação única com pré-condições e verificação que abortam.
- **Definitiva** = 0091 (+ 0092, 0093) aplicadas pelo ledger, na sequência
  integrada 0076…0093. Os mesmos comandos rodam de novo sem efeito
  (idempotentes) — não há duas correções concorrentes nem dependência de
  ordem acidental. A contenção fica incorporada à sequência pelas próprias
  0091/0093; o ledger registrará 0091/0093 quando a sequência for aplicada.
- **0091 não depende** de 0076–0090 (só detecta a 0076 para ajustar o modelo
  da Somente leitura). A contenção não depende de nada além da 0075.
- **Rollback**: `producao/rollback-contencao.sql` (reabre E1–E3; só para
  emergência funcional).

## 4. Validação

| Ambiente | O que | Resultado |
|---|---|---|
| Local, cópia do banco equivalente à produção (`crm_base`) | verificação antes → contenção → depois → reaplicar → rollback → reaplicar → 0089–0093 por cima | antes `f t t f f f t t`; depois `t t t t t t t t`; rollback restaura o estado anterior exatamente; reaplicação e sequência completa sem conflito; 28/28 testes de segurança |
| Local, banco só com a contenção | `views-isolamento-db` | 7/8 — a falha é o defeito antigo de `fn_margin_by_order` (`min(uuid)`), corrigido pela 0092 (fora da contenção); anon recusado nas 6 funções |
| **Neon, branch filha da homologação** (`valida-contencao-20261011`) | contenção pelo conector, dados sintéticos Alfa/Beta | anon: de 3 empresas → `permission denied`; Alfa: unidades/caixa da Beta 10/1 → 0/0; próprio caixa 1000; `service_role` inalterado |

Testes de regressão no repositório (falham se as exposições voltarem):
- `tests/views-isolamento-db.test.ts` — anon nas 4 views; sem permissão não
  vê valores; Alfa/Beta só os próprios números; 6 funções SECURITY DEFINER
  recusam outra empresa e anon; **nenhuma view com anon ou sem
  security_invoker**; execução pública da função de regras fiscais;
- `tests/isolamento-multiempresa-db.test.ts`,
  `tests/permissoes-produtos-db.test.ts` — unidades e catálogo.

## 5. Riscos e compatibilidade

- **Compatibilidade de schema:** os objetos exigidos existem em produção
  (conferido); as pré-condições do script abortam se o schema divergir.
  `security_invoker` existe desde o PostgreSQL 15 (produção 17.6).
- **Bloqueios:** `ALTER VIEW` e `DROP POLICY` pegam lock curto; o script usa
  `lock_timeout = 5s` (aborta em vez de enfileirar).
- **Efeito colateral conhecido:** sem a 0091, nenhum usuário lê `units`
  direto no banco (nem a própria empresa). O app não usa esse caminho.
- **Fora da contenção (risco residual):** o linter do Supabase lista 263
  funções SECURITY DEFINER executáveis por `anon`. A grande maioria confere
  sessão/permissão internamente; varredura por padrões não encontrou outra
  com exposição comprovada além de E3 (as demais sem checagem são gatilhos —
  não chamáveis diretamente — e verificações booleanas de módulo). Revisão
  dedicada recomendada.
