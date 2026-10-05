
---
---

# RODADA 2 — 04/10/2026 · testar → identificar → corrigir → comprovar → continuar testando

> Réplica **local** da homologação (PostgreSQL 16 local, dublê do Neon Auth, caixa de e-mail local, `next start`), as mesmas **7 empresas / 48 usuários / Owner** criadas pelo fluxo oficial com os roteiros da rodada 1 (`evidencias/teste-48-usuarios/roteiros/`) e dados fictícios.
> **Nada em `main`, produção, Vercel de produção ou banco de produção.** As migrations desta rodada (0081–0088) foram aplicadas **somente em bancos locais descartáveis**.
> Branch: `claude/e2e-empresa-nova-correcoes`. Evidências e roteiros: [`evidencias/teste-48-usuarios-rodada-2/`](evidencias/teste-48-usuarios-rodada-2/). Testes: [`tests/rodada2-regressao.test.ts`](../../tests/rodada2-regressao.test.ts) e [`tests/rodada2-integridade-db.test.ts`](../../tests/rodada2-integridade-db.test.ts).
> A rodada 1 (seções 1–13 acima) **não foi alterada**. As seções desta rodada usam a numeração **R2.x**; os problemas, **R2-xx**.

## R2.0 Incidente: o ambiente foi reiniciado no meio da rodada (e o que isso mudou)

No fim da primeira execução desta rodada o contêiner foi **reiniciado** e perdeu o clone de trabalho, o banco local e os roteiros que estavam só nele — inclusive **dois commits que eu ainda não tinha enviado** ao GitHub. O erro foi meu: devia ter enviado a cada etapa. Refiz a rodada inteira, desta vez **enviando a cada etapa** (9 commits). Consequências, sem esconder nada:

- **Ambiente refeito do zero** pelo mesmo caminho da rodada 1: banco pelo plano equivalente à produção (98 migrations), dublê de autenticação, Owner pelo bootstrap oficial e as 7 empresas / 48 usuários / massa de dados pelos roteiros **commitados** da rodada 1 (`r1-setup`, `r2-dados`). Por isso os **códigos e números** (PV-…, CR-…, contagens) são diferentes dos da execução perdida.
- **As correções foram reescritas** a partir do registro da sessão: 0086 e 0087 e os testes de regressão foram recuperados literalmente; 0081–0085, 0088, o fiscal simulado e os roteiros `p1`/`p2`/`p3` foram reescritos e **comprovados de novo** (antes → depois) neste ambiente novo. Nenhum resultado abaixo vem da execução perdida, exceto onde está escrito "execução perdida".
- O roteiro fiscal "antes" (2 PASS / 11 FAIL na execução perdida) **não pôde ser refeito** contra o banco antigo com os 48 usuários (o banco foi perdido e o novo já recebeu as migrations). A prova "antes" do fiscal nesta reexecução é a dos **testes de banco executados um a um sem as migrations** (R2.16).

## R2.1 Resumo executivo

⟦RESUMO⟧

## R2.2 Método (e o que NÃO foi feito)

- **Reproduzir antes de corrigir.** Os problemas abertos foram executados de novo **contra o código e o banco originais**, num roteiro próprio (`p1-reproducao`), 4 vezes cada nas duas empresas de operação mais intensa (Vértice e Sertão). **Antes: 2 PASS / 46 FAIL.**
- **Corrigir no banco o que é do banco.** Corridas *check-then-act* foram fechadas com trava (`SELECT … FOR UPDATE`) e, onde cabe, **índice único**: o banco recusa a duplicidade venha de onde vier (tela, API, integração).
- **Migration só depois de conferir os dados.** Cada migration com índice único **confere duplicatas antes** e **para** se encontrar. As duplicatas criadas pela reprodução foram tratadas pela **API oficial**, com o papel responsável de cada empresa (o autor fica na auditoria): **6 títulos, 8 separações e 10 expedições excedentes cancelados**, nada apagado (`p0-limpeza.out.json`).
- **Comprovar com o mesmo roteiro e com teste que falha antes.** Rebuild, reinício e o **mesmo** roteiro de novo (FAIL → PASS), mais teste de regressão. Os 20 testes de banco foram executados **um a um contra um banco sem as migrations**: 19 falham (R2.16).
- **Falso positivo é do harness, não do ATLAS** — cada um justificado em R2.17. Onde o roteiro estava errado, **o roteiro foi corrigido** e a versão antiga guardada.
- **Não perseguir 100% PASS.** Decisões de negócio ficaram como estão (R2.19); o que não dava para corrigir com segurança ficou **aberto**, com causa e caminho.

## R2.3 Problemas da rodada 1 — estado atual (reproduzidos, não presumidos)

