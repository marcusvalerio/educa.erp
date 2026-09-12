# Financeiro — Fase 7

Fundação do módulo Financeiro (`supabase/migrations/0031` a `0035`),
construída sobre RLS/RBAC, Catálogo, Estoque/WMS (docs/INVENTORY.md),
Compras (docs/PURCHASING.md), Comercial (docs/COMMERCIAL.md), Logística
(docs/LOGISTICS.md) e Produção/PCP (docs/PRODUCTION.md) já existentes.

**Aviso — escopo desta etapa:** como nas fases anteriores, estas
migrations foram escritas e revisadas estaticamente, mas **não foram
aplicadas nem testadas contra um banco Postgres real** — instrução
explícita desta fase foi trabalhar apenas nos arquivos versionados do
repositório, sem tocar em nenhum projeto Supabase real (sem
`execute_sql`/`apply_migration`, especialmente não no ASTRA.ERP).

**Financeiro operacional, não contabilidade** (seções 23-24): nenhum
razão contábil, partidas dobradas, plano de contas contábil completo,
SPED, NF-e/NFC-e/NFS-e, apuração tributária ou depreciação contábil
foi implementado. Tudo aqui é o necessário para controlar obrigações,
contas e movimentações do dia a dia.

## 1. Princípio fundamental: obrigação ≠ pedido

O Financeiro registra **obrigações efetivas**, nunca pedidos (seção
4). `purchase_orders`/`sales_orders` continuam existindo exatamente
como estão — nenhuma linha deste módulo os altera. Um título nasce só
quando um **evento apropriado** acontece, sempre através de uma função
explícita, nunca automaticamente:

- **A pagar**: `fn_generate_accounts_payable_from_purchase_receipt` —
  o evento é a **confirmação** de um recebimento (0018), que já gerou
  entrada real em estoque. Um pedido de compra em aberto, por si só,
  nunca gera título.
- **A receber**: `fn_generate_accounts_receivable_from_sales_order` —
  ponte provisória até existir Faturamento (seção 22); o evento
  disponível hoje é um pedido de venda **aprovado** (não
  draft/pending_approval/cancelled).

Ambas são idempotentes: no máximo um título por documento de origem —
uma segunda chamada retorna o título já existente em vez de duplicar.

## 2. Fluxo

```
COMPRAS -> RECEBIMENTO (confirmado) -> accounts_payable -> payments
COMERCIAL -> PEDIDO APROVADO (ponte p/ faturamento futuro) -> accounts_receivable -> receipts

CAIXA/BANCOS (financial_accounts)
  -> financial_transactions (ledger)
  -> bank_reconciliations
  -> v_cash_flow_summary / v_cash_flow_projection
```

## 3. Categorias financeiras e centros de custo (migration 0031)

`financial_categories` (INCOME/EXPENSE, hierárquica via `parent_id`) e
`cost_centers` (hierárquico, sem motor de rateio) são estruturas
**"cadastro"** — mesmo padrão de `product_categories`/`work_centers`:
CRUD direto via RLS (`.view`/`.create`/`.update`, sem `.delete`
exposto), sem função dedicada. **Não são plano de contas contábil** —
só classificação operacional para relatório/filtro.

## 4. Contas financeiras (migration 0031)

`financial_accounts` representa caixa, conta bancária, carteira ou
conta digital (`type`: CASH/BANK/DIGITAL/OTHER). Duas regras
estruturais:

- **Nenhum dado bancário sensível**: sem senha, token ou credencial.
  `bank_account_masked` é texto livre para o número **já mascarado**
  (ex.: `"****1234"`) — a aplicação nunca grava o número completo ali.
- **`current_balance` é um saldo materializado, nunca editável
  diretamente** (seção 19) — mesmo princípio de `stock_balances`
  (0009): só `fn_post_financial_transaction` (0034) pode alterá-lo.
  `fn_create_financial_account` garante que `current_balance` nasce
  igual a `opening_balance`; o schema de atualização
  (`src/lib/validations/finance.ts`) **não inclui**
  `opening_balance`/`current_balance` — ficam de fora por construção
  (Zod descarta chaves desconhecidas), não por uma checagem ad-hoc no
  handler.

