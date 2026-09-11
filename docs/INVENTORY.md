# Estoque / WMS — Fase 2c

Este documento descreve o domínio transacional de Estoque/WMS introduzido
nesta fase (`supabase/migrations/0008` a `0012`), construído sobre a
fundação de RLS/RBAC/Catálogo já existente (ver **docs/RBAC.md** e
**docs/CATALOGO.md** se existir). Cobre depósitos, endereçamento
hierárquico, lotes, números de série, saldo, ledger de movimentações,
transferências, reservas, ajustes e contagens de inventário.

**Importante — escopo desta etapa:** as migrations abaixo foram escritas
e revisadas estaticamente, mas **não foram aplicadas nem testadas contra
um banco Postgres real** — instrução explícita desta fase foi trabalhar
apenas sobre os arquivos de migration já existentes no repositório
`marcusvalerio/educa.erp` (branch `claude/rls-rbac-catalogo-fase2b`), sem
tocar em nenhum projeto Supabase (incluindo o ASTRA.ERP usado em fases
anteriores). Antes de considerar este domínio pronto para uso, uma etapa
seguinte precisa: aplicar as migrations 0008-0012 a um projeto Supabase
real, rodar `get_advisors` (RLS/performance), e repetir a técnica de
teste empírico com sessão simulada (`set role authenticated; set
request.jwt.claims = ...`) usada nas fases anteriores para provar RLS/
RBAC/concorrência ponta a ponta — nada disso foi possível aqui.

## 1. Arquitetura do ledger (por que stock_balances nunca é escrito direto)

```
stock_movements   ledger imutável, insert-only — fonte de verdade
stock_balances    saldo derivado (on_hand / reserved / available)
```

`stock_balances` é um **cache**, sempre recalculado a partir de
`stock_movements` pela função `public.fn_post_stock_movement` — a única
rotina que escreve nessas duas tabelas. Nenhuma policy de RLS permite
`insert`/`update`/`delete` nelas para o papel `authenticated`; a única
forma de alterar saldo é chamando uma função `SECURITY DEFINER` (via
RPC). Isso é o que torna "ajuste sempre gera movimento, nunca mutação
direta de saldo" uma garantia estrutural do banco, não uma convenção de
código na API.

`available = on_hand - reserved` é coluna gerada (`generated always as
... stored`) — nunca gravada diretamente, sempre consistente.

### Vocabulário de `movement_type`

| Tipo | Efeito |
|---|---|
| `RECEIPT` | `on_hand += qty` (entrada manual) |
| `ISSUE` | `on_hand -= qty` (saída manual) |
| `TRANSFER_OUT` / `TRANSFER_IN` | saída na origem / entrada no destino de uma transferência |
| `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` | ajuste positivo/negativo (sempre via documento de ajuste ou fechamento de contagem) |
| `RETURN_IN` / `RETURN_OUT` | devolução de cliente / a fornecedor (vocabulário reservado — sem função emissora própria nesta etapa) |
| `PRODUCTION_IN` / `PRODUCTION_OUT` | reservado para integração futura com um módulo de produção |
| `RESERVATION` / `RELEASE` | `reserved += qty` / `reserved -= qty` — não afeta `on_hand` |

### Concorrência e integridade

- `fn_post_stock_movement` garante a linha de `stock_balances` (insert
  idempotente) e trava com `select ... for update` antes de aplicar o
  delta — duas chamadas concorrentes para o mesmo grão (produto/local/
  lote) serializam corretamente.
- `on_hand >= 0`, `reserved >= 0` e `reserved <= on_hand` são `CHECK`
  constraints na tabela, além de validados explicitamente na função (com
  mensagens de erro claras em vez do erro genérico de constraint) —
  saída insuficiente, reserva que excederia o saldo, liberação que
  excede a reserva, e saída que derrubaria `on_hand` abaixo do já
  reservado são todos bloqueados.
- **Idempotência**: toda chamada pode informar `idempotency_key`. Uma
  chave repetida retorna o movimento já existente em vez de reaplicar o
  efeito — importante para reentrega de requisições (timeout de rede,
  retry do cliente). Índice único parcial em
  `(company_id, idempotency_key) where idempotency_key is not null`, com
  tratamento de `unique_violation` para a corrida entre duas requisições
  simultâneas com a mesma chave.

## 2. Tabelas

### Endereçamento (migration 0008)

