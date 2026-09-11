# Produtos / Catálogo — rodada 1 (fundação)

Este documento descreve a evolução do cadastro de produtos de um
cadastro simples para uma fundação de catálogo ERP — não a maturidade
final (ver "O que fica para a próxima rodada").

Migration: `supabase/migrations/0009_catalog_foundation.sql`.

## Produto continua sendo catálogo, não estoque

`products.default_location_code` é configuração/default operacional
("onde este produto costuma ficar"), não saldo. Nenhuma coluna de
saldo/quantidade foi adicionada a `products` nesta rodada — o modelo
está preparado para, no futuro, `product → warehouse → location →
stock balance → stock movements` como tabelas separadas.

## O que foi adicionado

| Tabela | Por quê | Nota |
| --- | --- | --- |
| `units` | Unidades de medida (UN, KG, CX...) | **Catálogo global**, sem `company_id` — como `permissions`. Gerenciado por migration nesta rodada (RLS só libera SELECT). |
| `product_categories` | Hierarquia categoria → subcategoria → ... | Usa a extensão `ltree` (disponível no projeto, nunca usada antes desta rodada) — permite consultas de "todos os produtos desta categoria e subcategorias" sem N níveis de JOIN. |
| `product_brands` | Marca do produto | Tabela simples, flat. |
| `product_units` | Embalagens/conversões adicionais (ex.: 1 CX = 12 UN) com código de barras próprio por embalagem | `products.unit` continua sendo a unidade comercial padrão — esta tabela é só para embalagens **adicionais**, opcional. |
| `product_suppliers` | Um produto pode ter mais de um fornecedor (custo, prazo, preferência, SKU do fornecedor) | Substitui a suposição de fornecedor único. |
| `product_prices` | Fundação de preço/custo (`cost`/`sale`/`minimum`), com vigência (`valid_from`/`valid_to`) | *Exclusion constraint* via `btree_gist` impede dois períodos vigentes sobrepostos do mesmo tipo para o mesmo produto — testado na definição da constraint, não só documentado. Não é uma lista de preços completa (isso fica para depois). |

Tipos numéricos: `numeric(14,4)` para custo/preço/quantidades de
conversão — não `float`, para não acumular erro de arredondamento em
dinheiro/quantidade.

## O que NÃO foi feito (de propósito)

- **`products.category`/`subcategory`/`unit`/`supplier_id` não foram
  removidos.** Ganharam equivalentes relacionais (`category_id`,
  `brand_id`, `product_suppliers`), populados por **backfill** a
  partir dos dados existentes (ver abaixo) — os campos antigos
  continuam funcionando exatamente como antes. O corte definitivo
  (remover os campos de texto) fica para quando a UI migrar de fato
  para os seletores relacionais, não antes.
- **Sem product_variants.** Não há caso de uso real hoje (nenhum dado,
  nenhuma tela pedindo variantes) — criar a tabela agora seria
  especulativo. O padrão de `product_units` (id de produto + atributo +
  conversão/preço) é o mesmo que se estenderia para variantes quando
  houver necessidade real, sem refazer o produto.
- **Sem reparentamento de categoria.** O `path` (ltree) é calculado só
  no INSERT (trigger `set_path`); mover uma categoria já criada para
  outro pai — e recalcular o `path` de toda a subárvore — não foi
  implementado. Hoje isso significa: crie a árvore certa desde o
  início, ou recrie a categoria.
- **Sem lista de preços por cliente/segmento.** `product_prices` tem
  só três tipos fixos (custo/venda/mínimo) — não é um motor comercial.
- **Lote/série continuam como estavam** (`batch_controlled`/
  `expiration_controlled`, flags booleanas já existentes) — preparar o
  catálogo para elas não exigiu nenhuma mudança nesta rodada; as
  tabelas de lote/validade em si (`product → batch/lot → expiration`)
  ficam para quando Estoque for implementado.

## Migração dos dados existentes (sem quebrar nada)

Estratégia usada, nesta ordem, dentro da própria migration 0009:

1. Criar as tabelas novas.
2. Popular `units` com todas as unidades hoje realmente usadas em
   `products.unit` (conferido por query antes de escrever a migration:
   UN, KG, G, L, ML, M, CX, PC, KIT, T — todas cobertas) mais as do
   pedido original (CM, FD, PAL) que ainda não tinham uso.
3. Adicionar a foreign key `products.unit → units.code` **depois** do
   passo 2 — sem isso, qualquer valor de `unit` fora da lista quebraria
   a migration inteira; confirmado com uma contagem de órfãos = 0 antes
   de seguir.
4. Criar uma linha em `product_categories` para cada `category`
   distinta já usada, e uma linha filha para cada par
   `(category, subcategory)` distinto.
5. Popular `products.category_id` a partir do texto existente
   (preferindo o nível de subcategoria quando presente).
6. Popular `product_suppliers` a partir de `products.supplier_id`
   (`is_preferred = true`).
7. Só depois disso, RLS habilitada + policies.

Resultado conferido após a migration (projeto ASTRA.ERP real, não
simulado): 30/30 produtos com `category_id` preenchido (mesma
contagem de produtos que tinham `category` em texto), 30/30 com uma
linha em `product_suppliers` (mesma contagem que tinha `supplier_id`),
0 órfãos na FK de `unit`.

## UI desta rodada (mínima, aditiva)

Prioridade desta etapa foi banco → segurança → domínio → API →
repository → testes → UI (nessa ordem, conforme pedido). O que foi
exposto na interface:

- Duas novas rotas de API seguindo exatamente o mesmo padrão genérico
  dos 8 cadastros existentes: `/api/categories` e `/api/brands`
  (CRUD completo, mesmo contrato `list/get/create/update/toggleStatus/
  remove`). `/api/units` é uma listagem simples só leitura (a tabela
  não tem `id`/`status` — não se encaixa no factory genérico, e RLS já
  só libera SELECT para ela mesmo).
- No formulário de Produto (`src/lib/cadastros/forms.ts`), dois campos
  novos e **opcionais** — "Categoria (catálogo)" e "Marca" — populados
  a partir das tabelas reais via o mesmo mecanismo `optionsSource` já
  usado por Fornecedor/Local de estoque. Os campos antigos de texto
  (Categoria/Subcategoria/Unidade) continuam no formulário, inalterados.
- **Não foram criadas telas de Cadastro dedicadas** (listagem própria,
  menu lateral) para Categorias/Marcas nesta rodada — ficaria
  significativamente maior que "UI mínima" pedido, e a capacidade já
  fica exposta e testável via API e via o formulário de Produto. Isso é
  o próximo passo natural de UI, não implementado agora.
