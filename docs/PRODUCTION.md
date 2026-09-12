# Produção / PCP — Fase 6

Fundação do módulo de Produção/PCP (`supabase/migrations/0026` a
`0030`), construída sobre RLS/RBAC, Catálogo, Estoque/WMS
(docs/INVENTORY.md), Compras (docs/PURCHASING.md), Comercial
(docs/COMMERCIAL.md) e Logística (docs/LOGISTICS.md) já existentes.

**Aviso — escopo desta etapa:** como nas fases anteriores, estas
migrations foram escritas e revisadas estaticamente, mas **não foram
aplicadas nem testadas contra um banco Postgres real** — instrução
explícita desta fase foi trabalhar apenas nos arquivos versionados do
repositório, sem tocar em nenhum projeto Supabase real (sem
`execute_sql`/`apply_migration`, especialmente não no ASTRA.ERP).

## 1. Princípio fundamental: Produção não cria um segundo estoque

Nenhuma tabela nova deste módulo grava diretamente em `stock_balances`.
O saldo continua sendo exclusivamente
`stock_balances`/`stock_movements`/`stock_reservations` (0009/0011):

- **Reserva de matéria-prima** reaproveita `stock_reservations`/
  `stock_reservation_items` (0011) via `fn_create_reservation` —
  **não existe** `production_reservations`.
- **Consumo/devolução/produção de acabado/perda** tocam o ledger
  exclusivamente via `fn_post_stock_movement` (0009) — o mesmo
  primitivo usado por Compras, Comercial e Logística. Nenhuma função
  deste módulo faz `update stock_balances` direto.
- **Vocabulário de movimento**: `PRODUCTION_IN`/`PRODUCTION_OUT` já
  existiam desde 0009, reservados exatamente para esta etapa — nenhum
  tipo de movimento novo foi necessário.
- **Localização**: `production_orders.consumption_location_id`/
  `output_location_id` são `warehouse_locations` (0009) normais — a
  única novidade é o uso do `purpose = 'PRODUCTION'` já existente desde
  0013 (Almoxarifado Operacional), não uma estrutura de local paralela.
- **Lote/Série**: `product_lots`/`product_serial_numbers` (0009/0010)
  são reaproveitados tal como estão. `product_serial_numbers.status`
  ganhou um único valor novo (`consumed`, 0026) para série de
  matéria-prima baixada em produção — nenhuma tabela paralela.
- **Produto fabricado**: `products.production_type`
  (`purchased`/`manufactured`/`both`, 0026) é uma coluna aditiva — o
  mesmo registro em `products` pode ser comprado, fabricado e vendido.
  Nenhuma tabela paralela de "produtos fabricados".

## 2. Fluxo

```
DEMANDA (futura: pedido de venda / MRP — não implementado nesta etapa)
  ↓
ORDEM DE PRODUÇÃO (production_orders)
  draft → planned → released → materials_reserved → in_progress
  ↓                                                      ↓
  snapshot da BOM ativa                    stock_reservations (consumo)
  (production_order_materials)
  ↓
CONSUMO DE MATERIAIS (fn_consume_production_material)     → ISSUE+RELEASE
  ou DEVOLUÇÃO (fn_return_production_material)            → RELEASE
  ou PERDA (fn_register_production_scrap, material_id)    → ISSUE+RELEASE
  ↓
PRODUTO ACABADO (fn_register_production_output)           → PRODUCTION_IN
  ou REFUGO de acabado (fn_register_production_scrap, sem material_id)
  ↓
ORDEM CONCLUÍDA (fn_complete_production_order) → completed
```

## 3. Produto fabricado (migration 0026)

`products.production_type` (`purchased` padrão, `manufactured`,
`both`). `fn_create_production_order` exige `production_type in
('manufactured', 'both')` — não é possível abrir uma ordem de produção
para um produto marcado só como comprado.

## 4. Centro de trabalho, roteiro e operações (migration 0026)

`work_centers`, `production_routings` e `production_routing_operations`
são **"cadastro"**: sem função RPC, sem workflow de aprovação própria —
CRUD direto (GET/POST/PATCH, sem DELETE exposto) gated pela mesma
permissão compartilhada `production_operations.{view,create,update}`
(pedido explícito: "não criar granularidade excessiva" — nenhuma
`work_centers.*`/`production_routings.*` separada). `production_routings`
pode opcionalmente referenciar um produto; cada operação tem
`sequence`, nome, `work_center_id` opcional e `planned_time_minutes`.
**Não é um MES completo** — é só a fundação estrutural pedida (seção
22-23); nenhum cálculo de capacidade/APS.

