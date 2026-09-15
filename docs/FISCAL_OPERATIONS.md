# Fiscal Operacional Avançado — Fase 22

Evolução do Fiscal Core já existente (`supabase/migrations/0036-0042`, `0053`) — **nenhuma tabela/função do core foi recriada**. Todas as alterações em funções já existentes são `create or replace` de **mesma assinatura** (nunca adicionam/removem parâmetro), então nenhum chamador antigo quebra; toda tabela/função nova é aditiva.

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations (`supabase/migrations/0063`) foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 1. Ciclo fiscal — AUTHORIZING inserido, nada removido

Ciclo final: `DRAFT → CALCULATED → READY → AUTHORIZING → AUTHORIZED`, com `REJECTED`/`DENIED`/`CONTINGENCY`/`CANCELLED` como estados de erro já existentes desde 0039/0041 — **nenhum estado removido**. `AUTHORIZING` é **opcional**: `fn_authorize_fiscal_document` continua aceitando a chamada direta a partir de `READY` (fluxo antigo, inalterado — quem nunca chamar `fn_begin_fiscal_document_authorization` continua funcionando exatamente como antes) e agora também a partir de `AUTHORIZING` (fluxo novo). `fn_reject_fiscal_document` foi ampliada da mesma forma (`CALCULATED` ou `AUTHORIZING`). `fn_guard_fiscal_document_snapshot` (imutabilidade, seção 22.16) passou a cobrir `AUTHORIZING` também — um documento em processo de autorização não pode ter seus dados consolidados alterados por baixo do provedor.

## 2. Numeração — 100% reutilizada, nenhuma linha nova

`document_sequences`/`fn_next_document_number`/`fn_assign_fiscal_document_number` (0053) já são concorrentes-seguras (`FOR UPDATE`, nunca `MAX()+1`) e já cobrem `fiscal_documents.number`. Nenhuma alteração foi necessária — a seção 22.2 do pedido pede exatamente o que já existe.

## 3. XML — referência versionada (nunca o arquivo em si)

`fiscal_document_files` generaliza `xml_storage_reference`/`xml_sent_reference` (campos únicos desde 0039/0041) para múltiplos tipos e **versões** (`XML_SENT`/`XML_AUTHORIZED`/`XML_CANCELLATION`/`XML_CORRECTION_LETTER`/`XML_EVENT`/`OTHER`, `version` incremental por tipo). `storage_reference` é um **ponteiro textual** — nenhum armazenamento de arquivo real (esta fase não tem Supabase Storage nem qualquer outro backend de arquivo conectado; `grep` confirmou zero uso de `.storage.` em todo o projeto). `fn_register_fiscal_document_file` só grava o ponteiro.

## 4. Modelos fiscais

`fiscal_documents.type` já suporta `NFE`/`NFCE`/`NFSE`/`CTE`/`MDFE`/`OTHER` (0039) — nenhuma regra de UF/município foi criada (nenhuma infraestrutura adequada para isso existe nesta fase, por instrução explícita).

## 5. Certificado digital — metadados apenas, nunca segredo

`fiscal_digital_certificates`: `alias`/`certificate_type` (A1/A3)/`subject_name`/`issuer_name`/`valid_from`/`valid_until`/`status`. **Nenhuma coluna de senha ou chave privada existe nesta tabela ou em qualquer outra do ERP** — `external_secret_reference` é um ponteiro textual (nome de segredo) para um secret manager externo que **não existe** nesta fase; o campo fica preenchido só quando uma integração futura o gravar. `fn_register_fiscal_certificate`/`fn_configure_fiscal_provider` não têm parâmetro de senha/chave em sua assinatura — impossível chamá-las com um segredo mesmo por engano. Teste dedicado (`tests/fiscal-operations-validations.test.ts`) verifica que o schema Zod não define campos `password`/`privateKey`/`secret`.

## 6. Provider abstraction (seção 22.6)

```
Fiscal Domain (fiscal_documents, ciclo de status)
      ↓
Fiscal Provider Interface (fiscal_provider_configs: provider_code/environment/config)
      ↓
Provider Adapter (não implementado — nenhum adapter real nesta fase)
      ↓
SEFAZ / Provedor externo (não implementado)
```

`provider_code='NONE'` é o único valor operacional nesta fase. A camada de domínio (`fiscal_documents`, `fn_authorize_fiscal_document`) **nunca** depende de uma implementação de provedor específica — só recebe o resultado já processado via `fn_process_fiscal_authorization_response`.

