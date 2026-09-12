# Configuração e Parametrização do ERP — Fase 14

Camada de configuração (`supabase/migrations/0052-0053`), construída sobre RBAC, Fiscal (fiscal_establishments) e todos os módulos operacionais já existentes.

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 1. Uma tabela, não um `settings(key, value)` sem tipo (seção 14)

`system_settings` é a **única** tabela de configuração — mas não é um par `key/value` em JSON solto: cada linha tem `value_type` (STRING/INTEGER/DECIMAL/BOOLEAN/DATE/JSON) e uma coluna própria por tipo (`value_string`/`value_integer`/`value_decimal`/`value_boolean`/`value_date`/`value_json`), com um CHECK garantindo que **exatamente** a coluna correspondente a `value_type` está preenchida. `JSON` só é usado quando o valor realmente não cabe em um escalar tipado (seção 14.5).

O **namespace de módulo** (seção 14.4 — "inventory.*", "sales.*"...) vive no próprio par `module`/`key` (ex.: `module='inventory', key='default_cost_method'`) — não uma tabela por módulo.

## 2. Três níveis, uma tabela (seção 14.1)

`company_id`/`establishment_id` nulos ou preenchidos representam os três níveis sem três tabelas:

| Nível | company_id | establishment_id |
|---|---|---|
| GLOBAL (padrão do sistema) | `null` | `null` |
| COMPANY | preenchido | `null` |
| ESTABLISHMENT | preenchido | preenchido |

Um CHECK garante `establishment_id` nunca aparece sem `company_id`. `establishment_id` referencia `fiscal_establishments` (FK composta com `company_id`) — integra com o que já existe (seção 14.3), nunca uma segunda tabela de estabelecimento.

## 3. Resolução determinística (seção 14.7/14.18)

`fn_resolve_setting(company_id, establishment_id, module, key, reference_date?)`: uma única query, filtrando linhas que casam (`company_id` nulo OU igual; `establishment_id` nulo OU igual) e ordenando por especificidade (`establishment_id is not null` antes de `company_id is not null`), `LIMIT 1`. Precedência sempre **ESTABLISHMENT > COMPANY > GLOBAL** — nunca duas queries com fallback implícito no código do chamador, nunca ambíguo. Respeita `valid_from`/`valid_until` (seção 14.19) e `status = 'active'`.

## 4. Escrita (seção 14.22) — permissão por nível, criar ≠ atualizar

`fn_upsert_setting` é o único ponto de escrita. A permissão exigida depende de **qual nível** está sendo escrito:

- `establishment_id` preenchido → `settings.establishment.update` (exige `company_id` também preenchido).
- só `company_id` preenchido → `settings.company.update`.
- ambos nulos (GLOBAL) → `settings.create` se a linha ainda não existir, `settings.update` se já existir — distinção real entre criar e atualizar, não fundidas na mesma permissão.

Rotas de conveniência (`/api/company-settings`, `/api/establishment-settings`) fixam o nível esperado no corpo antes de repassar para `fn_upsert_setting`, evitando um cliente "company" escrever acidentalmente em "establishment" (ou vice-versa).

## 5. Defaults (seção 14.6)

Seed de linhas GLOBAIS (`company_id`/`establishment_id` nulos) na própria migration: `inventory.default_cost_method = MOVING_AVERAGE` (mesmo vocabulário de `cost_movements.cost_method`, Fase 10 — nunca duplicado), `fiscal.default_tax_regime = SIMPLES_NACIONAL`, `company.default_currency = BRL`, `company.timezone = America/Sao_Paulo`, entre outros — `fn_resolve_setting` devolve essas linhas quando nem empresa nem estabelecimento configuraram nada.

## 6. Segurança (seção 14.20/14.21)

`value_type` **não inclui** um tipo "SECRET"/"TOKEN"/"CERTIFICATE" — a ausência é a proteção estrutural, não uma convenção de nome de chave que alguém poderia esquecer de seguir. Nenhuma senha, token, chave privada ou certificado é armazenável nesta tabela, por design. `fn_upsert_setting` grava em `audit_logs` (quem/quando/módulo/chave/tipo) — nunca o valor em si quando ele fosse sensível, mas como nenhum valor sensível pode ser gravado aqui, não há risco de vazamento via auditoria.

## 7. Configurações por módulo (seções 14.8-14.15)

