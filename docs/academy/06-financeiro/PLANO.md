# Aula 06 — Financeiro

| | |
|---|---|
| **Público** | Financeiro (e Gerente e Administrador, que têm as mesmas permissões financeiras) |
| **Personagem** | **Fernanda** — **Financeiro** (papel **personalizado**, criado pela Ana na aula 10) |
| **Viabilidade** | 🟡 mista: **gerar conta a receber do pedido ✅** · contas a receber, a pagar e fluxo de caixa 🔎 · baixa (recebimento), pagamento, lançamento avulso e cancelamento ⛔ |
| **Duração estimada** | 10–12 min |

**O aluno sai sabendo:**

- como a venda vira **conta a receber**;
- como o recebimento de compra vira **conta a pagar**;
- ler status e vencimentos;
- o que o fluxo de caixa mostra;
- quem pode fazer o quê no financeiro;
- como conferir que um título foi gerado e baixado.

## Cenário

**Quinta-feira, 11h.** O pedido **PV-0001** da Granito (aula 03) foi aprovado e reservado. Fernanda precisa:

- gerar o título a receber;
- acompanhar o recebimento via PIX (⛔);
- conferir a conta a pagar da compra da aula 04.

## Fluxo

PEDIDO APROVADO → **CONTA A RECEBER** (CR) → RECEBIMENTO (baixa) · RECEBIMENTO DE COMPRA → **CONTA A PAGAR** (CP) → PAGAMENTO

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "O financeiro registra o que a empresa tem a receber e a pagar, e quando o dinheiro de fato entra e sai." | — |
| 02 | Cenário | Fernanda, papel Financeiro (personalizado: o que isso significa), 11h. ⚠️ **B6**: a tela Início dela mostra dois cartões de erro. Explicar e seguir para o Financeiro. | `/app` |
| 03 | Navegação | Painel Financeiro (pendências, títulos a receber recentes) · **Contas a receber** (abas Vencidos e Em aberto; vencimento em vermelho) · **Contas a pagar** · **Fluxo de caixa** (saldo acumulado, projeção por semana) · Centros de custo. | 🔎 |
| 04 | Operação principal | Abrir PV-0001 → **Gerar conta a receber** → *"Gera o título a receber a partir do valor do pedido e das condições de pagamento."* → *"Conta a receber gerada."* → painel **Financeiro** do pedido mostra **CR-0001 · Em aberto · valor · vencimento** → **Contas a receber** com o título. **Recebimento**: selo ⛔ "baixa por integração nesta versão" → CR-0001 **Recebido** (resultado real). | ✅ / ⛔ |
| 05 | O que acontece no ERP | CR ligado ao pedido (origem) → fluxo de caixa (a receber em aberto → saldo) → painel Início ("Precisa de atenção": contas vencidas). CP gerado do recebimento **REC-0001** (aula 04). | 🔎 + motion |
| 06 | Caso realista | Um cliente atrasou: o título fica **Vencido** e entra em "Precisa de atenção". Recebimento **parcial** → **Recebido parcial**. | 🔎 / ⛔ |
| 07 | Erros e exceções | Ver tabela. | |
| 08 | Conferência | Status do título, vínculo com o pedido (painel Financeiro do pedido), fluxo de caixa, auditoria (a geração aparece como **Aprovação** de "Conta a receber"). | 🔎 |
| 09 | Relação | COMERCIAL → FINANCEIRO ← COMPRAS · FINANCEIRO → CONTROLADORIA e PAINÉIS. | motion |

## Permissões (mostrar no quadro)

| Quem | Gera CR | Vê CR/CP | Cria CP | Baixa / paga (API) |
|---|---|---|---|---|
| Fernanda (Financeiro) | ✅ | ✅ | ✅ | ✅ |
| Carlos (Gerente) / Ana (Admin) | ✅ | ✅ | ✅ | ✅ |
| Rafael (Operador) | — | ✅ | ✅ ⚠️ B9 | só cria pagamento |
| Juliana (Vendedor) | — | **Sem acesso** | — | — |

## Erros e exceções (reais)

| Erro | Por que | Como resolver |
|---|---|---|
| Juliana abre Contas a pagar: *"Sem acesso a este recurso"* | Fora do papel | Correto: segregação |
| Botão **Gerar conta a receber** ausente | Papel sem `accounts_receivable.approve`, ou pedido em status não elegível (Rascunho / Aguardando aprovação) | Aprovar o pedido antes; usar o papel Financeiro |
| ⚠️ **B6**: cartões "Não foi possível carregar o relatório executivo" no Início | O papel personalizado não tem o relatório executivo | Ignorar e ir ao módulo; débito registrado |
| ⚠️ **B4**: título gerado à noite com a data do dia seguinte | Datas em UTC | Atenção no fechamento |
| ⚠️ **B3**: número do título "pula" | Numeração global | Débito registrado (some no ambiente Academy limpo) |

## Telas usadas

| Tela | Rota | Legenda |
|---|---|---|
| Pedido (gerar CR) | `/app/comercial/pedidos-venda/:id` | ✅ |
| Financeiro (painel) | `/app/financeiro` | 🔎 |
| Contas a receber | `/app/financeiro/contas-receber` | 🔎 |
| Contas a pagar | `/app/financeiro/contas-pagar` | 🔎 |
| Fluxo de caixa | `/app/financeiro/fluxo-caixa` | 🔎 |
| Centros de custo | `/app/financeiro/centro-custos` | 🔎 |

## Preparação de cena (⛔)

- Baixa do CR-0001 (Fernanda, PIX).
- CP do REC-0001 (Fernanda).
- Um título vencido para o caso realista: data no passado, via integração.
