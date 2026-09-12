# Fiscal / Núcleo Tributário — Fase 8 + Fase 9 (Operacional)

Fundação do módulo Fiscal (`supabase/migrations/0036` a `0040`, Fase 8),
construída sobre RLS/RBAC, Catálogo, Estoque/WMS, Compras, Comercial,
Logística, Produção/PCP e Financeiro já existentes, evoluída pela Fase 9
— Fiscal Operacional (`0041` a `0042`) — para um ciclo de vida com
conferência fiscal explícita (`READY`), documento referenciado
(devolução), volumes declarados e imutabilidade dos dados fiscais
consolidados. Ver `## 18` em diante para o que a Fase 9 acrescenta.

**Aviso — escopo desta etapa:** como nas fases anteriores, estas
migrations foram escritas e revisadas estaticamente, mas **não foram
aplicadas nem testadas contra um banco Postgres real** — instrução
explícita desta fase foi trabalhar apenas nos arquivos versionados do
repositório, sem tocar em nenhum projeto Supabase real (sem
`execute_sql`/`apply_migration`, especialmente não no ASTRA.ERP).

**NÃO implementado nesta etapa** (seção 1/28, deliberado): SEFAZ,
certificado digital, assinatura XML, autorização/cancelamento
eletrônico real, DANFE, NFC-e em produção. A arquitetura nasce
preparada para NF-e/NFC-e/NFS-e/CT-e/MDF-e (vocabulário `type` já
inclui todos), mas "autorizar"/"rejeitar" nesta etapa são registros
manuais (o operador informa o que a SEFAZ retornaria), não uma
comunicação real.

## 1. Princípio fundamental: contexto fiscal, nunca duplicação

O Fiscal não duplica `products`/`customers`/`suppliers`/pedidos/
recebimentos/estoque/financeiro (seção 3) — adiciona o contexto
tributário. Nenhuma tabela nova é uma segunda tabela de produto,
cliente, fornecedor, transportadora ou auditoria.

## 2. Snapshot fiscal — o requisito crítico (seção 4)

Uma regra fiscal pode mudar; um documento histórico não pode mudar
retroativamente. Isso é garantido em duas camadas:

1. **`fiscal_document_items`** grava `ncm_code`/`ncm_description`/
   `cfop_code`/`origin_code` como **texto**, copiado no momento da
   criação do item (`fn_add_fiscal_document_item`) — nunca relido de
   `fiscal_ncms`/`fiscal_cfops`/`product_fiscal_profiles` depois. Os
   campos `ncm_id`/`cfop_id` também guardados na mesma linha são só
   para rastreabilidade e para a resolução de regra no momento do
   cálculo — a fonte de verdade **exibida e armazenada** é sempre o
   texto, nunca um join ao vivo.
2. **`fiscal_document_item_taxes`** grava `rate`/`cst`/`csosn`/
   `reduction_percentage`/`amount` como os valores que a `tax_rule`
   efetivamente produziu **naquele cálculo** (`fn_calculate_fiscal_document`).
   `source_tax_rule_id` é só rastreabilidade — se a regra mudar ou for
   desativada depois, esta linha permanece exatamente como foi.

Se o NCM de um produto mudar amanhã (nova linha em
`product_fiscal_profiles`, seção 3 abaixo) ou uma `tax_rule` for
substituída, nenhum documento fiscal já calculado é afetado.

## 3. Estabelecimento fiscal (migration 0036)

`companies` (0001) não tem CNPJ/inscrições/regime tributário próprios,
e "1 company = 1 estabelecimento fiscal" não pode ser assumido (seção
5). Não existe nenhuma tabela de filiais hoje (0005 só previa o
conceito, nunca implementado) — `fiscal_establishments` é a primeira:
`company_id` (nunca duplicado) + CNPJ/inscrição estadual/municipal/
`tax_regime`/endereço próprios. Uma `company` pode ter N
`fiscal_establishments`.

