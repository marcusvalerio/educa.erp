# CRM — Fase 15

Camada de CRM (`supabase/migrations/0054-0055`), construída sobre Comercial (customers/sales_representatives/sales_quotes/sales_orders, 0019-0021), `party_addresses`/`party_contacts` (0051), RBAC (0005) e `audit_logs` (0003).

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 0. O que já existia (nunca duplicado)

`customers` continua sendo O cadastro de cliente — um lead convertido nunca gera uma segunda tabela de "cliente", sempre um `customers` real (`fn_convert_lead_to_customer`, reaproveitando ou criando). `sales_quotes`/`sales_orders` continuam exatamente como em 0020/0021; a única mudança é aditiva (`source_type`/`source_id` nullable, seção 2). `party_addresses`/`party_contacts` não foram estendidas para leads/oportunidades nesta fase — seu `party_type` continua limitado a customer/supplier/carrier (0051); CRM usa campos próprios de contato (email/phone) em `leads`, suficientes para o estágio atual.

## 1. Leads, origens e qualificação

`lead_origins` é um cadastro simples (code/name) por empresa. `leads` guarda nome, documento, contato, origem, responsável, `status` (NEW/CONTACTED/QUALIFIED/DISQUALIFIED/CONVERTED) e `qualification` (COLD/WARM/HOT, opcional). `converted_customer_id` só é preenchido por `fn_convert_lead_to_customer` — bloqueado por RLS em update direto (mesmo rigor de `party_addresses.is_primary`, 0051).

## 2. Pipelines, estágios e oportunidades

`pipelines`/`pipeline_stages` são configuráveis por empresa (múltiplos funis). `opportunities` referencia cliente e/ou lead (uma oportunidade pode existir antes do lead virar cliente oficial), estágio, valor estimado, probabilidade, responsável, data prevista de fechamento. `opportunity_stage_history` registra `entered_at`/`exited_at` por estágio — usado pelo indicador de tempo médio por estágio; não é redundante com `audit_logs` (é um fato estruturado, não um log genérico).

Mudança de estágio (`fn_move_opportunity_stage`) e fechamento ganho/perdido (`fn_close_opportunity`) são sempre via função — travam a linha, encerram a linha de histórico atual e abrem/fecham a nova, gravando em `audit_logs`. Update direto de `opportunities` nunca sai de `status=OPEN` (RLS).

`sales_quotes`/`sales_orders` ganharam `source_type`/`source_id` (polimórfico, mesmo padrão de `cost_movements`/`fiscal_documents`) — usado por `fn_convert_opportunity_to_sales_quote`/`fn_convert_opportunity_to_sales_order`, que reaproveitam `fn_create_sales_quote`/`fn_create_sales_order` (0020/0021) sem alterá-las.

## 3. Atividades

`activities` (CALL/MEETING/TASK/CONTACT/FOLLOW_UP/NOTE) é polimórfica por `related_type`/`related_id` (lead/opportunity/customer), guardada por `fn_assert_crm_related_exists` (mesmo padrão de `fn_assert_party_exists`, 0051).

## 4. Conversões

| Conversão | Função |
|---|---|
| Lead → Cliente | `fn_convert_lead_to_customer` — reaproveita cliente existente pelo documento; nunca duplica |
| Lead → Oportunidade | `fn_convert_lead_to_opportunity` |
| Oportunidade → Orçamento de venda | `fn_convert_opportunity_to_sales_quote` |
| Oportunidade → Pedido de venda | `fn_convert_opportunity_to_sales_order` |

Todas exigem `customer_id` preenchido quando aplicável (as duas últimas) — nunca criam um pedido/orçamento "sem cliente".

## 5. Indicadores (seção "funções de indicador")

Todas como funções SQL `returns table(...)`, permissão `crm_reports.view`, mesmo padrão de Controladoria/Relatórios (0045-0048):

`fn_crm_leads_by_origin`, `fn_crm_lead_conversion_rate`, `fn_crm_opportunities_by_stage`, `fn_crm_pipeline_summary` (total + ponderado por probabilidade), `fn_crm_sales_by_rep`, `fn_crm_activities_summary`, `fn_crm_won_lost_opportunities`, `fn_crm_avg_time_per_stage` (via `opportunity_stage_history`).

## 6. RBAC

| Código | Uso |
|---|---|
| `lead_origins.view/create/update` | origens de lead |
| `leads.view/create/update` | cadastro de lead |
| `leads.convert` | converter lead em cliente/oportunidade |
| `pipelines.view/create/update` | pipelines e estágios |
| `opportunities.view/create/update` | cadastro/edição descritiva |
| `opportunities.move_stage` | mover estágio |
| `opportunities.close` | fechar ganha/perdida |
| `opportunities.convert` | gerar orçamento/pedido |
| `activities.view/create/update` | atividades de CRM |
| `crm_reports.view` | indicadores |

## 7. RLS e auditoria

Todas as tabelas com `company_id` + RLS via `has_permission`. `opportunities`/`leads` bloqueiam via `with check` a saída dos estados transacionais por update direto (conversão/fechamento/mudança de estágio só por função). Toda transição/conversão grava em `audit_logs` (reaproveitado, nenhuma tabela de log paralela).

## 8. API

`/api/lead-origins`, `/api/leads` (+`/[id]/convert-to-customer`, `/convert-to-opportunity`), `/api/pipelines`, `/api/pipeline-stages`, `/api/opportunities` (+`/[id]/move-stage`, `/close`, `/convert-to-quote`, `/convert-to-order`), `/api/activities`, `/api/crm/reports/*` (8 endpoints, um por indicador).

## 9. Testes e frontend

`tests/crm-validations.test.ts` cobre a camada de validação Zod. A lógica transacional real (conversão sem duplicar cliente, histórico de estágio, RBAC, RLS, isolamento por empresa) vive nas funções SQL e só é verificável contra um Postgres real. Nenhuma tela dedicada de CRM nesta rodada — backend/API completos, UI fica para a integração do Design System (Fase 19) como próximo passo.