- **`warehouses`** — depósitos/armazéns. `type` = `standard` (físico) ou
  `virtual` (bucket lógico, ex.: quarentena). Toda empresa ganha um
  depósito `PRINCIPAL` automático (mesmo padrão de `fn_seed_company_rbac`
  /`fn_seed_company_units`).
- **`warehouse_locations`** (já existia desde 0002) ganhou `warehouse_id`
  (FK real) e `parent_location_id` (endereçamento hierárquico — ex.:
  depósito → rua → prédio → nível → posição). As colunas antigas
  (`warehouse` texto livre, `zone`/`aisle`/`rack`/`level`/`position`)
  são preservadas, depreciadas.
- **`product_lots`** — lotes rastreáveis por produto (usado quando
  `products.batch_controlled = true`).
- **`product_serial_numbers`** — números de série por produto (quando
  `products.serial_controlled = true`, coluna nova). Tem vocabulário de
  status próprio (`in_stock`/`reserved`/`shipped`/`returned`/`scrapped`)
  — **não** participa do cálculo de `stock_balances` nesta etapa (ver
  §5, decisões de escopo).

### Ledger e saldo (migration 0009)

- **`stock_balances`** — grão `(company_id, product_id, location_id,
  lot_id)`. `lot_id` nullable — índice único por expressão (`coalesce`)
  porque `UNIQUE` de coluna trata `NULL` como distinto.
- **`stock_movements`** — ledger completo, com `reference_type`/
  `reference_id` apontando para o documento que originou o movimento
  (`stock_transfer`, `stock_reservation`, `stock_adjustment`,
  `stock_count`, ou `manual` para `fn_receive_stock`/`fn_issue_stock`).

### Documentos transacionais (migrations 0010-0012)

Todos seguem o mesmo padrão: cabeçalho + itens, RLS só de `select` para
`authenticated`, toda escrita via função `SECURITY DEFINER`.

- **`stock_transfers`** (+ `stock_transfer_items`) — ciclo `draft` →
  `in_transit` → `completed`, ou `draft` → `cancelled`.
  `fn_create_transfer` só grava o documento; `fn_ship_transfer` grava
  `TRANSFER_OUT` na origem; `fn_receive_transfer` grava `TRANSFER_IN` no
  destino; `fn_cancel_transfer` só permitido em `draft` (nada foi
  movimentado ainda).
- **`stock_reservations`** (+ `stock_reservation_items`) — ciclo
  `active` → `released` (libera sem consumir) ou → `consumed` (vira
  saída real). `fn_create_reservation` já grava `RESERVATION` no
  momento da criação (diferente de transferência). `fn_release_reservation`
  grava `RELEASE`. `fn_consume_reservation` grava `ISSUE` + `RELEASE`.
- **`stock_adjustments`** (+ `stock_adjustment_items`) — ciclo `draft` →
  `posted`, ou `draft` → `cancelled`. `fn_create_adjustment` (permissão
  `stock.adjust`) só grava o documento; `fn_post_adjustment` (permissão
  separada `stock.approve`) é quem de fato gera `ADJUSTMENT_IN`/
  `ADJUSTMENT_OUT` — separação entre propor e aprovar.
- **`stock_counts`** (+ `stock_count_items`) — ciclo `counting` →
  `closed`, ou `counting` → `cancelled`. `fn_start_count` fotografa
  `stock_balances.on_hand` de todo o depósito em
  `stock_count_items.expected_quantity`. `fn_submit_count_item` registra
  a quantidade contada. `fn_close_count` (permissão `stock.approve`)
  gera um `ADJUSTMENT_IN`/`ADJUSTMENT_OUT` por item com variância ≠ 0 —
  itens nunca contados são ignorados (não assumimos variância para o que
  não foi contado).

## 3. RBAC — permissões `stock.*`

| Código | Uso |
|---|---|
| `stock.view` | ler saldos, movimentações e todos os documentos |
| `stock.create` | registrar entradas diretas (`fn_receive_stock`) e criar documentos (transferência, reserva) |
| `stock.update` | editar documentos em rascunho; liberar/consumir reservas |
| `stock.transfer` | expedir, receber e cancelar transferências |
| `stock.adjust` | registrar saídas manuais (`fn_issue_stock`) e criar ajustes |
| `stock.count` | criar contagens e registrar quantidades contadas |
| `stock.approve` | efetivar ajustes contra o saldo e fechar contagens |