| ID | Problema | Rodada 1 | Reprodução nesta rodada (antes) | Depois da correção | Situação |
|---|---|---|---|---|---|
| R48-01 🔴 | Duas contas a receber para o mesmo pedido | 4 de 6 | **6 de 8** execuções com 2 títulos ativos (Vértice 4/4, Sertão 2/4) | 8/8 com 1 título; o 2º recebe "Este pedido já tem a conta a receber CR-0064. Nenhum título novo foi criado." | ✅ corrigido (0081) |
| R48-06 🟠 | Separação em dobro (G1) | 3 de 4 | **8 de 8** | 8/8: 1 separação; o 2º recebe "O pedido PV-0142 já tem a separação SEP-0072 em aberto. Use essa separação (ou cancele-a antes de criar outra)." | ✅ corrigido (0081) |
| R48-06 🟠 | Expedição em dobro (G3) | 4 de 4 | **8 de 8** (8 unidades em expedições para 4 reservadas) e também **em sequência** (G3b) | 8/8 + G3b: o 2º recebe "…a quantidade a expedir (4) é maior que o reservado ainda livre para expedição (0)…" | ✅ corrigido (0081) |
| R48-11 🟡 | Reserva "active" depois da expedição | 62 registros | 2 de 2; **30** reservas ativas de pedidos já expedidos; **45** divergências saldo reservado × reservas | reserva **consumida**; 30 → **0**; divergências 45 → **0** | ✅ corrigido (0081) |
| R48-15 🟡 | Corrida de reserva sem parcial | rodadas 2–3 | **8 de 8** (o perdedor: 422 "Reserva de 7.0000 excede o saldo disponível.") | 8/8: os dois 200; reservado 10 de 10 (o perdedor fica com o que sobrou) | ✅ corrigido (0081) |
| R48-04 🟠/⚪ | Operador lança conta a pagar, baixa recebível e cria NCM | 21 divergências | ⟦R4804⟧ | — | ⚪ **decisão de negócio** (não alterado) |
| R48-16 🟡 | Desempenho com 48 usuários | p95 2,2 s | ⟦R4816-antes⟧ | ⟦R4816-depois⟧ | ⟦R4816-sit⟧ |
| R48-17 🔵 | UUID na mensagem da expedição | aberto | reproduzido ("Item 79623d82-…: quantidade a expedir (5) excede…") | "…para o produto VO-…-M17 — Produto rodada 2 M17…, a quantidade a expedir (5)…"; sem UUID | ✅ corrigido |
| R48-22 🔵 | "4.0000" nas mensagens | aberto | reproduzido ("Reserva de 8.0000 excede…") | formatação central + `fn_fmt_qty` | ✅ corrigido |
| R48-23 🔵 | Convite do Owner como `platform:OWNER:owner@…` | aberto | ⟦R4823⟧ | tela: "Owner da plataforma (owner@…)"; `user_id` nulo continua no dado | ✅ exibição corrigida |
| R48-24 🔵 | Vendedor recebe 403 de locais de estoque ao abrir o pedido | aberto | (código) a tela buscava os locais para todos | a tela só busca para quem pode reservar · ⟦R4824⟧ | ✅ corrigido |
| R48-26 🔵 | Lista de usuários devolve o próprio registro (200) sem `users.read` | aberto | ⟦R4826-antes⟧ | ⟦R4826-depois⟧ | ⟦R4826-sit⟧ |
| R48-27 / B11 🔵⚪ | Pedido entregue continua "Expedido" | aberto | reproduzido (nenhuma função grava "Concluído") | — | ⚪ decisão |
| R48-29 🔵 | "(ex.: 10,50 → 10.50)" | aberto | — | "Informe … só com números, com ponto antes dos centavos (ex.: 10.50)." | ✅ texto ajustado |
| R48-30 🔵 | Alvos de toque < 32 px no celular | 102 combinações (3 tamanhos) | ⟦R4830⟧ | — | 🔵 aberto (melhoria de UX) |
| R48-31 🔵 | Menu "Picking"/"Packing" | aberto | reproduzido (menu e títulos das telas) | "Separação"/"Embalagem" (a busca por "picking"/"packing" continua achando) | ✅ corrigido |
| B15 🔵 | Código de permissão no 403 | rodada 7 empresas | "(stock.adjust)" | "(Estoque — Ajustar)" | ✅ corrigido |
| B18 🔵 | Item do pedido não herda a unidade do produto | rodada 7 empresas | **reproduzido** (2/2): produto "CX", item com unidade **nula** | item "CX" | ✅ corrigido (0085) |
| D1 | (decisão pendente desde a rodada de 7 empresas) | — | não reavaliado | — | ⚪ aguardando sua decisão |

**Roteiro de reprodução (`p1`, 48 verificações):** antes **2 PASS / 46 FAIL** → depois **48 / 0** ⟦P1F⟧.

## R2.4 Recebível — avaliação da correção (prioridade crítica)