## 5. Contas a pagar e a receber (migrations 0032/0033)

Estruturas espelhadas (payable/receivable), cada uma com cabeçalho +
parcelas:

| Campo do cabeçalho | Papel |
|---|---|
| `original_amount` | valor original da obrigação |
| `discount`/`interest`/`penalty` | ajustes |
| `updated_amount` | `original_amount - discount + interest + penalty` — coluna **gerada**, nunca gravada diretamente |
| `status` | OPEN/PARTIALLY_PAID(RECEIVED)/PAID(RECEIVED)/OVERDUE/CANCELLED |
| `due_date` | vencimento da 1ª parcela (exibição/ordenação — a fonte real é a tabela de parcelas) |
| `origin_type`/`origin_id` | referência polimórfica (sem FK, mesmo padrão de `stock_movements.reference_id`) |

### Parcelas (seções 9/11)

`accounts_payable_installments`/`accounts_receivable_installments`:
uma obrigação à vista tem exatamente 1 parcela — **nunca um título
duplicado por parcela**. `paid_amount`/`received_amount` são sempre
**incrementais**, nunca sobrescritos (mesmo princípio aditivo de
`sales_order_items`/`production_order_materials`). Invariante
estrutural (CHECK, não só convenção): `paid_amount <= amount` /
`received_amount <= amount`.

### Duas formas de nascer, ambas via função

- **Manual**: `fn_create_accounts_payable`/`fn_create_accounts_receivable`
  — o chamador informa `original_amount` e um array de parcelas
  `[{due_date, amount}]`; a função valida que a soma das parcelas fecha
  exatamente em `updated_amount` (mesma técnica de validação de soma
  já usada em `fn_create_payment_term`, 0019 — só que em valor, não
  percentual) antes de gravar qualquer linha.
- **Gerada do evento apropriado**: `fn_generate_accounts_payable_from_purchase_receipt`/
  `fn_generate_accounts_receivable_from_sales_order` — calculam o
  valor a partir do documento de origem e, se uma `payment_terms_id`
  for informada (ou, no caso do pedido de venda, já estiver gravada em
  `sales_orders.payment_terms_id`, 0021), usam
  `payment_term_installments` (0019) para parcelar — **reaproveitada,
  nenhuma estrutura paralela de "condição de pagamento"**. Sem
  condição informada, gera 1 parcela à vista.

`purchase_orders` nunca recebeu uma coluna `payment_terms_id` (Compras
não foi alterado nesta etapa, "não alterar desnecessariamente") —
por isso `fn_generate_accounts_payable_from_purchase_receipt` exige a
condição como parâmetro explícito quando parcelamento é necessário,
diferente da função de contas a receber, que tem o fallback do pedido.

### Valor da obrigação gerada a partir de Compras

`fn_generate_accounts_payable_from_purchase_receipt` calcula
`original_amount = soma(accepted_quantity × unit_price)` dos itens do
recebimento — o que foi **de fato aceito**, não o total do pedido.
Recebimento parcial gera obrigação parcial, consistente com o restante
do sistema ("recebimento parcial é o caminho normal").

### Status, vencimento e cancelamento (seções 16/26)

`fn_recompute_payable_status`/`fn_recompute_receivable_status`
(internas, nunca expostas) recalculam o status do cabeçalho a partir
das parcelas, com prioridade: CANCELLED (tudo cancelado) > PAID/RECEIVED
(tudo pago/recebido) > OVERDUE (alguma parcela vencida não liquidada) >
PARTIALLY_PAID/RECEIVED (algo já liquidado) > OPEN.

`fn_refresh_overdue_payables`/`fn_refresh_overdue_receivables`
avançam OPEN/PARTIALLY_PAID(RECEIVED) → OVERDUE quando `due_date <
hoje` — **só avançam, nunca revertem** (não há função de edição de
vencimento nesta etapa, então a transição é sempre consistente, nunca
contraditória, seção 16). Expostas via
`POST /api/accounts-payable/refresh-overdue` e equivalente para
receivable.

`fn_cancel_accounts_payable`/`fn_cancel_accounts_receivable`: nunca
apagam (seção 26) — cancelam o cabeçalho e toda parcela **ainda não
paga**; parcelas já pagas permanecem PAID/RECEIVED, histórico
preservado. Um título CANCELLED nunca mais aceita pagamento/recebimento
(guarda em `fn_pay_installment`/`fn_receive_installment`).