`tax_regime`: `SIMPLES_NACIONAL`/`LUCRO_PRESUMIDO`/`LUCRO_REAL`/`MEI`
(seção 6) — só classificação, usada como dimensão de `tax_rules`;
nenhum cálculo específico de regime implementado.

## 4. Classificação fiscal (migration 0037)

Todas **"cadastro"** (CRUD direto via RLS, sem função dedicada — mesmo
padrão de `product_categories`/`work_centers`):

- **`fiscal_ncms`**: código + descrição + vigência. `products.ncm`
  (0002, texto livre) permanece inalterado e depreciado — a referência
  estruturada é `product_fiscal_profiles.ncm_id` (seção 7).
- **`fiscal_cfops`**: código + descrição + `direction`
  (ENTRADA/SAIDA) + `scope` (INTERNAL/INTERSTATE/FOREIGN) — juntos já
  expressam a classificação 1.xxx/2.xxx/3.xxx/5.xxx/6.xxx/7.xxx, sem
  um campo "tipo" redundante (seção 8).
- **`fiscal_operation_natures`**: Venda de mercadoria, Compra para
  revenda, Transferência, Devolução, Remessa, Retorno... com
  `default_cfop_id` opcional (sugestão/atalho, seção 12 — o CFOP
  efetivo de um documento pode ser outro, definido no item).
- **`fiscal_cst_codes`**: código CST **por imposto**
  (`tax_type` ICMS/IPI/PIS/COFINS) — nunca assume que um único CST
  serve para todos os tributos (seção 9).
- **`fiscal_csosn_codes`**: CSOSN (ICMS no Simples Nacional), sem
  `tax_type` (é sempre ICMS).

**Origem da mercadoria** (seção 10) não tem tabela própria: é uma
lista oficial fixa (códigos `0`-`8`), nunca criada/editada pelo
usuário — modelada como `CHECK` direto em `product_fiscal_profiles`/
`fiscal_document_items`, igual a como todo "status" já é modelado
neste sistema.

## 5. Configuração fiscal do produto (migration 0038)

`product_fiscal_profiles` **não é uma segunda tabela de produtos**
(seção 11) — é o detalhamento fiscal de um `products` já existente,
**versionado**: cada mudança de NCM/CST/origem é uma linha **nova**
via `fn_set_product_fiscal_profile`, nunca uma edição da anterior.
Mesmo princípio de `product_boms` (0027): só um perfil `active` por
produto a qualquer momento, garantido por índice único parcial — a
versão anterior vira `obsolete` na mesma transação em que a nova é
criada, nunca apagada.

`fn_update_product_fiscal_profile_notes` só edita `notes` — qualquer
mudança de NCM/CST/origem exige uma nova versão (`fn_set_product_fiscal_profile`),
nunca uma edição em lugar do que já pode ter sido usado em um
documento histórico (coerente com o §2).

## 6. Regras tributárias (migration 0038)

**Não é um motor tributário universal** (seção 14) — é uma base
extensível: `tax_rules` é o **contexto** de aplicação (produto/NCM/
origem/CFOP/natureza de operação/UF origem/UF destino/regime
tributário/cliente/fornecedor — todas dimensões **opcionais**, `null`
= "qualquer"); `tax_rule_items` são os **impostos** que essa regra
produz quando o contexto casa (um item por `tax_type` — seção 13: uma
operação pode envolver ICMS+IPI+PIS+COFINS+FCP simultaneamente, cada
um com sua própria base/alíquota/CST).

### Vigência e prioridade (seção 15)

`valid_from`/`valid_until` + `priority`. Várias regras `active` podem
casar com o mesmo contexto — isso **não é um erro**: `priority` (maior
vence) resolve o conflito. `fn_resolve_applicable_tax_rules` (interna,
0038) implementa essa resolução via `DISTINCT ON (tax_type) ... ORDER
BY tax_type, priority DESC, valid_from DESC` — para cada imposto,
escolhe a regra de maior prioridade cujo contexto casa (cada dimensão
`null` na regra é tratada como "qualquer"), com empate resolvido pela
regra mais recente.

