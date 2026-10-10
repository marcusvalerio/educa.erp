# Relatório de segurança multiempresa — catálogo de produtos e views

Branch `claude/atlas-neon-ux-crm` · 10/10/2026 · correção: migration
`0091_isolamento_catalogo_e_views.sql` + ajustes de API.

**Escopo da validação:** a correção foi validada **somente em bancos locais
descartáveis** (PostgreSQL 16) e no app compilado local. Na **produção**
(Supabase, PostgreSQL 17.6) foram feitas apenas consultas de **catálogo e
contagens**, sem ler linhas de negócio e sem alterar nada. **A produção
continua com os defeitos descritos aqui** até que a 0091 seja aplicada lá,
com autorização.

Dados de teste fictícios: empresas Gama/Delta (E2E pelo app) e Alfa/Beta
(testes de banco). Nenhum dado real aparece neste documento.

## 1. Problemas reproduzidos

### 1.1 Unidades de medida legíveis entre empresas (incidente reportado)

| | Antes (banco igual ao de produção) | Depois (com a 0091) |
|---|---|---|
| Gama · Somente leitura lê `units` | **33 unidades de 3 empresas**, inclusive as 10 da Delta (CM, CX, FD, G, KG, L, M, ML, PAL, UN) | 10, só da Gama |
| Gama · Vendedor (sem `units.read` no catálogo) | 33, de 3 empresas | 10, só da Gama |
| Gama · Administrador | 33, de 3 empresas | 10, só da Gama |
| Delta · Administrador | 33 | 10, só da Delta |

O que vazava: **todas as colunas** de `units` (código, nome, símbolo, tipo,
casas decimais, unidade-base, situação) **e o `company_id`**, ou seja, o
identificador interno de todas as outras empresas. Clientes, pedidos e
demais tabelas não vazavam por esse caminho (Gama lê 0 clientes da Delta).

**Por onde:** acesso direto ao banco com o JWT do usuário (Data API do
Supabase/PostgREST, ou `pg` com `request.jwt.claims` no Neon). **A API do
app não vazava**: as rotas `/api/units` usam o cliente administrativo e
filtram pelo `company_id` da sessão. O E2E confirma que a rota sempre
devolveu só a empresa do usuário.

**Produção (consulta de catálogo):** a policy `units_select_authenticated
USING (true)` **existe** em produção, ao lado de `units_select`.

### 1.2 Views financeiras e de estoque legíveis sem login (encontrado nesta missão; mais grave)

`v_cash_flow_summary`, `v_cash_flow_projection`, `inventory_valuation` e
`v_sales_order_item_margin` rodavam com os direitos do **dono** (que ignora o
RLS) e tinham `SELECT` para `anon` e `authenticated`.

| | Antes | Depois |
|---|---|---|
| `anon` (sem login) lê `v_cash_flow_summary` | **3 empresas** (saldo, a receber, a pagar) | `permission denied` |
| Somente leitura da Alfa lê as 4 views | todas as empresas | só a Alfa (RLS de quem consulta) |

**Produção (consulta de catálogo):** as 4 views **não têm**
`security_invoker`, o dono é `postgres` (`bypassrls = true`) e
`anon` tem `SELECT`. Com a chave pública *anon* do projeto, a Data API do
Supabase devolve os totais financeiros, o valor de estoque e a margem por
item de **todas as empresas**. Não foi feita nenhuma leitura dessas views em
produção para confirmar o conteúdo; o risco foi deduzido do catálogo e
reproduzido localmente. **Recomenda-se tratar como incidente ativo** (seção 8).

### 1.3 Referências entre empresas no catálogo (encontrado nesta missão)

As FKs do catálogo eram de uma coluna só (`products.unit_id → units.id`,
`unit_conversions.to_unit_id → units.id`, `products.category_id`, `brand_id`,
`supplier_id`...). As rotas gravam com o cliente administrativo e fixam só o
`company_id` da linha. Por isso, um id de **outra empresa** era aceito: por
exemplo, uma conversão da Gama para uma unidade da Delta. Com o vazamento
1.1, os ids eram fáceis de obter.

**Produção (contagem, sem ler linhas):** **0** referências entre empresas nas
18 relações. As FKs da 0091 validam sobre os dados atuais.

## 2. Semântica real de `units` (comprovada)

- `units.company_id` é **NOT NULL**; `unique (company_id, code)` e
  `unique (id, company_id)`; FK para `companies` com `on delete cascade`.
- Toda unidade nasce **por empresa**: o gatilho `seed_company_units` de
  `companies` semeia as 10 unidades padrão em cada empresa nova.
- **Não existe unidade global, de sistema nem sem empresa**: 0 linhas com
  `company_id` nulo, e a coluna não aceita nulo. O conceito de "registro
  global" **não existe** para unidades. Catálogos realmente globais (sem
  `company_id`) são outros: `permissions`, `platform_modules`,
  `platform_module_permission_map`, `permission_actions` e
  `dashboard_focus_areas`. Neles `USING (true)` é coerente e foi mantido.
