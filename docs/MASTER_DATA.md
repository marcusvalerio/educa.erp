# Cadastros Mestres Avançados — Fase 13

Evolução dos cadastros mestres (`supabase/migrations/0049-0051`), construída sobre Catálogo, Comercial, Compras e Logística já existentes.

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 0. O que já existia (nunca duplicado)

Antes de codificar, esta fase inspecionou o que já existe — a maior parte do que o enunciado pede **já foi construída na Fase 2b** (`0007_product_catalog.sql`) e na Fase 4 (`0019_commercial_foundation.sql`):

| Pedido no enunciado | Já existe desde | Nesta fase |
|---|---|---|
| Unidades de medida | `units` (0007) | evoluída (símbolo/tipo/casas decimais/base) |
| Conversão de unidades | `unit_conversions` (0007) | evoluída (vigência/produto específico) |
| Categoria de produto hierárquica | `product_categories` (0007) | evoluída (descrição + trigger anti-ciclo) |
| Marca | `product_brands` (0007) | evoluída (código + descrição) |
| Produto com variações (base) | `product_variants` (0007) | inalterada — já cobre a seção 13.8 |
| Múltiplos fornecedores por produto | `product_suppliers` (0007) | inalterada |
| Múltiplos códigos de barra | `product_barcodes` (0007) | inalterada |
| Cliente: limite de crédito, segmento, status comercial | `customers.credit_limit/segment/commercial_status` (0002/0019) | `segment` ganhou CHECK formal |
| Cliente → condição de pagamento/tabela de preço/vendedor padrão | `customers.default_payment_terms_id/default_price_list_id/default_sales_representative_id` (0019) | inalterada |
| Condições comerciais | `payment_terms`/`price_lists`/`sales_representatives` (0019) | inalteradas |
| Segmentação de produto (produção) | `products.production_type` (0026) | dimensão DIFERENTE, ver §6 |

Nenhuma dessas entidades foi recriada com outro nome — esta fase só evolui (`alter table`) o que já existe.

## 1. Unidades de medida (migration 0049)

`units` ganhou: `symbol` (ex.: "kg"), `unit_type` (COUNT/WEIGHT/VOLUME/LENGTH/AREA/TIME/OTHER — classificação dimensional, só organizacional), `decimal_places` (casas decimais de exibição/arredondamento) e `base_unit_id` (autorreferência — a unidade de referência do seu `unit_type`, ex.: KG é a base de peso). Nenhum desses campos participa do CÁLCULO de conversão — isso continua exclusivamente em `unit_conversions`.

## 2. Conversões de unidade (migration 0049)

`unit_conversions` ganhou `product_id` (nullable — conversão específica de um produto, ex.: "1 CAIXA = 12 UN" para o produto A vs. "1 CAIXA = 24 UN" para o produto B) e `valid_from`/`valid_until` (vigência). A unicidade original (`company_id, from_unit_id, to_unit_id`) foi substituída por um índice único por expressão que trata `product_id` nulo como um "produto" próprio (`coalesce`, mesmo padrão de `stock_balances.lot_id`) — permite a conversão global e as específicas coexistirem sem ambiguidade.

`fn_convert_unit_quantity(company_id, from_unit_id, to_unit_id, quantity, product_id?, reference_date?)` resolve deterministicamente: conversão específica do produto (direta, depois inversa) → conversão global (direta, depois inversa) → erro claro se nenhuma existir. Nunca "adivinha" um fator.

**Limitação documentada:** ciclos multi-hop (A→B→C→A) não são detectados — só o caso direto (`from_unit_id <> to_unit_id`, CHECK desde 0007) e a ambiguidade produto/global são guardados estruturalmente. Um grafo de conversões transitivas fica como evolução futura.

## 3. Categorias de produto (migration 0049)

`product_categories` ganhou `description`. Prevenção de ciclo de hierarquia: o CHECK `parent_id <> id` (0007) já cobre o caso trivial; o trigger `guard_category_hierarchy` (novo) percorre a cadeia de ancestrais antes de aceitar um novo `parent_id`, bloqueando ciclos profundos (A→B→C→A) — profundidade máxima 100 níveis.

## 4. Marcas (migration 0049)

`product_brands` ganhou `code` (opcional, único por empresa quando informado) e `description` — sem quebrar marcas já cadastradas sem código.

## 5. Atributos de produto (migration 0050)

`product_attributes` (Cor, Tamanho, Voltagem...) + `product_attribute_values` (lista fechada, só para `input_type = SELECT`) + `product_attribute_assignments` (produto ↔ atributo ↔ valor, exatamente um dos quatro campos `value_id`/`value_text`/`value_number`/`value_boolean` preenchido — CHECK estrutural). Nem um JSON solto (teria zero tipagem) nem uma coluna por característica (explodiria o schema a cada atributo novo). `fn_assign_product_attribute` valida que o campo preenchido é consistente com `input_type` do atributo (o CHECK sozinho não sabe *qual* atributo está sendo atribuído) e faz upsert (reatribuir substitui o valor anterior, nunca duplica a linha).

## 6. Unidade por produto e segmentação (migration 0050)