## 5. BOM — estrutura de produto (migration 0027)

`product_boms` representa **como** um produto é fabricado. Versionada
por produto (`version`, incrementado a cada `fn_create_bom`, nunca
reciclado mesmo que versões antigas fiquem obsolete). Workflow:
`draft → active → obsolete`.

- **Só uma BOM `active` por produto** — garantido por **índice único
  parcial** (`product_boms_one_active_per_product`), não só por
  convenção de função: estruturalmente impossível ter duas BOMs ativas
  do mesmo produto ao mesmo tempo.
- **Nunca apagada**: `fn_activate_bom` torna `obsolete` qualquer BOM
  ativa anterior do mesmo produto, na mesma transação em que ativa a
  nova — nunca um instante com duas ativas nem um instante sem nenhuma.
- **Itens** (`product_bom_items`): `quantity`/`unit_id` do componente,
  `scrap_percentage` (perda esperada daquele componente específico),
  `sequence`, `is_optional`. Só podem ser adicionados/removidos
  enquanto a BOM está em `draft` (`fn_add_bom_item`/`fn_remove_bom_item`)
  — uma vez `active`, a receita não muda mais; qualquer alteração exige
  uma nova versão via `fn_create_bom`. `fn_activate_bom` exige ao menos
  1 item.
- Um produto não pode ser componente de sua própria BOM (bloqueado em
  `fn_add_bom_item`).

### Unidades — BOM nunca assume unidades iguais

`product_bom_items.unit_id` é a unidade em que o item foi **autorado**
(ex.: "2 metros"), que pode ser diferente da unidade de estoque do
componente (ex.: o componente é controlado em "rolos"). Nenhuma
conversão é assumida — ver §6.

## 6. Snapshot da BOM na Ordem de Produção (migrations 0027/0028)

Requisito de rastreabilidade explícito: **se a BOM mudar depois, uma
ordem antiga não pode mudar retroativamente**.

`fn_create_production_order` materializa os componentes da BOM ativa
(ou de uma BOM explícita, desde que não esteja em `draft`) em
`production_order_materials` **uma única vez**, no momento da criação:

1. Para cada `product_bom_items`, calcula
   `quantidade = item.quantity * (planned_quantity / bom.reference_quantity) * (1 + scrap_percentage/100)`.