Junto com `warehouses.*` e `product_lots.*`/`product_serial_numbers.*`
(padrão `read`/`create`/`update`/`delete`, igual aos demais cadastros).
Todas inseridas no catálogo global `permissions` e propagadas para os
3 papéis padrão de cada empresa via `fn_seed_company_rbac` (idempotente
— cada migration que adiciona permissões novas re-chama essa função
para as empresas já existentes).

Cada função `fn_*` checa `has_permission()` **internamente**, usando
`auth.uid()` — não apenas na camada de API. Isso é necessário porque as
tabelas de estoque não têm policy de escrita nenhuma para
`authenticated`; a função é a única porta de entrada, então ela mesma
precisa ser a barreira real (defesa contra alguém chamando a RPC
diretamente via Supabase client, sem passar pelas rotas Next.js).

## 4. Camada de API

Diferente dos cadastros (que usam `createTableRepository` genérico +
cliente `service_role`), a leitura do domínio de estoque usa o cliente
admin (depois de checar permissão na API), mas **toda escrita chama uma
função RPC através do cliente de sessão** (`src/lib/supabase/server.ts`,
cookies do usuário autenticado) — não do cliente admin. O motivo:
`fn_post_stock_movement` e as funções que a chamam fazem sua própria
checagem de `has_permission()` via `auth.uid()`, que só resolve
corretamente quando a chamada carrega o JWT real do usuário. Ver
`src/lib/api/inventory-handlers.ts` (comentário no topo do arquivo).

Rotas principais: `/api/warehouses`, `/api/product-lots`,
`/api/product-serial-numbers` (CRUD simples), `/api/stock-balances` e
`/api/stock-movements` (leitura), `/api/stock-movements/receive` e
`/.../issue` (movimentos diretos), `/api/stock-transfers`
(+ `/[id]/ship`, `/[id]/receive`, `/[id]/cancel`),
`/api/stock-reservations` (+ `/[id]/release`, `/[id]/consume`),
`/api/stock-adjustments` (+ `/[id]/post`, `/[id]/cancel`),
`/api/stock-counts` (+ `/[id]/items/[itemId]/submit`, `/[id]/close`,
`/[id]/cancel`), `/api/material-requests` (+ `/[id]/deliver`, `/[id]/cancel`
— ver §6).

## 5. Auditoria

Reaproveita `public.audit_logs` (nenhum sistema paralelo). O ledger
`stock_movements` já é, por natureza, um registro imutável de toda
mudança de saldo — duplicar cada linha dele em `audit_logs` seria
redundante. Em vez disso, `audit_logs` registra o nível de **documento**
(igual aos 8 cadastros existentes): toda transição de status relevante
(expedir/receber/cancelar transferência, efetivar ajuste, fechar
contagem) grava uma linha `entity` = nome da tabela, `action = 'UPDATE'`,
com `old_data`/`new_data` contendo o status antes/depois.

## 6. Almoxarifado Operacional (migration 0013)

**Não é um segundo estoque.** É o mesmo `warehouses`/`warehouse_locations`/
`product_lots`/`product_serial_numbers`/`stock_balances`/`stock_movements`
de todo este documento — a diferença entre "Estoque" (produtos/
mercadorias) e "Almoxarifado Operacional" (matérias-primas, componentes,
insumos) é só o **propósito de um local**, não um mecanismo de saldo
paralelo.

```
ALMOXARIFADO OPERACIONAL → requisição → PRODUÇÃO → transformação → PRODUTO ACABADO → ESTOQUE
```

### `warehouse_locations.purpose`

Nova coluna: `STOCK` (padrão), `OPERATIONAL_WAREHOUSE`, `PRODUCTION`,
`QUARANTINE`, `TRANSIT`. Vive no **local**, não no depósito — um mesmo
depósito físico pode ter áreas com propósitos diferentes (ex.: uma
área de quarentena dentro de um depósito de estoque geral), então
classificar por local é o que evita forçar uma reorganização física só
para representar a distinção.