### Workflow

`fn_create_tax_rule` (draft) → `fn_add_tax_rule_item`/
`fn_remove_tax_rule_item` (só em draft) → `fn_approve_tax_rule`
(exige ≥1 item, draft→active) / `fn_deactivate_tax_rule`
(active→inactive, reaproveita `tax_rules.approve` — mesmo espírito de
`fn_obsolete_bom` reaproveitando `production_boms.approve`).

## 7. Documento fiscal (migration 0039)

`fiscal_documents` é a entidade genérica (seção 16):
`type` (NFE/NFCE/NFSE/CTE/MDFE/OTHER), `direction` (ENTRADA/SAIDA),
`status` (DRAFT→CALCULATED→READY→AUTHORIZED — `READY` introduzida na
Fase 9, ver `## 18` — ou →REJECTED/DENIED em CALCULATED, ou →CANCELLED
a partir de quase qualquer estado, ou →CONTINGENCY via evento manual).
`code` é o identificador interno
(`fn_generate_code`, prefixo `DF`); `number`/`series`/`model` são os
identificadores fiscais oficiais, informados pelo chamador (nenhuma
numeração oficial é simulada/gerada automaticamente).

### Origem e idempotência (seções 17/42)

`source_type`/`source_id` (referência polimórfica, sem FK — mesmo
padrão de `stock_movements.reference_id`) registram de onde o
documento nasceu. Um **índice único parcial**
(`company_id, source_type, source_id` onde não-nulo e `status <>
'CANCELLED'`) garante que uma mesma origem operacional nunca tem dois
documentos fiscais ativos simultâneos — `fn_create_fiscal_document`
também checa isso explicitamente antes de inserir (retorna o
documento existente em vez de duplicar), dupla proteção contra
duplicidade acidental.

### Itens — o snapshot (seção 20)

`fn_add_fiscal_document_item`: se `ncm_code`/`cfop_code`/`origin_code`
não forem informados explicitamente, resolve a partir do
`product_fiscal_profiles` **ativo** do produto (NCM/origem) e do
`default_cfop_id` da natureza de operação do documento (CFOP) — e
**copia os valores**, nunca guarda só a referência (ver §2). Exige
NCM e CFOP resolvidos (de um jeito ou de outro) antes de aceitar o
item — nunca grava um item fiscal sem classificação.

### Cálculo — transacional (migration 0039, seção 41)

`fn_calculate_fiscal_document`:
1. Travado (`for update`), permitido em DRAFT ou CALCULATED (recalcular
   antes de autorizar é normal, nunca em AUTHORIZED/CANCELLED/etc.).
2. Determina UF origem/destino pela `direction` (SAIDA: origem =
   estado do estabelecimento, destino = estado do cliente; ENTRADA:
   origem = estado do fornecedor, destino = estado do estabelecimento).
3. **Apaga e recria** as linhas de imposto de cada item (idempotente —
   recalcular nunca duplica) chamando `fn_resolve_applicable_tax_rules`
   por item (produto/NCM/origem/CFOP do **snapshot do item**, natureza/
   UFs/regime/cliente/fornecedor do documento, na data de emissão).
4. Para cada imposto resolvido: `basis = item.total_amount × (1 -
   reduction%/100)`; `amount = basis × rate/100` — grava a
   `fiscal_document_item_taxes` junto com `source_tax_rule_id`.
5. Consolida `products_amount`/`taxes_amount`/`total_amount` do
   cabeçalho (seção 26 — tudo `numeric`, nunca FLOAT) e marca
   `CALCULATED`.

### Autorização/rejeição/cancelamento (seções 28/30)