- Categorias, marcas, conversões, produtos e listas de preço seguem o mesmo
  modelo: tudo por empresa, sem compartilhamento.
- **Empresa ativa:** `has_permission(company_id, código)` (SECURITY DEFINER)
  exige um `public.users` ativo do `auth.uid()` **naquela empresa**, com
  papel ativo que tenha o código e o módulo habilitado. Nada vem do
  cliente.
- **Usuário em várias empresas:** o banco permite (um `auth_user_id` em
  vários `public.users`), e cada linha só dá acesso à própria empresa
  (teste 8b). A API resolve a empresa pela sessão
  (`getAuthContext` → `users` por `auth_user_id`, `maybeSingle`). Um login
  ligado a duas empresas **falha fechado** (401) na API. Não existe seletor
  de empresa: o cliente nunca escolhe o tenant.

## 3. Causa raiz

1. A `0009` aplicada em produção (11/09, versão que não está no
   repositório: `poc/neon-full/sql/prod-history/20260911130849_0009.sql`)
   criou `units` como **catálogo global** (`code` PK, sem `company_id`) com
   `units_select_authenticated USING (true)`. Para uma tabela global, isso
   estava correto.
2. A `0006b_reconcile_units_legacy_to_tenant_model.sql` converteu `units`
   para **por empresa** e declara: "NÃO cria/altera nenhuma policy de RLS".
   As migrations seguintes criaram `units_select` com `has_permission`, mas
   **ninguém removeu a policy do modelo global**.
3. Policies PERMISSIVE do PostgreSQL somam-se por **OU**. Com `true` numa
   delas, a outra deixa de restringir.

Views (1.2): criadas nas migrations 0035/0043/0047 sem `security_invoker`.
Mantiveram o `GRANT` padrão do Supabase para `anon`/`authenticated`.

FKs (1.3): o padrão composto `(coluna, company_id)` já existia em
produção e preço, mas não foi aplicado às tabelas mais antigas do catálogo.

## 4. Correção (migration 0091)

1. `drop policy if exists units_select_authenticated`. As 4 policies de
   `units` foram reafirmadas (`units.read/create/update/delete` na empresa da
   linha) e o RLS foi mantido habilitado.
2. Catálogo de permissões: ver `RELATORIO-PERMISSOES-PRODUTOS.md`.
3. 18 FKs compostas `*_same_company_fk` (coluna, `company_id`) →
   `(id, company_id)` do pai, com o mesmo `on delete` da FK original
   (`set null (coluna)` onde era `set null`). Foram adicionadas `NOT VALID` e
   **validadas só quando não há violação**. Se houver, ficam `NOT VALID`
   (protegem as gravações novas) e um `WARNING` informa a contagem.
   **Nenhuma linha é apagada.**
4. Views: `security_invoker = true` e `revoke all ... from anon`. A API lê
   essas views com o cliente administrativo e filtro de empresa, então nada
   muda para o app.
5. A migration é idempotente e funciona nas duas ordens (só esta linha ou
   depois de 0076–0088). Ver `RELATORIO-INTEGRACAO-MIGRATIONS.md`.

**Ajustes de API** (mesma missão):
- Erro de FK numa gravação passou a **422** `RELATED_NOT_FOUND`, com
  mensagem genérica, sem nome de constraint nem id. Antes era 409 "não é
  possível excluir".
- Exportar exige a permissão de leitura da própria entidade. Importar exige
  criar e editar a entidade (seção 6).

## 5. Políticas finais (catálogo)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `units` | `units.read` | `units.create` | `units.update` | `units.delete` |
| `unit_conversions` | `unit_conversions.read` | `.create` | `.update` | `.delete` |
| `product_categories` | `categories.read` | `categories.create` | `categories.update` | `categories.delete` |
| `product_brands` | `brands.read` | `brands.create` | `brands.update` | `brands.delete` |
| `products` | `products.read` | `products.create` | `products.update` | `products.delete` |
| `product_suppliers`, `product_units`, `product_variants`, `product_barcodes` | `products.read` | `products.update` | `products.update` | `products.update` |
| `price_lists` | `price_lists.read` | `.create` | `.update` | `.delete` |
| `price_list_items` | `price_lists.read` | `price_lists.update` | `price_lists.update` | `price_lists.update` |

Todas usam `has_permission(company_id, …)` para o papel `authenticated`.
`anon` não tem policy, e portanto não tem acesso. O teste
`permissoes-produtos-db` falha se alguma policy permissiva sem escopo de
empresa voltar a existir nessas tabelas.

## 6. Caminhos alternativos revisados