**Causa (confirmada no código vivo do banco):** `fn_generate_accounts_receivable_from_sales_order` lia o pedido **sem trava**, procurava título existente e então inseria — *check-then-act*. Sem índice único na origem, duas transações simultâneas passavam pela verificação e criavam dois títulos.

| Requisito | Como ficou (migration 0081) |
|---|---|
| **O banco impede a duplicidade** | Índice único parcial `accounts_receivable_origin_active_unique (company_id, origin_type, origin_id) WHERE origin_id IS NOT NULL AND status <> 'CANCELLED'`: qualquer 2º título **ativo** do mesmo pedido é recusado pelo PostgreSQL, venha da tela, da API ou de integração. |
| **Concorrência** | `SELECT … FROM sales_orders … FOR UPDATE` no início: a 2ª geração espera a 1ª terminar e encontra o título. Se mesmo assim o índice recusar, a função devolve o título existente. |
| **Idempotência** | Repetir não cria nada. A API usa `fn_generate_receivable_for_sales_order`, que diz **se criou agora ou se já existia**: 201 "Conta a receber CR-… gerada." / 200 "Este pedido já tem a conta a receber CR-…. Nenhum título novo foi criado." A tela mostra a mensagem do servidor. |
| **Integridade financeira** | valor do título = total do pedido; soma das parcelas = valor (conferido no banco — R2.12). |
| **Vínculo com o pedido** | `origin_type='sales_order'`, `origin_id` = pedido; a auditoria grava também o código do pedido. |
| **Auditoria** | uma linha `APPROVE` por título criado, com o autor real; a repetição não gera auditoria falsa. |
| **Isolamento** | a permissão é conferida **na empresa do pedido** antes de revelar se existe título. |
| **Título cancelado** | não gera outro automaticamente para o mesmo pedido; a resposta diz isso (409). Gerar de novo após cancelar é ⚪ decisão (R2-15). |

**Antes de aplicar em homologação/produção, rode a conferência** (a migration para sozinha se encontrar duplicata):

```sql
select company_id, origin_id, array_agg(code order by created_at) titulos
from accounts_receivable
where origin_type = 'sales_order' and origin_id is not null and status <> 'CANCELLED'
group by 1, 2 having count(*) > 1;
```

**Prova:** reprodução 6/8 FAIL → 8/8 PASS; 3 rodadas da suíte A–G (E4) com 1 título; testes de banco "índice único recusa o 2º título ativo" e "geração idempotente diz se criou ou já existia" (ambos falham sem a 0081).

## R2.5 Separação e expedição

| Cenário | Antes | Depois |
|---|---|---|
| Pessoa 1 + Pessoa 2, mesmo pedido, mesmo instante — separação | 201/201, 2 separações (8/8) | 201 / 422 "O pedido PV-… já tem a separação SEP-… em aberto. Use essa separação (ou cancele-a antes de criar outra)." Trava + índice `pick_lists_open_per_order_unique` |
| Pessoa 1 + Pessoa 2 — expedição | 201/201, 8 unidades em expedições para 4 reservadas | 201 / 422 "Não é possível criar a expedição: para o produto …, a quantidade a expedir (4) é maior que o reservado ainda livre para expedição (0). 4 já está em outra expedição aberta deste pedido." |
| 2ª expedição **em sequência** com a mesma quantidade | **aceita** (sem concorrência!) | recusada (a criação desconta as expedições abertas) — R2-02 |
| Expedir 3× ao mesmo tempo | 1 saída de estoque (já protegido) | 1 saída; os outros: 409 "Só é possível expedir uma expedição pronta para envio (situação atual: Expedida)." |
| Expedir de um local onde a reserva é de OUTRO pedido | **criada** (só seria barrada no envio) | recusada na criação: "…o pedido PV-… não tem reserva suficiente neste local para o produto … (reservado livre aqui: 0). Expeça do local onde o estoque foi reservado." — R2-03 |
| Entregar 2× ao mesmo tempo | 2 conexões reais: **ok/ok → 2 eventos "entregue"** (`p6-entrega-dupla`, banco sem 0084) | uma confirma, a outra é recusada "…(situação atual: Entregue)" → **1 evento** (0084) — R2-10 |
| Impacto no estoque e contadores | — | saldo cai uma vez só; contadores do pedido não dobram (suíte A–G, G3) |

## R2.6 Reservas — ciclo completo

