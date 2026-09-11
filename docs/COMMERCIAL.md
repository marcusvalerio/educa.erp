# Comercial — Fase 4

Fundação do módulo Comercial (`supabase/migrations/0019` a `0021`),
construída sobre RLS/RBAC, Catálogo, Estoque/WMS (docs/INVENTORY.md) e
Compras (docs/PURCHASING.md) já existentes.

**Aviso — escopo desta etapa:** como nas fases anteriores, estas
migrations foram escritas e revisadas estaticamente, mas **não foram
aplicadas nem testadas contra um banco Postgres real** — instrução
explícita desta fase foi trabalhar apenas nos arquivos versionados do
repositório, sem tocar em nenhum projeto Supabase real (sem
`execute_sql`/`apply_migration`, especialmente não no ASTRA.ERP).

**Nota sobre o contexto recebido:** o pedido desta etapa lista
`product_prices` entre as estruturas já existentes na branch. Não
existe — esta branch tem apenas `products.cost_price/sale_price/
min_price` (colunas simples, sem vigência, desde 0007). "Tabela de
preço com vigência" (`price_lists`/`price_list_items`) foi construída
do zero nesta etapa porque não havia nada equivalente para reaproveitar
aqui — não é duplicação de uma estrutura existente.

## 1. Fluxo

```
CLIENTE
  ↓
ORÇAMENTO (sales_quotes)           — opcional
  ↓
APROVAÇÃO
  ↓
PEDIDO DE VENDA (sales_orders)
  ↓
RESERVA DE ESTOQUE (stock_reservations — REUTILIZADA, não duplicada)
  ↓
SEPARAÇÃO / EXPEDIÇÃO / FATURAMENTO / CONTAS A RECEBER  — não implementados
                                                            nesta etapa,
                                                            modelo já
                                                            preparado (§7-9)
```

## 2. Princípio fundamental: nenhuma estrutura duplicada

- **Clientes**: `customers` (0002) recebeu só colunas aditivas —
  nenhuma segunda tabela de clientes.
- **Produtos**: `products`/`product_categories`/`product_brands`
  inalterados.
- **Estoque**: reserva de um Pedido de Venda usa `stock_reservations`/
  `stock_reservation_items` (0011) via `fn_create_reservation`/
  `fn_release_reservation` — **não existe** `sales_stock_reservations`
  nem qualquer mecanismo paralelo. Disponibilidade é
  `stock_balances.available` (coluna gerada desde 0009, já líquida de
  reservas existentes) — nenhum cálculo novo, reaproveitado direto.
- **Auditoria**: `audit_logs`, vocabulário de `action` já ampliado em
  0017 (inclui `APPROVE`/`CANCEL`/`RESERVE`/`RELEASE`, reaproveitados
  aqui sem nova migration de constraint).
- **RBAC/RLS**: mesmo `has_permission()`/`fn_seed_company_rbac` de
  sempre.

## 3. Clientes — extensão (migration 0019)

`customers` ganhou, de forma aditiva:

| Coluna | Uso |
|---|---|
| `default_sales_representative_id` | vendedor padrão (FK `sales_representatives`) |
| `default_price_list_id` | tabela de preço padrão (FK `price_lists`) |
| `default_payment_terms_id` | condição de pagamento padrão (FK `payment_terms`) |
| `segment` | segmento comercial (texto livre) |
| `commercial_status` | `active`/`credit_hold`/`blocked` — **diferente** de `status` (um cliente pode estar `Ativo` no cadastro e `credit_hold` no comercial, ex.: inadimplência) |

`credit_limit` **já existia** desde 0002 — reaproveitado como "limite
de crédito" sem nenhuma coluna nova. `payment_terms` (texto livre,
também já existia) fica **depreciado** em favor de
`default_payment_terms_id` — mesmo padrão já usado em
`products.category`/`unit` → `category_id`/`unit_id` (0007): coluna
antiga preservada, nunca removida, só não é mais a fonte de verdade.

`fn_create_sales_order` usa os defaults do cliente quando o pedido não
informa explicitamente vendedor/tabela/condição de pagamento — reduz
fricção sem impedir uma escolha pontual diferente por pedido.

## 4. Vendedores, tabelas de preço e condições de pagamento (0019)

- **`sales_representatives`** — cadastro simples (CRUD genérico, mesmo
  padrão de `warehouses`/`product_lots`). `commission_percentage` é só
  o parâmetro — apuração financeira de comissão não implementada.
- **`price_lists`** + **`price_list_items`** — tabela de preço com
  vigência (`valid_from`/`valid_until`) e `priority` (maior primeiro,
  para uma futura resolução automática de "qual tabela vale para este
  cliente" quando mais de uma se aplica — não implementada: orçamento/
  pedido recebem `price_list_id` explicitamente). `products.sale_price`
  continua sendo o fallback quando nenhuma tabela é informada.
