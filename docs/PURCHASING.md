# Compras / Suprimentos — Fase 3

Fundação do ciclo de Compras (`supabase/migrations/0014` a `0018`),
construída sobre RLS/RBAC (docs/RBAC.md), Catálogo (docs/CATALOGO.md se
existir) e Estoque/WMS (docs/INVENTORY.md) já existentes.

**Aviso — escopo desta etapa:** como nas fases anteriores de Estoque,
estas migrations foram escritas e revisadas estaticamente, mas **não
foram aplicadas nem testadas contra um banco Postgres real** — instrução
explícita desta fase foi trabalhar apenas nos arquivos versionados do
repositório `marcusvalerio/educa.erp`, sem tocar em nenhum projeto
Supabase (nenhum `execute_sql`/`apply_migration`, especialmente não no
ASTRA.ERP). Antes de considerar este domínio pronto para uso, uma etapa
seguinte precisa aplicar 0014-0018 a um projeto real, rodar
`get_advisors`, e repetir a técnica de teste empírico com sessão
simulada usada nas fases anteriores.

## 1. Fluxo

```
NECESSIDADE
  ↓
SOLICITAÇÃO DE COMPRA (purchase_requests)
  ↓
COTAÇÃO (purchase_quotes)              — opcional, comparação de fornecedores
  ↓
PEDIDO DE COMPRA (purchase_orders)
  ↓
RECEBIMENTO (purchase_receipts)        — pode haver vários por pedido
  ↓
CONFERÊNCIA                            — dentro do próprio recebimento
  ↓
fn_confirm_purchase_receipt
  ↓
ESTOQUE (purpose = STOCK)  ou  ALMOXARIFADO OPERACIONAL (purpose = OPERATIONAL_WAREHOUSE)
```

Cotação é opcional — um Pedido de Compra pode referenciar uma
`purchase_request_id`/`purchase_quote_id` ou nenhuma das duas
(compra direta).

## 2. Princípio fundamental: Compras não tem estoque próprio

Nenhuma tabela deste módulo é uma fonte de saldo. O saldo continua
sendo **exclusivamente** `stock_balances`, alterado **exclusivamente**
por `public.fn_post_stock_movement` (docs/INVENTORY.md §1). Compras
toca nisso em **um único lugar**: `fn_confirm_purchase_receipt`
(0018) — nenhuma outra função deste módulo insere, atualiza ou lê
`stock_balances`/`stock_movements` diretamente.

O destino de um recebimento (`purchase_receipt_items.destination_location_id`)
é qualquer `warehouse_locations` existente — **nenhuma tabela nova foi
criada para representar "estoque de compras" vs "almoxarifado de
compras"**. Se o local escolhido tem `purpose = 'STOCK'`, o material
entra no Estoque; se `purpose = 'OPERATIONAL_WAREHOUSE'`, entra no
Almoxarifado Operacional (docs/INVENTORY.md §6). A mesma infraestrutura,
o mesmo ledger, a mesma função — só o local escolhido muda.

## 3. Solicitação de Compra (`purchase_requests`, migration 0014)

Necessidade interna de aquisição (matéria-prima, componente, insumo,
produto para revenda, material operacional, reposição de estoque).

**Workflow**: `draft → requested → approved → rejected | cancelled`,
depois `approved → partially_ordered → ordered → completed` (avançado
automaticamente por `fn_sync_purchase_request_status`, chamada pelas
migrations 0016/0018 quando pedidos são criados/recebidos referenciando
a solicitação — compara `quantity_approved` agregado por item contra o
agregado de `ordered_quantity`/`received_quantity` dos pedidos ligados).

`quantity_approved` é registrada por item (não só um total) —
`fn_approve_purchase_request` aceita aprovação parcial por item.

Funções: `fn_create_purchase_request` (`purchase_requests.create`),
`fn_submit_purchase_request` (`.update`), `fn_approve_purchase_request`/
`fn_reject_purchase_request` (`.approve`), `fn_cancel_purchase_request`
(`.update`).

## 4. Cotação / RFQ (`purchase_quotes`, migration 0015)