| Verificação | Antes | Depois |
|---|---|---|
| Reserva nunca acima do saldo (corrida 8 + 7 com saldo 10) | nunca passou de 10 ✅ | idem ✅ |
| Perdedor da corrida | 422 "Reserva de 7.0000 excede o saldo disponível.", sem reserva | reserva parcial do que sobrou, pedido em "Reserva pendente" |
| Expedição consome a reserva | reserva continuava "active" | `consumed_quantity` por item; reserva "consumed" ao terminar; expedição parcial consome só o que saiu |
| Saldo reservado = reservas ativas não consumidas | **45 divergências** | **0** |
| Reservas ativas de pedidos já expedidos | **30** | **0** (ajuste da 0081) |
| Cancelamento libera | só em "aprovado/reservado"; pedido em separação ou pronto para expedir **não cancelava** (422 "Um dos valores informados não é permitido") e a reserva ficava presa | sem tarefa aberta: cancela e libera o restante; com separação/expedição aberta: recusa nomeando a tarefa (R2-01/R2-16) |
| Cancelamento depois de expedição parcial | — | libera só o restante (teste de banco: expedido 2, reservado 2, cancelado 3, nenhuma reserva presa) |

## R2.7 Fiscal — simulação (sem SEFAZ, sem certificado, sem provedor real)

**Arquitetura:** o ATLAS.ERP já previa autorização por provedor (tentativa → resposta). Faltava o provedor. Foi criado o **SIMULACAO** (0082), que usa os mesmos caminhos (tentativa em `fiscal_authorization_attempts`, eventos, auditoria com o autor real):

- só em documento de **homologação**, só com o provedor **configurado explicitamente** no estabelecimento, e as rotas só existem com `APP_ENV=homologacao`;
- confere o documento como um validador faria e **rejeita** com códigos **próprios** `SIM-…` (não imita códigos oficiais): sem itens (SIM-101), NCM/CFOP inválido (SIM-102), destinatário sem CPF/CNPJ (SIM-103), total divergente (SIM-104), CFOP × direção (SIM-105), CFOP × destino (SIM-106);
- aprovado: chave de 44 dígitos no formato da NF-e, com DV módulo 11, e protocolo `SIMULACAO-…`;
- cancelamento simulado: justificativa ≥ 15 caracteres, prazo de 24 h, evento `SIMULACAO-CANC-…`.

**Documento visual** (`/app/fiscal/notas-fiscais/:id/documento-simulado`): estrutura parecida com o documento auxiliar, **sem** brasões ou logotipos oficiais e **sem** código de barras; faixa "ATLAS.ERP · DOCUMENTO FISCAL SIMULADO · SEM VALOR FISCAL · NÃO AUTORIZADO PELA SEFAZ", marca d'água "ATLAS.ERP — SIMULAÇÃO" repetida, carimbo "SIMULAÇÃO — SEM VALOR FISCAL" / "CANCELADO" / "NÃO AUTORIZADO" e texto final dizendo que não houve transmissão. **Em nenhum lugar se apresenta como NF-e autorizada.** Capturas: `02-fiscal-simulado/`. Nova tela de detalhe do documento (numerar, calcular, pronto, autorizar/cancelar na simulação, linha do tempo em português).

| Teste (Vértice e Sertão) | Resultado |
|---|---|
| C0 — série e provedor | o Administrador cadastra a série 1 do estabelecimento e o provedor SIMULACAO pelas rotas oficiais |
| S0 — checklist | a 1ª NF-e passa a contar a série de numeração (R2-09) |
| N1–N5 — numeração | o **Fiscal numera** (antes exigia permissão de configuração); numera depois de "pronto"; **não renumera**; a autorização manual recusa documento sem número e chave "123"; dois documentos numerados ao mesmo tempo têm números diferentes e nenhum número se repete na série |
| S1 — pedido → NF-e → numerar → calcular → pronta → autorizar | AUTHORIZED; chave de 44 dígitos com DV válido; protocolo `SIMULACAO-…`; pedido de origem, cliente, produto, quantidade (4), preço (37,50), NCM, CFOP e total conferidos no banco; 1 tentativa no provedor; autor real na auditoria. **Impostos: nenhum** (R2-12) |
| S2/S3 — autorizar de novo / 3 pessoas ao mesmo tempo | 1 autoriza; os outros 409 "O documento DF-… já foi autorizado (simulação), chave …. Nada foi refeito."; 1 tentativa, 1 evento |
| S4/S5 — rejeições | CFOP 6102 para cliente do mesmo estado → REJECTED **SIM-106**; CFOP 1102 em saída → REJECTED **SIM-105** |
| S6 — cancelamento | justificativa curta → 422; 2 pessoas ao mesmo tempo → 1 cancela, o outro "já está cancelado"; 1 auditoria CANCEL |
| S7 — NF-e do mesmo pedido 2× ao mesmo tempo | 1 documento; **só uma resposta 201**; o outro 200 "Este pedido já tem a NF-e DF-…. Nenhum documento novo foi criado." (R2-19) |
| S8 — permissão e isolamento | Vendedor/Operador 403; documento de outra empresa recusado e invisível (404) |
| S9 — documento visual | marca d'água e avisos presentes; nenhuma frase de "autorizado pela SEFAZ" |
| **S10 — entrada** | NF-e de ENTRADA a partir do recebimento de compra: **fornecedor como remetente**, sem cliente, CFOP 1102, autorizada na simulação; o documento visual mostra o fornecedor |
| Descontos | **não exercitado** com desconto ≠ 0 nos roteiros fiscais. No código o desconto do item é levado ao documento e a simulação recusa total divergente (SIM-104). Fica para a homologação real (R2.20) |

