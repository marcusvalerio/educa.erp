# Aula 03 — Comercial

| | |
|---|---|
| **Público** | Vendedor e Gerente |
| **Personagens** | **Juliana** — Vendedor · **Carlos** — Gerente · (citados: **Rafael** reserva; **Fernanda** gera a conta a receber) |
| **Viabilidade** | 🟡 mista: consultar, enviar para aprovação, aprovar, reservar, liberar reserva, gerar conta a receber e cancelar ✅ · **criar orçamento e pedido ⛔ (B1)** · pipeline do CRM ✅ |
| **Duração estimada** | 14–16 min |

**O aluno sai sabendo:**

- acompanhar oportunidades, orçamentos e pedidos;
- ler os **status** do pedido;
- enviar para aprovação (Vendedor) e aprovar (Gerente);
- entender a **segregação de funções** (quem vende não aprova);
- saber o que acontece depois da aprovação;
- saber o que esta versão **ainda não faz pela tela**.

## Cenário — um dia da Juliana

| Hora | Situação | Legenda |
|---|---|---|
| 08:30 | Consulta o cliente **Granito Serviços** (cadastro e pedidos anteriores) | ✅ |
| 08:45 | No **Pipeline** do CRM, move a oportunidade "Reposição de baldes" para a etapa seguinte | ✅ |
| 09:00 | O orçamento **ORC-0001** (10 × Balde 8 L, 6 × Balde 12 L) foi registrado, enviado e aprovado pelo cliente | ⛔ via integração |
| 10:00 | O pedido **PV-0001** é gerado do orçamento aprovado e aparece em Rascunho | ⛔ via integração |
| 10:05 | Juliana confere itens e valores e **envia para aprovação** | ✅ |
| 10:15 | Carlos **aprova** | ✅ |
| 10:20 | O pedido segue para a reserva (Rafael, aula 05) e para o financeiro (Fernanda, aula 06) | ✅ (apresentado) |

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "O Comercial transforma o interesse do cliente em pedido aprovado. Aqui trabalham o vendedor, que registra e acompanha, e o gerente, que aprova." | — |
| 02 | Cenário | Juliana, Vendedor, 8h30. O que o papel dela permite (menus visíveis). | — |
| 03 | Navegação | **Orçamentos** (abas Todos, Validade vencida, Aguardando cliente; status; validade em vermelho quando vence). **Pedidos de venda** (abas por situação, busca por pedido ou cliente, filtros, colunas). **Detalhe do pedido**: cabeçalho, KPIs (Total, Itens, Reservado, Expedido), Informações, Andamento, Itens, Expedições, Financeiro, Histórico. **Faturamento** (documentos fiscais). **CRM**: Leads, Pipeline, Oportunidades, Atividades. | 🔎 + pipeline ✅ |
| 04 | Operação principal | (1) Pipeline: mover a oportunidade. (2) Selo ⛔ **"Nesta versão: orçamento e pedido são criados por integração"**; cortar para a lista com ORC-0001 **Aprovado** e PV-0001 **Rascunho** (resultado real). (3) Abrir PV-0001: conferir cliente, itens, quantidades, preços, total e observação "Pedido gerado do orçamento ORC-0001". (4) **Enviar para aprovação** → confirmação *"O pedido segue para aprovação e deixa de ser editável como rascunho."* → *"Pedido enviado para aprovação."* → status **Aguardando aprovação**. (5) Troca de usuário: Carlos abre o pedido → **Aprovar** → *"Aprovar libera o pedido para reserva de estoque."* → *"Pedido aprovado."* | ✅ / ⛔ |
| 05 | O que acontece no ERP | "Aprovado, o pedido deixa de ser só comercial." Animação: **Reserva** (estoque), **Conta a receber** (financeiro), **NF-e** (fiscal), **Separação e expedição** (logística). Botões que aparecem para cada papel: Reservar estoque, Gerar conta a receber. | motion + detalhe |
| 06 | Caso realista | "O cliente pediu para trocar 6 baldes de 12 L por 8 L." **Não há edição de pedido pela tela** (⛔). O caminho real: Carlos **cancela** o pedido (*"O cancelamento libera reservas e não pode ser desfeito."*), e um novo pedido é gerado (⛔). Segunda variação: um pedido reservado por engano → **Liberar reserva**. | ✅ / ⛔ |
| 07 | Erros e exceções | Ver tabela. | ✅ |
| 08 | Conferência | Status **Aprovado**, número PV-0001, Andamento (Reserva 0%), **Histórico** do pedido (exige permissão de auditoria), lista filtrada "Aguardando aprovação" vazia. | 🔎 |
| 09 | Relação | COMERCIAL → ESTOQUE (05) → FINANCEIRO (06) → FISCAL (07) → LOGÍSTICA (08). | motion |

## Erros e exceções (reais)

| Erro | Por que | Como resolver |
|---|---|---|
| Juliana não vê **Aprovar** | O Vendedor não tem `sales_orders.approve` (segregação) | O Gerente aprova |
| Juliana abre Contas a pagar: *"Sem acesso a este recurso"* | Fora do papel | Pedir ao administrador, se fizer sentido |
| ⚠️ **B5**: Reservar sem saldo mostra *"Estoque reservado."*, mas o KPI **Reservado** fica em 0% | Bug conhecido | **Conferir sempre o KPI Reservado e o Andamento**, não só a mensagem |
| *"Selecione o local de onde reservar."* | Reserva sem local | Escolher o local (Picking) |
| Pedido sem itens / quantidade zero (pela integração): *"O pedido precisa de ao menos um item…"* / *"A quantidade deve ser maior que zero."* | Validação do pedido | Corrigir na origem |
| ⚠️ **B4**: pedido feito à noite aparece com a data do dia seguinte | Datas em UTC | Atenção ao fechar o dia ou o mês (débito registrado) |
| ⚠️ **B18**: item com "Un. —" | O item não herda a unidade do produto | Débito registrado |

## Telas usadas

| Tela | Rota | Usuário | Legenda |
|---|---|---|---|
| Clientes | `/app/cadastros/clientes` | Juliana | ✅ |
| Pipeline | `/app/crm/pipeline` | Juliana | ✅ |
| Orçamentos | `/app/comercial/orcamentos` | Juliana | 🔎 |
| Pedidos de venda | `/app/comercial/pedidos-venda` | Juliana, Carlos | 🔎 |
| Pedido (detalhe) | `/app/comercial/pedidos-venda/:id` | Juliana, Carlos | ✅ |
| Faturamento | `/app/comercial/faturamento` | Carlos | 🔎 |

## Preparação de cena (⛔, fora da gravação, com o papel correto)

| Etapa | Usuário |
|---|---|
| Pipeline e oportunidade (o pipeline e os estágios não têm tela de cadastro) | Ana / Juliana |
| ORC-0001: criar → enviar | Juliana |
| ORC-0001: aprovar | Carlos |
| PV-0001: criar a partir do orçamento | Juliana |
| Pedido extra para o caso realista | Juliana |

## Observações

- Se a criação de pedido ganhar tela (B1) antes da gravação, a parte 04 passa a mostrar o preenchimento completo. O roteiro já reserva o espaço.
