# Projetos e Serviços — Fase 18

Camada de Projetos e Serviços (`supabase/migrations/0059`), construída sobre `customers` (0002/0019), `sales_quotes`/`fn_create_sales_quote` (0020), Estoque/Custos (`fn_post_stock_movement`/`fn_register_cost_movement`, 0009/0043) e Qualidade (`quality_inspections`, 0058).

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 0. Explicitamente SEM RH

`time_entries` é **apontamento operacional** de horas em projeto/tarefa ou ordem de serviço — não é ponto, não é timesheet de folha de pagamento, não alimenta nenhum cálculo de remuneração. Nenhuma tabela de cargo, benefício, recrutamento ou férias existe nesta ou em qualquer fase anterior do ERP.

## 1. Projetos e tarefas

`projects` (status PLANNING→IN_PROGRESS→ON_HOLD/COMPLETED/CANCELLED, cliente opcional, orçamento). `project_tasks` tem hierarquia (`parent_task_id`, mesma técnica anticiclo de `product_categories`) e **dependências** via `project_task_dependencies` — um grafo (uma tarefa pode depender de várias outras), cuja prevenção de ciclo usa uma CTE recursiva (o padrão while-loop de árvore não se aplica a um grafo).

## 2. Ordens de serviço

`service_orders`: workflow `OPEN → SCHEDULED → IN_PROGRESS → WAITING → COMPLETED`, `CANCELLED` a partir de qualquer estado não terminal, via `fn_transition_service_order_status` (mesmo rigor de `maintenance_orders`, 0057) — update direto nunca muda `status`.

## 3. Consumo de material e custos — mesma decisão da Fase 16

Nenhuma tabela `project_materials`/`service_order_materials`: o consumo já fica representado em `stock_movements` (`reference_type='project'`/`'service_order'`) e `cost_movements` (`source_type` igual). `fn_consume_project_service_material` é o único caminho (`fn_post_stock_movement` + `fn_register_cost_movement`).

Custos manuais (serviço/despesa, nunca material) em **uma** tabela polimórfica `project_service_costs` (`source_type`/`source_id` = project/service_order) — em vez de duas tabelas quase idênticas (`project_costs`/`service_order_costs`), seguindo o mesmo princípio de `quality_actions` (0058) e `document_sequences` (0053). `fn_project_service_cost_summary(source_type, source_id)` soma material (de `cost_movements`) + serviço/despesa (manuais) em uma chamada.

## 4. Integração comercial — nunca automática

`fn_create_sales_quote_from_project`/`fn_create_sales_quote_from_service_order` reaproveitam `fn_create_sales_quote` (0020) sem alterá-la, só marcando `source_type`/`source_id` (coluna criada em 0054) depois de criado. Nunca geram pedido, documento fiscal ou título a receber automaticamente — cada etapa da cadeia Projeto/Serviço → Orçamento → Pedido → Fiscal → Financeiro continua exigindo uma chamada explícita do usuário.

## 5. Integração com Qualidade

`fn_create_quality_inspection_from_service_order` cria uma `quality_inspections` com `source_type='service_order'` — nunca finaliza/aprova automaticamente; o fluxo normal de inspeção (0058) continua válido a partir daí.

## 6. RBAC

| Código | Uso |
|---|---|
| `projects.view/create/update` | projetos |
| `projects.consume_materials` / `.manage_costs` / `.convert` | consumo/custo/orçamento a partir de projeto |
| `project_tasks.view/create/update` | tarefas |
| `time_entries.view/create/update` | apontamento operacional |
| `service_orders.view/create/update` | ordens de serviço |
| `service_orders.transition` / `.consume_materials` / `.manage_costs` / `.convert` | workflow/consumo/custo/orçamento |

## 7. RLS e auditoria

Cadastros (`projects`/`project_tasks`/`time_entries`): CRUD direto via `has_permission`. `service_orders`: create/update descritivo direto; `status` só via função. `project_service_costs`: select-only (escrita via função), visibilidade resolvida pela empresa do projeto/ordem de serviço referenciado (sem `company_id` próprio redundante).

## 8. API

`/api/projects` (+`/[id]`, `/sales-quote`), `/api/project-tasks` (+`/[id]`), `/api/project-task-dependencies`, `/api/time-entries`, `/api/service-orders` (+`/[id]`, `/transition`, `/quality-inspection`, `/sales-quote`), `/api/project-service/consume-material`, `/add-cost`, `/cost-summary`.

## 9. Testes e frontend

`tests/projects-services-validations.test.ts` cobre a validação Zod (incluindo o refine que exige `projectId` ou `serviceOrderId` em `time_entries`). Prevenção de ciclo no grafo de dependências, workflow, RBAC e RLS só são verificáveis contra um Postgres real. Nenhuma tela dedicada nesta rodada.