`products` ganhou `purchase_unit_id`/`sale_unit_id`/`production_unit_id` (nulos = mesma `unit_id` de estoque) — a conversão entre elas é sempre resolvida por `fn_convert_unit_quantity` no momento do uso, nunca um fator fixo duplicado em `products`. E `product_segment` (RESALE/RAW_MATERIAL/FINISHED_GOOD/SERVICE) — dimensão **diferente** de `production_type` (0026, que descreve *origem*: purchased/manufactured/both). Um produto pode ser `production_type='manufactured'` e `product_segment='FINISHED_GOOD'` simultaneamente; nenhuma coluna foi substituída.

## 7. Endereços e contatos de parceiro (migration 0051)

`party_addresses`/`party_contacts` são polimórficas por `party_type` (customer/supplier/carrier) + `party_id` — mesmo padrão de `source_type`/`source_id` usado em todo o sistema (`stock_movements`, `fiscal_documents`). `customers`/`suppliers`/`carriers` continuam com seus próprios campos de endereço únicos (o endereço "rápido" do cadastro); estas tabelas são para quando um parceiro precisa de **mais de um** endereço/contato (cobrança ≠ entrega, por exemplo).

Guarda de qualidade de dados: um trigger (`fn_guard_party_reference`) valida que `party_id` realmente existe na tabela correspondente a `party_type` **e** pertence à mesma empresa antes de aceitar a linha — sem isso, um `party_id` digitado errado ficaria silenciosamente órfão (impossível de expressar como FK real, por ser polimórfico).

`is_primary`: um índice único parcial garante no máximo um endereço/contato principal por parceiro. Trocar o principal é atômico via `fn_set_primary_party_address`/`fn_set_primary_party_contact` (desmarca o anterior e marca o novo na mesma transação) — a API nunca insere/atualiza `is_primary=true` diretamente (RLS bloqueia).

## 8. Fornecedores, transportadoras, motoristas, veículos (seções 13.13-13.16)

Inspecionados e já adequados desde 0002/0007: `suppliers.supplier_category` já cobre classificação; `drivers.cnh_expiration` já cobre validade de habilitação; `vehicles.plate/type/cargo_capacity_kg/carrier_id` já cobre identificação/capacidade/propriedade. `party_addresses`/`party_contacts` (§7) agora cobrem múltiplos endereços/contatos para os três (fornecedor, transportadora — motoristas/veículos usam o contato/endereço da transportadora à qual pertencem, não precisam de um próprio). Nenhuma coluna nova necessária nessas quatro tabelas.

## 9. Histórico (seção 13.22)

Nenhuma mudança desta fase afeta documentos já emitidos: `fiscal_document_items`/`sales_order_items`/`purchase_order_items` continuam com seus próprios snapshots (nome, NCM, preço no momento da criação) — mudar `product_categories.description` ou reatribuir um atributo de produto amanhã não altera nenhum documento histórico, porque esses documentos nunca referenciam as tabelas mestres ao vivo (princípio já estabelecido desde a Fase 8/Fiscal).

## 10. RBAC

| Código | Uso |
|---|---|
| `product_attributes.view/create/update` | atributos, valores e atribuições |
| `party_addresses.view/create/update` | endereços de parceiros |
| `party_contacts.view/create/update` | contatos de parceiros |

`units.*`/`unit_conversions.*`/`product_categories.*`/`product_brands.*` já existiam desde 0005 — não recriadas.

## 11. RLS e auditoria

Todas as tabelas novas (`product_attributes`, `product_attribute_values`, `product_attribute_assignments`, `party_addresses`, `party_contacts`) têm `company_id` + RLS + índices. `product_attribute_assignments` é select-only (escrita exclusiva via `fn_assign_product_attribute`); `party_addresses`/`party_contacts` têm CRUD direto via `has_permission` exceto `is_primary` (só via função). Nenhuma auditoria de leitura — apenas operações relevantes (não há necessidade de auditar cada consulta de atributo).

## 12. API

`/api/unit-conversions/convert` (POST, `fn_convert_unit_quantity`). `/api/product-attributes` (+`/[id]`), `/api/product-attribute-values`, `/api/product-attribute-assignments` (POST valida consistência com `input_type`). `/api/party-addresses` (+`/[id]`, `/[id]/set-primary`), `/api/party-contacts` (+`/[id]`, `/[id]/set-primary`).

`units`/`product-categories`/`product-brands`/`unit-conversions`/`products` continuam servidos pelo factory genérico já existente (`src/lib/api/handlers.ts`) — os novos campos ficam disponíveis no banco e em `schema.ts`; expor os novos campos nesse factory genérico legado (mappers.ts/cadastros/types.ts em português) é trabalho de UI que fica para uma etapa futura, coerente com "não construir frontend completo" — esta fase prioriza banco de dados/domínio/backend.

## 13. Testes e frontend

`tests/master-data-validations.test.ts` cobre a camada de validação Zod (`src/lib/validations/master-data.ts`). A lógica transacional real (conversão determinística, prevenção de ciclo, consistência de atributo por tipo, guarda de parceiro existente, atomicidade do "principal", RBAC, RLS, isolamento por empresa) vive nas funções/triggers SQL e só é verificável contra um Postgres real. Nenhuma tela nova.