Três níveis:

- `purchase_quotes` — a cotação em si, opcionalmente ligada a uma
  `purchase_request_id`.
- `purchase_quote_suppliers` — **uma proposta por fornecedor
  convidado**. Frete, prazo de entrega, condição de pagamento e
  validade são campos da proposta (por fornecedor), não da cotação.
- `purchase_quote_items` — preço por produto **dentro da proposta de
  um fornecedor específico** (`quote_supplier_id`) — é isso que
  permite comparar fornecedor A vs B para o mesmo produto lado a lado.

`fn_select_purchase_quote_supplier` encerra a cotação: o vencedor vira
`selected`, as demais propostas respondidas viram `rejected`, a cotação
vira `closed`. O Pedido de Compra criado depois referencia
`purchase_quote_id` para rastreabilidade — a conversão cotação → pedido
não é automática nesta etapa (o usuário cria o pedido manualmente,
informando os itens/preços da proposta vencedora).

## 5. Pedido de Compra (`purchase_orders`, migration 0016)

**Workflow**: `draft → pending_approval → approved → sent →
partially_received → received → closed`, mais `cancelled` (de qualquer
estado antes de totalmente recebido).

`purchase_order_items` mantém três quantidades **separadas**, nunca só
uma "quantidade restante": `ordered_quantity`, `received_quantity`,
`cancelled_quantity`. Pendente = `ordered - received - cancelled`,
sempre calculado, nunca armazenado. Um `CHECK` de banco
(`purchase_order_items_received_within_ordered`) garante
`received_quantity + cancelled_quantity <= ordered_quantity` — "recebido
> pedido" é estruturalmente impossível, não só uma validação de
aplicação.

`total_amount` é **sempre derivado** — dois triggers
(`fn_recalculate_purchase_order_total` em `purchase_order_items`, e a
variante `_on_header` quando `freight_cost`/`discount` do cabeçalho
mudam) recalculam `sum(line_total) + freight_cost - discount` a cada
mudança. Nunca é gravado diretamente pela API.

### Cancelamento parcial

`fn_cancel_purchase_order` não é um cancelamento cego. Cancela apenas o
que ainda está **pendente** em cada item
(`cancelled_quantity = ordered_quantity - received_quantity`). Se nada
foi recebido em nenhum item, o pedido inteiro vira `cancelled`. Se algo
já foi recebido, o restante pendente é cancelado e o pedido vira
`closed` — está tudo contabilizado (recebido + cancelado = pedido), não
`cancelled`, que implicaria que nada chegou a ser recebido.

## 6. Recebimento (`purchase_receipts`, migration 0018)

Onde Compras finalmente encosta em Estoque — e **somente** aqui (§2).

### Recebimento parcial (obrigatório)

Um Pedido de Compra pode ter vários recebimentos. Cada confirmação
**soma** em `purchase_order_items.received_quantity` (nunca substitui).
Exemplo do pedido de 100 unidades: recebimento 1 confirma 40
(`received_quantity` vira 40, pedido `partially_received`), recebimento
2 confirma 30 (`received_quantity` vira 70, ainda `partially_received`),
recebimento 3 confirma 30 (`received_quantity` vira 100, pedido
`received`).

### Conferência e divergência

Cada `purchase_receipt_items` distingue explicitamente:

| Campo | Representa |
|---|---|
| `quantity_received` | PEDIDO vs o que fisicamente chegou (RECEBIDO) |
| `conference_status` (`pending`/`matched`/`divergent`) | resultado da CONFERÊNCIA |
| `accepted_quantity` | ACEITO — o que efetivamente entra em estoque |
| `rejected_quantity` | REJEITADO — fica de fora, nunca vira `stock_movements` |
| `divergence_type` (`none`/`quantity`/`product`/`lot`/`expiration`/`quality`/`other`) | natureza da divergência |