2. **Conversão de unidade** (seção 8 — "não assumir que toda
   matéria-prima usa a mesma unidade do produto acabado"): se
   `item.unit_id` for diferente da unidade de estoque do componente
   (`products.unit_id`), busca um fator em `unit_conversions` (em
   qualquer direção cadastrada) e converte. Se a BOM e o componente
   usam unidades diferentes e **não existe** conversão cadastrada, a
   criação da ordem falha com um erro claro pedindo o cadastro da
   conversão — nunca assume um fator de 1.
3. `production_order_materials` nasce com a quantidade já convertida,
   na unidade de estoque do componente — é esse snapshot, não a BOM,
   que todo o resto do módulo (reserva/consumo/devolução/perda) usa.
   `bom_item_id` fica como referência histórica de qual linha da BOM
   originou aquele material, sem depender dela continuar existindo do
   jeito que estava.

Depois de criada, a ordem nunca mais relê `product_bom_items` — mesmo
que a BOM seja alterada (nova versão ativada) ou tornada obsolete, esta
ordem permanece com o snapshot original intacto.

## 7. Ordem de produção — workflow (migration 0028)

```
draft → planned → released → materials_reserved → in_progress → completed
                                                         ↓
                                                      on_hold (e volta)
  (cancelled a partir de qualquer status, exceto completed/cancelled)
```

- **`fn_plan_production_order`**: `draft → planned`, define
  `planned_date`. Reaproveita `production_orders.update` (sem
  permissão `.plan` dedicada).
- **`fn_release_production_order`** — "liberar ordem + reservar
  materiais" como **uma única transação** (seção 33): para cada
  material ainda não totalmente reservado
  (`planned_quantity - reserved_quantity`), verifica
  `stock_balances.available` no **mesmo grão** que
  `fn_post_stock_movement` usa (produto+local+lote exato, via
  `is not distinct from` — nunca superestima disponibilidade somando
  lotes que a reserva de fato não vai alcançar), e reserva o **mínimo**
  entre o que falta e o disponível. Reserva **parcial é o caminho
  normal** (seção 11): se nem tudo couber, a ordem fica em `released`
  (não `materials_reserved`) e a função pode ser **chamada de novo**
  mais tarde para tentar cobrir o restante (top-up) — mesmo espírito de
  `fn_reserve_sales_order_stock` (0021, docs/COMMERCIAL.md §6).
  Overbooking é estruturalmente impossível pelo mesmo motivo de sempre:
  `fn_post_stock_movement` (dentro de `fn_create_reservation`) trava a
  linha de `stock_balances` e rejeita qualquer reserva que excederia o
  disponível.
- **`fn_start_production_order`**: exige `materials_reserved` — só
  inicia produção com a matéria-prima 100% reservada.
- **`fn_hold_production_order`/`fn_resume_production_order`**:
  `in_progress ↔ on_hold`. Reaproveitam `production_orders.update`.
- **`fn_cancel_production_order`**: permitida em qualquer status exceto
  `completed`/`cancelled`. Libera (via `fn_release_reservation`,
  reaproveitada, nunca reimplementada) qualquer `stock_reservations`
  ativa vinculada à ordem. O que já foi consumido permanece consumido —
  fato histórico, nunca desfeito (cancelar não é logística reversa).

## 8. Consumo, devolução e rastreamento aditivo (migration 0029)

Em `production_order_materials`, cada quantidade tem seu próprio campo,
**nunca sobrescrito** — mesmo princípio já estabelecido em
`sales_order_items` (docs/LOGISTICS.md §6) e `purchase_order_items`:

| Campo | Quem grava | Quando |
|---|---|---|
| `planned_quantity` | `fn_create_production_order` | snapshot da BOM |
| `reserved_quantity` | `fn_release_production_order` | reserva (soma, nunca decrementa) |
| `consumed_quantity` | `fn_consume_production_material` | consumo efetivo (soma) |
| `returned_quantity` | `fn_return_production_material` | devolução (soma) |
| `scrapped_quantity` | `fn_register_production_scrap` | perda de matéria-prima (soma) |

Invariante estrutural (CHECK da tabela, não só convenção de função):
`consumed_quantity + returned_quantity + scrapped_quantity <=
reserved_quantity` — nunca é possível usar, devolver ou perder mais do
que foi efetivamente reservado para aquela linha.

- **`fn_consume_production_material`**: grava **ISSUE** (reduz
  `on_hand`) + **RELEASE** (reduz `reserved`) pela quantidade parcial
  exata — exatamente o que `fn_ship_shipment` (0024,
  docs/LOGISTICS.md §4.4) já faz para expedição parcial, aqui
  reaproveitado para consumo parcial de produção: o mesmo primitivo
  (`fn_post_stock_movement`) usado em granularidade parcial, não um
  mecanismo novo. `reference_type = 'PRODUCTION_ORDER'`,
  `reference_id = production_order.id` (literal, seção 13). Suporta
  série consumida (`product_serial_numbers.status = 'consumed'`).
- **`fn_return_production_material`**: material separado mas não
  consumido. Gera só **RELEASE** — o material nunca saiu de `on_hand`,
  só estava reservado; devolver é liberar a reserva, nunca uma segunda
  movimentação de entrada.
- Ambas bloqueiam consumir/devolver mais do que
  `reserved_quantity - consumed_quantity - returned_quantity -
  scrapped_quantity` (o que ainda está reservado e não utilizado).

### Idempotência além do movimento de estoque

`fn_post_stock_movement` já é idempotente por `idempotency_key` (0009)
— mas isso só protege o **saldo**. Sem cuidado adicional, uma segunda
chamada com a mesma chave faria `fn_post_stock_movement` devolver o
movimento existente **sem reaplicar o delta**, mas o restante da
função (incrementar `consumed_quantity`, por exemplo) rodaria de novo e
duplicaria esse incremento. Por isso `fn_consume_production_material`/
`fn_return_production_material`/`fn_register_production_output`/
`fn_register_production_scrap` fazem um **short-circuit explícito no
início**: se já existe um movimento (ou, no caso de
`production_scrap`, uma linha) com a mesma `idempotency_key`, a função
retorna o estado atual sem repetir nenhum efeito colateral — proteção
de ponta a ponta, não só do ledger.

## 9. Produto acabado (migration 0029)

**`fn_register_production_output(order_id, produced_quantity,
rejected_quantity, lot_number?, serial_numbers?, idempotency_key?)`**:

- `produced_quantity`/`rejected_quantity` do cabeçalho são sempre
  **incrementais** — suporta produção parcial em múltiplas chamadas
  (seção 17: planejado 100, produzido 40, depois 35, depois 25).
- Se `produced_quantity > 0`: grava **`PRODUCTION_IN`** em
  `output_location_id` via `fn_post_stock_movement`
  (`reference_type = 'PRODUCTION_ORDER'`). Produto com
  `batch_controlled = true` exige `lot_number` explícito (cria o
  `product_lots` se não existir, `manufactured_at = hoje`). Produto com
  `serial_controlled = true` exige exatamente N séries para N unidades
  produzidas (mesma validação de `fn_pick_item`, 0023) — cada série
  nasce como uma linha nova em `product_serial_numbers`
  (`status = 'in_stock'`, localizada em `output_location_id`).
- `rejected_quantity` só soma no cabeçalho aqui — o **registro
  rastreável** (motivo, lote) de um refugo de acabado é
  `fn_register_production_scrap` (separado, chamável independentemente
  quando o operador quiser detalhar a rejeição).
- Produto rejeitado **nunca entra** em `stock_balances` — só o que é
  `produced_quantity` gera `PRODUCTION_IN`.

## 10. Perdas e refugos (migration 0029)

`production_scrap` é a estrutura dedicada de rastreabilidade de perda
(seção 18), com dois modos, distinguidos por `material_id`:

- **`material_id` preenchido** — perda de **matéria-prima** já
  reservada (quebra, defeito antes do consumo). Gera **ISSUE** (a
  perda é física, reduz `on_hand` de verdade) + **RELEASE** (o que se
  perdeu não pode continuar reservado) pela quantidade perdida,
  `reference_type = 'PRODUCTION_SCRAP'`. `stock_movement_issue_id`
  aponta para o movimento gerado (rastreabilidade explícita).
  Incrementa `production_order_materials.scrapped_quantity`.
- **`material_id` ausente** — refugo de **produto acabado** (produzido
  mas rejeitado). **Nenhum movimento de estoque** — o produzido
  rejeitado nunca chegou a entrar em `stock_balances` (só
  `produced_quantity`, não `rejected_quantity`, gera `PRODUCTION_IN`
  em `fn_register_production_output`). Só o registro, com motivo,
  para rastreabilidade.

Em ambos os casos: `reason` é obrigatório (texto livre), `quantity` >
0, e a função é idempotente por uma `idempotency_key` própria da
tabela (`production_scrap.idempotency_key`, índice único parcial —
cobre também o caso sem movimento de estoque, que não teria como se
apoiar na idempotência de `stock_movements`).

## 11. Conclusão da ordem (migration 0029)

**`fn_complete_production_order`**: `in_progress → completed`. A única
regra estrutural é estar `in_progress` — a decisão de "já produzi o
suficiente" é do operador (seção 17: não trava em
`produced_quantity >= planned_quantity`, permitindo encerrar com
produção menor que o planejado quando necessário). Idempotente pelo
guard de status: uma segunda chamada de "Concluir produção" (seção 34)
encontra `status = 'completed'` e falha com erro claro — não produz
duas vezes.