`fn_authorize_fiscal_document`/`fn_reject_fiscal_document`: só a
partir de CALCULATED — registram `access_key`/`protocol`/
`receipt_number` ou `return_code`/`rejection_reason` **manualmente**
(nenhuma comunicação real com SEFAZ). `fn_cancel_fiscal_document`:
nunca apaga — muda `status` e grava um evento; bloqueada só a partir
de já-CANCELLED (idempotência por guarda de status).

## 8. Eventos fiscais (migrations 0039/0040)

`fiscal_document_events` é um **ledger append-only** (seção 31),
criado junto com `fiscal_documents` (não em 0040) porque as próprias
funções de ciclo de vida (`fn_create_fiscal_document`/
`fn_calculate_fiscal_document`/`fn_authorize_fiscal_document`/
`fn_reject_fiscal_document`/`fn_cancel_fiscal_document`) já gravam
`CREATED`/`CALCULATED`/`AUTHORIZED`/`REJECTED`/`CANCELLED`
automaticamente, em cada transição.

`fn_register_fiscal_document_event` (0040) é o logger **manual**, só
para `CONTINGENCY`/`CORRECTION_LETTER`/`OTHER`/`DENIED` — os tipos
automáticos acima não podem ser inseridos por aqui (evita um evento
"CREATED" falso fora de ordem). `CONTINGENCY` e `DENIED` também
atualizam `fiscal_documents.status` quando fazem sentido.

## 9. Integração com Compras e Comercial (migration 0040)

Preparação explícita, nunca automática (seção 3/35-36): estas funções
só criam um documento fiscal quando **chamadas deliberadamente** —
nenhum trigger gera `fiscal_documents` só porque um `purchase_receipt`
foi confirmado ou um `sales_order` foi aprovado.

- **`fn_create_fiscal_document_from_purchase_receipt`** (documento de
  ENTRADA, seção 18): só a partir de um recebimento **confirmado**
  (mesmo evento apropriado usado por
  `fn_generate_accounts_payable_from_purchase_receipt`, Financeiro
  0032) — nunca de um pedido em aberto. Popula os itens a partir de
  `purchase_receipt_items`/`purchase_order_items` (quantidade aceita ×
  preço do pedido).
- **`fn_create_fiscal_document_from_sales_order`** (documento de
  SAÍDA, seção 19): a partir de um pedido **aprovado**. Usa
  `shipped_quantity` quando já há expedição registrada (0024), senão
  `ordered_quantity - cancelled_quantity`. A cadeia completa pedida
  (`sales_order → shipment → fiscal_document`, seção 19/36) fica
  **preparada estruturalmente** — `source_type` já inclui `'shipment'`,
  `fiscal_documents` já referencia `carrier_id`/`vehicle_id` — mas o
  gerador específico a partir de `shipment` (quantidade exata daquela
  expedição, permitindo múltiplos documentos por pedido parcialmente
  expedido) é uma evolução natural, não construída nesta etapa.

Ambas idempotentes via `fn_create_fiscal_document` (índice único por
origem, §7) — chamar de novo para a mesma origem só devolve o
documento existente, nunca duplica itens.

## 10. Transporte (seção 27)

`fiscal_documents.carrier_id`/`vehicle_id` referenciam `carriers`/
`vehicles` (0002) diretamente — nenhuma transportadora duplicada.
Volume/peso/frete ficam nos campos já existentes (`freight_amount` no
cabeçalho, `freight_amount` por item) — nenhuma estrutura de "volume
fiscal" nova (reaproveitaria `shipment_packages`, Logística 0024, se
necessário no futuro).

## 11. Integração com Estoque (seção 34)

O Fiscal **nunca** move estoque diretamente — nenhuma linha deste
módulo toca `stock_movements`/`stock_balances`. Um documento fiscal
pode **referenciar** a operação que já movimentou estoque
(`source_type`/`source_id` apontando para o `purchase_receipt` que já
passou por `fn_post_stock_movement` em 0018), nunca gerar uma segunda
movimentação.

