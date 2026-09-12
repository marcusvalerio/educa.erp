# Custos e Formação de Custo — Fase 10

Camada de custo (`supabase/migrations/0043-0044`), integrada com
Compras, Estoque, Produção e (por referência, nunca duplicação)
Financeiro. Construída sobre RLS/RBAC, Catálogo, Estoque/WMS, Compras,
Comercial, Produção/PCP, Financeiro e Fiscal já existentes.

**Aviso — escopo desta etapa:** como em todas as fases anteriores,
estas migrations foram escritas e revisadas estaticamente, mas **não
foram aplicadas nem testadas contra um banco Postgres real** — trabalho
só nos arquivos versionados do repositório, sem tocar em nenhum projeto
Supabase real.

## 1. Princípio fundamental: quantidade física ≠ valorização econômica

`stock_movements`/`stock_balances` (0009) continuam sendo a **única**
fonte de verdade da quantidade física em estoque — esta fase nunca lê
nem escreve neles de forma diferente do que já acontecia (só passa a
também gerar um evento de custo logo depois de cada movimento
relevante). O custo vive num ledger **paralelo**:

- **`cost_movements`** — ledger imutável, um-para-um com
  `stock_movements` (índice único em `stock_movement_id`).
- **`product_cost_balances`** — saldo valorado derivado (cache), nunca
  escrito diretamente — só por `fn_register_cost_movement`.

