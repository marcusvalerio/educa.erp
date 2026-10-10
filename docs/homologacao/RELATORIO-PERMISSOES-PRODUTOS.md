# Relatório de permissões do catálogo de produtos

Branch `claude/atlas-neon-ux-crm` · 10/10/2026. Substitui a análise "A/B/C"
de `RELATORIO-CORRECOES-CRM-E-PAINEIS.md` §6, que estava "não alterado".
Validação **só local**. A produção não foi alterada.

## 1. Divergências encontradas

| # | Divergência | Efeito |
|---|---|---|
| D1 | A API e a RLS exigiam `product_categories.*`, `product_brands.*`, `units.*`, `unit_conversions.*` e `product_suppliers.*`. Esses códigos estão na `0005_rbac.sql` do **repositório**, mas a 0005 **aplicada em produção** é anterior e tem `categories.*` e `brands.*` (módulo `catalog`). Confirmado em produção: nenhum `units.*`, `unit_conversions.*`, `product_categories.*` ou `product_brands.*` | Ninguém, nem o Administrador, lia unidades, categorias ou marcas pela API (403). A tela de Produtos mostrava o aviso de "informações complementares" |
| D2 | `units_select_authenticated USING (true)` | Leitura de unidades entre empresas (ver relatório de segurança) |
| D3 | `price-list-items`: a API pedia `price_lists.create/.delete` para incluir e remover itens; a RLS pede `price_lists.update` | Com o cliente administrativo, quem só podia criar tabelas mexia nos itens de qualquer tabela |
| D4 | Importar e exportar só conferiam `import_export.*` | Exportava qualquer cadastro da empresa sem a permissão de leitura dele |
| D5 | `product_categories.code` e `product_brands.code` são NOT NULL, mas a API e a importação não enviavam código | Criar categoria ou marca pela API: HTTP 500. Importar "só com nome": a linha validava e falhava ao gravar. Ficava escondido atrás do 403 do D1 |
| D6 | PATCH genérico com zod 4: `.partial()` aplica os defaults | Editar um campo apagava unidade, categoria, marca, fornecedor e preços, e reativava o cadastro |

## 2. Modelo adotado

Princípios: reaproveitar o código que **já existe e já está concedido**,
criar código só onde **não há equivalente**, e manter a mesma permissão em
interface, API e RLS.

| Recurso | Permissão | Por quê |
|---|---|---|
| Produtos | `products.read/create/update/delete` | já existia |
| Categorias | `categories.*` (existente) | `product_categories.*` seria sinônimo redundante; `categories.*` já está nos papéis de produção |
| Marcas | `brands.*` (existente) | idem |
| Unidades | **`units.*` (novo, módulo `catalog`)** | não há equivalente; é o código da `0005` do repositório |
| Conversões de unidade | **`unit_conversions.*` (novo, módulo `catalog`)** | idem |
| Fornecedores do produto | `products.read` / `products.update` | vínculo é parte do produto, como `product_units` já fazia |
| Unidades, variantes e códigos de barras do produto | `products.read` / `products.update` | já era assim na RLS (sem rota própria) |
| Tabelas de preço | `price_lists.*` | já existia |
| Itens da tabela de preço | ler `price_lists.read`; incluir/alterar/remover `price_lists.update` | igual à RLS (D3) |

**Concessão dos códigos novos** (`0091`): cada papel, de sistema ou
personalizado, recebe `units.<ação>` e `unit_conversions.<ação>` **somente
para as ações que já tem em `categories.*`**. A família "catálogo" anda
junta. Leitura nunca vira escrita, e nenhum papel ganha uma ação que não
tinha.

- O Administrador de sistema recebe tudo (invariante da 0005).
- Nos modelos de empresa nova, o Vendedor passa a ter `units.read` e
  `unit_conversions.read`. Ele já tinha `categories.read`, e a tela de
  Produtos lê unidades.
- O módulo `catalog` foi mapeado ao módulo contratado "cadastros", como
  `products`.

Nada foi removido. Os papéis existentes não foram recalculados.

**Resultado por papel numa empresa nova** (igual nas duas sequências de
migrations; famílias: produtos, categorias, marcas, unidades, conversões,
tabelas de preço):

| Papel | Leitura | Criar | Editar | Excluir |
|---|---|---|---|---|
| Administrador | ✔ | ✔ | ✔ | ✔ |
| Gerente | ✔ | ✔ | ✔ | ✔ |
| Operador | ✔ | ✔ | ✔ | — |
| Vendedor | ✔ | — | — | — |
| Somente leitura | ✔ | — | — | — |

## 3. Matriz tela × API × permissão × RLS

