# Aula 08 — Logística

| | |
|---|---|
| **Público** | Logística (operador logístico), Operador e Gerente |
| **Personagens** | **Bruno** — **Logística** (papel **personalizado**) · **Carlos** — Gerente (aprova a expedição) |
| **Viabilidade** | 🔎 **consulta**: picking, packing, expedição e transportes 🔎 · reservar ✅ (no pedido) · criar separação, separar, concluir, criar expedição, volumes, embalar, aprovar, expedir e entregar ⛔ |
| **Duração estimada** | 9–11 min |
| **Status** | **decisão pendente** (README, decisão 1) |

**O aluno sai sabendo:**

- o caminho físico do pedido: reserva → separação → embalagem → aprovação → expedição → entrega;
- o papel do operador logístico e o que o gerente aprova;
- os estados de cada documento;
- como conferir que a mercadoria saiu e foi entregue.

## Cenário

**Sexta-feira, 8h.** O pedido **PV-0001** da Granito está reservado no Picking e precisa sair hoje para Santos.

1. Bruno separa (SEP-0001) e embala.
2. Carlos aprova a expedição.
3. Bruno expede (EXP-0001); o motorista entrega com assinatura do recebedor.

Todas essas etapas são ⛔ via integração.

## Fluxo

PEDIDO (Reservado) → **SEPARAÇÃO** (Pendente → Separando → Concluída) → **EXPEDIÇÃO** (Liberada → Embalada → Expedida → Em trânsito → Entregue) → pedido **Expedido**

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "A logística transforma um pedido aprovado em mercadoria entregue, com cada etapa registrada." | — |
| 02 | Cenário | Bruno, papel Logística (personalizado), 8h. Menus que ele vê. | — |
| 03 | Navegação | **Picking** (abas Na fila e Separando; lista, início, conclusão) · **Packing** · **Expedição** (abas Expedição atrasada e Prontas para expedir; cliente, cidade, data prevista) · **Transportes** · Cadastros de transporte (Transportadoras, Motoristas, Veículos ✅). | 🔎 |
| 04 | Operação principal | Etapas com selo ⛔ e o resultado real em cada tela: SEP-0001 **Separando → Concluída**; EXP-0001 **Embalada → Expedida → Entregue**. Narração: o que o operador faz fisicamente em cada etapa e o que o sistema registra (volumes, peso, rastreio, recebedor). | 🔎 / ⛔ |
| 05 | O que acontece no ERP | Na expedição, saída de estoque `SHIPMENT` (o "em estoque" cai). No pedido: KPI **Expedido 100%** e Andamento. A auditoria registra Separação, Embalagem, Expedição e Entrega. | 🔎 + motion |
| 06 | Caso realista | **Entrega falhou** (destinatário ausente): eventos de entrega (Falha na entrega, Destinatário ausente) → nova tentativa (⛔). | ⛔ → 🔎 |
| 07 | Erros e exceções | Ver tabela. | |
| 08 | Conferência | Pedido com Reserva 100% e Expedição 100%; EXP **Entregue**; Movimentações com `SHIPMENT`; auditoria. | 🔎 |
| 09 | Relação | COMERCIAL → ESTOQUE → **LOGÍSTICA** → FINANCEIRO (cobrança) e FISCAL (documento acompanha a mercadoria). | motion |

## Erros e exceções (reais)

| Erro | Por que | Como resolver |
|---|---|---|
| ⚠️ **B11**: pedido entregue continua **"Expedido"** (nunca "Concluído") | Nenhuma rotina grava a conclusão | Conferir na **Expedição** (Entregue); débito registrado |
| Separar pedido sem reserva | A separação parte da reserva | Reservar antes (aula 05) |
| Bruno abre Contas a receber ou NF-e: *"Sem acesso a este recurso"* | Fora do papel | Correto |
| Bruno tenta **lançar** recebimento | O papel Logística só **confirma** | O Operador (Rafael) lança |
| ⚠️ **B6** no Início do Bruno | Papel personalizado | Ver aula 06 |

## Telas usadas

| Tela | Rota | Legenda |
|---|---|---|
| Picking | `/app/logistica/picking` | 🔎 |
| Packing | `/app/logistica/packing` | 🔎 |
| Expedição | `/app/logistica/expedicao` | 🔎 |
| Transportes | `/app/logistica/transportes` | 🔎 |
| Pedido (andamento) | `/app/comercial/pedidos-venda/:id` | 🔎 |
| Transportadoras · Motoristas · Veículos | `/app/cadastros/…` | ✅ |

## Preparação de cena (⛔)

- Separação e conclusão (Bruno).
- Expedição com volume e rastreio (Bruno).
- Aprovação da expedição (Carlos).
- Expedir e entregar (Bruno).
- Uma entrega com falha, para o caso realista.
