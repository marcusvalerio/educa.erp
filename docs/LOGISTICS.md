# Logística / Expedição — Fase 5

Fundação do módulo de Logística/Expedição (`supabase/migrations/0022` a
`0025`), construída sobre RLS/RBAC, Catálogo, Estoque/WMS
(docs/INVENTORY.md) e Comercial (docs/COMMERCIAL.md) já existentes.

**Aviso — escopo desta etapa:** como nas fases anteriores, estas
migrations foram escritas e revisadas estaticamente, mas **não foram
aplicadas nem testadas contra um banco Postgres real** — instrução
explícita desta fase foi trabalhar apenas nos arquivos versionados do
repositório, sem tocar em nenhum projeto Supabase real (sem
`execute_sql`/`apply_migration`, especialmente não no ASTRA.ERP).

## 1. Princípio fundamental: Logística não cria um segundo estoque

Esta é a regra mais importante desta etapa e está refletida em todo o
desenho: **nenhuma tabela nova deste módulo grava diretamente em
`stock_balances`**. O saldo continua sendo exclusivamente
`stock_balances`/`stock_movements`/`stock_reservations` (0009/0011).

- **Separação (pick_lists)** só *lê* `stock_reservations`/
  `stock_reservation_items` para saber o quê e de onde separar — nunca
  grava estoque.
- **Expedição (shipments)** é a ÚNICA parte de Logística que toca o
  ledger, e só dentro de `fn_ship_shipment`, que chama
  `fn_post_stock_movement` (0009) — o mesmo primitivo usado por Compras
  e por `fn_consume_reservation` (0011). Nenhuma função de Logística
  faz `update stock_balances` diretamente.
- **Entrega (delivery_events)** não toca estoque algum — é um ledger de
  eventos sobre uma expedição já expedida.
- **Localização**: `pick_list_items`/`shipment_items` referenciam
  `warehouse_locations` (0009) — não existe uma segunda estrutura de
  locais para Logística.
- **Lote/Série**: `product_lots`/`product_serial_numbers` (0009/0010)
  são reaproveitados tal como estão — `fn_pick_item` valida a contagem
  de séries informadas, `fn_ship_shipment` atualiza
  `product_serial_numbers.status` para `'shipped'`; nenhuma tabela
  paralela de lote/série.
- **Transportadora/motorista/veículo**: `carriers`/`drivers`/`vehicles`
  (0002) são reaproveitados sem nenhum cadastro novo — `shipments` só
  referencia (`carrier_id`/`driver_id`/`vehicle_id`, todos nullable).

## 2. Fluxo

```
PEDIDO DE VENDA (reserved / ready_to_ship / partially_shipped)
  ↓
SEPARAÇÃO (pick_lists)            — nasce das stock_reservations ativas
  ↓                                  do pedido; não move estoque
CONFERÊNCIA                       — dobrada em pick_list_items
  (divergence_type/notes)            (sem tabela de QC separada)
  ↓
EXPEDIÇÃO (shipments)
  draft → ready → packed → ready_to_ship → shipped → in_transit
  ↓                                           ↑ aqui, e só aqui,
  (pode haver mais de uma expedição              Logística toca
   por pedido — expedição parcial)               stock_movements
  ↓
ENTREGA (delivery_events)
  out_for_delivery → delivered | failed | refused | absent | returned
  ↓
CONCLUSÃO (shipments.status = completed)

ROTEIRIZAÇÃO (routes/route_stops)  — preparado, NÃO implementado (§8)
```

## 3. Separação (`pick_lists`, migration 0023)

**Workflow**: `pending → in_progress → completed`, mais `cancelled`.

`fn_create_pick_list(company_id, sales_order_id, warehouse_id, notes)`:

1. Exige o pedido em `reserved` ou `reservation_pending`.
2. Varre toda `stock_reservations` **ativa** com
   `reference_type = 'sales_order'` e `reference_id = sales_order_id`,
   e cada `stock_reservation_item` dentro dela — **a mesma reserva já
   criada por `fn_reserve_sales_order_stock`** (docs/COMMERCIAL.md §6),
   nenhuma nova consulta de disponibilidade.
