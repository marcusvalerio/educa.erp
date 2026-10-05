Commits (branch `claude/e2e-empresa-nova-correcoes`):

| Commit | Conteúdo |
|---|---|
| **`e4f34c7`** | migrations 0081, 0084, 0085, 0086, 0087 |
| **`514d11b`** | migrations 0082, 0083, 0088 (fiscal) |
| **`85fb136`** | aplicação: recebível e NF-e idempotentes, mensagens, RBAC, telas; ajuste fino da mensagem da 0081; testes unitários |
| **`4e39bb0`** | testes de banco |
| **`8d29f00`** | fiscal simulado na aplicação |

Testes:
- **U** = `tests/rodada2-regressao.test.ts` (sem banco).
- **DB** = `tests/rodada2-integridade-db.test.ts` (PostgreSQL real, banco descartável).
- **E2E** = roteiros desta rodada, com sessões reais dos 48 usuários (`p1`…`p6`, `r3`…`r9`).

### Problemas da rodada 1 reproduzidos nesta rodada

**R48-01 · 🔴 CRÍTICO · Financeiro (contas a receber)**
- **Cenário:** duas pessoas (Financeiro e Gerente) geram a conta a receber do mesmo pedido ao mesmo tempo (ou duplo clique).
- **Passos:** pedido aprovado → `POST /api/sales-orders/:id/generate-receivable` duas vezes em paralelo, com sessões diferentes.
- **Esperado:** 1 título; o 2º recebe aviso de que o título já existe.
- **Encontrado (antes):** **6 de 8** execuções com **2 títulos ativos** para o mesmo pedido: Vértice 4/4, Sertão 2/4. O cliente seria cobrado em dobro.
- **Causa:** `fn_generate_accounts_receivable_from_sales_order` lia o pedido sem trava, procurava título e inseria (*check-then-act*). Não havia índice único na origem.
- **Correção:**
  - índice único parcial `accounts_receivable_origin_active_unique`;
  - trava `FOR UPDATE` no pedido;
  - `fn_generate_receivable_for_sales_order` diz se criou ou se já existia;
  - a API responde 201/200/409 com mensagem;
  - a tela mostra a mensagem do servidor;
  - a migration 0081 confere duplicatas antes e para se encontrar alguma. Os 6 pares locais foram cancelados antes pela API oficial.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:**
  - DB "índice único recusa o 2º título ativo" e "geração idempotente diz se criou ou já existia";
  - U "resposta da geração do título" e "índices únicos com mensagem própria";
  - E2E `p1` E4 e `r5` E4.
- **Resultado:**
  - FAIL 6/8 → **PASS 8/8** (p1);
  - 3 rodadas da concorrência A–G com 1 título;
  - integridade "mais de uma conta a receber ativa por pedido" = 0.

