# Aula 04 — Compras

| | |
|---|---|
| **Público** | Operador (compras e recebimento) e Gerente (aprovação) |
| **Personagens** | **Rafael** — Operador · **Carlos** — Gerente · **Bruno** — Logística (confere o recebimento) |
| **Viabilidade** | 🔎 **consulta**: solicitação, cotação, pedido de compra, aprovação, recebimento e conta a pagar são ⛔ |
| **Duração estimada** | 7–9 min ("aula de acompanhamento") · 14–16 min quando houver telas de ação |
| **Status** | **decisão pendente** (README, decisão 1) |

**O aluno sai sabendo:**

- o ciclo de compra do ATLAS.ERP e o significado de cada status;
- quem faz cada etapa;
- onde acompanhar;
- **por que o recebimento é o único caminho que dá entrada no estoque vindo de compra**;
- como conferir a entrada e a conta a pagar.

## Cenário

**Terça-feira, 8h40.** No **Saldo de estoque**, Rafael vê que o **Balde plástico 8 L** está abaixo do mínimo depois da venda da aula 03.

| Etapa | Quem | Legenda |
|---|---|---|
| Solicitação **SC-0001** | Rafael | ⛔ |
| Pedido de compra **PC-0001** ao fornecedor Polar | — | ⛔ |
| Aprovação do PC-0001 | Carlos | ⛔ |
| Mercadoria chega na quinta: recebimento **REC-0001** na Doca | Rafael | ⛔ |
| Conferência | Bruno | ⛔ |
| Conta a pagar | Fernanda | ⛔ |

## Fluxo

NECESSIDADE → FORNECEDOR → **SOLICITAÇÃO** → (COTAÇÃO) → **PEDIDO DE COMPRA** → APROVAÇÃO → ENVIO → **RECEBIMENTO** → **ESTOQUE** (+ CONTA A PAGAR)

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "Compras garante que o que falta chegue, com controle de quem pediu, quem aprovou e o que de fato entrou." | — |
| 02 | Cenário | Rafael vê o saldo baixo (estoque mínimo do produto). | `/logistica/estoque` 🔎 |
| 03 | Navegação | Suprimentos: Solicitações (abas, prioridade, setor), Cotações, Pedidos de compra (abas Entrega atrasada / Aguardando aprovação), Agendamentos; Logística → **Recebimento** (aba Em conferência). Gaveta de detalhe (ex.: PC aguardando aprovação). | 🔎 |
| 04 | Operação principal | **Aula de acompanhamento.** Cada etapa ⛔ aparece com selo e corte para o resultado real: SC-0001 **Solicitada → Aprovada → Pedida**; PC-0001 **Aguardando aprovação → Aprovado → Enviado → Recebido**; REC-0001 **Rascunho → Confirmado**. Narração explica o que a pessoa faz em cada etapa e por quê. | 🔎 / ⛔ |
| 05 | O que acontece no ERP | Recebimento confirmado → **Movimentações**: entradas `PURCHASE_RECEIPT` na Doca de recebimento → **Saldo** sobe → **Contas a pagar**: "Recebimento REC-0001". Animação do fluxo. | 🔎 |
| 06 | Caso realista | Recebimento **parcial**: o fornecedor entregou 30 de 50 → PC **Recebido parcial**. | ⛔ → 🔎 |
| 07 | Erros e exceções | Ver tabela. | |
| 08 | Conferência | PC com status **Recebido**, REC **Confirmado**, movimentação com origem `PURCHASE_RECEIPT`, saldo na Doca, CP em aberto, auditoria. | 🔎 |
| 09 | Relação | COMPRAS → ESTOQUE (05) → FINANCEIRO (06: contas a pagar) → FISCAL (NF de entrada ⛔). | motion |

## Erros e exceções

Confirmar ao vivo na preparação.

| Erro | Por que | Como resolver |
|---|---|---|
| Recebimento lançado por quem não tem `purchase_receipts.create` (ex.: Bruno) | O papel Logística só **confirma** | O Operador lança; Bruno confere |
| *"A quantidade deve ser maior que zero."* no recebimento | Item sem quantidade | Informar a quantidade recebida |
| PC aguardando aprovação há dias | Falta aprovação do Gerente | Aba "Aguardando aprovação"; cobrar o aprovador |
| ⚠️ **B9**: Operador consegue criar conta a pagar | Modelo do papel amplo demais | Segregação: ajustar o papel (aula 10) |

## Telas usadas

| Tela | Rota | Legenda |
|---|---|---|
| Solicitações de compra | `/app/suprimentos/solicitacao-compra` | 🔎 |
| Cotações | `/app/suprimentos/cotacoes` | 🔎 |
| Pedidos de compra | `/app/suprimentos/pedidos-compra` | 🔎 |
| Agendamentos | `/app/suprimentos/agendamentos` | 🔎 |
| Recebimento | `/app/logistica/recebimento` | 🔎 |
| Movimentações | `/app/logistica/movimentacoes` | 🔎 |
| Saldo de estoque | `/app/logistica/estoque` | 🔎 |
| Contas a pagar | `/app/financeiro/contas-pagar` | 🔎 |

## Versão futura ("operação")

Quando existirem telas de criar, aprovar e receber, a parte 04 vira o preenchimento completo:

- **solicitação:** itens, quantidade, prioridade, setor;
- **pedido de compra:** fornecedor, itens, preço, entrega prevista;
- **recebimento:** documento, série, valor, quantidade recebida e local de destino.

A estrutura da aula não muda.