## 12. Integração com Financeiro (seção 33)

Mesmo princípio do Financeiro (docs/FINANCE.md §1): o Fiscal **nunca**
cria `accounts_payable`/`accounts_receivable` automaticamente só
porque existe um documento fiscal. A obrigação financeira nasce pelo
fluxo financeiro apropriado — `fn_generate_accounts_payable_from_purchase_receipt`/
`fn_generate_accounts_receivable_from_sales_order` (Financeiro 0032/
0033) já existem e continuam sendo o único caminho; o documento fiscal
e o título financeiro compartilham a mesma origem operacional
(`purchase_receipt`/`sales_order`) sem um depender do outro ou
duplicar a referência.

## 13. Limitações atuais e evolução futura

- **Sem gerador a partir de `shipment`**: estrutura pronta
  (`source_type = 'shipment'`, `carrier_id`/`vehicle_id`), função não
  implementada (§9).
- **Transferência entre estabelecimentos (Fase 9, §18.7)**: vocabulário
  pronto (`source_type = 'transfer_out'/'transfer_in'`,
  `fiscal_document_references.reference_type = 'TRANSFER_COUNTERPART'`),
  mas nenhuma função gera automaticamente as duas pernas do documento —
  cada estabelecimento precisa ter seu documento criado via
  `fn_create_fiscal_document` e vinculado manualmente via
  `fn_add_fiscal_document_reference`, mesmo espírito do item acima.
- **Sem comunicação SEFAZ real**: autorização/rejeição são registros
  manuais; nenhum XML é gerado, assinado ou transmitido.
  `xml_storage_reference` é só um ponteiro preparado (seção 29).
- **Sem ISS/NFS-e completo**: o vocabulário (`tax_type = 'ISS'`,
  `fiscal_documents.type = 'NFSE'`) existe, mas nenhuma regra
  específica de serviço foi modelada (seção 25) — a prioridade foi
  mercadoria.
- **DIFAL/ICMS-ST**: vocabulário presente (`tax_type`), cálculo
  específico (partilha interestadual, MVA de substituição tributária)
  não implementado — `tax_rule_items` trata qualquer `tax_type` com a
  mesma fórmula genérica (base × alíquota com redução opcional).
- **Regime tributário sem cálculo próprio**: `fiscal_establishments.tax_regime`
  é só uma dimensão de `tax_rules` — nenhuma lógica específica do
  Simples Nacional (sublimites, partilha) foi implementada.

## 14. RBAC

| Código | Uso |
|---|---|
| `fiscal_establishments.view/create/update` | estabelecimentos |
| `fiscal_ncms.view/create/update` | NCM |
| `fiscal_cfops.view/create/update` | CFOP |
| `fiscal_operation_natures.view/create/update` | natureza de operação |
| `fiscal_tax_codes.view/create/update` | CST + CSOSN compartilham este módulo — ambos são cadastros de referência da mesma natureza (código de situação tributária), sem regra de negócio própria que justifique dois módulos separados |
| `product_fiscal_profiles.view/create/update` | perfil fiscal do produto — `.update` só edita notas, nunca a classificação (§5) |
| `tax_rules.view/create/update/approve` | regras tributárias — `.approve` cobre ativar E desativar |
| `fiscal_documents.view/create/cancel` | documentos — `.create` cobre criar, adicionar itens E gerar devolução |
| `fiscal_documents.calculate/ready/authorize` | transições específicas do ciclo de vida (Fase 9, §18.2) — substituem o antigo uso genérico de `.update` para essas três transições; `.update` permanece só para `fn_reject_fiscal_document` |
| `fiscal_document_events.view/create` | eventos — `.create` só para os tipos manuais (§8), agora incluindo `INUTILIZATION`/`MANIFESTATION` (§18.3) |
| `fiscal_document_references.view/create` | documento referenciado (Fase 9, §18.4) |
| `fiscal_document_packages.view/create` | volumes declarados (Fase 9, §18.5) |