## 12. Rastreabilidade (seção 21)

Cadeia estruturada via FK, nunca texto livre:

```
production_orders
  ↓ (production_order_id)
production_order_materials  →  bom_item_id → product_bom_items → product_boms
  ↓ (material_id, opcional)                  ↓ (lot_id/serial_numbers)
production_scrap                             product_lots / product_serial_numbers
  ↓ (stock_movement_issue_id)
stock_movements (reference_type='PRODUCTION_ORDER'/'PRODUCTION_SCRAP', reference_id=production_orders.id)
```

Produto acabado: `stock_movements` de `PRODUCTION_IN`
(`reference_id = production_orders.id`) + `product_lots`/
`product_serial_numbers` criados por `fn_register_production_output`
fecham o rastro até "qual ordem produziu qual lote/série". Uma tela de
rastreabilidade (produto acabado → ordem → matéria-prima → lote de
origem) não foi implementada nesta etapa (não pedido) — mas todas as
FKs necessárias para montar essa consulta já existem.

## 13. Apontamento básico (migration 0030)

`production_operation_logs`: início/fim, operador, quantidade
produzida/rejeitada **naquela operação**, ligado opcionalmente a
`production_routing_operations`/`work_centers`. Ledger insert-only via
`fn_log_production_operation` (sem workflow, sem update/delete) —
**não** altera `production_orders.produced_quantity`/
`rejected_quantity` (isso é exclusivamente
`fn_register_production_output`) — é um registro de chão de fábrica
complementar, não uma segunda fonte de verdade de produção. **Não é um
sistema de ponto/HR** nem um MES completo — só a base estrutural
pedida.