`product_cost_balances.quantity` é um espelho **interno**, necessário
só para o cálculo do custo médio móvel (precisa de "quantidade
anterior" no mesmo grão do "valor anterior"). Ele **não** é exposto
como "o" saldo físico de lugar nenhum — a view de consulta
(`inventory_valuation`, §13) lê quantidade de `stock_balances`, nunca
desta cópia.

## 2. Métodos de custo

`cost_method` é um vocabulário de 3 valores: `MOVING_AVERAGE` (**único
implementado** nesta fase), `FIFO` e `STANDARD` (**preparados** —
existem como valor válido em `cost_movements.cost_method` e
`product_standard_costs` existe como estrutura, mas nenhuma função
calcula FIFO ou usa custo padrão para valorar estoque). Nenhum cálculo
FIFO fictício foi criado só para "existir" — é honestamente ausente.

## 3. Custo médio móvel

`fn_register_cost_movement` (0043) implementa a fórmula clássica para
cada **entrada** (RECEIPT/TRANSFER_IN/ADJUSTMENT_IN/RETURN_IN/
PRODUCTION_IN):

```
novo_custo_médio = (valor_anterior + quantidade × custo_unitário) / (quantidade_anterior + quantidade)
```

Para cada **saída** (ISSUE/TRANSFER_OUT/ADJUSTMENT_OUT/RETURN_OUT/
PRODUCTION_OUT/SCRAP), o custo usado é sempre o **custo médio atual**
do grão (nunca um valor informado pelo chamador) — a saída nunca
"inventa" um custo, só usa o que o ledger já sabe. Tudo em `NUMERIC`
(`unit_cost numeric(14,6)`, `total_value numeric(18,4)`) — nunca
`FLOAT`, em nenhuma coluna monetária/de custo desta fase.

## 4. Custo de aquisição

Nesta fase, o custo de entrada de compra é o `unit_price` do item do
pedido (a mesma fonte já usada como `p_unit_cost` de
`fn_post_stock_movement` desde 0018) — frete/seguro/outras despesas do
cabeçalho de `purchase_orders` **não** são rateados automaticamente
sobre o custo unitário nesta etapa (o tratamento tributário de cada
imposto — se entra ou não no custo — também não é assumido
automaticamente). A composição completa (produto + frete + seguro +
outras despesas − descontos, com tratamento configurável de impostos)
fica preparada como evolução natural, sem inventar uma regra de rateio
que o domínio ainda não pediu.

## 5. Custo por movimentação

`cost_movements` é o ledger de custo — `RECEIPT`, `ISSUE`,
`TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`,
`RETURN_IN`/`RETURN_OUT` (vocabulário presente, **nenhuma função de
estoque emite esses dois tipos ainda** — não existe fluxo de devolução
de estoque implementado; ver docs/INVENTORY.md), `PRODUCTION_IN`,
`PRODUCTION_OUT` (idem — vocabulário existe desde 0009, nenhuma função
o emite), `SCRAP` (idem — a perda de produção grava `ISSUE` no ledger
de estoque hoje; `SCRAP` fica como valor preparado para quando um
`movement_type` distinto for criado). `source_type`/`source_id`
(referência polimórfica, mesmo padrão de `stock_movements.reference_id`)
tornam cada `cost_movement` rastreável até sua origem sem dezenas de
colunas nullable (§19).

## 6. Entrada de compra

`fn_confirm_purchase_receipt` (0018, *create or replace* em 0044):
depois de cada `RECEIPT` postado (o recebimento físico **confirmado**,
nunca o pedido isolado — pedido ≠ recebimento), chama
`fn_register_cost_movement` com o `unit_price` do item do pedido. A
responsabilidade de conferência física continua 100% de
Compras/Estoque — o Fiscal e o Custo só leem o fato consumado.

## 7. Transferência

`fn_ship_transfer`/`fn_receive_transfer` (0010, *create or replace* em
0044): a saída na origem grava `TRANSFER_OUT` no ledger de custo
usando o custo médio **vigente naquele momento** — e fotografa esse
valor em `stock_transfer_items.unit_cost_snapshot` (coluna nova). A
entrada no destino usa **exatamente** esse valor fotografado como
custo de entrada do `TRANSFER_IN`. Resultado: A envia 10 unidades a
custo médio 25 → A perde valor 250; B recebe 10 unidades a custo 25 →
B ganha valor exatamente 250. Nenhum lucro ou perda é criado só pela
transferência.

## 8. Saída de venda

`fn_ship_shipment` (0024, *create or replace* em 0044): o `ISSUE` da
expedição (a saída real de estoque) gera um `cost_movement` — quantidade
× custo médio atual do grão = custo da mercadoria vendida (COGS). O
`RELEASE` que acompanha (libera a reserva) nunca gera custo — não
altera valor, só o quanto está reservado. Nenhum lançamento em
`accounts_receivable`/`sales_orders`/`fiscal_documents` é criado
automaticamente por este módulo — a integração futura com Financeiro
fica preparada via `source_type = 'shipment_item'`, nunca um segundo
sistema contábil.

## 9. Produção (crítico)

`fn_consume_production_material` (0029, *create or replace* em 0044):
cada consumo de matéria-prima (`ISSUE` no local de consumo) gera um
`cost_movement` (custo médio atual do componente), acumulado em duas
colunas novas: `production_order_materials.consumed_cost` (por linha,
nunca decrementado) e `production_orders.material_cost` (total da
ordem). **Único** custo calculado nesta fase para o produto acabado:
o custo de material consumido. Mão de obra, máquina, energia, rateio
indireto **não** foram inventados — não há infraestrutura própria
(centro de custo de produção com apontamento de horas, tarifa de
máquina etc.) para alimentá-los ainda; a arquitetura (`source_type`/
`source_id` em `cost_movements`, mais colunas aditivas futuras em
`production_orders`) está preparada para acomodá-los sem redesenho.

## 10. Custo do produto acabado

`fn_register_production_output` (0029, *create or replace* em 0044): ao
registrar produção, o `PRODUCTION_IN` recebe um `unit_cost` calculado
como `production_orders.material_cost ÷ (produced_quantity + quantidade
desta chamada)` — o custo total de material acumulado na ordem,
distribuído pela quantidade total já produzida (recalculado a cada
chamada, mesmo espírito de custo médio móvel, agora no nível da ordem
em vez do grão de estoque). `fn_register_cost_movement` grava o
`cost_movement` correspondente com esse mesmo `unit_cost`.

## 11. Scrap

`fn_register_production_scrap` (0029, *create or replace* em 0044):
quando há `material_id` (perda de matéria-prima já reservada), o
`ISSUE` gerado também vira `cost_movement` — rastreável via
`source_type = 'production_scrap'`/`source_id = production_order_id`
(nunca apagado; `production_scrap` continua sendo o registro com
motivo). Refugo de produto acabado (`material_id` nulo) nunca chegou a
ter custo atribuído (nunca entrou em estoque) — nada a registrar no
ledger de custo além do que `production_scrap` já guarda.

## 12. Ajustes de estoque

`fn_post_adjustment`/`fn_close_count` (0012, *create or replace* em
0044): todo `ADJUSTMENT_IN`/`ADJUSTMENT_OUT` gerado (seja de um ajuste
manual ou do fechamento de uma contagem) passa a gerar um
`cost_movement`. Entrada usa `stock_adjustment_items.unit_cost` quando
informado; se nulo (todo o caso de `fn_close_count`, que nunca informa
custo), usa o custo médio atual — a quantidade muda, o custo médio não
se altera (correto para "encontrei mais do que eu tinha, sem uma nova
compra associada"). Saída sempre ao custo médio atual.

## 13. Estoque valorado

`inventory_valuation` (view, mesmo padrão de `v_cash_flow_summary`/
`v_cash_flow_projection`, Financeiro 0035 — nunca uma tabela mutável):
`quantity` vem de `stock_balances.on_hand` (a fonte física, §1);
`unit_cost` vem de `product_cost_balances.average_unit_cost`;
`total_value = quantity × unit_cost`. Um grão com saldo físico mas
ainda sem nenhum `cost_movement` aparece com `unit_cost`/`total_value`
zerados (produto recebido por um meio ainda não integrado ao custo) —
nunca um erro, só ausência de dado.

## 14. Histórico

Nenhuma linha de `cost_movements` é jamais atualizada. O exemplo do
enunciado é garantido estruturalmente: uma entrada de 100 unidades a
custo 10 grava `unit_cost = 10` permanentemente nessa linha; uma
segunda entrada de 100 a custo 20 grava sua própria linha com
`unit_cost = 20`, `average_cost_before = 10`, `average_cost_after = 15`
— o saldo (`product_cost_balances`) passa a refletir 15, mas nenhuma
das duas linhas do ledger muda depois.

## 15. Reprocessamento

`fn_reprocess_product_cost` (0043) nunca é silencioso: exige `p_reason`
(rejeita string vazia), trava a linha de `product_cost_balances` (`for
update`) e recalcula `quantity`/`total_value` **somando o próprio
ledger** (`cost_movements` já existente) — nunca reescreve uma linha
antiga, nunca "adivinha" um custo novo para um movimento passado.
Determinístico e portanto idempotente: reprocessar duas vezes seguidas
produz o mesmo resultado. Todo reprocessamento é auditado (`audit_logs`,
`action = 'UPDATE'`, `old_data`/`new_data` com o saldo antes/depois e o
motivo).

## 16. Custos Standard (preparado)

`product_standard_costs` (`cost`, `version`, `valid_from`/`valid_until`,
`status`) segue o mesmo padrão de versionamento de
`product_fiscal_profiles` (0038)/`product_boms` (0027): índice único
parcial garante uma única versão `active` por produto;
`fn_set_product_standard_cost` obsoleta a anterior na mesma transação
em que cria a nova. `fn_update_product_standard_cost_notes` só edita
observações — custo/versão nunca são editáveis (§14). **Nenhuma**
função de valoração desta fase lê esta tabela — o custo médio móvel
continua sendo o método operacional; custo padrão é só estrutura para
uma evolução futura.

## 17. Centro de custo

`cost_centers` (Financeiro, 0031) é reaproveitado sem alteração — esta
fase não cria uma segunda tabela de centro de custo. Nenhuma função de
custo desta etapa grava `cost_center_id` ainda (não há uma dimensão de
centro de custo em `stock_movements`/`production_orders` para herdar) —
preparado para quando essa referência existir, nunca inventado agora.

## 18. Financeiro

Mesmo princípio do Financeiro (`docs/FINANCE.md` §1) e do Fiscal
(`docs/FISCAL.md` §12): o Custo **nunca** cria `accounts_payable`/
`accounts_receivable`/`financial_transactions` automaticamente.
`cost_movements.source_type = 'purchase_receipt_item'` permite, quando
necessário, rastrear até o recebimento e, a partir dele, até o título a
pagar gerado por `fn_generate_accounts_payable_from_purchase_receipt`
(Financeiro 0032) — sempre por referência, nunca duplicando a tabela.

## 19. Rastreabilidade

Cada `cost_movement` responde "de onde veio" via `source_type` +
`source_id` (referência polimórfica, sem FK — mesmo padrão de
`stock_movements.reference_type`/`reference_id` e
`fiscal_documents.source_type`/`source_id`), evitando dezenas de
colunas nullable: `purchase_receipt_item`, `shipment_item`,
`stock_transfer_item`, `stock_adjustment_item`, `stock_count_item`,
`production_order`, `production_scrap`. `stock_movement_id` (FK direta,
única) é sempre o vínculo estrutural com o movimento físico que gerou
o custo.

## 20. Custo e lotes

`cost_movements`/`product_cost_balances` compartilham o mesmo grão de
`stock_balances` (`company_id, product_id, location_id, lot_id`,
`coalesce` de `lot_id` para tratar produto sem lote como um grão
próprio) — o custo já pode variar por lote quando o produto é
controlado por lote, sem nenhuma extensão adicional. O histórico por
lote é preservado da mesma forma que qualquer outro grão (§14).

## 21. Serializados

Não implementado nesta fase (deliberado, seção 21 do enunciado) — o
grão de custo é por produto/local/lote, nunca por número de série
individual. A arquitetura (ledger append-only + saldo derivado por
grão) permite adicionar `serial_number` como uma dimensão adicional do
grão no futuro sem redesenho, se o negócio realmente precisar de custo
individual por unidade serializada.

## 22. API

`/api/cost-methods` (lista os 3 métodos e seu status
implementado/preparado). `/api/cost-movements` (filtrável por
`?productId=`/`?locationId=`/`?sourceType=`). `/api/product-costs`
(saldo valorado por grão, filtrável por `?productId=`/`?locationId=`),
`/api/product-costs/reprocess` (POST, `fn_reprocess_product_cost`).
`/api/inventory-valuation` (a view, filtrável por `?productId=`/
`?locationId=`). `/api/standard-costs` (+`/[id]`, `/[id]/notes`).
Nenhum CRUD inútil — as únicas operações de custo iniciadas
diretamente pelo usuário são consulta, reprocessamento e custo padrão;
o cálculo em si acontece dentro das funções de negócio de outros
módulos (Compras/Logística/Estoque/Produção), nunca por uma rota
"calcular custo" solta.

## 23. RBAC

| Código | Uso |
|---|---|
| `costs.view` | consultar `cost_movements`/`product_cost_balances` |
| `costs.reprocess` | `fn_reprocess_product_cost` |
| `inventory.valuation.view` | consultar a view `inventory_valuation` |
| `standard_costs.view/create/update` | custo padrão — `.update` só edita notas (§16) |

`costs.calculate`/`costs.close` (citados como exemplo no enunciado) não
foram criados como permissões próprias: não existe uma ação de usuário
distinta de "calcular custo" (acontece dentro das transações de negócio
de outros módulos, gated pela permissão *daquela* transação — ex.:
`purchase_receipts.confirm`) nem uma feature de "fechamento de período"
implementada nesta etapa — criar as permissões sem nenhuma função para
usá-las seria inflar RBAC além do que o domínio realmente pede.

## 24. RLS

Todas as tabelas novas (`cost_movements`, `product_cost_balances`,
`product_standard_costs`) têm `company_id` + RLS + índices, mesmo
padrão de todo módulo anterior. `select`-only para `authenticated` —
toda escrita via função `SECURITY DEFINER` (`fn_register_cost_movement`
é interna, sem grant nenhum, chamável só de dentro de outra função do
mesmo owner — mesmo padrão de `fn_post_stock_movement`, 0009).

## 25. Auditoria

`fn_reprocess_product_cost` grava em `audit_logs` (`action = 'UPDATE'`,
entidade `product_cost_balances`, saldo antes/depois + motivo).
`fn_set_product_standard_cost` grava `action = 'CREATE'` com a versão
anterior (quando existir) e a nova. Cálculo/aplicação de custo dentro
das transações de negócio de outros módulos já é coberto pelos
`audit_logs` que essas próprias funções gravam (ex.:
`fn_confirm_purchase_receipt` grava `CONFIRM`).

## 26. Concorrência

`fn_register_cost_movement` trava a linha de `product_cost_balances`
(`for update`) antes de ler/calcular/escrever — duas entradas
concorrentes no mesmo grão (produto/local/lote) serializam ali, nunca
produzem uma média incorreta por uma corrida entre ler e escrever.
`fn_reprocess_product_cost` trava a mesma linha antes de recalcular.

## 27. Idempotência

Um `stock_movement` nunca gera mais de um `cost_movement` — índice
único em `cost_movements.stock_movement_id` (estrutural, não só
convenção), com o mesmo tratamento de corrida por `unique_violation`
usado em `fn_post_stock_movement` (0009): se duas chamadas concorrentes
tentam registrar custo para o mesmo movimento, a segunda recebe a linha
já criada pela primeira, sem duplicar nem aplicar o delta duas vezes.

## 28. Precisão

Toda coluna de custo/quantidade-monetária/valor é `NUMERIC` — nunca
`FLOAT`: `unit_cost numeric(14,6)` (mais casas decimais que valores
monetários comuns, para não perder precisão em produtos de baixo valor
unitário e alta quantidade), `total_cost`/`total_value`
`numeric(18,4)`.

## 29. Testes

`tests/cost-validations.test.ts` cobre a camada de validação Zod
(`src/lib/validations/costs.ts`) e os tipos de `schema.ts`. A lógica
transacional real (custo médio móvel, entrada, entrada concorrente,
transferência sem lucro, saída/COGS, produção/consumo/produto acabado,
scrap, ajuste, lote, histórico, reprocessamento, idempotência, RLS,
RBAC) vive nas funções SQL e só é verificável contra um Postgres real,
fora do alcance desta etapa.

## 30. Frontend

Nenhuma tela nova — banco de dados, backend, domínio, integrações,
RBAC/RLS, testes e documentação, como pedido; frontend fica para uma
etapa futura.