- **`payment_terms`** + **`payment_term_installments`** — diferente das
  duas anteriores, **não** usa o repositório genérico: a soma dos
  percentuais das parcelas precisa fechar em 100% antes de gravar
  qualquer linha, uma validação atômica multi-linha que só uma função
  garante (`fn_create_payment_term`/`fn_update_payment_term`, mesmo
  padrão de `fn_add_quote_supplier_response` em Compras — `update`
  substitui as parcelas por completo, delete + reinsert). Geração de
  parcelas reais (títulos) para o Financeiro não implementada.

## 5. Orçamento (`sales_quotes`, migration 0020)

**Workflow**: `draft → sent → approved | rejected | expired`, e
`cancelled` a partir de qualquer estado anterior a `approved` (um
orçamento já aprovado não pode ser cancelado diretamente — cancela-se o
Pedido de Venda gerado a partir dele, se existir).

Não gera nenhum efeito de estoque — é compromisso comercial preliminar.
`total_amount` sempre derivado via trigger (mesmo padrão de
`purchase_orders`, 0016). `fn_expire_sales_quote` é manual nesta etapa
(sem scheduler/cron configurado) — uma rotina periódica futura poderia
chamá-la automaticamente para orçamentos `sent` com `valid_until` no
passado.

## 6. Pedido de Venda (`sales_orders`, migration 0021)

**Workflow**: `draft → pending_approval → approved → reservation_pending
→ reserved → picking → ready_to_ship → shipped → completed`, mais
`cancelled`. **Picking/Expedição não implementados nesta etapa** —
`picking`/`ready_to_ship`/`shipped`/`completed` existem só no
vocabulário do `CHECK` (nenhuma função os define) para o modelo já
nascer pronto para quando esse módulo existir.

### Preço e desconto históricos (seção 15 do pedido)

`sales_order_items.unit_price`/`discount` são gravados no item no
momento da criação — nunca recalculados a partir do preço atual do
produto/tabela. Um pedido feito a R$ 90 continua R$ 90 mesmo que o
preço do produto mude depois. `total_amount` do cabeçalho é sempre
derivado (trigger), nunca confiado ao frontend.

### Snapshot do endereço de entrega (seção 17)

Se `fn_create_sales_order` não recebe campos de endereço explícitos,
fotografa o endereço **atual** do cliente (`customers`) nas colunas
`delivery_*` do pedido. Alterações futuras no cadastro do cliente não
afetam pedidos já criados — exatamente o comportamento pedido.

### Conversão de orçamento em pedido

Se `p_items` vier vazio/nulo e `p_sales_quote_id` for informado,
`fn_create_sales_order` copia os itens de `sales_quote_items` — o
orçamento precisa estar `approved`. Se itens vierem explícitos, são
usados independentemente de haver ou não uma cotação de referência.

### Reserva de estoque — a integração crítica (seção 11-14, 24-25)

`fn_reserve_sales_order_stock(order_id, location_id)`:

1. **Trava o cabeçalho do pedido** (`select ... for update`) —
   protege contra duplo clique: duas chamadas concorrentes para o
   MESMO pedido serializam aqui, nunca criam duas reservas para a
   mesma necessidade (seção 25 — idempotência).
2. Para cada item ainda pendente (`ordered - cancelled - reserved > 0`),
   lê `stock_balances.available` no local informado — **não** um
   cálculo próprio: `available` já é `on_hand - reserved`, líquido de
   toda reserva existente (seção 12).
3. `to_reserve = min(pendente, disponível)` por item — reserva parcial
   é o caminho normal, não uma exceção (seção 13): o que não couber
   fica pendente para uma futura chamada (ex.: depois de um
   `purchase_receipt` repor o estoque).
4. Chama `fn_create_reservation` (0011) **uma vez**, com os itens já
   capados — cria o cabeçalho `stock_reservations` +
   `stock_reservation_items` com `reference_type = 'sales_order'`,
   `reference_id` = id do pedido.
5. Overbooking é estruturalmente impossível: o que de fato é gravado
   passa por `fn_post_stock_movement` (dentro de `fn_create_reservation`),
   que trava a linha de `stock_balances` e rejeita qualquer reserva que
   excederia `on_hand` — dois pedidos de venda concorrentes disputando o
   mesmo produto/local serializam ali, camada que já existia desde
   0009, reaproveitada sem nenhuma mudança.
6. Atualiza `sales_order_items.reserved_quantity` e recalcula o status
   do pedido: `reserved` se cada item está 100% coberto, senão
   `reservation_pending`. Chamável de novo mais tarde para tentar
   cobrir o que ficou pendente (top-up).

**Tradeoff documentado** (mesmo espírito do lock de pedido inteiro em
`fn_confirm_purchase_receipt`, docs/PURCHASING.md §8): o lock é no
CABEÇALHO do pedido, não por item — duas reservas concorrentes contra
o MESMO pedido (mesmo que itens diferentes) serializam em vez de
processar em paralelo. Simplificação deliberada, segura, aceitável no
volume esperado.