**Nunca finge autorização** (instrução final explícita): `fn_begin_fiscal_document_authorization` só marca o documento como `AUTHORIZING` e registra uma tentativa (`fiscal_authorization_attempts`, status `SENT`) — nunca autoriza. `fn_process_fiscal_authorization_response` exige que o **chamador informe explicitamente** `p_result` (`AUTHORIZED`/`REJECTED`/`ERROR`, sem valor default) — nenhuma das duas funções chama um provedor real (nenhum existe) nem decide sozinha que algo foi autorizado. O sistema diferencia claramente:
- **INTERNAL READY** — `fn_mark_fiscal_document_ready` (0041, inalterada): conferência fiscal interna, sem qualquer comunicação externa.
- **EXTERNALLY AUTHORIZED** — só acontece via `fn_process_fiscal_authorization_response(..., p_result => 'AUTHORIZED', ...)`, que delega para `fn_authorize_fiscal_document` (nunca duplica a lógica de transição) e exige `access_key` explícito.

## 7. Autorização (seção 22.7)

`fiscal_authorization_attempts` é o ledger de tentativas — uma linha por tentativa (`attempt_number` sequencial por documento), nunca sobrescrita. `fn_begin_fiscal_document_authorization` (READY/REJECTED → AUTHORIZING) cria a tentativa; `fn_process_fiscal_authorization_response` processa o retorno (protocolo/chave de acesso armazenados via a função de autorização já existente; rejeição via a função de rejeição já existente; erro técnico mantém o documento em `AUTHORIZING` para nova tentativa, sem finalizar nada). Nenhuma chamada externa acontece dentro de uma transação do banco — as funções só gerenciam o estado local, exatamente como pede a seção 22.7 ("chamadas externas não devem comprometer transações internas").

## 8. Eventos fiscais e idempotência (seção 22.8)

Cancelamento (`fn_cancel_fiscal_document`), carta de correção/inutilização/manifestação/contingência (`fn_register_fiscal_document_event`, 0041, **assinatura inalterada**) já existiam. Nova coluna `fiscal_document_events.idempotency_key` (nullable, índice único parcial por `(fiscal_document_id, idempotency_key)`) + nova função **aditiva** `fn_register_fiscal_document_event_idempotent` (assinatura própria, não altera a função original): reenviar o mesmo evento com a mesma chave devolve o evento já existente em vez de duplicar — pensada para integrações automáticas (provedor externo, reprocessamento), enquanto o fluxo manual da UI continua usando a função original exatamente como antes.

## 9. Rejeições (seção 22.9)

`fiscal_authorization_attempts.error_code`/`error_message`/`attempt_number`/`started_at`/`finished_at` registram cada tentativa rejeitada. Reprocessamento: `fn_begin_fiscal_document_authorization` aceita explicitamente `status = 'REJECTED'` como origem válida — uma nova tentativa (`attempt_number` seguinte) pode ser iniciada sem reabrir manualmente o documento.

## 10. Contingência

`CONTINGENCY` já existe como status/evento desde 0041 — nenhuma regra fiscal nova foi inventada; a seção 22.10 pede exatamente isso ("preparar arquitetura, não inventar regras").

## 11-14. Entrada/saída/devoluções/volumes — 100% reutilizados

- **Documento de entrada**: `fn_create_fiscal_document_from_purchase_receipt` (0040, inalterada) — recebimento físico (`purchase_receipts`) e documento fiscal continuam entidades distintas; nunca convertido automaticamente em autorizado.
- **Documento de saída**: `fn_create_fiscal_document_from_sales_order` (0040, inalterada) — pedido e documento fiscal continuam distintos; emissão só por chamada explícita.
- **Devoluções**: `fn_create_fiscal_document_return` + `fiscal_document_references` (0042, inalteradas).
- **Volumes**: `fiscal_document_packages` (0042, inalterada) — distinta de `shipment_packages` (volume físico da expedição), por desenho já documentado em 0042.

Nenhuma linha de código nova foi necessária para estas quatro seções — reuso total, exatamente como pedido.

## 15. API