## 14. RBAC

| Código | Uso |
|---|---|
| `production_boms.view/create/update/approve` | BOM — `.update` cobre adicionar/remover componente em rascunho; `.approve` cobre ativar E tornar obsoleta |
| `production_orders.view/create/update/release/start/complete/cancel` | ordem — `.update` cobre planejar, colocar em espera, retomar E registrar produção de acabado (`fn_register_production_output`); `.release` é isolada (reserva materiais); `.start`/`.complete`/`.cancel` idem |
| `production_materials.view/consume/return` | materiais da ordem |
| `production_operations.view/create/update` | centros de trabalho, roteiros, operações de roteiro E apontamento (`fn_log_production_operation` usa `.create`) — permissão única para toda a família "operações/roteiro", sem granularidade por tabela |
| `production_scrap.view/create` | perdas/refugos |

Todas usam o sufixo `.view`/`.create`/`.update`/... (não `.read`)
porque toda a Produção tem handlers dedicados
(`src/lib/api/production-handlers.ts`), sem o hardcode de
`${modulo}.read` do factory genérico — mesma distinção já presente em
Estoque/Compras/Comercial/Logística. Todas propagadas para os 3 papéis
padrão via `fn_seed_company_rbac`.

## 15. RLS, auditoria, concorrência, idempotência

- **RLS**: todas as 9 tabelas novas com `company_id`, RLS habilitada,
  `select` gated pela permissão `.view` correspondente. `work_centers`/
  `production_routings`/`production_routing_operations` também têm
  `insert`/`update` diretos (sem função — CRUD simples), gated por
  `production_operations.create`/`.update`; as demais só têm `select` —
  toda escrita via função `SECURITY DEFINER`.
- **Auditoria**: reaproveita `audit_logs` (0003), vocabulário de
  `action` ampliado em 0026 com `RELEASE`/`START`/`CONSUME`/
  `COMPLETE`/`SCRAP` (CREATE/UPDATE/APPROVE/CANCEL/RETURN já existiam).
- **Concorrência**: `fn_release_production_order`/
  `fn_start_production_order`/`fn_cancel_production_order`/
  `fn_consume_production_material`/`fn_return_production_material`/
  `fn_register_production_output`/`fn_register_production_scrap`/
  `fn_complete_production_order` travam (`for update`) a ordem e/ou o
  material antes de validar e alterar — mesma técnica de
  `fn_confirm_purchase_receipt` (0018) e `fn_ship_shipment` (0024).
- **Idempotência**: guarda de status em toda transição (uma função só
  avança a partir do status exato que espera) + `idempotency_key`
  explícita nas funções com efeito colateral em estoque, com
  short-circoit ANTES de qualquer efeito (não só dentro de
  `fn_post_stock_movement`) — ver §8. Cobre especificamente os casos
  citados na seção 34: reserva, consumo, devolução, apontamento,
  entrada de acabado, conclusão da ordem.

## 16. Códigos

`BOM-0001` (BOM), `OP-0001` (ordem de produção), `ROTEIRO-0001`
(roteiro) — mesmo mecanismo `fn_generate_code` (0002) de todo o
restante do sistema. UUID continua sendo PK em toda tabela.

## 17. Integração com os módulos existentes

