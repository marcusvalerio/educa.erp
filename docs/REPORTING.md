# Relatórios / BI Operacional — Fase 12

Camada de relatórios e indicadores (`supabase/migrations/0048`), construída sobre Controladoria (Fase 11) e todos os módulos operacionais já existentes.

**Aviso — escopo desta etapa:** como em todas as fases anteriores, esta migration foi escrita e revisada estaticamente, mas **não foi aplicada nem testada contra um banco Postgres real**.

## 1. Princípio (seção 12.1)

Relatórios consultam fontes confiáveis — nunca fabricam número. Quando não há dado, o valor aparece como `0`/`null`, nunca um "número demonstrativo". Nenhum KPI foi inventado (ex.: SLA de entrega — seção 12.8 — só existiria se o sistema tivesse SLA configurado, o que não é o caso hoje).

## 2. Por que não existe `report_definitions` (seção 12.2)

O enunciado pede a tabela "somente se realmente necessária". Esta fase entrega um conjunto **fixo e conhecido** de 8 dashboards (executivo, comercial, estoque, compras, produção, logístico, financeiro, fiscal) — não um catálogo dinâmico configurável pelo usuário. Criar `report_definitions` agora seria abstração sem uso real (seção 12.2: "evitar sistema de BI genérico abstrato"). Se um catálogo dinâmico for genuinamente necessário no futuro (ex.: usuário definindo seus próprios relatórios), essa é a hora de criá-lo — não antes.

## 3. Arquitetura: funções parametrizadas, não tabelas (seção 12.14)

Cada dashboard é uma função SQL `fn_report_*(company_id, period_start, period_end)` retornando uma única linha com colunas nomeadas (mesmo padrão de `v_cash_flow_summary`, só que parametrizada por período — por isso função, não view simples). Nenhuma materialized view foi criada nesta fase — os volumes agregados (contagens/somas por empresa+período) são baratos o bastante para calcular sob demanda; se um dashboard específico se mostrar pesado no futuro, materializar com uma estratégia de refresh explícita é a evolução natural, não um padrão aplicado a priori.

Relatórios OPERACIONAIS de **lista** (pedidos, recebimentos, expedições, documentos fiscais, movimentações de estoque...) **já existem** como APIs de listagem com filtro desde as fases anteriores (`GET /api/purchase-orders`, `/api/shipments`, `/api/fiscal-documents`, `/api/stock-movements` etc.) — não duplicados aqui (seção 12.11).

## 4. Dashboards (seções 12.3-12.10)

| Dashboard | Função | Indicadores |
|---|---|---|
| Executivo | `fn_report_executive` | receita bruta/líquida, margem bruta %, CMV, despesas operacionais, resultado gerencial, contas a receber/pagar em aberto, caixa, valor de estoque, pedidos/expedições/ordens de produção em aberto |
| Comercial | `fn_report_commercial` | pedidos, valor, ticket médio, clientes, cancelados, pendentes, conversão de orçamento (quando há orçamentos no período) |
| Estoque | `fn_report_inventory` | quantidade/valor total (via `inventory_valuation`), entradas/saídas/transferências/ajustes no período, reservas ativas, produtos sem giro (saldo positivo sem nenhum ISSUE no período) |
| Compras | `fn_report_purchases` | solicitações, pedidos, valor comprado, recebimentos, valor recebido, itens divergentes, fornecedores distintos |
| Produção | `fn_report_production` | ordens por status, quantidade produzida, custo de material consumido (Fase 10), quantidade de scrap |
| Logístico | `fn_report_logistics` | expedições por status, entregas concluídas/falhas (via `delivery_events`), listas de separação, lead time médio (só quando `shipped_at` existe — nenhum SLA inventado) |
| Financeiro | `fn_report_finance` | reaproveita `v_cash_flow_summary` (Financeiro 0035) + recebido/pago no período + vencidos |
| Fiscal | `fn_report_fiscal` | documentos por direção/status, impostos destacados (só de documentos AUTHORIZED) |

## 5. Filtros (seção 12.12)

