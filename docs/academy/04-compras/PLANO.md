# Aula 04 — Compras

> Plano de produção. Revalidado no código (`2b9112b`) e no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 04 |
| **Título** | Compras — acompanhar o abastecimento, da necessidade à entrada no estoque |
| **Personagens** | **Rafael** (percebe a falta, solicita, compra, lança o recebimento) · **Carlos** (aprova) · **Bruno** (confere e confirma o recebimento) · **Fernanda** (citada: gera a conta a pagar) |
| **Papéis reais** | Rafael — **Operador** · Carlos — **Gerente** · Bruno — **Logística** (personalizado) · Fernanda — **Financeiro** (personalizado) |
| **Duração estimada** | 10–12 min ("aula de acompanhamento") |
| **Nível** | Intermediário |
| **Cobertura** | 🔎 **consulta**: as telas de Suprimentos e Recebimento são listas com filtros, abas e detalhe · ⛔ solicitação, aprovação, pedido de compra, envio, recebimento, confirmação e conta a pagar são feitos pela API · ⚠️ sem alerta de estoque mínimo (D6) |
| **Objetivo principal** | Entender o ciclo de compra do ATLAS.ERP, quem age em cada etapa, o que cada status significa e onde conferir que a mercadoria **de fato** entrou no estoque e gerou a obrigação de pagar. |

> **Decisão registrada (README, decisão 1):** como nenhuma etapa de compra tem tela de ação nesta versão, a aula é de **acompanhamento**. Cada etapa ⛔ é anunciada pelo quadro "Preparado fora da interface" e seguida do resultado real nas telas. Quando houver telas de ação, a seção 5 vira preenchimento completo sem mudar a estrutura.

## 2. Contexto de negócio

> Terça-feira, 14h. A manhã foi boa: o Granito levou 10 baldes. O Rafael abre o saldo de estoque para planejar a semana e vê o Picking com **2 baldes disponíveis**. O estoque mínimo do produto é **20**.
>
> A Polar entrega em 3 dias. Se ele pedir hoje, os baldes chegam na quinta de manhã. Ele pede **50 unidades**, o suficiente para voltar ao nível de trabalho sem lotar o armazém.
>
> O pedido de compra precisa do aval do Carlos antes de ir para o fornecedor. E, quando o caminhão chegar, quem confere a carga na doca é o Bruno.

## 3. O que o aluno vai aprender

- Perceber a necessidade de compra comparando o **disponível** com o **estoque mínimo**.
- O ciclo: **solicitação → aprovação → pedido de compra → aprovação → envio ao fornecedor → recebimento → conferência → entrada no estoque → conta a pagar**.
- Quem faz cada etapa e por quê (solicitante, aprovador, comprador, conferente, financeiro).
- Os status da solicitação, do pedido de compra e do recebimento.
- Acompanhar tudo nas telas: Solicitações, Pedidos de compra, Recebimento, Movimentações, Saldo e Contas a pagar.
- Por que o **recebimento** é o único caminho que dá entrada de estoque vinda de compra.
- O que esta versão ainda não faz pela tela.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | O processo que garante que o que falta chegue, com registro de quem pediu, quem aprovou, quanto custou e o que realmente entrou. |
| Por que existe | Comprar mexe no caixa. Por isso há dois controles: alguém aprova antes de comprar, e alguém confere a carga antes de o estoque subir. A conta a pagar nasce do que foi **recebido**, não do que foi pedido. |
| Quem executa | Operador: solicita, cria o pedido de compra, envia ao fornecedor, lança o recebimento. Gerente: aprova a solicitação e o pedido de compra. Logística: confere e confirma o recebimento. Financeiro: gera a conta a pagar. |
| Módulo responsável | Suprimentos (`/app/suprimentos`) e Logística → Recebimento (`/app/logistica/recebimento`) |
| Quem recebe o resultado | Estoque (entrada na Doca, aula 05) · Financeiro (conta a pagar, aula 06) · Fiscal (nota de entrada ⛔, aula 07). |