`product_fiscal_profiles.*` e `fiscal_tax_codes.*` não estavam na
lista literal da seção 38 — foram adicionados porque o domínio
genuinamente precisa deles (mesmo espírito de `production_materials.view`
em Produção/PCP: necessário para a tabela existir com RLS coerente,
sem inflar além do que a tabela realmente exige). Todas usam o sufixo
`.view`/`.create`/`.update`/... (não `.read`) porque todo o Fiscal tem
handlers dedicados (`src/lib/api/fiscal-handlers.ts`). Propagadas aos
3 papéis padrão via `fn_seed_company_rbac`.

## 15. RLS, auditoria, idempotência

- **RLS**: `fiscal_establishments`/`fiscal_ncms`/`fiscal_cfops`/
  `fiscal_operation_natures`/`fiscal_cst_codes`/`fiscal_csosn_codes`
  têm CRUD completo (select/insert/update) via `has_permission`
  direto. As 7 tabelas transacionais
  (`product_fiscal_profiles`/`tax_rules`/`tax_rule_items`/
  `fiscal_documents`/`fiscal_document_items`/
  `fiscal_document_item_taxes`/`fiscal_document_events`) só têm
  `select` — toda escrita via função `SECURITY DEFINER`.
- **Auditoria**: reaproveita `audit_logs` (0003), vocabulário ampliado
  em 0036 com `AUTHORIZE`/`EVENT` (`REJECT` já existia desde 0017,
  `APPROVE`/`CANCEL`/`CREATE`/`UPDATE` desde sempre).
- **Idempotência**: guarda de status em toda transição +
  `fn_calculate_fiscal_document` sempre recalcula do zero (delete+
  reinsert, nunca duplica) + índice único por origem em
  `fiscal_documents` (§7, seção 42) — a combinação cobre os casos
  citados: criação de documento, cálculo/consolidação, cancelamento.
- **Concorrência**: `fn_calculate_fiscal_document`/
  `fn_authorize_fiscal_document`/`fn_reject_fiscal_document`/
  `fn_cancel_fiscal_document`/`fn_approve_tax_rule` travam (`for
  update`) antes de validar e alterar — mesma técnica de
  `fn_confirm_purchase_receipt` (0018).
- **Precisão monetária**: todo valor monetário é `numeric` — nunca
  FLOAT, em toda tabela nova deste módulo (seção 26).

## 16. API

`/api/fiscal-establishments` (+`/[id]`), `/api/fiscal-ncms` (+`/[id]`),
`/api/fiscal-cfops` (+`/[id]`, filtrável por `?direction=`),
`/api/fiscal-operation-natures` (+`/[id]`, filtrável por
`?direction=`), `/api/fiscal-cst-codes` (+`/[id]`, filtrável por
`?taxType=`), `/api/fiscal-csosn-codes` (+`/[id]`).

`/api/product-fiscal-profiles` (filtrável por `?productId=`/`?status=`,
+`/[id]`, `/[id]/notes`).

`/api/tax-rules` (filtrável por `?status=`/`?productId=`, +`/[id]`,
`/[id]/items`, `/[id]/approve`, `/[id]/deactivate`),
`/api/tax-rule-items/[id]` (DELETE).

`/api/fiscal-documents` (filtrável por `?status=`/`?type=`/
`?fiscalEstablishmentId=`, +`/[id]`, `/[id]/items`, `/[id]/calculate`,
`/[id]/ready`, `/[id]/authorize`, `/[id]/reject`, `/[id]/cancel`,
`/[id]/return`, `/[id]/references`, `/[id]/packages`),
`/api/fiscal-document-events` (filtrável por `?fiscalDocumentId=`),
`/api/fiscal-document-references` (filtrável por `?fiscalDocumentId=`),
`/api/fiscal-document-packages` (filtrável por `?fiscalDocumentId=`).