3. Para cada item de reserva, casa com o `sales_order_item`
   correspondente pelo `product_id` (mesma simplificação documentada em
   Compras para `purchase_receipt_items`/`purchase_order_items`: um
   item por produto por pedido é o caso comum) e cria um
   `pick_list_item` herdando `location_id`/`lot_id`/`quantity`
   diretamente da reserva — é assim que a separação já nasce sabendo o
   local exato e o lote, sem inventar nenhuma lógica de seleção de
   localização.
4. Avança o pedido para `picking`.

`fn_pick_item(pick_list_item_id, picked_quantity, lot_id, serial_numbers,
divergence_type, divergence_notes, mark_short)`:

- `picked_quantity` é sempre um **SET**, nunca um incremento — corrigir
  uma quantidade errada é só chamar de novo com o valor certo, antes de
  concluir a separação. Isso também é o que torna a operação
  idempotente por natureza (repetir a mesma chamada não duplica
  efeito).
- Bloqueia duro `picked_quantity > requested_quantity` — não é possível
  separar mais do que foi reservado para aquele item.
- Produto com `serial_controlled = true` exige exatamente N números de
  série informados para uma quantidade N.
- **Conferência dobrada aqui** (seção 8 do pedido): `divergence_type`
  (`none`/`quantity`/`product`/`lot`/`serial`) e `divergence_notes`
  ficam na própria linha do item — não existe uma segunda tabela de
  "conferência". Mesmo padrão de `purchase_receipt_items` em Compras.
- `mark_short` força o item para `short` mesmo que a quantidade
  separada não tenha coberto o solicitado — "é tudo que existe, aceitar
  a falta" (mesma flag cobre também produto/lote trocado via
  `divergence_type`).

`fn_complete_pick_list`: fecha qualquer item ainda `pending` (vira
`picked` se cobriu tudo, `short` se não), marca a separação `completed`
e avança o pedido para `ready_to_ship`. `fn_cancel_pick_list`: só
cancela separação `pending`/`in_progress`, cancela os itens ainda em
aberto e devolve o pedido para `reserved`.

## 4. Expedição (`shipments`, migration 0024)

**Workflow completo**:
`draft → ready → packed → ready_to_ship → shipped → in_transit →
delivered → completed`, mais `cancelled` (só possível até
`ready_to_ship` — ver §4.4). `picking` existe no vocabulário do `CHECK`
por paridade com `sales_orders.status`, mas nenhuma função o usa — a
separação em si já é conduzida inteiramente por `pick_lists`.

### 4.1 Criação e expedição parcial

`fn_create_shipment(company_id, sales_order_id, warehouse_id, items[],
pick_list_id, expected_ship_date, delivery_*, notes)`:

- Exige o pedido em `reserved`, `ready_to_ship` ou `partially_shipped`
  — este último é exatamente o que permite uma **segunda** (ou
  terceira) expedição contra o mesmo pedido (seção 21: "Pedido: 100,
  Expedição 1: 60, Expedição 2: 40").
- Para cada item informado, valida
  `quantidade ≤ sales_order_items.reserved_quantity - shipped_quantity`
  — a quantidade disponível para expedir é sempre a diferença entre o
  que já está reservado e o que já saiu em expedições anteriores deste
  mesmo pedido, nunca um novo cálculo de disponibilidade de estoque
  (esse já existe em `stock_balances.available`, usado só na reserva).
- **Endereço de entrega**: se a chamada não informar endereço
  explícito, a expedição **fotografa** o endereço já gravado no
  próprio `sales_order` (que por sua vez já é uma fotografia do
  cliente, feita em `fn_create_sales_order`, 0021) — nunca relê
  `customers` diretamente. Cada expedição tem sua própria cópia porque,
  em tese, duas expedições do mesmo pedido podem ir para endereços
  diferentes.
- `pick_list_id` é opcional e só informativo — não há obrigação de uma
  expedição nascer de uma separação concluída (permite expedir direto
  quando a operação não usa separação formal).

### 4.2 Volumes (`shipment_packages`)

Estrutura básica (`package_number`, `weight`, `height`, `width`,
`length`, `tracking_code`) — **sem** cálculo de peso cubado/cubagem,
exatamente como pedido (seção 9: "sem necessidade de cálculo de
cubagem"). Base pronta para uma etapa futura de logística adicionar
isso sem migrar o schema.

### 4.3 Transportadora/motorista/veículo (`fn_assign_shipment_transport`)

Valida coerência **sem** um `CHECK` de tabela (que não alcança outras
tabelas):

- Se o motorista informado já tem `carrier_id` próprio no cadastro E um
  `carrier_id` também foi informado na chamada, os dois precisam
  coincidir.
- Mesma regra para veículo × transportadora.
- Veículo × motorista: se o veículo já tem `driver_id` vinculado no
  cadastro e um motorista diferente foi informado aqui, rejeita.
- Campos nulos (motorista/veículo autônomos, sem vínculo de
  transportadora no cadastro) não são bloqueados — a validação só entra
  em ação quando há um vínculo real para contradizer.
- Bloqueada a partir de `shipped` — depois que a mercadoria saiu, o
  transporte não é mais editável por aqui.

### 4.4 `fn_ship_shipment` — a função crítica

Única função de todo o módulo de Logística que toca o ledger de
estoque. Transacional, com lock explícito:

1. `select ... for update` no **shipment** — primeira defesa contra
   duplo clique: uma segunda chamada concorrente para a mesma expedição
   espera o lock e, ao continuar, encontra o status já mudado para
   `shipped` e falha com "Só é possível expedir uma expedição pronta
   para envio" — nenhuma expedição duplicada é possível.
2. `select ... for update` no **sales_order** e em cada
   **sales_order_item** envolvido — mesma técnica de
   `fn_confirm_purchase_receipt` (0018, docs/PURCHASING.md): fecha a
   janela de corrida também no nível do pedido, não só da expedição.
3. Revalida `quantidade ≤ reserved_quantity - shipped_quantity` por
   item (a mesma regra de `fn_create_shipment`, mas sob lock — a
   validação na criação é otimista, esta é a que garante).
4. Para cada item, grava **ISSUE** (reduz `on_hand`) e **RELEASE**
   (reduz `reserved`) pela mesma quantidade parcial, ambos via
   `fn_post_stock_movement` com `reference_type = 'SHIPMENT'`,
   `reference_id = shipment.id`. Isto é exatamente o que
   `fn_consume_reservation` (0011) faz — mas essa função consome a
   reserva **inteira** de uma vez, e uma reserva de pedido de venda
   pode precisar ser consumida em várias expedições parciais ao longo
   do tempo. Por isso `fn_ship_shipment` chama o primitivo comum
   (`fn_post_stock_movement`) diretamente, na quantidade exata desta
   expedição — reúso do mesmo mecanismo em granularidade parcial, não
   um caminho paralelo.
5. **Idempotência explícita**: se `p_idempotency_key` for informado
   (vindo do corpo da requisição via `shipActionSchema`), cada chamada a
   `fn_post_stock_movement` recebe uma chave derivada
   (`key:issue:<item_id>` / `key:release:<item_id>`) — uma segunda
   submissão com a mesma chave é rejeitada pela própria garantia de
   idempotência de `fn_post_stock_movement` (0009), sem depender só do
   lock de linha do passo 1.
6. Atualiza `sales_order_items.shipped_quantity` (soma, nunca
   sobrescreve) e, se houver números de série, marca
   `product_serial_numbers.status = 'shipped'`.
7. Recalcula o status do **pedido**: soma
   `shipped_quantity + cancelled_quantity` de todos os itens contra
   `ordered_quantity` total — `'shipped'` se cobriu tudo, senão
   `'partially_shipped'`. Isso é o que sustenta "Pedido: 100, Expedição
   1: 60 → partially_shipped; Expedição 2: 40 → shipped".
8. Marca a própria expedição como `shipped` e registra `SHIP` em
   `audit_logs`.

`fn_cancel_shipment` só é permitida até `ready_to_ship` (estritamente
antes de `fn_ship_shipment` rodar) — a partir de `shipped` nenhum
estoque já movimentado pode ser desfeito por um cancelamento simples
(isso seria logística reversa, fora do escopo desta etapa).

## 5. Entrega e POD (`delivery_events`, migration 0025)

`delivery_events` é um **ledger insert-only** (mesmo espírito de
`stock_movements`/`audit_logs`) — nenhuma linha é atualizada ou
apagada; uma expedição pode ter várias tentativas de entrega (ausente,
depois entregue; ou recusada, depois devolvida), e cada uma fica
registrada como um evento próprio. O status "atual" da entrega é
sempre o evento mais recente, refletido em `shipments.status`.

- **`fn_create_delivery_event`**: registra `out_for_delivery`, exige
  expedição `shipped`/`in_transit`, avança o shipment para
  `in_transit`.
- **`fn_confirm_delivery`**: registra `delivered` com os campos de POD
  (`recipient_name`, `recipient_document`, `latitude`/`longitude`,
  `pod_type`, `pod_reference`) e avança o shipment para `delivered`.
  Grava `DELIVER` em `audit_logs`.
- **`fn_fail_delivery(shipment_id, status, ...)`**: `status` é validado
  contra `failed`/`refused`/`absent`/`returned` dentro da própria
  função (não é um parâmetro livre). `returned` cancela a expedição
  (`shipments.status = 'cancelled'`); os outros três deixam o shipment
  em `in_transit`, permitindo uma nova tentativa depois. Grava `RETURN`
  ou `FAIL` em `audit_logs`, conforme o caso.
- **`fn_complete_shipment`**: `delivered → completed`, fecho manual do
  ciclo. Deliberadamente reaproveita a permissão `shipments.update` (em
  vez de criar `deliveries.update`, que existe no vocabulário de
  permissões seedado mas fica sem função associada nesta etapa) —
  encerrar o ciclo de uma expedição já entregue é tratado como edição
  da expedição, não como um novo evento de entrega.

### POD sem armazenamento de arquivo

`pod_type` (`signature`/`photo`/`document`) e `pod_reference` (texto
livre) são apenas o **ponteiro** — nome de arquivo, hash ou URL de uma
assinatura/foto/documento que uma integração de upload futura
preencherá. Nenhum arquivo é armazenado ou processado nesta etapa.

### Devolução (`returned`) e logística reversa

Um evento `returned` registra o **fato** (mercadoria está retornando)
e cancela a expedição, mas **não** gera nenhuma movimentação de
estoque automática — logística reversa completa (entrada de volta no
saldo, conferência do retorno) está fora do escopo desta etapa.
`stock_movements` já tem o vocabulário `RETURN_IN` pronto (desde 0009)
para quando essa função futura for escrita; nenhuma estrutura nova foi
necessária para deixar essa porta aberta.

## 6. Rastreio requisitado → reservado → separado → expedido → cancelado

Em `sales_order_items`, cada quantidade tem seu próprio campo e seu
próprio dono:

| Campo | Quem grava | Quando |
|---|---|---|
| `ordered_quantity` | `fn_create_sales_order` (0021) | criação do pedido |
| `reserved_quantity` | `fn_reserve_sales_order_stock` (0021) | reserva de estoque |
| `picked_quantity` | `fn_pick_item` (0023, **este módulo**) | separação física |
| `shipped_quantity` | `fn_ship_shipment` (0024, **este módulo**) | saída real de estoque |
| `cancelled_quantity` | `fn_cancel_sales_order` (0021) | cancelamento |

Nenhum desses campos é recalculado a partir de outro — cada etapa só
soma (nunca sobrescreve) o que já havia, preservando o rastro completo
pedido a pedido, item a item, exatamente como pedido na seção 22.

## 7. RBAC

| Código | Uso |
|---|---|
| `pick_lists.view/create/update/complete/cancel` | separação — `.update` cobre iniciar E registrar itens separados |
| `shipments.view/create/update/approve/ship/cancel` | expedição — `.create` cobre criar, atribuir transporte e adicionar volumes; `.update` cobre embalar e encerrar (`fn_complete_shipment`); `.ship` é isolada (é a única que move estoque) |
| `deliveries.view/create/update/confirm/fail` | entrega — `.create` cobre só `out_for_delivery`; `.confirm` é a entrega bem-sucedida; `.fail` cobre as quatro ocorrências sem sucesso (`failed`/`refused`/`absent`/`returned`); `.update` está seedada no vocabulário pedido mas nenhuma função a usa nesta etapa (ver §5 — `fn_complete_shipment` reaproveita `shipments.update` deliberadamente) |

Todas usam o sufixo `.view`/`.create`/`.update`/... (não `.read`) porque
as três entidades têm handlers dedicados
(`src/lib/api/logistics-handlers.ts`), sem o hardcode de `${modulo}.read`
do factory genérico (`src/lib/api/handlers.ts`) — mesma distinção já
presente em Estoque/Compras/Comercial. Todas propagadas para os 3
papéis padrão via `fn_seed_company_rbac`.

## 8. RLS, auditoria, concorrência, idempotência

- **RLS**: `pick_lists`/`pick_list_items`/`shipments`/`shipment_items`/
  `shipment_packages`/`delivery_events` — todas com `company_id`, RLS
  habilitada, `select` gated pela permissão `.view` correspondente, sem
  exceção. Nenhuma tem policy de escrita — toda escrita é só via função
  `SECURITY DEFINER`, cada uma checando `has_permission()` internamente
  (defesa em profundidade, já que a função roda como o papel
  proprietário das tabelas e por isso ignora RLS).
- **Auditoria**: reaproveita `audit_logs` (0003), vocabulário de
  `action` ampliado em 0022 com `PICK`/`PACK`/`SHIP`/`DELIVER`/`FAIL`/
  `RETURN` — nenhuma tabela de auditoria paralela.
- **Concorrência**: `fn_ship_shipment` trava shipment + sales_order +
  cada sales_order_item envolvido antes de validar e mover estoque —
  mesma técnica já usada em `fn_confirm_purchase_receipt` (0018) e
  `fn_reserve_sales_order_stock` (0021).
- **Idempotência contra duplo clique**: dois mecanismos combinados,
  igual às etapas anteriores —
  1. guarda de status (uma função só avança a partir do status exato
     que espera; uma segunda chamada encontra status diferente e falha
     com erro claro) em toda transição de `pick_lists`/`shipments`/
     `delivery_events`;
  2. `p_idempotency_key` opcional em `fn_ship_shipment`, repassado a
     `fn_post_stock_movement` (0009) — cobre especificamente o caso de
     "expedir" citado na seção 26, onde o efeito colateral (movimento
     de estoque) precisa de uma garantia além do lock de linha.
  `fn_confirm_delivery`/`fn_fail_delivery` ("entregar") são protegidas
  só pela guarda de status — não tocam estoque, então o lock do
  shipment já é suficiente para impedir dois eventos conflitantes
  simultâneos.

## 9. Preparação para roteirização futura (NÃO implementada)

Pedido explícito desta etapa (seção 33): preparar, mas não implementar,
`routes`/`route_stops`/sequenciamento de entregas. Nenhuma tabela ou
coluna foi criada para isso — a preparação real é estrutural: `shipments`
já tem `carrier_id`/`driver_id`/`vehicle_id` e `delivery_events` já
carrega `latitude`/`longitude` por evento, exatamente os dados que uma
futura tabela `route_stops` precisaria referenciar (uma parada de rota
apontando para um `shipment_id`, com sequência e janela de horário). Não
existe hoje nenhuma tabela `routes` nem qualquer sequenciamento —
criá-las fica para quando esse módulo for pedido.

## 10. Integração com os módulos existentes

- **Comercial** (`sales_orders`): `pick_lists`/`shipments` sempre
  referenciam `sales_order_id`; o workflow do pedido (`reserved` →
  `picking` → `ready_to_ship` → `partially_shipped`/`shipped` →
  `completed`, ampliado em 0022) é avançado pelas próprias funções
  deste módulo — nenhuma duplicação do workflow de vendas.
- **Reservas** (`stock_reservations`): `fn_create_pick_list` lê as
  reservas ativas do pedido; `fn_ship_shipment` consome parcialmente a
  mesma reserva via `fn_post_stock_movement`, sem nunca chamar
  `fn_release_reservation`/`fn_consume_reservation` diretamente (esses
  operam sobre a reserva inteira, incompatível com expedição parcial).
- **Estoque** (`stock_movements`/`stock_balances`): único ponto de
  contato é `fn_ship_shipment` → `fn_post_stock_movement`. Localização
  (`warehouse_locations`) e lote (`product_lots`)/série
  (`product_serial_numbers`) são sempre os já existentes, nunca uma
  estrutura paralela.
- **Transportadora/motorista/veículo** (`carriers`/`drivers`/
  `vehicles`, 0002): reaproveitados por referência simples
  (`shipments.carrier_id`/`driver_id`/`vehicle_id`), com validação de
  coerência em `fn_assign_shipment_transport` — nenhum cadastro novo.

## 11. API

`/api/sales-orders/[id]/pick-lists` (POST — cria separação a partir do
pedido), `/api/sales-orders/[id]/shipments` (POST — cria expedição a
partir do pedido).

`/api/pick-lists` (GET, filtrável por `?status=`/`?salesOrderId=`),
`/api/pick-lists/[id]` (GET), `/api/pick-lists/[id]/start` (POST),
`/api/pick-lists/[id]/complete` (POST), `/api/pick-lists/[id]/cancel`
(POST), `/api/pick-lists/[id]/items/[itemId]/pick` (POST).

`/api/shipments` (GET, filtrável por `?status=`/`?salesOrderId=`),
`/api/shipments/[id]` (GET), `/api/shipments/[id]/transport` (POST),
`/api/shipments/[id]/packages` (POST), `/api/shipments/[id]/ready`
(POST), `/api/shipments/[id]/pack` (POST),
`/api/shipments/[id]/approve` (POST), `/api/shipments/[id]/ship`
(POST, corpo opcional `{ idempotencyKey }`),
`/api/shipments/[id]/cancel` (POST), `/api/shipments/[id]/complete`
(POST).

`/api/shipments/[id]/delivery-events` (GET/POST — POST registra
`out_for_delivery`), `/api/shipments/[id]/deliver` (POST — confirma
entrega com POD), `/api/shipments/[id]/fail-delivery` (POST — registra
ocorrência sem sucesso).

Todas as rotas sob `/api/shipments/[id]/...` e
`/api/sales-orders/[id]/...` usam o mesmo nome de segmento dinâmico
(`[id]`) — Next.js exige isso entre pastas-irmãs do mesmo diretório
pai; os três sub-caminhos de entrega foram corrigidos nesta etapa para
seguir o mesmo padrão das demais.

## 12. Testes e frontend

Testes desta etapa cobrem a camada de validação Zod
(`src/lib/validations/logistics.ts`) — forma/tipo dos payloads. A
lógica transacional real (expedição parcial, idempotência, lock de
concorrência, coerência transportadora/motorista/veículo, consumo
parcial de reserva, RBAC, isolamento por empresa) vive inteiramente nas
funções SQL e só é verificável contra um Postgres real, fora do alcance
desta etapa (ver aviso no topo e `tests/logistics-validations.test.ts`
para o detalhamento de quais dos cenários pedidos não são testáveis sem
banco). Nenhuma tela nova — banco de dados, backend, domínio, workflow,
segurança, integrações, testes e documentação, como pedido; frontend
fica para uma etapa futura.
