# Relatório de integração das migrations 0076–0091

Branch `claude/atlas-neon-ux-crm` · 10/10/2026. Nada foi aplicado em ambiente
remoto. Toda validação foi feita em bancos **locais** descartáveis
(PostgreSQL 16.x).

## 1. Branches e commits analisados

| Branch | Commit | Migrations novas | Observação |
|---|---|---|---|
| `main` | `48775f5` | nenhuma depois da 0075 | o último commit (02/10) é só de interface |
| `claude/e2e-empresa-nova-correcoes` | `3a19fb1` | 0076–0088 | homologação de 48 usuários; base `1b61fd7` |
| `claude/atlas-neon-ux-crm` (esta) | início `2946864` | 0089, 0090, **0091** (nova) | mesma base `1b61fd7` |

**Mecanismo de migrations:** arquivos `supabase/migrations/NNNN_*.sql`
aplicados em ordem de nome. A produção (Supabase) registra o que foi
aplicado no ledger `supabase_migrations.schema_migrations`, aplicado por
`supabase db push` ou pela ferramenta de migrations do Supabase (ver
`docs/SUPABASE.md`). Os bancos locais e o Neon são reconstruídos pelo plano
`poc/neon-full/plan-prod-equivalente.txt`, que reproduz o histórico **real**
da produção (inclui `prod-history/*`). Os bancos locais não têm ledger.

**Estado comprovado por ambiente:**

| Ambiente | Evidência | 0076–0088 | 0089–0091 |
|---|---|---|---|
| Produção (Supabase) | ledger lido em 10/10 (só leitura): 86 registros, último `20260929165645` = 0075 | **não aplicadas** | **não aplicadas** |
| Homologação remota (Neon) | sem acesso nesta sessão (conector Neon não autorizado). Os relatórios da outra linha dizem "nenhuma aplicada na homologação real" | sem evidência | sem evidência |
| Local `educa_poc` (homologação da outra linha) | objetos presentes (ex.: `fn_simulate_fiscal_authorization`, `fn_generate_fiscal_document_for_sales_order`) | aplicadas | não |
| Local `crm_*` (esta linha) | `crm_base` = 0075; `crm_fix`/`crm_app` com 0089/0090 | não | 0089, 0090 (0091 aplicada em `crm_app`) |
| Locais `vi_*` (validação desta missão) | `validar-sequencia.sh` | ver seção 4 | ver seção 4 |

## 2. Inventário

| Nº | Origem (commit) | Objetos e dados | Tipo | Dependências / conflitos | Decisão |
|---|---|---|---|---|---|
| 0076 empresa nova: estoque e papéis | outra linha, `40ca20e` | FK composta e gatilho em `warehouse_locations`; insere `units.*`/`unit_conversions.*` e concessões; altera policies de `product_categories`, `product_brands` e `product_suppliers`; **drop** `units_select_authenticated`; substitui `fn_role_template_permission_codes` e `fn_seed_default_roles_for_company` | corretiva + regra de papéis | substitui funções da 0075. O P2 coincide com a 0091 (idempotente). O **P3 dá CRM à Somente leitura de empresas novas** (decisão pendente) | manter. A 0091 preserva a regra vigente do CRM |
| 0077 relatórios e autor da auditoria | `40ca20e` | `fn_report_fiscal/inventory/production` (colunas qualificadas); gatilho `resolve_actor` em `audit_logs` | corretiva | **mesmas funções da 0090**. A definição final é idêntica byte a byte (conferido com `pg_get_functiondef`) | manter as duas. A 0090 vira no-op depois da 0077 |
| 0078 pré-requisitos da NF-e | `40ca20e` | `fn_create_fiscal_document_from_sales_order`, `fn_fiscal_setup_status` | corretiva | a 0083 recria `fn_fiscal_setup_status` | manter |
| 0079 nome da empresa na Central | `40ca20e` | coluna em `company_platform_profiles`; gatilho; **update** de nomes | aditiva + dados | — | manter |
| 0080 itens sem número de série | `40ca20e` | `fn_normalize_serial_numbers` + gatilhos; **update** JSON null → NULL | corretiva + dados (sem perda) | — | manter |
| 0081 integridade pedido/recebível/logística | `e4f34c7` (últ. `85fb136`) | 12 funções de reserva, separação, expedição e recebível; **índices únicos** `accounts_receivable_origin_active_unique`, `pick_lists_open_per_order_unique`; **update** de reservas | corretiva + dados | substitui funções da 0074. **Os índices únicos falham se houver duplicidade nos dados** | manter. Rodar as consultas de conferência da outra linha antes de qualquer ambiente com dados |
| 0082 fiscal simulado | `514d11b` | 6 funções do provedor SIMULACAO | aditiva | depende do app da outra linha (telas e handlers) | manter, com o código |
| 0083 numeração e autorização da NF-e | `514d11b` | 4 funções; drop/recreate `fn_fiscal_setup_status`; **índice único** `fiscal_documents_own_number_unique` | corretiva | falha se houver número repetido | manter, com conferência prévia |
| 0084 entrega sem duplicidade | `e4f34c7` | `fn_confirm_delivery`, `fn_fail_delivery` | corretiva | — | manter |
| 0085 unidade do item | `e4f34c7` | gatilhos em `sales_order_items`/`sales_quote_items`; **update** de itens sem unidade | corretiva + dados | — | manter |
| 0086 auditoria da criação | `e4f34c7` | recria `audit_logs_action_check` (+SUBMIT); gatilhos `audit_created`/`audit_submitted` | corretiva | a 0089 grava CREATE/UPDATE, aceitos nas duas versões | manter. O rótulo SUBMIT está no código da outra linha |
| 0087 NF-e idempotente | `e4f34c7` | `fn_generate_fiscal_document_for_sales_order` | corretiva | — | manter |
| 0088 eventos fiscais em ordem | `514d11b` | default `clock_timestamp()` em `fiscal_document_events` | corretiva | — | manter |
| 0089 conversões de lead | esta, `d8fd489` | `fn_convert_lead_to_customer`/`_opportunity`; policy `leads_update` | corretiva | depende só do CRM (≤0075); compatível com 0077 (autor) e 0086 (ações) | manter |
| 0090 relatórios | esta, `8925b8f` | as mesmas 3 funções da 0077 | corretiva | idêntica à 0077 | manter (no-op na sequência integrada; não reescrever) |
| **0091 isolamento do catálogo e das views** | esta, `e8aa489` (+ ajuste) | drop `units_select_authenticated`; `units.*`/`unit_conversions.*` + concessões; policies do catálogo; 18 FKs compostas (+2 `unique (id, company_id)`); views `security_invoker` + revoke `anon`; ajuste pontual em `fn_role_template_permission_codes` | corretiva de segurança | não depende de 0076–0088. Coincide com o P2 da 0076 (idempotente). Se a 0076 estiver aplicada, ajusta o modelo da Somente leitura (sem CRM) | **nova** |

