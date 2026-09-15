# Importação + Exportação — Fase 21

Infraestrutura genérica e reutilizável de entrada/saída de dados (`supabase/migrations/0062`) — um único mecanismo de import job por entidade, nunca um importador isolado por cadastro.

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 0. Formatos: CSV real, XLSX preparado (não implementado) — decisão de segurança

`src/lib/import-export/csv.ts` implementa o parser/serializador CSV (RFC 4180-ish: aspas, vírgula/quebra de linha dentro de campo, aspas escapadas, CRLF/LF) **sem nenhuma dependência nova**.

XLSX **não foi implementado nesta fase**: a única biblioteca Node amplamente usada para isso (`xlsx`, SheetJS) foi avaliada e instalada para teste — `npm install xlsx` reporta **1 vulnerabilidade de severidade alta, sem correção disponível no pacote publicado no npm** (Prototype Pollution + ReDoS; a versão corrigida só é distribuída pelo CDN próprio da SheetJS, fora do fluxo padrão de `npm install`). Por instrução explícita de nunca introduzir uma dependência insegura, a biblioteca foi desinstalada e XLSX foi deixado como **PREPARADO**: `format` já aceita `'XLSX'` no banco e nos tipos; upload/exportação de XLSX retornam um erro de validação claro explicando a limitação, em vez de falhar silenciosamente ou fingir suporte.

## 1. Import job: estado rastreável (seção 21.2)

`import_jobs` (cabeçalho: `module`/`entity_type`/`format`/`column_mapping`/contadores) → `import_job_rows` (linha encenada, `raw_data` sempre preservado) → `import_job_errors` (linha/coluna/valor/código/mensagem/severidade, seção 21.6). Estados: `UPLOADED → VALIDATING → READY → PROCESSING → COMPLETED/COMPLETED_WITH_ERRORS`, com `FAILED` (zero linhas aproveitáveis) e `CANCELLED` (a partir de qualquer estado não terminal) como saídas alternativas. **Nenhuma linha é persistida na tabela de destino só pelo upload** (seção 21.3) — a persistência só acontece em `PROCESSING`, depois de `VALIDATING` ter marcado a linha como `VALID`.

O **parsing do arquivo acontece em TypeScript** (Node), nunca no banco — as funções `fn_*` só gerenciam o estado (contadores, transições, idempotência), reaproveitando exatamente o mesmo padrão transacional já usado em Workflow (`fn_decide_approval`, 0061): trava `import_jobs` (`FOR UPDATE`) antes de incrementar contadores em `fn_record_import_row_result`, nunca perde um incremento sob duas linhas "simultâneas" da mesma chamada.

## 2. Mapeamento e validação (seções 21.4/21.5)

`fn_set_import_job_mapping` grava `column_mapping` (coluna do arquivo → campo do ERP). `fn_start_import_validation` exige mapeamento configurado. A validação real (`validateImportRow`, `src/lib/import-export/registry.ts`) reaproveita **o mesmo schema Zod do cadastro manual** (`schemasByEntity`, `src/lib/validations/cadastros.ts`) — a mesma regra de negócio que valida um POST manual em `/api/products` valida uma linha de importação, nunca uma cópia paralela. Cada linha recebe `VALID`/`INVALID` (`fn_record_import_row_validation`); erros vão para `import_job_errors` com `row_number`/`column_name`/`value_text`/`message` (seção 21.6, exemplo: "Linha 42, Coluna: NCM, Valor: 123456, Erro: NCM não encontrado" — aqui, como o exemplo do pedido, o erro localiza exatamente onde corrigir). `fn_complete_import_validation` fecha em `READY` (≥1 linha válida) ou `FAILED` (nenhuma).

## 3. Idempotência e processamento (seções 21.7/21.10)

`fn_start_import_processing` (`READY → PROCESSING`) libera o processamento; para cada linha `VALID`, `persistImportRow` (`src/lib/import-export/persist.ts`) procura um registro existente pela **chave natural** da entidade (`naturalKeyColumn`: `code`/`document`/`name`, conforme a entidade) — se existir, **atualiza** (nunca duplica); senão, cria, reaproveitando **o mesmo repositório** (`tablesByEntity`) do CRUD manual. `fn_record_import_row_result` marca a linha `PROCESSED` (terminal, nunca reprocessada) ou `FAILED`. `fn_finish_import_job` fecha em `COMPLETED` ou `COMPLETED_WITH_ERRORS`.

## 4. Reprocessamento (seção 21.8)