`/api/purchase-receipts/[id]/generate-fiscal-document`,
`/api/sales-orders/[id]/generate-fiscal-document`.

## 17. Testes e frontend

Testes desta etapa cobrem a camada de validação Zod
(`src/lib/validations/fiscal.ts`). A lógica transacional real (resolução
de regra por prioridade, snapshot imutável mesmo após a regra mudar,
cálculo de imposto, idempotência por origem, transições de status,
RBAC, isolamento por empresa) vive nas funções SQL e só é verificável
contra um Postgres real, fora do alcance desta etapa (ver aviso no
topo e `tests/fiscal-validations.test.ts` para o detalhamento de quais
dos 27 cenários pedidos não são testáveis sem banco). Nenhuma tela
nova — banco de dados, backend, domínio, modelo tributário, workflow,
segurança, integrações, testes e documentação, como pedido; frontend
fica para uma etapa futura (v0).

## 18. Fase 9 — Fiscal Operacional (migrations 0041-0042)

Evolui a Fase 8 para um Fiscal usável pelo resto do ERP, ainda **sem**
integração real com SEFAZ/certificado digital/NF-e eletrônica — o
objetivo é preparar o domínio para essa etapa futura sem refazer nada.

### 18.1 Documento fiscal operacional

Nenhuma entidade nova por tipo de operação — `fiscal_documents`
continua representando entrada, saída, devolução, transferência,
remessa e retorno através de `direction` + `fiscal_operation_natures` +
`source_type`, evitando duplicar a estrutura por operação.

### 18.2 Ciclo de vida — o estado READY

`DRAFT → CALCULATED → READY → AUTHORIZED → CANCELLED`
(+`REJECTED`/`DENIED`/`CONTINGENCY` como antes). `READY` é novo: separa
"foi calculado" de "foi conferido e está pronto para autorizar" —
nenhum documento pula direto de CALCULATED para AUTHORIZED.

- `fn_mark_fiscal_document_ready` (a **conferência fiscal**, §18.3):
  CALCULATED → READY.
- `fn_authorize_fiscal_document`: create or replace (0041) — agora
  exige READY (era CALCULATED) e grava `authorized_at`.
- `fn_calculate_fiscal_document`/`fn_cancel_fiscal_document`: mesma
  lógica de 0039, só a permissão exigida por `fn_calculate_fiscal_document`
  mudou (§14).

### 18.3 Conferência fiscal

`fn_mark_fiscal_document_ready` valida, antes de liberar para
autorização: estabelecimento existe e está ativo; natureza de operação
existe e está ativa; cliente presente quando SAÍDA, fornecedor presente
quando ENTRADA; ao menos um item; nenhum item com NCM/CFOP/origem/
unidade/quantidade incompletos; `products_amount > 0`; e que
`total_amount` bate com a soma dos componentes (produtos - desconto +
frete + seguro + outras despesas + impostos) — um documento incompleto
ou inconsistente nunca vira READY.

### 18.4 Documento referenciado

`fiscal_document_references` (`fiscal_document_id`,
`referenced_document_id`, `reference_type`) evita dezenas de colunas
nullable em `fiscal_documents` para cada tipo de relação — uma
devolução referencia o original (`RETURN`), um documento complementar
referencia o anterior (`COMPLEMENT`), um substituto referencia o
anterior (`REPLACEMENT`), as duas pernas de uma transferência se
referenciam entre si (`TRANSFER_COUNTERPART`). A FK composta
`(id, company_id)` em ambos os lados impede referenciar um documento de
outra empresa.

### 18.5 Volumes

`fiscal_document_packages` (quantidade/espécie/marca/numeração/peso
bruto/peso líquido) é o volume **declarado no documento fiscal** —
deliberadamente uma entidade separada de `shipment_packages` (Logística
0024, o volume **físico** da expedição): podem divergir (reembalagem,
consolidação de várias expedições em um só documento) e por isso nunca
foram fundidas.