## 6. Movimentações, pagamentos e recebimentos (migration 0034)

### O ledger

`financial_transactions` é um ledger **imutável** (insert-only, igual
a `stock_movements`). `fn_post_financial_transaction` é a **única**
função que escreve `financial_accounts.current_balance` — trava a
linha da conta (`for update`) antes de aplicar o delta (CREDIT = +,
DEBIT = -), com o mesmo tratamento de `idempotency_key` e corrida de
`unique_violation` que `fn_post_stock_movement` (0009) já usa. Não é
exposta diretamente (revoke sem grant) — só chamável internamente por
`fn_pay_installment`/`fn_receive_installment`/`fn_reverse_payment`/
`fn_reverse_receipt`/`fn_create_manual_financial_transaction`.

### Pagamento e recebimento (seções 12-15/28)

`fn_pay_installment`/`fn_receive_installment`: trava a parcela e o
cabeçalho (`for update`) antes de validar
`valor <= saldo_da_parcela` — fecha a mesma janela de corrida que
`fn_post_stock_movement` já fecha para `stock_balances`: dois
pagamentos concorrentes de R$ 700 contra uma parcela de R$ 1.000 nunca
registram R$ 1.400 (exemplo literal da seção 28). `payments`/`receipts`
nunca armazenam `payable_id`/`receivable_id` diretamente — sempre
derivável via `installment_id` (evita duplicar a referência).
`reference` é só um ponteiro de texto para o comprovante, nenhum
armazenamento de arquivo (mesmo padrão de
`delivery_events.pod_reference`, Logística 0025).

### Estorno (seção 25)

`fn_reverse_payment`/`fn_reverse_receipt`: a movimentação original
**nunca é apagada ou alterada** — grava um lançamento inverso
(CREDIT devolvendo o valor para um pagamento estornado, DEBIT
retirando para um recebimento estornado) e marca o
pagamento/recebimento como `REVERSED`. A parcela tem
`paid_amount`/`received_amount` decrementado de volta e seu status
recalculado (pode voltar a OPEN/PARTIALLY_PAID). Idempotente: com
`idempotency_key`, uma segunda chamada retorna o resultado já aplicado;
sem chave, uma segunda tentativa falha claramente ("já estornado"),
nunca duplica o estorno.

### Movimentação manual

`fn_create_manual_financial_transaction`: único uso direto de
`financial_transactions.create` fora do fluxo de título — para
lançamentos de conta não ligados a um pagamento/recebimento (ex.: taxa
bancária, depósito de caixa).

### `payments.cancel`/`receipts.cancel` — permissão seedada, sem função

Toda `payments`/`receipts` nasce `CONFIRMED` — não existe um estado
pendente anterior a "cancelar" nesta etapa; a única mutação possível
de um registro já histórico é o estorno (`.reverse`). As permissões
`.cancel` foram seedadas (pedido explícito da seção 31) mas
deliberadamente não têm função associada — mesmo precedente de
`deliveries.update` (Logística, 0025): documentado em vez de inventar
um workflow só para preenchê-las.

## 7. Conciliação bancária (migration 0035)

`bank_reconciliations` (por conta + período) +
`bank_reconciliation_items` (um item por `financial_transaction`
dentro do período, auto-populado por `fn_create_bank_reconciliation`
no momento da criação). `fn_set_reconciliation_item_status` marca cada
item `reconciled`/`unreconciled`/`divergent`. `fn_complete_bank_reconciliation`
fecha a conciliação (reaproveita `bank_reconciliation.update`, sem
permissão `.complete` dedicada — mesmo espírito de
`fn_complete_shipment`). **Nenhuma integração com API bancária** nesta
etapa (seção 20) — quando um extrato real existir, ele será casado
contra `financial_transactions` através desta mesma estrutura.

## 8. Fluxo de caixa (migration 0035)

**Não é um campo "saldo projetado" mutável** (seção 17) — é sempre
calculável a partir de dados já existentes, por isso modelado como
**views**, nunca uma tabela armazenando um número:

- `v_cash_flow_summary`: por empresa, `current_balance_total` (soma de
  `financial_accounts.current_balance` ativas) +
  `open_receivable_total` (soma do saldo aberto de parcelas a
  receber) + `open_payable_total` (soma do saldo aberto de parcelas a
  pagar). `projected_balance = current_balance_total +
  open_receivable_total - open_payable_total` é calculado pelo
  chamador (API/frontend futuro), não armazenado — exatamente o
  exemplo da seção 17 (10.000 + 20.000 − 12.000 = 18.000).
- `v_cash_flow_projection`: série por `due_date`, direção
  INFLOW/OUTFLOW, valor em aberto — a granularidade temporal que
  permite um saldo projetado dia a dia, não só um agregado total.

Lidas via `GET /api/cash-flow-summary`/`GET /api/cash-flow-projection`
com o cliente admin (mesmo padrão de leitura "cadastro" — permissão
checada na API, igual a qualquer outra leitura agregada).

## 9. Precisão monetária e moeda (seções 29-30)

Todo valor monetário é `numeric(16, 4)` — **nunca FLOAT**, em toda
tabela nova deste módulo. Nenhum cálculo monetário crítico acontece em
JavaScript: somas, deltas de saldo e validação de soma de parcelas são
sempre feitos dentro das funções PL/pgSQL. `financial_accounts.currency_code`
(padrão `'BRL'`) prepara múltipla moeda — nenhum motor de câmbio
implementado.

## 10. RBAC

| Código | Uso |
|---|---|
| `financial_categories.view/create/update` | categorias |
| `cost_centers.view/create/update` | centros de custo |
| `financial_accounts.view/create/update` | contas financeiras — `.update` nunca toca saldo (fora do schema) |
| `accounts_payable.view/create/update/approve/cancel` | títulos a pagar — `.create` é manual; `.approve` é a geração a partir de um recebimento confirmado (evento apropriado, seção 21); `.update` só campos não-financeiros |
| `accounts_receivable.view/create/update/approve/cancel` | espelha accounts_payable; `.approve` é a geração a partir de um pedido aprovado |
| `payments.view/create/reverse` (+ `.cancel` seedada, sem função — §6) | pagamentos |
| `receipts.view/create/reverse` (+ `.cancel` seedada, sem função — §6) | recebimentos |
| `financial_transactions.view/create` | ledger — `.create` só para lançamento manual (pagamento/recebimento usam a permissão do título) |
| `bank_reconciliation.view/create/update` | conciliação — `.update` cobre ajustar itens E concluir |

Todas usam o sufixo `.view`/`.create`/`.update`/... (não `.read`)
porque todo o Financeiro tem handlers dedicados
(`src/lib/api/finance-handlers.ts`), sem o hardcode de `${modulo}.read`
do factory genérico — mesma distinção já presente em todos os módulos
anteriores. Todas propagadas para os 3 papéis padrão via
`fn_seed_company_rbac`.

## 11. RLS, auditoria, concorrência, idempotência

- **RLS**: `financial_categories`/`cost_centers` têm CRUD completo
  (select/insert/update) via `has_permission` direto — mesmo padrão de
  `work_centers`/`product_categories`. `financial_accounts` tem
  select+update direto (sem insert — exclusivo de
  `fn_create_financial_account`, que garante `current_balance`
  correto desde a primeira linha). Todas as demais (9 tabelas
  transacionais) só têm `select` — toda escrita via função `SECURITY
  DEFINER`.
- **Auditoria**: reaproveita `audit_logs` (0003), vocabulário ampliado
  em 0031 com `PAY`/`REVERSE`/`RECONCILE` (`RECEIVE` já existia desde
  0017, reaproveitado aqui para recebimento financeiro — mesma palavra,
  mesmo conceito de "dinheiro/mercadoria entrando").
- **Concorrência**: `fn_pay_installment`/`fn_receive_installment`/
  `fn_reverse_payment`/`fn_reverse_receipt`/`fn_cancel_accounts_payable`/
  `fn_cancel_accounts_receivable` travam (`for update`) a parcela e o
  cabeçalho antes de validar e alterar — mesma técnica de
  `fn_confirm_purchase_receipt` (0018) e `fn_ship_shipment` (0024).
  `fn_post_financial_transaction` trava a conta antes do delta — mesmo
  princípio de `fn_post_stock_movement` (0009).