`fn_create_purchase_receipt` já calcula `divergence_type`/
`conference_status` automaticamente (produto recebido ≠ produto pedido
→ `product`; quantidade recebida > pendente do pedido → `quantity`;
caso contrário `none`/`matched`), com `accepted_quantity` default
= `least(quantity_received, pendente)` — mas tudo pode ser revisado
antes de confirmar via `fn_update_purchase_receipt_item`
(`purchase_receipts.update`, só em recebimento `draft`).

Exemplos do pedido do adendo — todos representáveis:
- Pedido 100, recebido 95 → item com `quantity_received=95`,
  `divergence_type='none'` (95 ≤ pendente), `accepted_quantity=95`.
- Pedido Produto A, recebido Produto B → `divergence_type='product'`,
  `conference_status='divergent'` — decisão de aceitar/rejeitar fica
  para quem revisa antes de confirmar.
- Quantidade correta, lote divergente → `lot_number`/`lot_id`
  registrados como chegaram; `divergence_type='lot'` setável
  manualmente via `fn_update_purchase_receipt_item`.
- Validade inadequada → mesmo padrão, `divergence_type='expiration'`.

### Confirmação — transacional, com concorrência e idempotência

`fn_confirm_purchase_receipt` (`purchase_receipts.confirm`) é a única
operação verdadeiramente crítica do módulo:

1. Trava o cabeçalho do pedido (`select ... for update`) — bloqueia
   `cancelled`/`closed`.
2. Para cada item do recebimento: **trava o `purchase_order_item`
   correspondente** (`select ... for update`) antes de recalcular o
   pendente — dois recebimentos concorrentes contra o mesmo item do
   pedido serializam corretamente, nenhum lê um "pendente" desatualizado
   (mesma técnica de `fn_post_stock_movement`, ver docs/INVENTORY.md §1).
   Isso serializa a nível de pedido inteiro (não só do item) — uma
   simplificação deliberada, documentada como tradeoff aceitável no
   volume esperado (ver §8).
3. **Bloqueio duro**: se `accepted_quantity` do item excede o pendente
   recém-recalculado, a transação inteira aborta com um erro claro —
   "recebido > pedido" é impossível de persistir, mesmo sob concorrência.
4. Resolve lote (`product_lots`, upsert se `lot_number` foi informado e
   o produto é `batch_controlled`) e valida número de série
   (`product_serial_numbers`, exige exatamente `accepted_quantity`
   séries quando o produto é `serial_controlled`) — reaproveitando
   integralmente a infraestrutura de docs/INVENTORY.md §2, nenhuma
   estrutura nova.
5. Chama `fn_post_stock_movement` (tipo `RECEIPT`, mesmo tipo que
   `fn_receive_stock` usa para entradas manuais) no
   `destination_location_id` do item, com
   `reference_type = 'PURCHASE_RECEIPT'` e `reference_id` = id do
   recebimento — rastreabilidade completa até `purchase_receipt` →
   `purchase_order` → `purchase_order_item` via o join natural
   `stock_movements.reference_id = purchase_receipts.id` →
   `purchase_receipt_items.purchase_order_item_id`.
6. Soma `accepted_quantity` em `purchase_order_items.received_quantity`.
7. Recalcula o status do pedido (`partially_received` ou `received`,
   conforme `received + cancelled` cobre ou não `ordered` de todos os
   itens) e, se houver `purchase_request_id` ligada, chama
   `fn_sync_purchase_request_status`.
8. Marca o recebimento `confirmed` e grava um `audit_logs` (`CONFIRM`).

**Idempotência**: a guarda `status = 'draft'` já impede reprocessamento
por si só — uma segunda chamada de confirmação falha imediatamente
("só é possível confirmar em rascunho"), nunca gera uma segunda entrada.
`idempotency_key`, quando informada, é repassada a cada
`fn_post_stock_movement` como camada extra contra retry de rede a meio
da transação (mesmo padrão de todo o resto do estoque).

`fn_reject_purchase_receipt` (`purchase_receipts.reject`) é o caminho
para "a entrega inteira está errada, devolver sem tocar em estoque" —
diferente de divergência item a item (que ainda pode ser parcialmente
aceita e confirmada).

## 7. RBAC