**Dependências ocultas e conflitos conferidos:**
- **Nenhuma migration desta linha depende de 0076–0088.** A 0091 detecta a
  0076 pela definição da função.
- **Funções substituídas por mais de uma migration:**
  - `fn_report_*` (0077 e 0090, mesmo resultado);
  - `fn_role_template_permission_codes` (0075 → 0076 → ajuste da 0091);
  - `fn_reserve_sales_order_stock` (0074 → 0081);
  - `fn_fiscal_setup_status` (0078 → 0083).
- **Policies duplicadas:** nenhuma. A 0076 e a 0091 alteram as mesmas
  policies para a mesma expressão.
- **Mesmo nome, objetos diferentes:** nenhum.
- **Ordem:** aplicar a 0076 **depois** da 0091 (fora da ordem dos nomes)
  desfaria o ajuste da Somente leitura. Aplicar sempre na ordem dos nomes.
- **Código do app:** 0076–0088 vêm com código na outra linha (mapeamento de
  permissões, telas do fiscal simulado, rótulo SUBMIT etc.). Esta branch já
  traz o mesmo mapa de permissões da 0076. As telas do fiscal simulado e
  outros ajustes **só existem na outra linha**. A integração das branches
  (merge de código) é uma decisão à parte e não foi feita.

## 3. Sequência recomendada

```
0001 … 0075 (como na produção) → 0076 … 0088 → 0089 → 0090 → 0091
```

Ordem dos nomes, sem renumerar nada.

Condições para aplicar fora do ambiente local:
1. integrar o código das duas linhas (decisão);
2. backup;
3. consultas de conferência das 0081/0083 (duplicidades de recebível,
   separação e número fiscal);
4. conferência das FKs da 0091 (feita em produção em 10/10, só contagem:
   **0** referências entre empresas nas 18 relações);
5. aplicar primeiro na homologação remota e repetir esta validação lá.

## 4. Validação (local)

Script reprodutível, **sem merge**: `poc/neon-full/integracao/validar-sequencia.sh`.
Ele lê 0076–0088 da outra linha por `git show`. Saída em
`evidencias/seguranca-multiempresa/validar-sequencia.txt`.

| Cenário | Como | Resultado |
|---|---|---|
| Banco vazio, só esta linha | 0001–0075 + 0089–0091 | OK 96/96 arquivos |
| Banco vazio, sequência integrada | 0001–0075 + 0076–0088 + 0089–0091 | OK 109/109 |
| Incremental a partir do estado da produção | cópia de `crm_base` (0075) + 0076…0091 | esquema e catálogo de permissões **idênticos** ao do banco vazio (0 linhas de diferença no `pg_dump --schema-only`) |
| Banco já atualizado | cópia de `educa_poc` (0076–0088 + dados da homologação de 48 usuários) + 0089–0091 | idêntico (0 linhas). Nenhum WARNING de FK |
| Idempotência | reaplicar 0089–0091 no banco integrado | sem erro, sem duplicar |
| Objetos-chave | policy `units_select_authenticated`; FKs `*_same_company_fk`; views | 0; 18/18 validadas; 4/4 `security_invoker` nos dois bancos vazios |