**Itens sem `product_id`** (fora do catálogo) nunca são reserváveis via
estoque — ficam permanentemente pendentes, mesma decisão já tomada para
`purchase_request_items` em Compras.

### Cancelamento e liberação de reserva (seção 14)

`fn_cancel_sales_order` e `fn_release_sales_order_reservation`
compartilham `fn_release_sales_order_reservations_internal`, que
localiza toda `stock_reservations` ativa referenciando o pedido
(`reference_type = 'sales_order'`) e chama `fn_release_reservation`
(0011) em cada uma — **nenhuma lógica de liberação reimplementada**.
Nunca apaga registros históricos; a reserva permanece no ledger como
`released`. Cancelar um pedido com reserva ativa libera primeiro,
depois cancela a quantidade ainda pendente de cada item.

### Preparação para Logística/Fiscal/Financeiro (seções 18-20)

- **Logística**: `carrier_id` (FK `carriers`, já existia desde 0002) —
  referência pronta para uma futura `shipments`/expedição. Nenhum TMS
  implementado.
- **Fiscal**: `fiscal_document_type/number/series/access_key/status` —
  mesmo padrão de preparação usado em `purchase_receipts` (0018).
  Nenhum módulo fiscal acoplado.
- **Financeiro**: `customer_id`, `payment_terms_id`, `total_amount` e o
  próprio código do pedido já são suficientes como referência para uma
  futura geração de parcelas/Contas a Receber — nenhuma tabela
  financeira criada nesta etapa.

## 7. RBAC

| Código | Uso |
|---|---|
| `sales_representatives.read/create/update` | vendedores (sem `.delete` — pedido explícito só lista estas 3; rota DELETE não é exportada na API) |
| `price_lists.read/create/update/delete` | tabelas de preço (itens reaproveitam as mesmas 4 — sem `price_list_items.*` próprio) |
| `payment_terms.view/create/update` | condições de pagamento |
| `sales_quotes.view/create/update/approve/cancel` | orçamento (`.approve` cobre aprovar E rejeitar; `.update` cobre enviar E expirar — sem inflar a granularidade) |
| `sales_orders.view/create/update/approve/cancel/reserve` | pedido de venda (`.update` também cobre liberar reserva) |

`sales_representatives`/`price_lists` usam o sufixo `.read` (não
`.view`) porque passam pelo repositório/handlers genéricos
(`src/lib/api/handlers.ts`), que sempre monta `${modulo}.read` para
GET — `.view` é usado nas demais entidades porque têm handlers
dedicados (`commercial-handlers.ts`) que não têm esse hardcode. Mesma
distinção já presente em Estoque/Compras.

Todas propagadas para os 3 papéis padrão via `fn_seed_company_rbac`.

## 8. RLS, auditoria, concorrência e idempotência

- **RLS**: toda tabela nova com `company_id`, RLS habilitada, `select`
  gated por `*.view`/`.read`, sem exceção. `payment_terms`/
  `sales_quotes`/`sales_orders` (+itens) só têm policy de leitura — toda
  escrita via função.
- **Auditoria**: reaproveita `audit_logs` — eventos `APPROVE`/`CANCEL`/
  `RESERVE`/`RELEASE` já estavam no vocabulário ampliado por 0017
  (Compras); nenhuma migration de constraint nova foi necessária aqui.
- **Concorrência**: `fn_reserve_sales_order_stock` trava o pedido
  (`for update`) antes de decidir quanto reservar; a garantia real
  contra overbooking físico vem de `fn_post_stock_movement` (0009),
  inalterada.
- **Idempotência**: aprovar pedido, reservar estoque e liberar reserva
  são protegidos pela combinação guarda-de-status (uma função só avança
  a partir do status exato que espera — uma segunda chamada encontra um
  status diferente e falha com erro claro) + lock de linha onde a ação
  tem efeito colateral em outra tabela (reserva). Nenhuma duplicação de
  efeito é possível por duplo clique.

## 9. API

`/api/sales-representatives`, `/api/price-lists` (+`/api/price-list-items`,
filtrável por `?priceListId=`), `/api/payment-terms`, `/api/sales-quotes`
(+`/[id]/send`, `/approve`, `/reject`, `/expire`, `/cancel`),
`/api/sales-orders` (+`/[id]/submit`, `/approve`, `/reserve`,
`/release-reservation`, `/cancel`).

## 10. Testes e frontend

Testes desta etapa cobrem a camada de validação Zod (forma/tipo) e
mappers — a lógica transacional real (reserva parcial, overbooking,
liberação, idempotência, RBAC, isolamento por empresa) vive nas funções
SQL e só é verificável contra um Postgres real, fora do alcance desta
etapa (ver aviso no topo). Nenhuma tela nova — banco de dados, backend,
domínio, workflow, segurança, integrações, testes e documentação, como
pedido; frontend fica para v0.
