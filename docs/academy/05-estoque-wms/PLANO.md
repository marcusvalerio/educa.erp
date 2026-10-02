# Aula 05 — Estoque / WMS

| | |
|---|---|
| **Público** | Operador, Logística e Gerente |
| **Personagens** | **Rafael** — Operador · **Bruno** — Logística · **Carlos** — Gerente (ajuste e aprovação) |
| **Viabilidade** | 🟡 **conceito + consulta**: reservar e liberar reserva ✅ (no pedido) · locais de estoque ✅ (cadastro) · entrada, saída, ajuste, transferência, contagem, separação e expedição ⛔ |
| **Duração estimada** | 15–18 min (uma das aulas mais completas, com peso em **conceito**) |

**O aluno sai sabendo:**

- a diferença entre **em estoque**, **reservado** e **disponível**;
- por que o estoque é um **livro de movimentações** (ledger imutável) e não um número digitado;
- como o **local** organiza o armazém (doca, picking, expedição, almoxarifado);
- o que a **reserva** faz com o saldo;
- como a mercadoria anda do recebimento à expedição;
- como conferir tudo.

## Cenário

**Quinta-feira, 7h30.**

1. Chegaram **50 Baldes plásticos 8 L** na **Doca de recebimento** (recebimento REC-0001 da aula 04, ⛔).
2. Rafael confere a entrada no **Saldo** e nas **Movimentações**.
3. **10h:** chega o pedido **PV-0002** de **5 unidades**, já aprovado por Carlos.
4. Rafael **reserva** no Picking (✅).
5. O saldo **disponível** cai, o **em estoque** não. O aluno entende o porquê.
6. Bruno separa e expede (⛔; aprofundado na aula 08).

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "Estoque não é um número que alguém digita: é a soma de tudo o que entrou e saiu, em cada local." | — |
| 02 | Cenário | Rafael, Operador, 7h30, caminhão na doca. | — |
| 03 | Navegação | **Locais de estoque** (tipos e capacidade) · **Saldo de estoque** (Produto, Local, Em estoque, Reservado, Disponível; abas Sem disponibilidade e Com reserva) · **Movimentações** ("Ledger de estoque — imutável, nunca editado por esta tela": data, tipo, produto, local, quantidade, **origem**) · Transferências, Inventário, Endereçamento, Almoxarifado, Picking, Packing, Expedição, Devoluções (para que serve cada uma). | 🔎 |
| 04 | Operação principal | (1) **Conceito animado**: em estoque − reservado = disponível, com o balde no armazém. (2) **Entrada de 50**: selo ⛔ "recebimento por integração" → Movimentações mostra **Entrada · Doca de recebimento · 50 · PURCHASE_RECEIPT** → Saldo sobe. (3) **Pedido de 5**: abrir PV-0002 → **Reservar estoque** → escolher **Picking — rua A, módulo 01** → *"Reserva as quantidades pendentes do pedido no local escolhido. Itens sem saldo ficam com reserva pendente."* → **Reservar** → KPI **Reservado 100%**. (4) Saldo: **Reservado +5, Disponível −5, Em estoque igual**. Movimentações: `RESERVATION · stock_reservation`. | 🔎 / ✅ / ⛔ |
| 05 | O que acontece no ERP | Reserva → separação (SEP) → expedição (EXP, saída `SHIPMENT`) → o **em estoque** cai na saída. Animação PEDIDO → RESERVA → ESTOQUE → SEPARAÇÃO → EXPEDIÇÃO, com o produto mudando de estado (mesma linguagem do institucional). | motion + 🔎 |
| 06 | Caso realista | (a) O cliente cancelou 1 pedido: **Liberar reserva** (*"As quantidades reservadas voltam a ficar disponíveis no estoque."*) → Disponível volta. (b) A contagem encontrou 49 em vez de 50: **ajuste por inventário** (⛔ contagem e ajuste; Gerente aprova) → movimentação de ajuste. | ✅ / ⛔ |
| 07 | Erros e exceções | Ver tabela. | |
| 08 | Conferência | Três lugares sempre: **Saldo** (por local), **Movimentações** (origem e documento) e **pedido** (KPI Reservado / Expedido e Andamento). | 🔎 |
| 09 | Relação | COMPRAS (entrada) → ESTOQUE → COMERCIAL (reserva) → LOGÍSTICA (saída) → FINANCEIRO e FISCAL. | motion |

## Erros e exceções (reais)

| Erro | Por que | Como resolver |
|---|---|---|
| ⚠️ **B5**: *"Estoque reservado."* sem saldo, com **Reservado 0%** | Bug: a mensagem não confere o resultado | **Conferir o KPI Reservado e a aba "Com reserva"**; pedido em **Reserva pendente** |
| *"Selecione o local de onde reservar."* | Local não escolhido | Escolher o local onde o produto **está** |
| Reservar no local errado (sem saldo ali) | O saldo é **por local** | Ver no Saldo onde o produto está |
| *"Saldo insuficiente: disponível 127.0000…, solicitado …"* (saída ou ajuste pela integração) | Saída maior que o disponível | Conferir as reservas; ⚠️ B15: casas decimais na mensagem |
| Vendedor tenta reservar: botão ausente | O papel não tem `sales_orders.reserve` | Operador, Logística ou Gerente reservam |
| Editar uma movimentação | **Não existe**, por desenho (ledger imutável) | Corrigir com ajuste ou estorno |

## Telas usadas

| Tela | Rota | Legenda |
|---|---|---|
| Locais de estoque | `/app/cadastros/locais-estoque` | ✅ |
| Saldo de estoque | `/app/logistica/estoque` | 🔎 |
| Movimentações | `/app/logistica/movimentacoes` | 🔎 |
| Transferências · Inventário · Endereçamento · Almoxarifado · Devoluções | `/app/logistica/…` | 🔎 |
| Pedido (reservar, liberar) | `/app/comercial/pedidos-venda/:id` | ✅ |
| Picking · Expedição | `/app/logistica/{picking,expedicao}` | 🔎 |

## Preparação de cena (⛔)

- Recebimento de 50 (Rafael).
- PV-0002 criado (Juliana) e aprovado (Carlos).
- Contagem de inventário e ajuste (Rafael conta; Carlos aprova).