Novas rotas (todas sob os prefixos já existentes, nenhuma rota antiga alterada):
`POST /api/fiscal-establishments/[id]/provider`, `GET /api/fiscal-provider-configs`, `POST /api/fiscal-establishments/[id]/certificates`, `GET /api/fiscal-certificates`, `POST /api/fiscal-certificates/[id]/deactivate`, `POST /api/fiscal-documents/[id]/begin-authorization`, `POST /api/fiscal-authorization-attempts/[id]/response`, `GET /api/fiscal-documents/[id]/authorization-attempts`, `GET`/`POST /api/fiscal-documents/[id]/files`, `POST /api/fiscal-documents/[id]/events-idempotent`.

Rotas já existentes (`/api/fiscal-documents/[id]/calculate|ready|authorize|reject|cancel|items|packages|references|return|assign-number`) continuam **exatamente como estavam** — nenhuma foi tocada.

## 16. Imutabilidade fiscal

Confirmada e ampliada (seção 1 acima) — snapshots fiscais permanecem imutáveis a partir de `READY`/`AUTHORIZING`/`AUTHORIZED`; uma alteração posterior no cadastro do produto nunca altera retroativamente um documento já calculado (mecanismo inalterado desde 0039: `fiscal_document_items` copia NCM/CFOP/descrição como texto, nunca relê o cadastro).

## 17. Auditoria

Todas as novas funções (`fn_configure_fiscal_provider`, `fn_register_fiscal_certificate`, `fn_begin_fiscal_document_authorization`, `fn_register_fiscal_document_file`) gravam `audit_logs`. `fiscal_authorization_attempts` e `fiscal_document_events` (com `idempotency_key`) são o detalhamento próprio do domínio.

## 18. RBAC

| Código | Uso |
|---|---|
| `fiscal_provider_configs.view` | consultar configuração de provedor e certificados |
| `fiscal_provider_configs.manage` | configurar provedor e registrar/desativar certificados |
| `fiscal_documents.submit_authorization` | iniciar e processar o resultado de uma tentativa de autorização |
| `fiscal_document_files.view` / `.create` | consultar/registrar referências de XML |

Permissões já existentes (`fiscal_documents.view/create/update/calculate/ready/authorize/cancel`, `fiscal_document_events.view/create`) continuam exatamente como estavam.

## 19. RLS

As 4 tabelas novas são select-only via RLS (`has_permission`); toda escrita passa por função `SECURITY DEFINER` — mesmo padrão de todo o resto do ERP.

## 20. Separação IMPLEMENTADO / PREPARADO / DEPENDENTE DE PROVEDOR EXTERNO

**IMPLEMENTADO:**
- Estado `AUTHORIZING`, guards de imutabilidade ampliados.
- Ledger de tentativas de autorização com numeração sequencial.
- Registro do resultado de uma tentativa (sucesso → delega para `fn_authorize_fiscal_document`; rejeição → delega para `fn_reject_fiscal_document`; erro técnico → mantém `AUTHORIZING` para retry).
- Metadados de certificado digital (nunca segredo).
- Configuração de provedor (não-sensível).
- Referências de XML versionadas por tipo.
- Idempotência de eventos fiscais (chave opcional).
- 100% de reuso de entrada/saída/devolução/volumes/numeração já existentes.

**PREPARADO (estrutura pronta, sem implementação real):**
- Adapter de provedor real (SEFAZ ou qualquer outro) — `provider_code` além de `'NONE'` nunca foi implementado.
- Armazenamento real de XML — `storage_reference` é só um ponteiro; nenhum backend de arquivo está conectado neste projeto (confirmado: zero uso de Supabase Storage em todo o código).
- Secret manager para certificado digital — `external_secret_reference` fica sempre nulo até uma integração futura existir.
- Regras específicas de UF/município/contingência real.

**DEPENDENTE DE INFRAESTRUTURA EXTERNA (fora do alcance de qualquer fase deste projeto sem uma decisão explícita de produto):**
- Comunicação real com SEFAZ/provedor de NFS-e — exige contratar um provedor, obter certificado real e um ambiente de homologação/produção controlado pela Receita/prefeitura.
- Emissão fiscal real — depende do item acima.

## 21. Pendências (nada escondido)

- Nenhum provedor real foi (nem poderia ser, nesta fase) integrado — `fn_process_fiscal_authorization_response` continua exigindo acionamento manual/externo explícito do resultado.
- Frontend: nenhuma tela nova nesta fase (instrução explícita — não reformular a UI da Fase 19).