| Código | Uso |
|---|---|
| `purchase_requests.view/create/update/approve` | Solicitação de Compra |
| `purchase_quotes.view/create/update/approve` | Cotação (`.approve` = selecionar vencedor) |
| `purchase_orders.view/create/update/approve/cancel` | Pedido de Compra (`.update` também cobre enviar ao fornecedor e encerrar — reaproveitado, sem inflar a granularidade) |
| `purchase_receipts.view/create/update/confirm/reject` | Recebimento (`.confirm` é a única que gera estoque) |

Todas inseridas no catálogo global `permissions` e propagadas para os
3 papéis padrão via `fn_seed_company_rbac` (idempotente, mesmo padrão
de toda a Fase 2/2b/2c).

## 8. RLS, auditoria e transações

- **RLS**: toda tabela nova tem `company_id` obrigatório e RLS
  habilitada; policy de `select` gated por `*.view`, sem exceção. Toda
  escrita passa por função `SECURITY DEFINER` que checa `has_permission`
  via `auth.uid()` — mesmo padrão de Estoque/WMS, nenhuma tabela de
  Compras tem policy de insert/update direto para `authenticated`.
- **Auditoria**: reaproveita `public.audit_logs` — nenhum sistema
  paralelo. A migration 0017 amplia o vocabulário de `action` (que só
  aceitava `CREATE/UPDATE/DELETE/ACTIVATE/INACTIVATE` desde 0003) para
  incluir `APPROVE/CANCEL/RECEIVE/CONFIRM/REJECT`, ampliação aditiva na
  mesma tabela (ver comentário no topo do arquivo da migration —
  encontrado como um problema real nas migrations desta própria etapa e
  corrigido incrementalmente, não retroativamente).
- **Transações**: cada função é uma única transação Postgres — toda
  chamada de `fn_confirm_purchase_receipt` só efetiva (ou não efetiva
  nada) por completo; não há como o sistema ficar num estado
  parcialmente atualizado entre `purchase_receipt`,
  `purchase_receipt_items`, `purchase_order_items`, `purchase_orders`,
  `stock_movements` e `stock_balances`.
- **Tradeoff documentado**: `fn_confirm_purchase_receipt` trava o
  pedido inteiro (`purchase_orders`, `for update`) antes de processar
  seus itens, não só os itens envolvidos — dois recebimentos
  concorrentes contra o MESMO pedido (mesmo que itens diferentes)
  serializam em vez de processar em paralelo. Simplificação deliberada,
  segura (sem risco de corrupção), aceitável no volume esperado deste
  domínio; uma otimização futura poderia travar só os
  `purchase_order_items` efetivamente tocados.

## 9. Preparação para módulos futuros (não implementados nesta etapa)

- **Financeiro** (§21 do pedido): `purchase_orders` já tem
  `payment_terms`/`freight_cost`/`discount`/`total_amount`;
  `purchase_receipts` já referencia `supplier_id`. Falta: parcelas,
  vencimentos, Contas a Pagar propriamente dita — nada aqui foi
  implementado, mas nada bloqueia.
- **Fiscal** (§22): `purchase_receipts` já tem `document_type`/
  `document_number`/`document_series`/`access_key`/
  `document_issued_at`/`document_value` — campos de referência prontos
  para uma futura Nota Fiscal de Entrada, sem acoplar um módulo fiscal
  completo.
- **Produção**: `purchase_receipts` já pode entregar em qualquer local
  com `purpose = 'OPERATIONAL_WAREHOUSE'` (Almoxarifado Operacional),
  exatamente o ponto de entrada que uma futura Ordem de Produção
  consumiria via `material_requests` (docs/INVENTORY.md §6).
- **Conversão automática de cotação → pedido**: hoje manual (§4) — uma
  função `fn_create_purchase_order_from_quote` seria uma extensão
  aditiva natural, não implementada por não ter sido pedida
  explicitamente.

## 10. Frontend

Nenhuma tela nesta etapa — banco de dados, backend, domínio, workflow,
segurança, testes e documentação, exatamente como pedido. Frontend fica
para um ciclo futuro (v0).