**R48-06 (G1) · 🟠 ALTO · Logística (separação)**
- **Cenário/Passos:** Logística e Logística 2 criam a separação do mesmo pedido ao mesmo tempo.
- **Esperado:** 1 separação; o 2º recebe recusa clara.
- **Encontrado:** **8/8** com 2 separações abertas.
- **Causa:** `fn_create_pick_list` sem trava nem índice.
- **Correção:** trava no pedido e índice `pick_lists_open_per_order_unique`. Mensagem: "O pedido PV-0142 já tem a separação SEP-0072 em aberto. Use essa separação (ou cancele-a antes de criar outra)." (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "2ª separação aberta recusada"; U índice único; E2E p1 G1, r5 G1.
- **Resultado:** FAIL 8/8 → **PASS 8/8**.

**R48-06 (G3) · 🟠 ALTO · Logística (expedição)**
- **Cenário/Passos:** duas expedições do mesmo pedido ao mesmo tempo, **e também em sequência** (G3b).
- **Esperado:** nunca expedir mais que o reservado.
- **Encontrado:** **8/8** com 2 expedições somando 8 unidades para 4 reservadas. Em sequência também passava (R2-02).
- **Causa:** `fn_create_shipment` não descontava as expedições abertas nem travava o pedido.
- **Correção:** trava, desconto das expedições abertas e mensagem com produto e quantidades (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "2ª expedição recusada"; E2E p1 G3/G3b, r5 G3.
- **Resultado:** FAIL 8/8 → **PASS 8/8**, mais G3b 2/2.

**R48-11 · 🟡 MÉDIO · Estoque (reservas)**
- **Cenário:** a reserva continuava "active" depois de o pedido ser expedido.
- **Esperado:** a expedição consome a reserva.
- **Encontrado:** 2/2 reproduções. **30** reservas ativas de pedidos expedidos e **45** divergências entre saldo reservado e reservas.
- **Causa:** a expedição baixava o saldo mas não marcava a reserva.
- **Correção:**
  - `consumed_quantity` por item;
  - `fn_consume_sales_order_reservation` (FIFO);
  - a reserva vira "consumed" quando termina;
  - ajuste das reservas antigas de pedidos já expedidos (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "expedição consome a reserva"; E2E p1 R11; integridade "reservado no saldo = reservas ativas não consumidas".
- **Resultado:** FAIL → **PASS**. Divergências 45 → **0**; reservas fantasmas 30 → **0**.

**R48-15 · 🟡 MÉDIO · Estoque (corrida de reserva)**
- **Cenário:** duas reservas simultâneas (8 + 7) com saldo 10.
- **Esperado:** nunca passar do saldo; o perdedor fica com o que sobrou, como acontece em sequência.
- **Encontrado:** **8/8**: o perdedor recebia 422 "Reserva de 7.0000 excede o saldo disponível." e ficava sem nada.
- **Causa:** leitura do saldo sem trava.
- **Correção:** `FOR UPDATE` nas linhas de saldo, em ordem determinística por produto (0081).
- **Commit:** `e4f34c7`.
- **Teste:** E2E p1 C, r5 C/C4. O teste DB é sequencial e passa também sem a correção (R2.17).
- **Resultado:** FAIL 8/8 → **PASS 8/8** (reservado 10 de 10).

**R48-17 · 🔵 BAIXO · Mensagens**
- **Encontrado:** UUID na mensagem da expedição ("Item 79623d82-…: quantidade a expedir (5) excede…").
- **Correção:** código e nome do produto (`fn_product_label`), mais o filtro de UUID na API.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** U "sem UUID interno"; DB "mensagens sem UUID"; E2E p1 M17.
- **Resultado:** **FAIL 2/2 → PASS 2/2.**

**R48-22 · 🔵 BAIXO · Mensagens**
- **Encontrado:** quantidades como "8.0000" e "4.0000".
- **Causa:** `numeric(16,4)` convertido em texto.
- **Correção:** `fn_fmt_qty` no banco e `formatDbQuantity` na API.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** U "R48-22".
- **Resultado:** **FAIL → PASS.**

**R48-23 · 🔵 BAIXO · Auditoria**
- **Encontrado:** o convite do Owner aparecia como `platform:OWNER:owner@…`.
- **Correção:** a tela mostra "Owner da plataforma (owner@…)" (`auditActorLabel`).
- **O que continua:** o `user_id` nulo continua no dado, porque o Owner não é usuário da empresa.
- **Commit:** `85fb136`.
- **Teste:** U "R48-23".
- **Resultado:** **exibição FAIL → PASS.**

**R48-24 · 🔵 BAIXO · Comercial**
- **Encontrado:** o Vendedor recebia 403 de "locais de estoque" ao abrir o pedido.
- **Causa:** a tela buscava os locais para todos os usuários.
- **Correção:** a tela só busca quando o usuário pode reservar.
- **Commit:** `85fb136`.
- **Teste:** E2E usabilidade (coluna "API com erro" nas telas de pedido do Vendedor).
- **Resultado:** ⟦R4824⟧.

**R48-26 · 🔵 BAIXO · Administração (RBAC)**
- **Cenário:** usuário sem `users.read` chama `GET /api/admin/users`.
- **Esperado:** 403.
- **Encontrado:** 200 com o próprio registro (25 casos no RBAC da rodada 1). Não havia vazamento: a RLS só devolve a própria linha.
- **Causa:** o handler não checava a permissão e dependia só da RLS.
- **Correção:** `hasPermission(…, "users.read")` antes da consulta → 403 "Você não tem permissão para esta operação (Usuários — Ler)."
- **Commit:** `85fb136`.
- **Teste:** U "R48-26"; E2E RBAC dos 48 usuários.
- **Resultado:** ⟦R4826⟧.

**R48-29 · 🔵 BAIXO · Validação**
- **Encontrado:** texto técnico "(ex.: 10,50 → 10.50)".
- **Correção:** "Informe … só com números, com ponto antes dos centavos (ex.: 10.50)."
- **Commit:** `85fb136`.
- **Resultado:** **ajustado.**

**R48-31 · 🔵 BAIXO · Navegação**
- **Encontrado:** menu e títulos com "Picking"/"Packing".
- **Correção:** "Separação"/"Embalagem". A busca por "picking"/"packing" continua achando as telas.
- **Commit:** `85fb136`.
- **Teste:** U "R48-31" (menu e títulos).
- **Resultado:** **FAIL → PASS.**

**B15 · 🔵 BAIXO · Mensagens**
- **Encontrado:** 403 da API com "(stock.adjust)".
- **Correção:** permissão por extenso, "(Estoque — Ajustar)".
- **Commit:** `85fb136`.
- **Teste:** U "403 genérico sem o código"; E2E r7.
- **Resultado:** **FAIL → PASS.**

**B18 · 🔵 BAIXO · Comercial**
- **Encontrado:** o item do pedido não herdava a unidade do produto e gravava nulo (2/2).
- **Causa:** a função de criação não lia `products.unit`.
- **Correção:** gatilho `fn_item_unit_from_product` nos itens de pedido e de orçamento, com ajuste dos itens antigos (0085).
- **Commit:** `e4f34c7`.
- **Teste:** DB "B18"; E2E p1 B18.
- **Resultado:** **FAIL (nulo) → PASS ("CX") 2/2.**

**R48-04 · ⚪ DECISÃO DE NEGÓCIO (risco de segregação de funções) · RBAC**
- O papel de sistema **Operador** pode criar conta a pagar, baixar parcela a receber e criar NCM.
- Reconfirmado nesta rodada: ⟦R4804⟧.
- **Não alterado**, porque a decisão é sua.

### Problemas novos desta rodada

**R2-01 · 🟠 ALTO · Comercial (cancelamento)**
- **Cenário:** cancelar pedido que já passou da reserva (em separação ou pronto para expedir).
- **Esperado:** cancelar e liberar a reserva, ou recusar dizendo o que impede.
- **Encontrado:** 422 genérico "Um dos valores informados não é permitido…", com a reserva presa (H1 e H1c, 2/2 cada).
- **Causa:** `fn_cancel_sales_order` só aceitava "aprovado/reservado", e o status inválido caía na restrição da tabela.
- **Correção (0081):**
  - sem separação ou expedição aberta: cancela e libera o restante;
  - com tarefa aberta: recusa nomeando a tarefa ("a separação SEP-0082 está em aberto. Cancele a separação antes…") — decisão R2-16;
  - a tela passou a oferecer o cancelamento nessas situações.
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** DB "R2-01" (3 testes); E2E p1 H1/H1c.
- **Resultado:** FAIL → **PASS**.

**R2-02 · 🟠 ALTO · Logística**
- **Encontrado:** a 2ª expedição **em sequência** (sem concorrência) com a mesma quantidade era aceita (G3b, 2/2).
- **Causa e correção:** ver R48-06 G3 (desconto das expedições abertas).
- **Commit:** `e4f34c7`.
- **Teste:** DB G3/R2-02; E2E p1 G3b.
- **Resultado:** **FAIL → PASS.**

**R2-03 · 🟡 MÉDIO · Logística**
- **Encontrado:** a expedição podia ser criada a partir de um local onde a reserva era de **outro** pedido (H2, 2/2 → 201). Só era barrada no envio.
- **Correção:** a criação exige reserva livre **deste** pedido naquele local: "…não tem reserva suficiente neste local… Expeça do local onde o estoque foi reservado." (0081).
- **Commit:** `e4f34c7`.
- **Teste:** DB "R2-03"; E2E p1 H2.
- **Resultado:** **FAIL → PASS.**

**R2-04 · 🟠 ALTO · Fiscal**
- **Encontrado:** o papel Fiscal **não conseguia numerar** a NF-e, porque a numeração exigia permissão de configuração.
- **Correção:** `fn_assign_fiscal_document_number` com a permissão de cálculo; a sequência interna fica sem permissão exposta (0083).
- **Commit:** `514d11b`.
- **Teste:** DB "R2-04/05/06" (falha sem a 0083); E2E p2 N1.
- **Resultado:** **FAIL → PASS.**

**R2-05 · 🟡 MÉDIO · Fiscal**
- **Encontrado:** documento "pronto" sem número ficava travado e não podia mais ser numerado.
- **Correção:** permitir numerar em DRAFT/CALCULATED/READY/REJECTED (0083).
- **Commit:** `514d11b`.
- **Teste:** DB; E2E N2.
- **Resultado:** **FAIL → PASS.**

**R2-06 · 🟡 MÉDIO · Fiscal**
- **Encontrado:** numerar duas vezes trocava o número e abria buraco na série.
- **Correção:** recusa com "já tem o número" (0083).
- **Commit:** `514d11b`.
- **Teste:** DB; E2E N3.
- **Resultado:** **FAIL → PASS.**

**R2-07 · 🟠 ALTO · Fiscal**
- **Encontrado:** a autorização **manual** aceitava documento sem número e qualquer texto como chave ("123").
- **Correção:** exige número, chave de 44 dígitos com DV válido e o número dentro da chave (0083).
- **Commit:** `514d11b`.
- **Teste:** DB "R2-07"; E2E N4.
- **Resultado:** **FAIL → PASS.**

**R2-08 · 🟠 ALTO · Fiscal**
- **Encontrado:** dois documentos de SAÍDA podiam ter o mesmo número e série no estabelecimento.
- **Correção:** índice único `fiscal_documents_own_number_unique`, com pré-checagem que para se houver repetição (0083).
- **Commit:** `514d11b` + `85fb136` (mensagem).
- **Teste:** DB "R2-08"; U mensagem; E2E N5; integridade "número repetido".
- **Resultado:** **FAIL → PASS.**

**R2-09 · 🟠 ALTO · Fiscal (configuração)**
- **Encontrado:** sem série de numeração a NF-e não pode ser numerada, mas o checklist da primeira NF-e dizia "pronto". Não há tela para criar série.
- **Corrigido:** o checklist cita a série (`fiscal_series`).
- **Aberto:** tela de séries e número inicial (⚪ decisão).
- **Commit:** `514d11b` + `8d29f00`.
- **Teste:** U `fiscal-setup` "R2-09"; E2E p2 S0.
- **Resultado:** **parcial.**

**R2-10 · 🟡 MÉDIO · Logística (entrega)**
- **Cenário:** duas confirmações de entrega simultâneas da mesma expedição.
- **Encontrado:** com 2 conexões reais ao banco sem a 0084 (`p6-entrega-dupla`): **ok/ok e 2 eventos "entregue"**.
- **Causa:** `fn_confirm_delivery` e `fn_fail_delivery` sem trava.
- **Correção:** `FOR UPDATE` na expedição; o 2º recebe "…(situação atual: Entregue)" (0084).
- **Commit:** `e4f34c7`.
- **Teste:** E2E p6 (antes × depois), r5 G3 ("entregar 2×" → 1 evento); integridade "mais de um evento entregue".
- **Resultado:** **FAIL → PASS** (1 evento).

**R2-11 · 🔵 BAIXO · Mensagens**
- **Encontrado:** mensagens do banco com código de status ("status atual: shipped"), permissões por código e números com 4 casas.
- **Correção:** `humanizeErrorMessage` aplicada a toda resposta de erro da API. O rótulo é escolhido pela entidade citada na frase.
- **Commit:** `85fb136`.
- **Teste:** U (8 testes); E2E p1 R11b ("situação atual: Expedido").
- **Resultado:** **FAIL → PASS.**

**R2-12 · 🟡 MÉDIO · Fiscal (impostos)**
- **Encontrado:** a NF-e é autorizada (na simulação) **sem nenhum imposto calculado**. O banco local tem **0 regras tributárias** e o checklist da 1ª NF-e não as exige.
- **Não corrigido:** criar regras tributárias é decisão fiscal/contábil (regime, CST/CSOSN, alíquotas por UF/NCM). Não inventei regras.
- **Situação:** **aberto**, com recomendação.

**R2-13 · 🔵 BAIXO · Fiscal (linha do tempo)**
- **Encontrado:** eventos gravados na mesma transação tinham o **mesmo horário**, e a linha do tempo podia inverter a ordem.
- **Causa:** default `now()` (início da transação).
- **Correção:** `clock_timestamp()` (0088).
- **Commit:** `514d11b`.
- **Teste:** DB "R2-13" (FAIL sem a 0088).
- **Resultado:** **FAIL → PASS.** Eventos antigos não foram reescritos.

**R2-17 · 🔵 BAIXO · Financeiro (validação)**
- **Encontrado:** parcelas que não somam o total respondiam **409** (conflito de situação) em vez de **422** (dado inválido). A mensagem já era clara.
- **Correção:** classificação no mapeamento do Financeiro.
- **Commit:** `85fb136`.
- **Teste:** U "R2-17"; E2E r7 (3 empresas).
- **Resultado:** ⟦R217⟧.

**R2-18 · 🟡 MÉDIO · Auditoria (cobertura)**
- **Cenário:** filtrar a trilha por autor e ação para saber quem criou um pedido.
- **Esperado:** criação e envio para aprovação aparecem na trilha.
- **Encontrado:** pedido de venda, orçamento, solicitação e pedido de compra **não tinham linha de criação** (140 pedidos de venda e 7 pedidos de compra, 0 linhas "Criação"). A trilha começava na aprovação; o autor existia só em `created_by`.
- **Causa:** as funções de criação não gravavam auditoria.
- **Correção (0086):**
  - gatilhos `AFTER INSERT` (CREATE) nas 4 tabelas;
  - SUBMIT na transição rascunho → pendente;
  - ação SUBMIT ("Envio para aprovação") incluída na lista de ações;
  - autor = usuário da sessão.
- **Commit:** `e4f34c7` + `85fb136` (rótulo).
- **Teste:** DB "R2-18" (FAIL sem a 0086); U rótulo; E2E p4.
- **Resultado:** FAIL → **PASS** (Vértice 81/81 e Sertão 81/81 pedidos criados depois da 0086 com CREATE e o autor certo) ⟦R218F⟧. Linhas antigas não foram recriadas, porque a trilha não é reescrita.

**R2-19 · 🔵 BAIXO · Fiscal (resposta da geração)**
- **Cenário:** Fiscal e Gerente geram a NF-e do mesmo pedido ao mesmo tempo (S7).
- **Esperado:** 1 documento, e só quem criou recebe "criado".
- **Encontrado (execução perdida):** **201 / 201** e 1 documento. Não houve duplicidade, mas o 2º recebeu "criado" para um documento que não criou.
- **Causa:** `fn_create_fiscal_document` devolve o documento existente sem dizer que já existia.
- **Correção:** `fn_generate_fiscal_document_for_sales_order` (trava, permissão, diz se criou) e API 201/200 (0087).
- **Commit:** `e4f34c7` + `85fb136`.
- **Teste:** DB "R2-19"; U "R2-19"; E2E p2 S7 (exatamente uma resposta 201).
- **Resultado:** **PASS** nas 2 empresas.

**R2-20 · 🔵 BAIXO · Mensagens**
- **Encontrado:** "Saldo insuficiente: disponível 2.672 em estoque, solicitado 99999." Um número formatado, o outro não.
- **Correção:** formatação das quantidades depois de "solicitado", "disponível" e "reservado".
- **Commit:** `85fb136`.
- **Teste:** U "R2-20"; E2E r7.
- **Resultado:** ⟦R220⟧.

**R2-21 · 🔵 BAIXO · Ferramentas de desenvolvimento**
- **Encontrado:** `supabase/seed.sql` não roda no esquema atual: os locais de estoque exigem `warehouse_id` e o seed não informa.
- **Situação:** **aberto.** Não afeta produção. Os testes de banco desta rodada usam fixtures mínimas próprias.

**R2-22 · 🔵 BAIXO · Auditoria (RBAC)**
- **Cenário:** usuário sem `audit_logs.read` chama `GET /api/admin/audit` (RBAC dos 48 usuários).
- **Esperado:** 403, como as demais operações negadas.
- **Encontrado:** **200 com lista vazia** para os **25** usuários sem a permissão: Vendedor 8, Financeiro 6, Logística 4, Fiscal 4, Compras 3. Não há vazamento, porque a RLS filtra. O roteiro da rodada 1 aceitava "lista vazia" como negação, por isso o caso não aparecia como FAIL. É o mesmo padrão do R48-26: parece "não aconteceu nada" em vez de "você não pode ver".
- **Causa:** o handler não conferia a permissão; dependia só da RLS.
- **Correção:** `hasPermission(…, "audit_logs.read")` antes da consulta → 403 "Você não tem permissão para esta operação (Auditoria — Ler)."
  - As telas que usam essa rota já são restritas a quem tem a permissão: a tela de auditoria e o mapa de calor do painel.
  - O histórico do registro usa outra rota (`/api/audit-logs`).
- **Commit:** `3a74d43`.
- **Teste:** U "R2-22" (FAIL antes); E2E RBAC 48 usuários na build final.
- **Resultado:** ⟦R222⟧.

**R2-23 · 🔵 BAIXO · Mensagens (permissões)**
- **Encontrado:** ao testar o R2-22, o 403 saiu como "(Audit logs — Ler)".
- **Causa:** 28 códigos de permissão têm prefixo diferente do recurso do catálogo ("audit_logs.read", "roles.manage", "units.read", "settings.company.update", "controlling.budget.create"…), e o texto caía no nome técnico humanizado em inglês: "Brands — Criar", "Controladoria — Budget create".
- **Correção:**
  - rótulos para os prefixos;
  - para códigos de 3 partes, a divisão recurso/ação que existe nos mapas, por exemplo "Configurações da empresa — Editar".
- **Commit:** `3a74d43`.
- **Teste:** U "R2-23" (15 códigos).
- **Resultado:** **FAIL 14/15 → PASS 15/15.**