- **Almoxarifado Operacional**: a origem dos materiais continua sendo
  `warehouse_locations` com `purpose = 'OPERATIONAL_WAREHOUSE'` (0013);
  `purpose = 'PRODUCTION'` (também de 0013, até então sem nenhuma
  função que o usasse) passa a ser efetivamente usado como
  `consumption_location_id`/`output_location_id` de uma ordem. O
  "abastecimento" físico entre Almoxarifado e uma localização de
  produção pré-estocada (seção 12: "ALMOXARIFADO → RESERVA →
  ABASTECIMENTO → LINHA DE PRODUÇÃO") **não precisou de nenhum
  mecanismo novo** — já é exatamente o que `stock_transfers` (0010) ou
  `material_requests` (0013) fazem entre dois `warehouse_locations`;
  este módulo só consome o resultado (o material já estar disponível
  no local de consumo da ordem), sem duplicar transferência.
- **Estoque**: único ponto de contato real é `fn_post_stock_movement`,
  chamado por `fn_consume_production_material`/
  `fn_return_production_material`/`fn_register_production_output`/
  `fn_register_production_scrap`. Localização/lote/série são sempre os
  já existentes.
- **Reservas**: `fn_release_production_order` chama
  `fn_create_reservation` (0011) exatamente como
  `fn_reserve_sales_order_stock` (0021) — mesma função, mesmo
  primitivo, zero duplicação.
- **Compras** (preparação futura, seção 26): nenhuma alteração em
  Compras nesta etapa. `production_order_materials` já expõe
  `planned_quantity - reserved_quantity` (necessidade não cobertável
  pelo estoque atual) como o dado que um MRP futuro leria para gerar
  `purchase_requests` (0014) automaticamente — nenhuma tabela ou coluna
  adicional foi necessária para deixar essa porta aberta.
- **Comercial** (preparação futura, seção 27): nenhuma alteração em
  Comercial nesta etapa. Uma futura integração "pedido de venda →
  demanda → produção" teria `sales_order_items`/`production_orders`
  como as duas pontas já existentes — o vínculo (provavelmente um
  `reference_type`/`reference_id` em `production_orders`, mesmo padrão
  usado em todo o resto do sistema) fica para quando esse fluxo for
  pedido.
- **Financeiro/Fiscal** (seções 28-29): nenhuma tabela financeira ou
  fiscal criada. `production_orders`/`production_order_materials`/
  `production_operation_logs` já reúnem os dados que um custeio futuro
  (material + mão de obra + indireto = custo da ordem = custo
  unitário) precisaria ler — nenhum sistema financeiro paralelo.

## 18. Limitações atuais e evolução futura

- **Sem MRP automático**: a necessidade de compra (planejado -
  reservado) é visível via consulta, não gera `purchase_requests`
  automaticamente.
- **Sem roteirização de entrega/produção avançada**: `work_centers`/
  `production_routings` são fundação, não um APS com capacidade finita.
- **Sem logística reversa de devolução de matéria-prima com defeito
  pós-consumo**: `fn_return_production_material` só cobre material
  **reservado e não consumido**; material já consumido e depois
  descoberto defeituoso não tem uma função de reversão dedicada nesta
  etapa (cairia em `fn_register_production_scrap` como perda, sem
  reverter o consumo já registrado).
- **Custeio não implementado**: estrutura de dados pronta (§17), cálculo
  de custo não.
- **Uma única localização de consumo/saída por ordem**: mesma
  simplificação deliberada de `fn_reserve_sales_order_stock` (0021) —
  uma ordem com materiais em múltiplos locais diferentes precisa de um
  `material_request`/`stock_transfer` prévio consolidando no local de
  consumo da ordem, não é resolvido automaticamente aqui.

## 19. API

`/api/work-centers` (+`/[id]`), `/api/production-routings` (+`/[id]`),
`/api/production-routing-operations` (+`/[id]`, filtrável por
`?routingId=`).

`/api/product-boms` (filtrável por `?productId=`/`?status=`,
+`/[id]`, `/[id]/items`, `/[id]/activate`, `/[id]/obsolete`),
`/api/product-bom-items/[id]` (DELETE).

`/api/production-orders` (filtrável por `?status=`/`?productId=`,
+`/[id]`, `/[id]/plan`, `/[id]/release`, `/[id]/start`, `/[id]/hold`,
`/[id]/resume`, `/[id]/cancel`, `/[id]/complete`, `/[id]/output`).

`/api/production-order-materials` (filtrável por
`?productionOrderId=`, +`/[id]/consume`, `/[id]/return`).

`/api/production-scrap` (filtrável por `?productionOrderId=`),
`/api/production-operation-logs` (filtrável por `?productionOrderId=`).

## 20. Testes e frontend

Testes desta etapa cobrem a camada de validação Zod
(`src/lib/validations/production.ts`). A lógica transacional real
(snapshot da BOM com conversão de unidade, reserva parcial sem
overbooking, consumo/devolução dentro do reservado, idempotência de
ponta a ponta, RBAC, isolamento por empresa) vive nas funções SQL e só
é verificável contra um Postgres real, fora do alcance desta etapa (ver
aviso no topo e `tests/production-validations.test.ts` para o
detalhamento de quais dos 28 cenários pedidos não são testáveis sem
banco). Nenhuma tela nova — banco de dados, backend, domínio,
workflow, segurança, integrações, testes e documentação, como pedido;
frontend fica para uma etapa futura (v0).