**Quem pode o quê** (permissões reais):

| Etapa | Operador | Gerente | Logística | Financeiro |
|---|---|---|---|---|
| Criar e enviar solicitação | ✅ | ✅ | — | — |
| **Aprovar solicitação** | — | ✅ | — | — |
| Criar pedido de compra, enviar para aprovação, enviar ao fornecedor | ✅ | ✅ | — | — |
| **Aprovar pedido de compra** | — | ✅ | — | — |
| Lançar recebimento | ✅ | ✅ | — | — |
| **Confirmar recebimento** | ✅ | ✅ | ✅ | — |
| **Gerar conta a pagar** do recebimento | — | ✅ | — | ✅ |
| Ver pedidos de compra | ✅ | ✅ | — | — |
| Ver recebimentos | ✅ | ✅ | ✅ | — |

Todas essas ações, nesta versão, acontecem pela API (⛔). Na tela, cada papel **acompanha** o que lhe cabe.

## 5. Roteiro de navegação

```
PERSONAGEM: Rafael — Operador · terça, 14h

1. Perceber a necessidade
   Rota: /app/logistica/estoque (Saldo de estoque) → busca "Balde"
   Resultado: Balde plástico 8 L · Picking — rua A, módulo 01 · Em estoque 12 ·
   Reservado 10 · Disponível 2.
   Rota: /app/cadastros/produtos → BAL-08 → Controle de estoque
   Resultado: Estoque mínimo 20 · Estoque máximo 120 · Ponto de reposição 30.
   Conclusão (feita pelo Rafael): disponível 2 < mínimo 20 → comprar.
   ⚠️ O sistema não avisa: a comparação é manual nesta versão (D6).

2. ⛔ Solicitação SC-0001
   Quadro: "Nesta versão, a solicitação de compra não tem tela. Foi registrada por
   integração pelo Rafael (Operador) e aprovada pelo Carlos (Gerente)."
   Rota: /app/suprimentos/solicitacao-compra
   Tela: "Solicitações de compra — Necessidades internas de compra, da abertura à
   aprovação para cotação." Abas: Aguardando aprovação, Prazo vencido.
   Colunas: Solicitação, Setor, Prioridade, Solicitada em, Necessária até, Status.
   Resultado: SC-0001 · Armazém · Alta · terça · quinta · Aprovada.
   Ação: clicar na linha → gaveta de detalhe (código, setor, status).

3. ⛔ Pedido de compra PC-0001
   Rota: /app/suprimentos/pedidos-compra
   Tela: "Pedidos de compra — Pedidos confirmados com fornecedores, do envio ao
   recebimento." Abas: Entrega atrasada, Aguardando aprovação.
   Colunas: Pedido, Fornecedor, Emissão, Entrega prevista, Total, Status.
   Momento 1 (antes da aprovação): PC-0001 · Polar Fornecimentos OD Ltda. · terça ·
   quinta · R$ 490,00 · Aguardando aprovação.
   Volta à solicitação: SC-0001 agora "Pedida".

PERSONAGEM: Carlos — Gerente

4. A fila de aprovação
   Rota: /app/suprimentos/pedidos-compra → aba "Aguardando aprovação"
   Resultado: PC-0001.
   ⛔ Aprovação registrada por integração com a conta do Carlos.
   Resultado: PC-0001 "Aprovado"; aba vazia.

PERSONAGEM: Rafael — Operador

5. ⛔ Envio ao fornecedor
   Resultado: PC-0001 "Enviado". A partir daqui o pedido pode ser recebido.

   [corte de tempo: quinta-feira, 7h30 — o caminhão da Polar na doca]

6. ⛔ Lançar o recebimento REC-0001 (Rafael)
   Rota: /app/logistica/recebimento
   Tela: "Recebimento de mercadorias — Conferência dos recebimentos de compra — único
   caminho que confirma entrada de estoque vinda de compra." Aba: Em conferência.
   Colunas: Recebimento, Fornecedor, Recebido em, Documento, Status.
   Resultado: REC-0001 · Polar · quinta · 1520 · Rascunho (aparece na aba
   "Em conferência").

PERSONAGEM: Bruno — Logística

7. ⛔ Conferir e confirmar
   Rota: /app/logistica/recebimento (o Bruno vê o Recebimento no menu dele)
   ⛔ Confirmação registrada por integração com a conta do Bruno.
   Resultado: REC-0001 "Confirmado"; aba "Em conferência" vazia.

8. Ver a entrada no estoque
   Rota: /app/logistica/movimentacoes
   Resultado: Tipo "Entrada" · Balde plástico 8 L · Doca de recebimento · 50 ·
   Origem "Recebimento de compra".
   Rota: /app/logistica/estoque
   Resultado: duas linhas do balde:
     Doca de recebimento          Em estoque 50 · Reservado 0  · Disponível 50
     Picking — rua A, módulo 01   Em estoque 12 · Reservado 10 · Disponível 2

PERSONAGEM: Carlos — Gerente

9. Fechar o ciclo
   Rota: /app/suprimentos/pedidos-compra → PC-0001 "Recebido"
   Rota: /app/suprimentos/solicitacao-compra → SC-0001 "Concluída"
   ⛔ Conta a pagar gerada do recebimento (Fernanda, Financeiro).
   Rota: /app/financeiro/contas-pagar
   Resultado: título "Recebimento REC-0001" · Polar · R$ 490,00 · Em aberto.

10. Telas citadas sem demonstração
    /app/suprimentos/cotacoes ("Cotações de compra"): usada quando há mais de um
    fornecedor; aqui a Polar é a única, então a etapa é pulada.
    /app/suprimentos/agendamentos: mostra os mesmos recebimentos da tela Recebimento
    (D7).
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Saldo | Zoom 1,4× na linha do Picking; coluna Disponível em vermelho-claro (motion) | Callout "2 disponíveis" | 2 s |
| Estoque mínimo | Gaveta do produto, bloco Controle de estoque | Callout "Mínimo 20 — comparação manual (D6)" + selo ⚠️ | 2,5 s |
| Diagrama do ciclo | Fundo escuro; stepper com 9 nós; nós ⛔ tracejados | Pílulas de quem faz cada nó | 6 s |
| Quadro ⛔ solicitação | Translúcido sobre a lista | — | 3 s → corte para a lista |
| Solicitações | Zoom nas colunas Prioridade e Necessária até | Callout "Necessária até fica vermelha se vencer" | 2 s |
| Pedido de compra | Zoom na linha e no selo "Aguardando aprovação" | Stepper do PC avança | 1,5 s |
| SC "Pedida" | Corte rápido de volta à lista de solicitações | Anel no selo | 1,5 s |
| Fila do Carlos | Aba "Aguardando aprovação" | Pílula Carlos | 2 s |
| Aprovação ⛔ | Quadro ⛔ curto → selo "Aprovado" | — | 1,5 s |
| Envio ⛔ | Selo "Enviado" | Callout "Só pedido enviado pode ser recebido" | 2 s |
| Corte de tempo | Cartão de capítulo "Quinta, 7h30" | Ilustração mínima do caminhão na doca | 2,5 s |
| Recebimento | Aba "Em conferência" → REC-0001 Rascunho | Callout "Rafael lança · Bruno confere" | 2 s |
| Confirmação ⛔ | Pílula Bruno; selo "Confirmado" | — | 1,5 s |
| Movimentações | Zoom na nova linha "Entrada" | Anel em Origem "Recebimento de compra" | 2,5 s |
| Saldo depois | Duas linhas lado a lado | Callout "A mercadoria está na Doca, ainda não no Picking" | **3 s** |
| Fechamento do ciclo | PC "Recebido", SC "Concluída" | Quadro de conferência com ✓ animados | 2 s |
| Conta a pagar | Zoom na linha do título | Callout "Nasce do que foi recebido" | 2 s |

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula quatro: Compras.

**[B — Contexto]**
Terça-feira, duas da tarde. O Granito levou dez baldes de manhã. O Rafael abre o saldo para planejar a semana e encontra só dois disponíveis no picking. O estoque mínimo do balde é vinte. Está na hora de comprar.

**[C — Explicação]**
Comprar mexe no caixa da empresa. Por isso, o ciclo de compra tem dois controles. Antes de comprar, alguém aprova. Depois que a mercadoria chega, alguém confere. A conta a pagar nasce do que foi recebido, não do que foi pedido. No ATLAS.ERP, o ciclo tem nove passos: a solicitação, a aprovação da solicitação, o pedido de compra, a aprovação do pedido, o envio ao fornecedor, o recebimento, a conferência, a entrada no estoque e a conta a pagar.

Uma observação sobre esta versão: nenhuma dessas etapas tem tela de ação ainda. Elas foram registradas por integração, cada uma com a conta da pessoa certa. Nesta aula, você vai aprender a acompanhar o ciclo e a conferir o resultado.

**[D1 — A necessidade]**
Como o Rafael percebeu a falta? Comparando dois números: o disponível no saldo, dois, e o estoque mínimo no cadastro do produto, vinte. Nesta versão, o sistema ainda não avisa quando o estoque fica abaixo do mínimo. A conferência é sua.

**[D2 — Solicitação]**
O Rafael registrou a solicitação SC zero zero zero um: cinquenta baldes, prioridade alta, necessários até quinta. Em Solicitações de compra, ela aparece com o setor, a prioridade e a data limite. Se a data vencer, ela fica em vermelho. O Carlos aprovou a solicitação.

**[D3 — Pedido de compra]**
Com a solicitação aprovada, o Rafael criou o pedido de compra para a Polar: cinquenta baldes a nove e oitenta, quatrocentos e noventa reais, entrega na quinta. O pedido está aguardando aprovação. E repare na solicitação: ela passou para pedida.

**[D4 — Aprovação e envio]**
O Carlos encontra o pedido na aba Aguardando aprovação. Essa aba é a fila do aprovador. Aprovado, o Rafael envia o pedido ao fornecedor. Atenção: só um pedido enviado pode ser recebido.

**[D5 — Recebimento]**
Quinta-feira, sete e meia. O caminhão da Polar está na doca. O Rafael lança o recebimento com a nota do fornecedor e manda tudo para a doca de recebimento. Enquanto não é confirmado, o recebimento fica em conferência. Quem confere é o Bruno, da logística. Ele conta a carga, confere com a nota e confirma.

**[E — Resultado]**
Só agora o estoque sobe. Nas movimentações, aparece uma entrada de cinquenta baldes na doca, com a origem do recebimento. No saldo, o balde tem duas linhas: cinquenta na doca e doze no picking. Repare: a mercadoria chegou, mas ainda não está no picking, de onde sai para os pedidos. Isso é assunto da próxima aula. O pedido de compra está recebido, a solicitação está concluída, e a conta a pagar de quatrocentos e noventa reais está em aberto no financeiro.

**[F — Erros e exceções]**
Alguns cuidados. O Rafael não aprova as próprias compras: o papel de operador não tem essa permissão. O Bruno confirma o recebimento, mas não o lança. Um pedido que ainda não foi enviado ao fornecedor não pode ser recebido. Se o fornecedor atrasar, a aba Entrega atrasada mostra o pedido. E, se o fornecedor mandar menos do que o pedido, o recebimento é parcial: o pedido fica como recebido parcial até a próxima entrega.

**[G — Exercício]**
Sua vez. Encontre um produto com disponível abaixo do estoque mínimo. Depois, acompanhe um pedido de compra até o recebimento e confira a entrada nas movimentações e a conta a pagar.

**[H — Fechamento]**
Resumindo: aprovar antes de comprar, conferir antes de estocar, pagar o que foi recebido. Na próxima aula, os cinquenta baldes saem da doca, vão para o picking e atendem um novo pedido.

## 8. Estados e fluxo

```
SOLICITAÇÃO DE COMPRA
Rascunho ──► Solicitada ──► Aprovada ──► Pedido parcial / Pedida ──► Concluída
                       └──► Recusada                 (Cancelada)