Roteiro fiscal: **34/34** (duas empresas) ⟦P2F⟧. Antes: execução perdida (2/11); nesta reexecução, a prova "antes" é a dos testes de banco sem 0082/0083 (R2.16).

## R2.8 Concorrência (cenários A–G da rodada 1 — sem reduzir execuções)

Mesma suíte da rodada 1, Vértice + Sertão, **3 rodadas completas** (critérios atualizados em R2.17):

| Rodada | Resultado |
|---|---|
| r2a · r2b · r2c (build com 0081–0088) | **34/34 · 34/34 · 34/34** |
| Rodada 1 (mesma suíte) | 26/34 · 26/34 · 27/34 |

Registro de cada corrida (empresa, usuários, operação, vencedor, resposta do perdedor, estado final) nos `r5-concorrencia-r2*.out.json` (roteiros). Exemplos:

| Corrida | Usuários | Vencedor | Perdedor recebeu | Estado final no banco |
|---|---|---|---|---|
| E4 — gerar título | Financeiro × Gerente | 201 | 200 "Este pedido já tem a conta a receber CR-…. Nenhum título novo foi criado." | 1 título ativo |
| G1 — separação | Logística × Logística 2 (Sertão) | 201 | 422 "…já tem a separação SEP-… em aberto…" | 1 separação |
| C — reserva 8 + 7 (saldo 10) | Gerente × Logística | ambos 200 | — (parcial do que sobrou) | reservado 10 = reservas 10 |
| C4 — 3 cliques em Reservar | Logística ×3 | 1 × 200 | 2 × 409 "…(situação atual: Reservado)." | reservado 6 |
| E1 — baixar a mesma parcela | Financeiro × Gerente | 201 | 422 com a situação da parcela por extenso | 1 recebimento, lançamento único |
| F2 — autorizar a mesma NF-e (manual, chave válida) | Fiscal ×2 | 200 | 409 "O documento DF-… já está autorizado…" | 1 autorização |
| G3 — entregar 2× | Logística × Logística | 201 | 409 "…(situação atual: Entregue)" | 1 evento de entrega |
| S3 — autorizar NF-e (simulação) | Fiscal × Gerente × Administrador | 1 | 2 × 409 "…já foi autorizado (simulação)…" | 1 tentativa, 1 evento |

## R2.9 RBAC (48 usuários × 25 operações de API + 12 telas por URL direta)

Mesmo roteiro da rodada 1 (`r4-rbac`): **48 usuários** × 25 operações de API + 13 rotas de tela por URL direta. Regra: **permitido ⇔ o papel tem a permissão no banco**. Rodado **duas vezes**: com a build das correções 0081–0088 (execução A) e com a build final, depois do R2-22 (execução final).

| | Rodada 1 | Rodada 2 — execução A | Rodada 2 — execução final |
|---|---|---|---|
| Verificações (API + telas) | 1.200 + 624 | **1.200 + 624** | ⟦RBAC-F-TOT⟧ |
| Conforme a configuração | 1.175 + 25 falsos positivos | **1.824 / 0 FAIL** | ⟦RBAC-F-PASS⟧ |
| Divergência real API × configuração | 0 | **0** | ⟦RBAC-F-DIV0⟧ |
| `GET /api/admin/users` sem `users.read` (R48-26) | 200 com o próprio registro (25) | **403 × 25** ✅ | ⟦RBAC-F-USERS⟧ |
| `GET /api/admin/audit` sem `audit_logs.read` (R2-22) | 200 com lista vazia (aceito pelo roteiro) | 200 com lista vazia × 25 → **registrado como R2-22** | ⟦RBAC-F-AUDIT⟧ |
| Telas por URL direta | 624 conforme | **624 conforme** (371 abrem, 253 "acesso restrito") | ⟦RBAC-F-UI⟧ |
| Divergências de **regra de negócio** (Operador) | 18 (rodada 1 contou 6 empresas) | **21** = 3 operações × 7 Operadores (a Ferrix tem 2) | ⟦RBAC-F-BIZ⟧ |

Respostas HTTP da execução A, por "configurado?":
- **sim:** 200 × 448 · 201 × 106 · 422 × 80 · 409 × 25 · 404 × 21. São todas recusas **de regra**, não de permissão: dado inválido ou situação errada, nunca 403.
- **não:** 403 × 495 · 200 vazio × 25 (os 25 do R2-22).

O critério do roteiro **não foi alterado**: ele continua aceitando "lista vazia" como negação, para comparar com a rodada 1. A diferença foi lida na tabela da matriz e registrada como problema do sistema (R2-22), e não escondida pelo critério.