Toda empresa ganha automaticamente um depósito `ALMOX` ("Almoxarifado
Operacional", `fn_seed_company_operational_warehouse`) — mesmo padrão
de `PRINCIPAL` (0008). Só o depósito é semeado; os locais dentro dele
(com `purpose = OPERATIONAL_WAREHOUSE`) são cadastrados normalmente via
`/api/warehouse-locations`, agora com um campo `finalidade` (`Estoque` /
`Almoxarifado Operacional` / `Produção` / `Quarentena` / `Trânsito` —
mapeado de/para `purpose` em `src/lib/database/mappers.ts`).

### `material_requests` — requisição interna de material

Prepara o fluxo "Produção solicita → Almoxarifado separa → entrega →
registra movimentação" sem implementar um módulo de Produção completo:

- `fn_create_material_request` (permissão nova **`stock.request`**) —
  só grava o documento (`status = 'requested'`), nenhum movimento ainda.
- `fn_deliver_material_request` (permissão **`stock.transfer` reaproveitada**
  — entregar é, na prática, mover material de um local para outro) —
  grava um `PRODUCTION_OUT` por item via `fn_post_stock_movement` no
  local de origem. O tipo `PRODUCTION_OUT` já existia no vocabulário de
  `stock_movements` desde a migration 0009, reservado exatamente para
  isto — nenhuma mudança no ledger foi necessária.
- `fn_cancel_material_request` (`stock.request`) — só em `requested`.

"Verificar disponibilidade" e "separar" (passos do fluxo conceitual)
não viram estado persistido nesta etapa — são processo/UI entre a
criação e a entrega, sem efeito em saldo até a entrega de fato.

`reference_type`/`reference_id` em `material_requests` ficam prontos
para apontar para uma futura `production_orders` (ordem de produção) —
nenhuma tabela de produção/BOM foi criada nesta etapa (fora do escopo
pedido), mas nada aqui impede que o módulo de Produção seja construído
depois: uma ordem de produção poderia gerar `material_requests`
automaticamente a partir de uma estrutura de produto (BOM), e seu
resultado (produto acabado) entraria no Estoque como um `RECEIPT`/
`PRODUCTION_IN` comum — vocabulário que já existe.

### Por que nenhuma permissão `warehouse.*` foi criada

O pedido explícito foi "não criar permissões duplicadas quando uma
permissão de estoque já atender ao mesmo propósito". `stock.view`
(ler), `stock.transfer` (mover entre locais) e as novas `stock.request`/
já cobrem toda a superfície do Almoxarifado Operacional — um segundo
namespace `warehouse.*` paralelo representaria exatamente as mesmas
operações sob nomes diferentes, então não foi criado.

## 7. Decisões de escopo desta etapa (e o que fica para depois)

- **Sem bucket físico de "em trânsito"**: entre `fn_ship_transfer` e
  `fn_receive_transfer`, a quantidade não existe em nenhum local — o
  status `in_transit` do documento é a fonte de verdade de que a
  mercadoria está a caminho, não um saldo em algum depósito virtual.
  Simplificação deliberada; uma evolução futura pode introduzir um
  depósito `virtual` dedicado para representar estoque em trânsito
  fisicamente, caso o negócio precise reportar seu valor.
- **`product_serial_numbers` não alimenta `stock_balances`**: é um
  registro de rastreabilidade (status + localização atual), mas o
  cálculo de saldo continua baseado em quantidade agregada
  (`stock_balances.on_hand`), não em contagem de números de série
  individuais. Reconciliar as duas visões (1 número de série = 1
  unidade de saldo) é um trabalho de um ciclo futuro.
- **Sem UI própria**: esta fase é banco de dados + API. Não há telas de
  Estoque/WMS — consistente com o pedido explícito desta etapa. A
  distinção visual 📦 Estoque / 🏭 Almoxarifado Operacional (adendo, §6)
  também fica para quando houver UI de estoque.
- **Sem BOM/ordem de produção**: `material_requests` prepara o ponto de
  entrada (Almoxarifado → Produção), mas estrutura de produto (lista de
  materiais por produto acabado) e ordens de produção não foram criadas
  — não fazem parte do pedido desta etapa e não são bloqueadas por nada
  aqui (§6).
- **Entrega de requisição é sempre total**: `fn_deliver_material_request`
  entrega a quantidade requisitada inteira por item. Entrega parcial
  (quantidade diferente da requisitada) é uma evolução futura, não um
  requisito desta etapa.
- **Nenhuma migration foi aplicada a um banco real** (ver aviso no
  topo) — a próxima etapa precisa validar isso empiricamente antes de
  qualquer uso em produção.