- **Idempotência**: guarda de status em toda transição + `idempotency_key`
  explícita em toda função com efeito colateral em saldo, com
  short-circuit **antes** de qualquer efeito (não só dentro de
  `fn_post_financial_transaction`) — mesma técnica adotada em Produção
  (0029) para não duplicar incrementos de quantidade quando só o
  movimento de estoque/saldo tinha proteção própria. Cobre
  especificamente os casos citados na seção 27: criação de título,
  criação de parcela (implícita na criação do título), pagamento,
  recebimento, estorno, movimentação financeira.

## 12. Integração com os módulos existentes

- **Compras**: `fn_generate_accounts_payable_from_purchase_receipt`
  lê `purchase_receipts`/`purchase_receipt_items`/`purchase_order_items`
  (somente leitura) — nenhuma coluna ou tabela de Compras foi alterada.
- **Comercial**: `fn_generate_accounts_receivable_from_sales_order` lê
  `sales_orders` (somente leitura, incluindo o `payment_terms_id` já
  existente) — nenhuma coluna ou tabela de Comercial foi alterada.
- **Estoque**: nenhuma integração direta — o evento de origem
  (confirmação de recebimento) já passou por `fn_post_stock_movement`
  antes de chegar ao Financeiro; este módulo nunca toca
  `stock_balances`/`stock_movements`.
- **Fiscal/Faturamento futuro** (seção 22): `accounts_receivable`
  aceita `document_reference` livre e a função de geração já está
  pronta para ser re-apontada para um evento de fatura confirmada
  quando esse módulo existir — só o gatilho muda, a estrutura não.
- **Contabilidade futura** (seção 24): `financial_categories`/
  `cost_centers`/`financial_transactions` já carregam os dados que uma
  futura integração contábil (razão, partidas dobradas) precisaria
  ler — nenhuma estrutura contábil foi criada aqui.

## 13. API

`/api/financial-categories` (+`/[id]`), `/api/cost-centers` (+`/[id]`),
`/api/financial-accounts` (+`/[id]`).

`/api/accounts-payable` (filtrável por `?status=`/`?supplierId=`,
+`/[id]`, `/[id]/cancel`, `/refresh-overdue`),
`/api/purchase-receipts/[id]/generate-payable`,
`/api/accounts-payable-installments` (filtrável por `?payableId=`,
+`/[id]/pay`).

`/api/accounts-receivable` (filtrável por `?status=`/`?customerId=`,
+`/[id]`, `/[id]/cancel`, `/refresh-overdue`),
`/api/sales-orders/[id]/generate-receivable`,
`/api/accounts-receivable-installments` (filtrável por
`?receivableId=`, +`/[id]/receive`).

`/api/payments` (filtrável por `?installmentId=`, +`/[id]/reverse`),
`/api/receipts` (filtrável por `?installmentId=`, +`/[id]/reverse`),
`/api/financial-transactions` (filtrável por `?financialAccountId=`).

`/api/bank-reconciliations` (filtrável por `?financialAccountId=`,
+`/[id]`, `/[id]/complete`), `/api/bank-reconciliation-items/[id]`.

`/api/cash-flow-summary`, `/api/cash-flow-projection`.

## 14. Testes e frontend

Testes desta etapa cobrem a camada de validação Zod
(`src/lib/validations/finance.ts`). A lógica transacional real (soma
de parcelas fechando exatamente no valor atualizado, bloqueio de
pagamento/recebimento acima do saldo, concorrência sob `for update`,
idempotência de ponta a ponta, recálculo de status, estorno revertendo
o saldo corretamente, RBAC, isolamento por empresa) vive nas funções
SQL e só é verificável contra um Postgres real, fora do alcance desta
etapa (ver aviso no topo e `tests/finance-validations.test.ts` para o
detalhamento de quais dos 30 cenários pedidos não são testáveis sem
banco). Nenhuma tela nova — banco de dados, backend, domínio,
workflow, segurança, integrações, testes e documentação, como pedido;
frontend fica para uma etapa futura (v0).