**Operador (R48-04)** — **não alterado** (decisão de negócio). Na API, o Operador pode, nas 7 empresas:
- criar conta a pagar;
- baixar parcela a receber;
- criar NCM.

Evidências: `03-rbac/` (matriz por empresa, telas e menus por papel) e `roteiros/r4-rbac-a.out.json` / `r4-rbac-final.out.json`.

## R2.10 Isolamento multiempresa

Mesma matriz da rodada 1 (`r3-isolamento`): cada empresa tenta ler, alterar, excluir, filtrar, buscar, exportar e abrir por URL direta os dados das outras 6 (42 pares), além de associar cadastros cruzados.

| | Rodada 1 | Rodada 2 |
|---|---|---|
| Verificações | 3.395 | **3.395** |
| PASS / FAIL | 3.395 / 0 | **3.395 / 0** |
| **Vazamentos** | 0 | **0** |
| Respostas HTTP | 403 × 1.104 · 404 × 954 · 422 × 390 · 405 × 42 · 200 × 660 | **as mesmas**: 403 × 1.104 · 404 × 954 · 422 × 390 · 405 × 42 · 200 × 660. Os 200 são listas só com dados da própria empresa, conferidas no banco |
| Tabelas sem RLS | 0 | **0** |
| Banco da empresa-alvo antes × depois | intacto | **intacto nas 7** |

Também nesta rodada:
- documento fiscal de outra empresa: invisível e recusado na simulação (S8: 404);
- título e NF-e de pedido de outra empresa: recusados **antes** de revelar se existem;
- integridade no banco: 0 registros apontando para cadastro de outra empresa e 0 auditorias gravadas na empresa X por usuário da empresa Y (R2.12).

**Nenhum vazamento.**

## R2.11 Auditoria

| Verificação | Resultado |
|---|---|
| Autor "system", "Sistema" ou service_role nas 7 empresas | **0** ✅ |
| Registro gravado na empresa X por usuário da empresa Y | **0** ✅ |
| `entity_id` de outra empresa | **0** ✅ |
| Rótulo do autor diferente do nome do usuário | **0** ✅ |
| Datas no futuro ou antes da criação da empresa | **0** ✅ |
| Registros sem `user_id` | **7**, um por empresa: o convite do 1º administrador, criado pelo **Owner da plataforma**, que não é usuário da empresa. O autor está no rótulo, e a tela agora mostra "Owner da plataforma (owner@…)" (R48-23). É o mesmo item da rodada 1, mantido como FAIL do roteiro, porque o dado continua sem `user_id` |
| Cobertura das ações críticas da rodada (títulos, NF-e autorizadas/canceladas, expedições) | 0 sem auditoria (R2.12) ✅ |
| **Filtros da trilha** (`p4`, Vértice/Sertão/Cobalto): sem filtro, entidade (3 mais frequentes), ação (CREATE/UPDATE/APPROVE/CANCEL), autor, entidade + ação, histórico de 1 registro, `entityId` de outra empresa, paginação (sem repetição, mais recente primeiro), `entityId` malformado, ação inexistente, nenhuma linha de outra empresa | ⟦P4F⟧. Cada total foi conferido com `count(*)` no banco |
| **Cobertura da criação (R2-18)** | antes: **0** linhas de criação para os **140** pedidos de venda e os **7** pedidos de compra do banco (`r218-antes.txt`). Depois da 0086: ⟦R218F2⟧ |
| Trilha sem permissão (R2-22) | antes: 200 com lista vazia; depois: 403 "(Auditoria — Ler)" ⟦R222b⟧ |

Totais: rodada 1, 8/9; rodada 2, **8/9** (o mesmo item, os convites do Owner), mais os filtros, o R2-18 e o R2-22.

## R2.12 Dados e integridade (direto no banco)

⟦INTEGRIDADE⟧

## R2.13 Validação e erros

⟦ERROS⟧

## R2.14 Desempenho (48 usuários simultâneos)

⟦DESEMPENHO⟧

## R2.15 Usabilidade (390 · 393 · 430 · 768 · 1440 px)

⟦USABILIDADE⟧

## R2.16 Problemas — ficha completa

⟦FICHAS⟧

## R2.17 Falsos positivos do harness (não contados como bug)

Cada item abaixo foi **identificado na execução perdida** (salvo indicação) e o roteiro corrigido; a reexecução já usou o roteiro corrigido. A versão antiga de cada roteiro está nos roteiros da rodada 1 (`evidencias/teste-48-usuarios/roteiros/`), que não foram alterados.