(Pedida e Concluída são atualizadas sozinhas, pelo pedido de compra e pelo recebimento)

PEDIDO DE COMPRA
Rascunho ──► Aguardando aprovação ──► Aprovado ──► Enviado ──► Recebido parcial / Recebido ──► Encerrado
                                                         (Cancelado)

RECEBIMENTO
Rascunho (aba "Em conferência") ──► Confirmado
                                └──► Recusado
```

**Fluxo entre módulos:**

```
ESTOQUE (disponível < mínimo, conferência manual)
  └──► COMPRAS: SC ⛔ ──► PC ⛔ ──► Recebimento ⛔
                                     ├──► ESTOQUE: Entrada "Recebimento de compra" na Doca (aula 05)
                                     ├──► FINANCEIRO: conta a pagar ⛔ (aula 06)
                                     └──► FISCAL: nota de entrada ⛔ (aula 07)
```

**Entrada:** PV-0001 reservado (aula 03); Picking com disponível 2.
**Processamento:** SC-0001 → PC-0001 (50 × R$ 9,80) → REC-0001 na Doca.
**Resultado:** Doca 50 / 0 / 50; Picking 12 / 10 / 2; PC Recebido; SC Concluída; conta a pagar R$ 490,00 em aberto.
**Segue para:** Estoque/WMS (aula 05).

## 9. Erros e exceções

As mensagens abaixo vêm das regras do banco e só aparecem pela API nesta versão. Na aula, são mostradas como quadro de erro (não há como provocá-las pela tela).

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Estoque abaixo do mínimo | — (nenhum aviso) | Não há alerta de estoque mínimo | A falta só é percebida por quem confere | Saldo × cadastro do produto | Conferência periódica; aba "Sem disponibilidade" no Saldo | ⚠️ D6 (novo) |
| Operador tenta aprovar | "Você não tem permissão para esta operação (purchase_orders.approve)." | Segregação | Não aprova | Erro da integração | O Gerente aprova | não (regra); ⚠️ B15 (código técnico na mensagem) |
| Receber pedido não enviado | "Só é possível receber um pedido enviado ao fornecedor e ainda não totalmente recebido (status atual: …)." | Etapa pulada | Recebimento recusado | Status do PC | Enviar o pedido antes | não |
| Recebimento sem itens | "O recebimento precisa de ao menos um item." | Dados incompletos | Não cria | — | Informar os itens | não |
| Quantidade zero | "A quantidade deve ser maior que zero." | Validação | Não cria | — | Informar a quantidade recebida | não |
| Logística tenta lançar recebimento | "Você não tem permissão para esta operação (purchase_receipts.create)." | O papel Logística só confirma | — | — | O Operador lança; o Bruno confere | não (regra) |
| Confirmar duas vezes | "Só é possível confirmar um recebimento em rascunho (status atual: …)." | Já confirmado | Nada muda | Status Confirmado | Nenhuma | não |
| Pedido parado na aprovação | — | Falta a aprovação do Gerente | Atraso na compra | Aba "Aguardando aprovação" | Cobrar o aprovador | não |
| Fornecedor atrasou | — (data em vermelho) | Entrega prevista vencida | Ruptura | Aba "Entrega atrasada" | Cobrar o fornecedor | não |
| Agendamentos igual a Recebimento | — | As duas telas leem os mesmos recebimentos | Confusão de nomes | Comparar as listas | Usar Recebimento | ⚠️ D7 (novo) |
| Operador cria conta a pagar avulsa | — | Papel padrão amplo demais (`accounts_payable.create`) | Segregação fraca | Matriz de permissões | Ajustar o papel (aula 10) | ⚠️ **B9** |
| Vendedor procura Suprimentos | — (menu ausente) | Sem permissão de compras | — | Menu | — | não |

## 10. Exercício prático

1. No Saldo de estoque, use a aba **Sem disponibilidade** e depois compare um produto com o **estoque mínimo** do cadastro.
2. Em Solicitações de compra, encontre a SC-0001 e diga o status e por que ele mudou sozinho.
3. Em Pedidos de compra, diga quem pode tirar um pedido da aba **Aguardando aprovação**.
4. Em Recebimento, encontre o REC-0001 e diga quem lançou e quem confirmou.
5. Nas Movimentações, filtre o Tipo **Entrada** e encontre a origem **Recebimento de compra**.
6. **Pergunta:** por que o Picking continua com 2 disponíveis, se chegaram 50 baldes?

## 11. Checklist de conclusão

- [ ] Sei perceber a necessidade (disponível × estoque mínimo) e sei que o sistema não avisa.
- [ ] Conheço os nove passos do ciclo e quem faz cada um.
- [ ] Leio os status da solicitação, do pedido de compra e do recebimento.
- [ ] Sei usar as abas Aguardando aprovação, Entrega atrasada e Em conferência.
- [ ] Sei por que só o recebimento confirmado dá entrada no estoque.
- [ ] Encontrei a entrada nas Movimentações e o saldo na Doca.
- [ ] Sei que a conta a pagar nasce do recebimento.
- [ ] Sei o que esta versão não faz pela tela.

## 12. Evidências

Salvar em `docs/academy/04-compras/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-saldo-picking-2.png` | Picking 12 / 10 / 2 |
| 02 | `02-produto-minimo.png` | Estoque mínimo 20 no cadastro |
| 03 | `03-sc-aprovada.png` | SC-0001 Aprovada |
| 04 | `04-pc-aguardando.png` | PC-0001 Aguardando aprovação |
| 05 | `05-sc-pedida.png` | SC-0001 Pedida |
| 06 | `06-fila-carlos.png` | Aba "Aguardando aprovação" |
| 07 | `07-pc-enviado.png` | PC-0001 Enviado |
| 08 | `08-rec-em-conferencia.png` | REC-0001 Rascunho na aba Em conferência |
| 09 | `09-rec-confirmado.png` | REC-0001 Confirmado |
| 10 | `10-movimentacao-entrada.png` | Entrada · Doca · 50 · Recebimento de compra |
| 11 | `11-saldo-doca-picking.png` | Doca 50 e Picking 12/10/2 |
| 12 | `12-pc-recebido-sc-concluida.png` | Ciclo fechado |
| 13 | `13-conta-a-pagar.png` | "Recebimento REC-0001" R$ 490,00 Em aberto |

## 13. Preparação técnica

Cada etapa é executada **entre as cenas**, na ordem, com a conta do papel correto, para que a gravação capture cada status real. Nenhuma tem tela.

| # | Etapa | Endpoint | Usuário | Dados | Resultado esperado |
|---|---|---|---|---|---|
| 1 | Pré-requisito | — | — | Aula 03 concluída | Picking 12 / 10 / 2 |
| 2 | Criar a solicitação | `POST /api/purchase-requests` | Rafael (`purchase_requests.create`) | `{ department: "Armazém", priority: "high", justification: "Picking com 2 disponíveis; estoque mínimo 20", neededBy: <quinta>, items: [{ productId: <BAL-08>, description: "Balde plástico 8 L", unit: "UN", quantity: 50 }] }` | SC-0001 Rascunho |
| 3 | Enviar para aprovação | `POST /api/purchase-requests/:id/submit` | Rafael (`purchase_requests.update`) | — | Solicitada |
| 4 | Aprovar | `POST /api/purchase-requests/:id/approve` | Carlos (`purchase_requests.approve`) | `{}` (aprova as quantidades solicitadas) | Aprovada |
| 5 | Criar o pedido de compra | `POST /api/purchase-orders` | Rafael (`purchase_orders.create`) | `{ supplierId: <Polar>, purchaseRequestId: <SC-0001>, paymentTerms: "28 dias", expectedDeliveryAt: <quinta>, items: [{ productId: <BAL-08>, description: "Balde plástico 8 L", unit: "UN", quantity: 50, unitPrice: 9.80 }] }` | PC-0001 Rascunho · R$ 490,00 · SC "Pedida" |
| 6 | Enviar para aprovação | `POST /api/purchase-orders/:id/submit` | Rafael (`purchase_orders.update`) | — | Aguardando aprovação → **gravar a cena 3 e 4** |
| 7 | Aprovar | `POST /api/purchase-orders/:id/approve` | Carlos (`purchase_orders.approve`) | — | Aprovado |
| 8 | Enviar ao fornecedor | `POST /api/purchase-orders/:id/send` | Rafael (`purchase_orders.update`) | — | Enviado |
| 9 | Lançar o recebimento | `POST /api/purchase-receipts` | Rafael (`purchase_receipts.create`) | `{ purchaseOrderId: <PC-0001>, documentType: "NF-e", documentNumber: "1520", documentSeries: "1", documentValue: 490.00, items: [{ purchaseOrderItemId: <item>, productId: <BAL-08>, quantityReceived: 50, unit: "UN", destinationLocationId: <REC-01> }] }` | REC-0001 Rascunho → **gravar a cena 6** |
| 10 | Confirmar | `POST /api/purchase-receipts/:id/confirm` | Bruno (`purchase_receipts.confirm`) | — | Confirmado · Entrada 50 na Doca · PC Recebido · SC Concluída |
| 11 | Gerar a conta a pagar | `POST /api/purchase-receipts/:id/generate-payable` | Fernanda (`accounts_payable.approve`) | `{}` | Título "Recebimento REC-0001" · R$ 490,00 · Em aberto |

- **Irreversível?** Recebimento confirmado gera movimento imutável e título financeiro. Executar só no ambiente Academy.
- **Datas:** a história usa terça e quinta. Se as etapas forem preparadas no mesmo dia, as colunas de data mostrarão o mesmo dia; a narração não cita datas absolutas.
- **Sem ambiente limpo:** os números seguem a numeração global (B3); o título a pagar continua identificável pela descrição "Recebimento REC-…".

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "04 · Compras" |
| B | Contexto | 0:09–0:40 | Fundo escuro: "Terça, 14h" · pílula Rafael/Operador |
| C | Explicação | 0:40–2:00 | Diagrama do ciclo com 9 nós (⛔ tracejados) e quem faz cada um; selo de cobertura 🔎 |
| D1 | Necessidade | 2:00–2:50 | Saldo e estoque mínimo; ⚠️ D6 |
| D2 | Solicitação | 2:50–3:40 | Quadro ⛔ → lista de solicitações |
| D3 | Pedido de compra | 3:40–4:40 | PC Aguardando aprovação; SC Pedida |
| D4 | Aprovação e envio | 4:40–5:40 | Fila do Carlos; Aprovado; Enviado |
| D5 | Recebimento | 5:40–7:00 | "Quinta, 7h30"; Em conferência; Bruno confirma |
| E | Resultado | 7:00–8:30 | Movimentações, saldo Doca × Picking, PC Recebido, SC Concluída, conta a pagar |
| F | Erros | 8:30–10:00 | Quadro de erros (segregação, pedido não enviado, quantidade, atraso, D6, D7, B9) |
| G | Exercício | 10:00–10:25 | Tela de exercício |
| H | Fechamento | 10:25–10:45 | 3 linhas → "Próxima aula: Estoque e WMS" → lockup |