`fn_reopen_import_job_for_reprocess` (só a partir de `COMPLETED_WITH_ERRORS`/`FAILED`) volta as linhas `FAILED` para `PENDING` — **linhas `PROCESSED` nunca são tocadas, nunca duplicadas**. `POST /api/imports/[id]/reprocess` reabre e roda o mesmo processamento sobre as linhas reabertas. Limitação disclosed: esta fase reprocessa a **mesma linha bruta** já enviada (útil para falhas transitórias); não existe ainda um endpoint para **editar** o conteúdo de uma linha individual antes de reprocessar — a correção de dados hoje exige reenviar o arquivo corrigido como um novo job.

## 5. Entidades suportadas nesta fase (seção 21.9) — 6 de 9, disclosed

`src/lib/import-export/registry.ts` registra: **produtos, clientes, fornecedores, categorias de produto, marcas de produto, unidades de medida**. Cada uma reaproveita 100% o schema Zod e o repositório já existentes do cadastro manual — nenhuma regra duplicada.

**Não implementadas nesta fase (arquitetura genérica já suporta, conector específico ainda não registrado):**
- **Conversões de unidade** — o schema exige `unidadeOrigemId`/`unidadeDestinoId` como UUID (não código legível); resolver por código exigiria uma etapa de lookup adicional não construída nesta fase.
- **Preços** (`price-lists`) — o campo `codigo` do schema é, na prática, **ignorado pelo mapper e gerado automaticamente pelo banco** (mesmo trigger `fn_generate_code` de `suppliers`/`carriers`); um arquivo de importação não teria como prover a chave natural de idempotência antes da criação, exigindo um design de chave diferente (provavelmente `nome`).
- **Estoque inicial** — a seção 21.10 é explícita: "não pode alterar `stock_balances` diretamente, deve passar pelo fluxo de movimento" (`fn_post_stock_movement`, 0009, tipo `ADJUSTMENT_IN`). Isso exige resolver produto+localização por código antes de postar o movimento — um conector genuinamente diferente dos 6 acima (não é um `tablesByEntity` simples), não construído nesta fase.
- **Pedidos/compras** — explicitamente fora do "implementar inicialmente" do pedido original (seção 21.9: "preparar arquitetura... não tentar implementar todas as entidades de uma vez").

Adicionar qualquer uma dessas entidades no futuro não exige alterar `import_jobs`/`import_job_rows`/`import_job_errors` nem as funções `fn_*` — só registrar um novo conector em `registry.ts`/`persist.ts` (para as compatíveis com `tablesByEntity`) ou um conector dedicado (para estoque inicial).

## 6. Exportação (seção 21.11)

`GET /api/exports?entityType=...&format=csv&search=&status=` é **síncrona** (gera e devolve o CSV na mesma chamada) — reaproveita `tablesByEntity` para **qualquer** uma das 18 entidades já cadastradas (não só as 6 importáveis: exportar é seguro/read-only, então a cobertura é mais ampla que a de importação), respeitando `search`/`status`/RBAC/RLS da mesma forma que a listagem manual. `fn_create_export_job` grava um registro de auditoria (nunca uma fila assíncrona). Seleção de colunas/ordenação avançada não foi implementada nesta fase — a exportação usa todas as colunas da entidade.

## 7. RBAC

| Código | Uso |
|---|---|
| `import_export.view` | consultar jobs, preview, erros, exportações |
| `import_export.import` | upload, mapeamento, validação, processamento, reprocessamento |
| `import_export.export` | exportar dados |
| `import_export.cancel` | cancelar um job em andamento |

## 8. RLS e auditoria

As 4 tabelas são select-only via RLS (`has_permission(company_id, 'import_export.view')`); toda escrita passa por função `SECURITY DEFINER`. `import_jobs` e `export_jobs` geram `audit_logs`; `import_job_errors` é o detalhamento próprio do domínio.

## 9. API

`POST /api/imports` (upload multipart: `file`+`entityType`), `GET /api/imports` (+`/[id]`, `/[id]/preview`, `/[id]/errors`), `POST /api/imports/[id]/mapping`, `/validate`, `/process`, `/reprocess`, `/cancel`, `GET /api/exports`, `GET /api/exports/jobs`.

## 10. Pendências (nada escondido)

- XLSX não implementado (motivo de segurança detalhado na seção 0).
- 3 das 9 entidades prioritárias (conversões, preços, estoque inicial) e pedidos/compras não têm conector de persistência ainda — detalhado na seção 5.
- Sem endpoint para editar uma linha individual antes de reprocessar (seção 4).
- Sem seleção de colunas/ordenação avançada na exportação (seção 6).
- Frontend: nenhuma tela nova nesta fase (instrução explícita — não reformular a UI da Fase 19). A API está completa e pronta para uma tela de "Importações"/wizard de mapeamento futura.