| Onde | O que parecia | Por que era do roteiro | O que foi feito |
|---|---|---|---|
| R11b (reprodução) | "liberar reserva de pedido expedido" → 404 | o roteiro chamou `/release`; a rota real é `/release-reservation` | rota corrigida; o sistema recusa com 422 "Este pedido não tem reserva ativa para liberar (situação atual: Expedido)." |
| Testes de banco | 17 testes "cancelados" | conexão com `neondb_owner`, que não é dono das tabelas e cai na RLS ao montar os dados | rodados com o dono do banco local (como na rodada 1) |
| Concorrência A (edição simultânea) | "as duas gravações deveriam prevalecer" | critério da rodada 1, anterior ao bloqueio otimista (R48-02, corrigido na rodada 1) | critério = as duas gravam (campos diferentes) **ou** uma grava e a outra recebe 409; gravação com versão velha tem de receber 409. Nada pode se perder em silêncio |
| Concorrência F2 | "autorização simultânea: ≤ 1" passava com **0** | as chaves do roteiro eram inventadas; a 0083 as recusa e o passo deixara de testar a corrida | chave válida (a mesma regra da simulação); critério **mais rígido**: exatamente 1 autoriza |
| Concorrência F1 / E4 | "≤ 1 documento / título" | não verificava a resposta | F1: exatamente uma resposta 201; E4: contagem de títulos ativos no banco |
| Integridade | 3 FAIL, incl. auditorias "sem autor" | o corte "antes × depois" usava data errada e comparava datas como texto | corte = instante em que as migrations foram aplicadas (`cut-0081.txt`); violações antigas continuam **contadas** como histórico, e as regras que não admitem histórico (duplicidades, vazamento) exigem **zero total** |
| Sonda B18 | "Escolha uma opção válida para o produto" | o roteiro repetiu o código do produto (409) e o pedido ficou sem produto | código único; resultado real: unidade "CX" |
| Erros — busca `' or 1=1 --` (3 empresas) | 200 "sem mensagem" = FAIL | lista vazia é a resposta certa; o classificador ignorava a opção `instr:false` da própria sonda | classificador corrigido |
| Erros — "Vendedor tenta aprovar" (Prisma) e "Somente leitura cria cliente" (Lince) | 409/422 em vez de 403 | a empresa não tem esse papel; o roteiro **trocava pelo Gerente** (que pode) | sem troca: "N/A — a empresa não tem o papel" |
| Erros — "saída avulsa maior que o saldo" (Mares, Lince) | 403 em vez de 409/422 | o Operador dessas empresas não tem "Estoque — Ajustar": testava a permissão, não o saldo | saldo testado com o Gerente **e** a permissão do Operador testada à parte (403 por extenso) |
| Erros — "reservar sem estoque" (3 empresas) | 200 "sem mensagem" | o produto "zerado" tinha recebido estoque no dia simulado da rodada 1 e o critério procurava texto no JSON | pré-condição conferida (disponível no local = 0) e critério pela reserva **deste** pedido + situação "Reserva pendente" |
| Usabilidade — detector de inglês | "Total" e "Item" como palavras em inglês | as duas são português | removidas da lista; as demais palavras continuam |
| Auditoria R2-18 (Cobalto) | "0 pedidos com CREATE" | a Cobalto não criou pedido depois da 0086 | "N/A — sem dados" (a regra só se aplica a pedidos criados depois da migration) |
| R48-15 (teste de banco) | o teste passa **também** sem a 0081 | o caminho sequencial já era correto; a corrida só aparece com duas conexões | teste renomeado para "(sequencial; a corrida real é comprovada no E2E)"; a prova FAIL → PASS da corrida é o p1 C (8/8 → 0/8 falhas) |

**O que NÃO foi tratado como falso positivo:**
- **"Soma das parcelas" com 409** era do sistema (R2-17).
- **S7 201/201** era do sistema (R2-19).
- **R48-26** era do sistema: o 200 com o próprio registro foi trocado por 403.
- **Seed:** `supabase/seed.sql` **não roda** no esquema atual: os locais de estoque exigem `warehouse_id` e o seed não informa. É um problema pré-existente, R2-21 🔵, registrado e não corrigido nesta rodada. Os testes de banco usam fixtures mínimas próprias.

## R2.18 Migrations aplicadas no ambiente LOCAL

