# Workflow + Aprovações — Fase 20

Motor genérico e reutilizável de workflow/aprovações (`supabase/migrations/0060-0061`), construído sobre RBAC (`users`/`roles`/`user_roles`, 0005) e o padrão polimórfico já usado por `stock_movements.reference_id`/`fiscal_documents.source_id` — o motor nunca conhece Sales Order, Purchase Order ou qualquer outra tabela de negócio, só `entity_type`/`entity_id`.

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 0. Por que um motor único, não um sistema por módulo

Qualquer entidade (Sales Order, Purchase Order, Financial Payable, Production Order, Stock Adjustment, Service Order, Project, ou qualquer módulo futuro) usa exatamente as mesmas 10 tabelas e as mesmas funções — o que muda entre um módulo e outro é só o `code`/`entity_type` do workflow e o `entity_snapshot` enviado em `fn_start_workflow`.

## 1. Definição (0060): workflow → versão → etapas → aprovadores → regras

`workflows` (cabeçalho, `code` único por empresa, `entity_type` polimórfico) → `workflow_versions` (versionamento: só uma `PUBLISHED` por vez; `DRAFT` é editável, `PUBLISHED` é congelada — uma mudança estrutural exige `fn_create_workflow_version` para uma nova versão, nunca edita a antiga) → `workflow_steps` (ordem, tipo, `approval_policy` ALL/ANY/QUORUM, `sla_hours`, `require_justification_on_reject`) → `workflow_step_approvers` (USER direto ou ROLE — nunca uma estrutura de funcionário, sempre RBAC existente) → `workflow_rules` (condições de alçada: `attribute`/`operator`/`value` avaliados contra o `entity_snapshot` da instância; sem regras = etapa sempre aplicável — múltiplas regras na mesma etapa = AND).

Alçada por valor (seção 20.6 do pedido) é modelada com 3 etapas na mesma versão, cada uma com uma regra sobre o mesmo atributo (`amount<=1000` / `amount>1000 and amount<=10000` — duas regras na etapa = AND — / `amount>10000`); `fn_start_workflow` materializa só a(s) etapa(s) cujas regras casam com o snapshot enviado.

## 2. Execução (0061): instância → etapas materializadas → aprovações → decisões → histórico

`fn_start_workflow(company_id, entity_type, entity_id, entity_snapshot, workflow_code?)` — ponto de entrada **explícito**, nunca disparado por trigger em tabela de negócio (seção 20.13/20.14: "o comportamento deve depender de configuração/evento explícito"). Resolve o workflow ativo publicado (por código ou por `entity_type`, erro se ambíguo), é **idempotente por entidade em aberto** (reenviar a mesma entidade com uma instância `PENDING`/`IN_PROGRESS` já existente devolve a existente, nunca duplica — reforçado por índice único parcial), filtra as etapas aplicáveis pelas `workflow_rules`, materializa a primeira etapa como `IN_PROGRESS` e suas `approvals` a partir de `workflow_step_approvers`.

`fn_decide_approval(approval_id, decision, justification?)` é o núcleo transacional: trava `workflow_instance_steps` (`FOR UPDATE`) antes de ler/escrever qualquer contador — duas decisões concorrentes na mesma etapa serializam nesta trava (seção 20.9/20.14), nunca produzem uma contagem perdida. Valida elegibilidade do aprovador (USER direto ou qualquer usuário com o ROLE atribuído, via `user_roles`), exige justificativa em `REJECTED` quando a etapa configura isso, grava a decisão em `approval_decisions`, recalcula `received_approvals` e:

- `REJECTED` → rejeita a etapa e a instância imediatamente (comportamento conservador e documentado: uma rejeição de qualquer aprovador elegível encerra a etapa, independentemente da política ALL/ANY/QUORUM).
- `RETURNED` → retorna a instância para correção (status `RETURNED`, workflow finalizado; reenvio é uma nova chamada a `fn_start_workflow`, não uma edição em andamento).
- `APPROVED` parcial (recebidas < exigidas) → etapa continua `IN_PROGRESS`, aguardando mais decisões.
- `APPROVED` completo (recebidas ≥ exigidas pela política ALL/ANY/QUORUM) → etapa `APPROVED`; se houver próxima etapa aplicável, avança e materializa suas `approvals`; senão, finaliza a instância como `APPROVED`.

`fn_cancel_workflow_instance` cancela uma instância `PENDING`/`IN_PROGRESS` (nunca uma já finalizada). `approval_history` é um ledger append-only de todos os eventos (`STARTED`/`STEP_ADVANCED`/`APPROVED`/`REJECTED`/`RETURNED`/`CANCELLED`/`FINISHED`) — mesmo padrão de `fiscal_document_events`.

## 3. SLA

`workflow_steps.sla_hours` + `workflow_instance_steps.due_at` (calculado quando a etapa vira `IN_PROGRESS`) preparam o prazo por etapa — nenhuma notificação automática implementada nesta fase (estrutura pronta para uma fase futura de notificações, seção 20.12).

## 4. Integrações

Nenhum módulo é ativado automaticamente. Um módulo que quiser aprovação chama `fn_start_workflow` explicitamente (ex.: no handler de "enviar para aprovação" de Pedido de Venda) e registra o `entity_type` correspondente (`sales_order`, `purchase_order`, `financial_payable`, `financial_receivable`, `production_order`, `stock_adjustment`, `service_order`, `project`, ou qualquer outro) em um `workflows.code` cadastrado. Nesta fase, nenhum desses módulos foi alterado para chamar o motor automaticamente — a integração fica pronta e testável via API, disparada explicitamente.

## 5. RBAC

| Código | Uso |
|---|---|
| `workflow.view` | consultar workflows, versões, etapas, instâncias, histórico, pendências |
| `workflow.create` / `.update` | criar workflow / editar nome-descrição |
| `workflow.activate` | ativar/desativar um workflow |
| `workflow.admin` | criar versão, adicionar etapa/aprovador/regra, publicar versão |
| `workflow.execute` | iniciar uma instância (`fn_start_workflow`) |
| `workflow.approve` | decidir APPROVED/RETURNED |
| `workflow.reject` | decidir REJECTED |
| `workflow.cancel` | cancelar uma instância em andamento |

## 6. RLS e auditoria

Todas as 10 tabelas são select-only via RLS (`has_permission(company_id, 'workflow.view')`); toda escrita passa por função `SECURITY DEFINER`. `workflows`/`workflow_instances` geram `audit_logs`; `approval_history` é o ledger detalhado próprio do domínio.

## 7. API

`/api/workflows` (+`/[id]`, `/[id]/status`, `/[id]/versions`), `/api/workflow-versions/[id]/publish`, `/api/workflow-versions/[id]/steps`, `/api/workflow-steps/[id]/approvers`, `/api/workflow-steps/[id]/rules`, `/api/workflow-instances` (+`/[id]`, `/[id]/cancel`), `/api/approvals/[id]/decide`, `/api/approvals/pending`.

## 8. Pendências (nada escondido)

- Nenhum módulo existente (Comercial/Compras/Financeiro/etc.) foi alterado para **chamar** `fn_start_workflow` automaticamente — por instrução explícita ("não ativar workflow automaticamente em todas as entidades"). A integração é uma chamada de API disponível, não uma automação ligada.
- Notificação de SLA vencido: só o campo `due_at` existe; nenhum job/e-mail/push foi implementado (fora de escopo desta fase, estrutura preparada).
- Frontend: nenhuma tela nova nesta fase (instrução explícita da Fase 20-22: não reformular a UI da Fase 19). A API está completa e pronta para uma tela de "Minhas aprovações"/"Workflows" futura, reaproveitando o Design System existente.