Todos os dashboards exigem `periodStart`/`periodEnd` (o único filtro universalmente aplicável e com base real em toda fonte). Filtros adicionais (produto/cliente/fornecedor/armazém) já existem nas APIs de listagem correspondentes (seção 3) — não duplicados aqui; um filtro por `?productId=`/`?customerId=` num dashboard agregado exigiria redesenhar cada função para aceitar filtros opcionais, o que fica como evolução natural quando um caso de uso concreto pedir.

## 6. Paginação (seção 12.13)

Não aplicável às funções desta migration — cada uma retorna exatamente uma linha (agregados). Relatórios de lista (seção 3) já paginam nas próprias rotas de listagem existentes.

## 7. Datas (seção 12.15)

Cada função documenta explicitamente qual campo de data usa como "data do indicador" (nunca uma mistura tácita de `created_at`/`due_date`/`paid_at`):

| Fonte | Campo usado |
|---|---|
| `accounts_receivable`/`accounts_payable` | `issue_date` (competência) |
| `cost_movements` | `created_at` |
| `stock_movements` | `created_at` |
| `purchase_requests` | `requested_at` |
| `purchase_orders` | `issued_at` |
| `purchase_receipts` | `received_at` |
| `sales_orders`/`sales_quotes` | `order_date`/`issued_at` |
| `production_orders`/`production_scrap` | `created_at`/`occurred_at` |
| `shipments`/`delivery_events` | `created_at`/`occurred_at` |
| `fiscal_documents` | `issue_date` |
| `receipts`/`payments` | `received_at`/`paid_at` |

## 8. Segurança (seções 12.19-12.21)

RBAC checado **dentro** de cada função (`has_permission`), não só na API — mesmo padrão da Controladoria (Fase 11). RLS nas tabelas de origem já garante isolamento por `company_id`; as funções sempre recebem e usam `p_company_id` do contexto autenticado (nunca aceito do cliente sem checar a permissão correspondente). Nenhum payload interno desnecessário é retornado — cada função devolve só as colunas do indicador.

## 9. Exportação (seção 12.17)

Não implementada nesta fase — `reports.export` é uma permissão reservada (seguindo o mesmo precedente de `payments.cancel`/`receipts.cancel`, Financeiro 0034): documentada, sem gerador de CSV/XLSX/PDF construído ainda. As APIs retornam JSON estruturado (uma linha por dashboard) que já serve de base para uma exportação futura sem precisar de redesenho.

## 10. RBAC

| Código | Uso |
|---|---|
| `reports.view` | dashboard executivo |
| `reports.export` | reservado (seção 9) |
| `commercial_reports.view` | dashboard comercial |
| `inventory_reports.view` | dashboard de estoque |
| `purchase_reports.view` | dashboard de compras |
| `production_reports.view` | dashboard de produção |
| `logistics_reports.view` | dashboard logístico |
| `financial_reports.view` | dashboard financeiro |
| `fiscal_reports.view` | dashboard fiscal |

`controlling_reports.view` (citada como exemplo na seção 12.19) não foi criada: os relatórios de controladoria (DRE, margens, resultado por centro) já exigem `controlling.view` (Fase 11) — uma segunda permissão para a mesma leitura duplicaria RBAC sem necessidade.

## 11. RLS

Nenhuma tabela nova nesta fase — RLS já garantida pelas tabelas de origem (Fases 1-11). As funções desta migration são `SECURITY DEFINER` com `search_path` fixo (`public, pg_temp`) e checam `has_permission(p_company_id, ...)` antes de qualquer leitura.

## 12. Performance

Índices relevantes (por `company_id` + status/data) já existem em todas as tabelas de origem desde suas fases originais — nenhum índice novo foi necessário para estas agregações. Nenhuma materialized view criada (seção 3).

## 13. Testes e frontend

`tests/reporting-validations.test.ts` cobre a camada de validação Zod compartilhada (`periodRangeQuerySchema`, `src/lib/validations/controlling.ts`) usada por todos os endpoints de relatório. A agregação real (contagens/somas corretas, isolamento por empresa, RBAC, dados vazios, dashboards refletindo fontes reais) vive nas funções SQL e só é verificável contra um Postgres real, fora do alcance desta etapa. Nenhuma tela/dashboard visual construído — só a camada de dados/API para um futuro frontend (v0) consumir.