### 18.6 Devoluções

`fn_create_fiscal_document_return` cria o documento de devolução
(venda ou compra) a partir de um original **AUTHORIZED**: direção
sempre invertida, mesmo cliente/fornecedor, itens copiados preservando
o snapshot do original (NCM/CFOP/origem/quantidade/preço — nunca
relidos do cadastro atual), `source_type = 'return'` (idempotente pelo
mesmo índice único de origem da Fase 8) e um vínculo automático em
`fiscal_document_references` (`RETURN`).

### 18.7 Transferências

Preparado, não automatizado (ver §13) — `source_type` inclui
`transfer_out`/`transfer_in` para que as duas pernas de uma
transferência entre estabelecimentos compartilhem o mesmo
`stock_transfer` como origem sem colidir no índice único de
idempotência (cada perna tem seu próprio `source_type`). O Fiscal
continua nunca movendo estoque — quem move é `fn_ship_transfer`/
`fn_receive_transfer` (Estoque, 0010; agora também gerando custo, ver
`docs/COSTS.md`).

### 18.8 Chave/identificação, transporte e XML (preparação)

Cabeçalho ganhou `freight_mode` (EMITENTE/DESTINATARIO/TERCEIROS/
SEM_FRETE/OTHER), `gross_weight`/`net_weight`/`volumes_quantity`
(resumo — o detalhe por volume vive em `fiscal_document_packages`),
`environment` (PRODUCTION/HOMOLOGATION, default HOMOLOGATION),
`service`, `return_message`, `authorized_at`, `xml_sent_reference`
(complementa `xml_storage_reference` de 0039, agora o pointer do XML
**enviado** vs. o de **retorno**). Nenhum arquivo ou certificado é
armazenado — só ponteiros/metadados preparados (§13).

### 18.9 Eventos

`fiscal_document_events.event_type` ganhou `READY` (automático, gravado
por `fn_mark_fiscal_document_ready`), `INUTILIZATION` e `MANIFESTATION`
(manuais, via `fn_register_fiscal_document_event`, create or replace em
0041) — o ledger continua append-only, nunca apagado.

### 18.10 Imutabilidade (snapshot consolidado)

Regra absoluta (§2, reforçada): a partir de READY/AUTHORIZED, um
trigger (`fn_guard_fiscal_document_snapshot`) bloqueia qualquer
alteração em `fiscal_establishment_id`/`type`/`direction`/
`operation_nature_id`/`customer_id`/`supplier_id`/`products_amount`/
`taxes_amount`/`total_amount`/`discount_amount`/`freight_amount`/
`insurance_amount`/`other_expenses_amount` — `status` em si permanece
mutável (cancelamento é sempre uma troca pura de status). Dois
triggers irmãos bloqueiam UPDATE/DELETE em `fiscal_document_items` e
`fiscal_document_item_taxes` assim que o documento sai de
DRAFT/CALCULATED. Isso é uma garantia estrutural do banco, não uma
convenção de código — mudar um NCM ou uma `tax_rule` amanhã nunca
altera um documento já conferido.

### 18.11 RBAC (Fase 9)

`fiscal_documents.calculate`/`.ready`/`.authorize`,
`fiscal_document_references.view`/`.create`,
`fiscal_document_packages.view`/`.create` (ver tabela em §14).

### 18.12 Testes (Fase 9)

`tests/fiscal-validations.test.ts` ganhou casos para os novos schemas
(`registerFiscalDocumentEventSchema` com os dois novos tipos,
`addFiscalDocumentReferenceSchema`, `addFiscalDocumentPackageSchema`,
`createFiscalDocumentReturnSchema`) — mesma limitação de sempre: o
workflow real (READY exige conferência completa, imutabilidade após
READY/AUTHORIZED, idempotência da devolução, RLS/RBAC/isolamento por
empresa) só é verificável contra um Postgres real.