| Caminho | Situação |
|---|---|
| Views (4 encontradas no schema `public`) | **corrigidas** (1.2) |
| `fn_seed_company_units`, `fn_seed_default_roles_for_company` (SECURITY DEFINER) | sem `EXECUTE` para `authenticated`/`anon` (teste 12) |
| `has_permission` (SECURITY DEFINER) | só responde pelo `auth.uid()` da sessão; perguntar por outra empresa devolve `false` (teste 8) |
| Rotas genéricas `/api/<cadastro>` (cliente administrativo) | empresa da sessão; `get/update/delete` filtram por `company_id` (id de outra empresa → 404); corpo/URL com `company_id`/`companyId` ignorados (E2E) |
| Ids relacionados nas gravações (cliente administrativo) | antes aceitos; **agora recusados pelas FKs compostas** (422) |
| Importação/exportação (cliente administrativo) | antes só `import_export.*`: quem exportava lia qualquer cadastro da própria empresa (ex.: usuários sem `users.read`). **Agora exige a permissão da entidade** (E2E) |
| Credenciais privilegiadas no navegador | `createAdminClient` só em módulos `server-only`. As variáveis `NEXT_PUBLIC_*` não incluem chave de serviço |
| Edição parcial (PATCH) | com zod 4, `.partial()` aplicava os defaults e um PATCH com um campo **apagava** unidade, categoria, marca e preços e reativava o cadastro. **Corrigido**: só os campos enviados são gravados |

## 7. Testes executados

**Banco, com RLS real** (`tests/isolamento-multiempresa-db.test.ts`, 14
casos; `tests/permissoes-produtos-db.test.ts`, 7 casos):

| # | Caso (Alfa × Beta) | Esperado | Antes (0075 + 0089/0090) | Depois (0091) |
|---|---|---|---|---|
| 0 | unidades próprias semeadas; nenhuma sem empresa | ok | ok | ok |
| 1 | Alfa lê as próprias | só Alfa | **falha** (vê Beta) | ok |
| 2 | Beta lê as próprias | só Beta | **falha** | ok |
| 3 | Alfa filtra pela Beta (comum e admin) | 0 | **falha** | ok |
| 4 | Beta filtra pela Alfa | 0 | **falha** | ok |
| 5 | id direto, código, paginação, junção por conversões | 0 | **falha** | ok |
| 6 | Alfa (admin) insere unidade na Beta | recusa RLS | recusa (sem código no catálogo) | recusa RLS |
| 7 | Alfa altera/exclui unidade da Beta | 0 linhas | 0 linhas | 0 linhas |
| 8 | mover a própria unidade para a Beta; `has_permission(Beta)` | recusa / false | 0 linhas / false | recusa / false |
| 8b | login em duas empresas com papel só na Alfa | só Alfa | **falha** | ok |
| 9 | nenhuma policy de leitura além de `units.read` | ok | **falha** (`true`) | ok |
| 10 | sem permissão não lê; Somente leitura não escreve | ok | **falha** | ok |
| 11 | produto e conversão com unidade/categoria da Beta | recusa FK | **falha** (aceito) | ok |
| 12 | views sem login; funções de semeadura | negado | **falha** (anon lê) | ok |
| P | API × catálogo × RLS; sem `USING true`; leitura ≠ escrita | ok | 3 falhas | ok |

Resultado: banco igual ao de produção **8 aprovados / 13 falhos**; com a
0091, **21/21**, nas duas sequências (só esta linha e integrada) e na cópia
do banco já atualizado.

**App compilado, sessões reais**
(`poc/neon-full/e2e/e2e-catalogo-isolamento.mjs`, Gama: Administrador,
Vendedor e Somente leitura; Delta: Administrador): **37/37**. O resultado
está em `evidencias/seguranca-multiempresa/e2e-catalogo-isolamento.json`.
Cobre:
- leitura só da própria empresa nas 4 identidades;
- `companyId` da outra empresa na URL e `company_id` no corpo ignorados;
- `GET/PATCH/DELETE` de id da Delta → 404, sem dados;
- conversão, produto e edição de produto com unidade ou categoria da Delta →
  422, nada gravado;
- Somente leitura e Vendedor → 403 em criar, editar e excluir unidades e
  categorias;
- exportação: Vendedor com `import_export.export` e sem `users.read` → 403;
  clientes → 200, só da Gama;
- tela de Produtos (Administrador e Somente leitura) sem aviso e sem
  chamadas recusadas;
- edição parcial mantém a unidade.

## 8. Limitações e riscos remanescentes

1. **Produção não foi corrigida.** Os itens 1.1 e 1.2 estão ativos lá. O
   1.2 dispensa login. Ação recomendada, com autorização: aplicar a 0091
   (ou, como contenção imediata, só a parte 4 — `security_invoker` +
   `revoke ... from anon` nas 4 views — e o `drop policy` da parte 1),
   depois de um backup.
2. Logs de acesso da Data API do Supabase não foram consultados. Não há
   como afirmar se o vazamento foi explorado.
3. A RLS só protege o acesso direto ao banco. As rotas do app usam o
   cliente administrativo e dependem da checagem de permissão no servidor e
   dos filtros por empresa. As FKs compostas cobrem as referências do
   catálogo. Outros módulos com FKs de uma coluna para tabelas por empresa
   não foram revisados nesta missão.
4. Login ligado a duas empresas: a API recusa (401). Escolher a empresa
   ativa é funcionalidade inexistente, não um defeito desta missão.