O `pg_dump --schema-only` compara tabelas, colunas, constraints, índices,
gatilhos, policies, grants, funções e views. O catálogo de permissões foi
comparado linha a linha.

Testes sobre os bancos:
- `npm test` completo: **877/877** no banco desta linha e no integrado.
- Testes de banco da outra linha (`empresa-nova-db`,
  `rodada2-integridade-db`): **35/35** no banco integrado e no já atualizado.
- Testes de segurança, CRM, relatórios e reservas: **57/57** no banco já
  atualizado.

**Local × remoto:** o local é PostgreSQL 16 e a produção é PostgreSQL 17.6.
A 0091 usa `on delete set null (coluna)`, que existe desde o 15. O
esquema da produção **não foi comparado** por `pg_dump` (sem acesso de
leitura ao dump). A equivalência com a produção vem do plano
`plan-prod-equivalente.txt` e das consultas de catálogo feitas. **Não se
afirma equivalência total.**

## 5. Integração executada (rodada final, 12/10/2026)

**Estratégia:** merge normal (sem rebase, sem reescrever histórico) numa
branch nova, preservando as duas linhas:

| Branch | Commit | Papel |
|---|---|---|
| `claude/e2e-empresa-nova-correcoes` | `3a19fb1` (inalterada) | origem de 0076–0088 e do código correspondente |
| `claude/atlas-neon-ux-crm` | `2218019` (inalterada pelo merge) | CRM, painéis, segurança (0089–0093), contenção |
| **`claude/atlas-integracao-0076-0093`** | merge `1ba81e4` + ajustes | integração validada |

**Mapa do diff (base comum `1b61fd7`):** 855 arquivos só ou também na outra
linha, 101 nesta; **13 alterados nas duas**.

| Arquivo em ambas | Resolução |
|---|---|
| `src/lib/api/handlers.ts` (conflito) | mapa de permissões em `entity-permissions.ts` (superconjunto); PATCH = só campos enviados + validação de CPF/CNPJ + bloqueio otimista |
| `src/lib/database/errors.ts` (conflito) | mensagens específicas da outra linha, agora pelas colunas da chave (FK da 0091 dizia "produto" no lugar de "unidade") |
| pedido de venda, matriz de papéis, `status.ts` (conflito) | versão da outra linha (superconjunto: `apiSendWithMessage`, `actionLabel`, SUBMIT) |
| `validations/cadastros.ts`, `mappers.ts`, `cadastros/types.ts`, `useIdNameLookup.ts`, `movimentacoes`, `reservation-feedback.ts`, `stock-labels.ts`, `stock-feedback.test.ts` | merge automático conferido (código obrigatório de categoria/marca + limites de tamanho da outra linha; bloqueio otimista em `table.update`) |

**Migrations na branch integrada:** 0076–0088 **byte a byte iguais** à
outra linha e 0089–0093 iguais a esta (conferido com `git diff`). Ordem final
pela ordem dos nomes; nenhuma renumeração.

**Contratos que mudaram com a integração (testes ajustados com motivo):**
- `teste-48-usuarios-regressao`: regex de texto fixava `parsed.data`; o PATCH
  passou a gravar `changes` (mesmo contrato de bloqueio otimista).
- Roteiros E2E: com a 0076 o local de estoque é criado pela API (201); CPF/CNPJ
  passaram a ser validados por dígito verificador (fixtures com CNPJs
  fictícios válidos).

**Validação (local):**

| Cenário | Resultado |
|---|---|
| vazio → 0001–0075 + 0076–0093 | OK 111/111 |
| vazio → só esta linha (0089–0093) | OK 98/98 |
| incremental (`crm_base`, estado da produção) → 0076–0093 | esquema e permissões **idênticos** ao vazio (0 linhas) |
| já atualizado (`educa_poc`, 0076–0088 + dados de 48 usuários) → 0089–0093 | idêntico (0 linhas); 18/18 FKs validadas |
| idempotência (reaplicar 0089–0093) | sem erro |
| `npm test` (código integrado, banco integrado) | **1062/1062**, 0 falhas, 0 canceladas, 0 TODO, 0 ignoradas |
| E2E geral / CRM API / CRM UI / painéis / catálogo | 210/210 · 66/66 · 32/32 · 13/13 · 37/37 |
| Código da `main` (produção, 48775f5) sobre o banco integrado | 209/210 no E2E geral; única diferença: criar categoria pela API continua 403 (comportamento atual da produção) — sem regressão |

**Remoto:** 0091–0093 aplicadas numa branch filha da homologação Neon (md5
conferido); 0076–0090 não (bloqueio de rede) — `RELATORIO-HOMOLOGACAO-REMOTA.md`.

**Produção (só leitura, 12/10):** ledger em 0075; 0 duplicidades para os
índices únicos da 0081/0083; 0 referências entre empresas para as FKs da 0091.