Preparadas como namespaces (`module`), não como tabelas: `inventory.*` (método de custo, armazém padrão), `purchasing.*` (aprovação, tolerâncias), `sales.*` (desconto máximo, condição padrão), `logistics.*` (transportadora padrão), `production.*` (política de scrap), `finance.*` (conta padrão), `fiscal.*` (regime, série padrão), `controlling.*` (centro de custo padrão). Nenhuma lógica transacional existente foi alterada para *ler* esses parâmetros automaticamente nesta fase — a infraestrutura de resolução está pronta (`fn_resolve_setting`); integrar um módulo específico para de fato consultar e aplicar o parâmetro (ex.: `fn_create_purchase_order` lendo `purchasing.default_warehouse`) é uma integração pontual documentada como próximo passo, não feita às cegas nesta rodada (seção "não refatorar módulos antigos sem necessidade").

## 8. Numeração documental (migration 0053, seção 14.16)

**Distinção importante:** `document_sequences` **não substitui** `fn_generate_code` (0002) — o código interno (`PV-0001`, `PC-0001`, `DF-0001`...) de `sales_orders`/`purchase_orders`/`fiscal_documents`/etc. continua exatamente como está, via `sequence` Postgres nativa por tabela (compartilhada entre empresas — suficiente para um identificador interno). `document_sequences` resolve um problema diferente: uma numeração **oficial por empresa** (e opcionalmente por estabelecimento+série) que precisa começar do 1 por empresa — hoje `fiscal_documents.number` é informado manualmente pelo chamador (0039) justamente por não existir um gerador seguro para isso.

`fn_next_document_number(company_id, document_type, series_code, establishment_id?)`: trava a linha (`FOR UPDATE`), incrementa `current_number`, grava e retorna o número formatado (`prefix-000042`) numa única transação — **nunca** `SELECT MAX(numero) + 1` (proibido explicitamente pelo enunciado: duas transações concorrentes leriam o mesmo MAX e gravariam o número duplicado). Duas chamadas concorrentes para a mesma sequência serializam na trava; cada uma recebe um número distinto e sequencial (1, 2, 3, 4 — nunca 1, 1, 2, 3).

## 9. Sequência e série na mesma linha (seção 14.17)

Uma única tabela `document_sequences` representa **tanto** a série (código, descrição, estabelecimento, tipo de documento, status) **quanto** seu contador (`current_number`, `prefix`, `padding`) — "não criar uma sequência separada para cada caso se a estrutura de série já puder representar isso" foi interpretado literalmente: nenhuma tabela `document_series` separada de `document_sequences`.

`fn_create_document_sequence` cria explicitamente (nunca criada silenciosamente na primeira chamada de `fn_next_document_number` — isso forçaria prefixo/padding a nascerem com um default arbitrário em vez de configurados deliberadamente). `fn_next_document_number` **falha** com erro claro se a sequência não existir.

## 10. Integração aditiva com Fiscal (bônus, seção "integração com sistema existente")

`fn_assign_fiscal_document_number(fiscal_document_id, series_code)`: um caminho **adicional**, nunca automático — quem preferir numeração oficial concorrente-segura chama esta função em vez de informar `number`/`series` manualmente ao criar o documento. `fn_create_fiscal_document`/`fn_calculate_fiscal_document` (0039/0041) continuam **exatamente como estão** — nenhum workflow fiscal antigo foi alterado; a integração é só uma função nova que atualiza `number`/`series` de um documento ainda em `DRAFT`.

## 11. RBAC

| Código | Uso |
|---|---|
| `settings.view` | consultar configuração resolvida (`fn_resolve_setting`) |
| `settings.create`/`.update` | criar/editar configuração de nível GLOBAL |
| `settings.company.view`/`.update` | consultar/editar configuração de nível empresa |
| `settings.establishment.view`/`.update` | consultar/editar configuração de nível estabelecimento |
| `document_sequences.view`/`.create`/`.update` | séries de numeração — `.update` cobre editar E obter o próximo número |

## 12. RLS

`system_settings`: linhas GLOBAIS (`company_id` nulo) são visíveis a qualquer `authenticated` — não há empresa para isolar um padrão do sistema; linhas COMPANY/ESTABLISHMENT exigem `has_permission` do nível correspondente, nunca vazando entre empresas. `document_sequences`: `company_id` sempre obrigatório, select-only via `has_permission(company_id, 'document_sequences.view')`.

## 13. Testes e frontend

`tests/settings-validations.test.ts` cobre a camada de validação Zod (`src/lib/validations/settings.ts`), incluindo a consistência `value_type` ↔ campo de valor preenchido. A lógica transacional real (precedência determinística, concorrência de `fn_next_document_number`, RBAC por nível, RLS, isolamento por empresa, ausência de segredo armazenável) vive nas funções SQL e só é verificável contra um Postgres real. Nenhuma tela nova.