| Tela / componente | Endpoint | Operação | API exige | Interface confere | Tabela | RLS |
|---|---|---|---|---|---|---|
| Cadastros → Produtos (`/app/cadastros/produtos`) | `GET /api/products` | listar | `products.read` | menu: `products.read` | `products` | `products.read` |
| idem | `POST` / `PATCH` / `DELETE /api/products[/id]` | criar, editar, excluir | `products.create/update/delete` | botões: `products.create/update/delete` | `products` | idem |
| idem, lista auxiliar | `GET /api/product-categories` | ler | `categories.read` | — (falha vira aviso) | `product_categories` | `categories.read` |
| idem, lista auxiliar | `GET /api/product-brands` | ler | `brands.read` | — (aviso) | `product_brands` | `brands.read` |
| idem, lista auxiliar | `GET /api/units` | ler | `units.read` | — (aviso) | `units` | `units.read` |
| idem, lista auxiliar | `GET /api/suppliers` | ler | `suppliers.read` | — (aviso) | `suppliers` | `suppliers.read` |
| (sem tela) | `/api/product-categories[/id]` | criar, editar, excluir | `categories.create/update/delete` | — | `product_categories` | idem |
| (sem tela) | `/api/product-brands[/id]` | idem | `brands.*` | — | `product_brands` | idem |
| (sem tela) | `/api/units[/id]` | idem | `units.*` | — | `units` | idem |
| (sem tela) | `/api/unit-conversions[/id]` | ler, criar, editar, excluir | `unit_conversions.*` | — | `unit_conversions` | idem |
| (sem tela) | `/api/product-suppliers[/id]` | ler; vincular, editar, remover | `products.read`; `products.update` | — | `product_suppliers` | idem |
| (sem tela) | `/api/price-lists[/id]` | CRUD | `price_lists.*` | — | `price_lists` | idem |
| (sem tela) | `/api/price-list-items[/id]` | ler; incluir, editar, remover | `price_lists.read`; `price_lists.update` | — | `price_list_items` | idem |
| (sem rota) | — | — | — | — | `product_units`, `product_variants`, `product_barcodes` | `products.read` / `products.update` |
| Importação | `/api/imports…` | upsert | `import_export.import` + `<entidade>.create` + `.update` | — | por entidade | por entidade |
| Exportação | `/api/exports?entityType=` | CSV | `import_export.export` + `<entidade>.read` | — | por entidade | — (cliente administrativo, filtrado pela empresa) |

A fonte única do mapa rota → permissão é `src/lib/api/entity-permissions.ts`,
usado pelas rotas genéricas, pela importação/exportação e pelos testes.
Na interface, a tela de Produtos confere `products.*`. As listas auxiliares
não são conferidas no cliente: quando a API recusa, a lista principal
aparece e o aviso "Algumas informações complementares não foram carregadas"
mostra que algo faltou. **A falha auxiliar não esconde o problema de
autorização.**

## 4. Testes (permitido × negado)

| Prova | Onde | Resultado |
|---|---|---|
| Toda permissão exigida pelas rotas do catálogo existe no catálogo | `permissoes-produtos-db` (era **TODO**) | ✔ |
| Policies de RLS = permissões da API, por operação e tabela | `permissoes-produtos-db` | ✔ (achou o D3) |
| Nenhum sinônimo redundante criado | `permissoes-produtos-db` | ✔ |
| Sem policy permissiva sem escopo de empresa (regressão do `USING true`) | `permissoes-produtos-db` (era **TODO**) | ✔ (falha no banco sem a 0091) |
| Leitura não vira escrita (Vendedor e Somente leitura sem escrita em unidades) | `permissoes-produtos-db` | ✔ |
| Autorizado lê (Administrador, Vendedor, Somente leitura → 200, só a própria empresa) | E2E `e2e-catalogo-isolamento` | ✔ |
| Sem permissão é negado (Somente leitura e Vendedor: criar, editar e excluir unidade e categoria → 403) | E2E | ✔ |
| Sem permissão de unidades não lê nem a própria empresa | `isolamento-multiempresa-db` (10) | ✔ |
| Uma empresa não lê nem grava dados de outra | `isolamento-multiempresa-db` e E2E | ✔ |
| Tela de Produtos carrega sem aviso para Administrador e Somente leitura | E2E | ✔ |
| Criar e editar produto; edição parcial mantém a unidade | E2E | ✔ |
| Exportar exige a leitura da entidade | E2E | ✔ |
| Categoria/marca exigem código; import "só nome" recusado na validação | `catalog.test.ts`, `import-export-validations.test.ts` | ✔ |

Os **2 TODO** anteriores foram resolvidos: o modelo pôde ser determinado pela
arquitetura existente (códigos já concedidos em produção + códigos da 0005
do repositório para o que não tinha equivalente).

## 5. Auditoria da solução da outra linha (0076, P2)

A 0076 de `claude/e2e-empresa-nova-correcoes` usa **o mesmo modelo**. A
auditoria encontrou:

- **Correto e mantido:** os códigos, a regra de concessão pela mesma ação em
  `categories.*`, a remoção da `units_select_authenticated` e o mapeamento
  do módulo.
- **Não cobria:** views com `anon` (1.2 do relatório de segurança), FKs de
  uma coluna, D3, D4, D5 e D6.
- **Risco de regra de negócio (P3 da 0076, fora do catálogo):** o novo
  modelo da **Somente leitura** de empresas novas concede **toda** permissão
  `read/view`, **inclusive o CRM** (6 códigos). Isso decidiria sozinho a
  decisão pendente nº 6. A 0091 mantém a regra vigente (Somente leitura sem
  CRM), ajustando pontualmente o modelo quando a 0076 estiver aplicada.

  O modelo também dá à Somente leitura `users.read`, `roles.read` e
  `audit_logs.read`. Isso **já valia** antes (ação `read` na 0075) e não
  foi mudado.

## 6. Decisões ainda pendentes

1. **Quais papéis recebem leitura e escrita em cada catálogo (decisão nº 2).**
   A matriz da seção 2 deriva só das permissões que os papéis já tinham em
   `categories.*`. Confirmar, por exemplo:
   - se o Operador deve criar e editar unidades e conversões;
   - se o Vendedor deve ler conversões.
2. **Somente leitura e o CRM (decisão nº 6)**, que a 0076 alteraria (seção 5).
3. Telas próprias para unidades, categorias, marcas, conversões e tabelas
   de preço não existem. Hoje esses cadastros são só por API ou importação.