| Migration | Para quê | Conferência prévia | Ajuste de dados |
|---|---|---|---|
| `0081_integridade_pedido_recebivel_logistica.sql` | recebível único e idempotente; separação única aberta; expedição sem excesso e no local reservado; reserva consumida; corrida de reserva; cancelamento depois da separação; mensagens com produto e sem 4 casas | **para** se houver título ativo duplicado ou separação aberta duplicada | reservas de pedidos já expedidos/concluídos → `consumed` (30 no banco local) |
| `0082_fiscal_simulado.sql` | provedor SIMULACAO, validação SIM-1xx, chave/protocolo simulados, cancelamento simulado | — | — |
| `0083_fiscal_numeracao_e_autorizacao.sql` | Fiscal numera; numerar depois da conferência; não renumerar; número de saída único; autorização manual exige número e chave válida; checklist conta a série | **para** se houver número de saída repetido | — |
| `0084_entrega_sem_duplicidade.sql` | trava na confirmação/falha de entrega | — | — (eventos duplicados antigos ficariam como histórico) |
| `0085_unidade_do_item_herda_do_produto.sql` | item do pedido/orçamento herda a unidade do produto | — | itens antigos sem unidade completados pela unidade do produto |
| `0086_auditoria_criacao_documentos.sql` | CREATE na trilha para pedido de venda, orçamento, solicitação e pedido de compra; SUBMIT no envio para aprovação; ação SUBMIT na lista permitida | — | — (trilha antiga não reescrita) |
| `0087_nfe_do_pedido_idempotente.sql` | gerar NF-e do pedido diz se criou ou já existia (trava no pedido) | — | — |
| `0088_eventos_fiscais_em_ordem.sql` | horário real (`clock_timestamp()`) nos eventos fiscais | — | — |

**Nenhuma foi aplicada em produção nem na homologação real.** Antes de aplicar lá: rodar as consultas de conferência (títulos ativos duplicados por pedido, separações abertas duplicadas, números de saída repetidos) e decidir o tratamento de cada caso **antes**. A 0086 recria a lista de ações permitidas da auditoria (inclui SUBMIT): aplicar junto com a versão da aplicação que traz o rótulo "Envio para aprovação".

## R2.19 Decisões que são suas (não decidi sozinho)

| ID | Questão | Situação atual (mantida) | O que eu recomendaria (só recomendação) |
|---|---|---|---|
| R48-04 | O papel de sistema **Operador** pode criar conta a pagar, baixar parcela a receber e criar NCM | permitido pela configuração. **Não alterado**, como pedido | rever com o dono do processo financeiro; se a resposta for "não", é uma migration de permissões do papel de sistema |
| R48-27 / B11 | Pedido entregue deve virar "Concluído"? | continua "Expedido" (nenhuma função grava "Concluído") | definir quando o pedido conclui (entrega confirmada? faturado + entregue?) |
| D1 | pendente desde a rodada das 7 empresas | não reavaliado nesta rodada | — |
| R2-09 | Tela de séries de numeração e número inicial da série | o checklist da 1ª NF-e agora cita a série; a série é criada pela rota de configuração (o roteiro usou a rota oficial) | tela própria, com número inicial — importante em migração de outro sistema |
| R2-12 | Regras tributárias padrão e sua exigência no checklist | sem regras: a NF-e simulada sai **sem imposto** | definir as regras com o contador; incluir "regras tributárias" no checklist (ou ao menos um alerta) |
| R2-14 | A autorização **manual** (informar chave e protocolo) deve existir fora da homologação? | existe, agora exigindo número e chave válida (R2-07) | restringir a um papel/situação de contingência ou remover quando houver provedor real |
| R2-15 | Pode gerar outro título para o mesmo pedido depois de cancelar o primeiro? | não gera automaticamente; responde 409 explicando (lançar avulso) | decidir se "regerar após cancelar" é permitido e por quem |
| R2-16 | Cancelar pedido com separação/expedição aberta: recusar ou cancelar em cascata? | recusa nomeando a tarefa aberta ("cancele a separação SEP-… antes") | manter a recusa (mais segura) ou cascata com confirmação |

## R2.20 O que ainda precisa ser testado na homologação real

1. **Antes de aplicar 0081–0088 na homologação real:** rodar as consultas de conferência (R2.4 e R2.18) no banco de homologação e tratar as duplicatas existentes **pela aplicação** (cancelamento com autor), não por SQL direto. A 0081 para sozinha se encontrar duplicata.
2. **Banco Neon real com latência de rede:** as travas novas (`FOR UPDATE`) serializam operações no **mesmo** pedido/saldo; aqui a rede é local. Repetir a concorrência A–G e o "dia simultâneo" contra o Neon de homologação e comparar p95.
3. **Neon Auth real** (aqui foi o dublê): convite, primeiro acesso, troca de senha e expiração de sessão com os 48 usuários.
4. **E-mail real** (aqui, caixa local): entrega dos convites e links.
5. **Vercel (homologação):** funções serverless frias, *timeouts* e o tempo de `/api/admin/roles` com o número real de empresas.
6. **Fiscal:** NF-e **com desconto ≠ 0**, frete e outras despesas; NF-e com regras tributárias reais (depois de R2-12); devolução/entrada com fornecedor de outro estado; cancelamento fora do prazo de 24 h (aqui só pela regra no banco).
7. **Celular real** (iOS/Android) além das larguras do navegador: teclado numérico, alvos de toque (R48-30) e rolagem das tabelas.
8. **Navegadores:** aqui só Chromium.
9. **Volume:** listas com milhares de registros (paginação, exportação CSV) — a massa local tem centenas.
10. **Decisões da R2.19**, depois de tomadas.
