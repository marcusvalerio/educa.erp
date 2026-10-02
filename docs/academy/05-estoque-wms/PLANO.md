# Aula 05 — Estoque / WMS

> Plano de produção. Revalidado no código (`2b9112b`) e no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 05 |
| **Título** | Estoque e WMS — onde está, quanto está livre e como a mercadoria anda |
| **Personagens** | **Bruno** (reserva, identifica a reserva parcial, transfere) · **Rafael** (confere a chegada; mostra a liberação de reserva) |
| **Papéis reais** | Bruno — **Logística** (personalizado) · Rafael — **Operador** |
| **Duração estimada** | 15–17 min (a aula com mais peso em **conceito**) |
| **Nível** | Intermediário |
| **Cobertura** | ✅ reservar e liberar reserva (no pedido) · 🔎 Saldo, Movimentações, Transferências, Inventário, Endereçamento, Almoxarifado, Picking, Packing, Expedição, Devoluções · ⛔ transferência, entrada e saída avulsas, ajuste, contagem, separação e expedição · ⚠️ B5 (mensagem da reserva parcial) |
| **Objetivo principal** | Entender o estoque como um livro de movimentações por local, ler **em estoque × reservado × disponível**, reservar um pedido, reconhecer uma reserva parcial e resolvê-la levando a mercadoria da doca para o picking. |

## 2. Contexto de negócio

> Quinta-feira, 7h30. Os 50 baldes da Polar chegaram e o Bruno confirmou o recebimento (aula 04). Eles estão na **doca**, ainda paletizados.
>
> Às 10h, chega um pedido novo: a Ferrovia, de Campinas, quer **5 baldes de 8 litros**. O Carlos já aprovou. O Bruno vai reservar.
>
> No picking, porém, só restam 2 baldes livres: os outros 10 estão reservados para o Granito. A mercadoria nova existe, mas está no lugar errado. É um dia normal de armazém.

## 3. O que o aluno vai aprender

- Por que o estoque é um **livro de movimentações** (ledger) e não um número que alguém digita.
- A diferença entre **em estoque**, **reservado** e **disponível**, e a fórmula que liga os três.
- Por que o saldo é **por local** (doca, picking, expedição) e como isso afeta a reserva.
- Ler as telas **Saldo de estoque** e **Movimentações**, com tipos e origens.
- **Reservar** um pedido e reconhecer uma **reserva parcial** (status "Reserva pendente").
- Por que a mensagem "Estoque reservado." **não basta** (B5) e o que conferir.
- O que é a **armazenagem** (doca → picking) e como a **transferência** move o saldo.
- **Liberar reserva** e o efeito no disponível.
- As demais telas do WMS e para que serve cada uma.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | O Estoque registra cada entrada, saída, transferência e reserva como uma linha imutável. O saldo é a soma dessas linhas, **por produto e por local**. O WMS organiza onde cada coisa fica e como anda dentro do armazém. |
| Por que existe | Um número digitado não explica nada. Um livro de movimentações diz de onde veio cada unidade, para onde foi e quem fez. E saber o **local** é o que permite separar o pedido sem procurar o produto pelo armazém. |
| Quem executa | Logística e Operador: reservam, recebem, transferem, separam e expedem. Gerente: ajusta e aprova ajustes. Todos os que vendem consultam o saldo. |
| Módulo responsável | Logística e Estoque (`/app/logistica`) + reserva no pedido (`/app/comercial/pedidos-venda/:id`) |
| Quem recebe o resultado | Comercial (o pedido fica Reservado) · Logística (separação e expedição, aula 08) · Compras (o disponível orienta a próxima compra, aula 04). |

**A fórmula** (quadro animado da cena C):

```
EM ESTOQUE   = tudo o que está fisicamente no local (entradas − saídas)
RESERVADO    = o que já está prometido a pedidos aprovados
DISPONÍVEL   = EM ESTOQUE − RESERVADO   → o que ainda pode ser vendido ou reservado
```

A reserva **não tira** a mercadoria da prateleira: muda o **reservado** e o **disponível**. O **em estoque** só cai quando a mercadoria sai (expedição, aula 08).

**O armazém da Órbita** (planta em motion, a mesma da aula 02):

```
 caminhão ─► REC-01 Doca de recebimento ──(armazenagem)──► PCK-A01 Picking ──(separação)──► EXP-01 Expedição ─► cliente
```

**Quem pode o quê** (permissões reais):

| Ação | Logística | Operador | Gerente | Vendedor |
|---|---|---|---|---|
| Ver saldo e movimentações | ✅ | ✅ | ✅ | ✅ |
| Reservar estoque no pedido | ✅ | ✅ | ✅ | — |
| Liberar reserva | — | ✅ | ✅ | ✅ |
| Transferir entre locais (API ⛔) | ✅ | ✅ | ✅ | — |
| Entrada avulsa (API ⛔) | ✅ | ✅ | ✅ | — |
| Ajuste de estoque (API ⛔) | — | — | ✅ | — |

## 5. Roteiro de navegação

```
PERSONAGEM: Rafael — Operador · quinta, 7h45

1. Conferir a chegada
   Rota: /app/logistica/movimentacoes
   Tela: "Movimentações de estoque — Ledger de estoque — imutável, nunca editado por
   esta tela." Colunas: Data, Tipo, Produto, Local, Quantidade, Origem. Filtro Tipo.
   Resultado (de cima para baixo):
     Entrada · Balde plástico 8 L · Doca de recebimento · 50 · PURCHASE_RECEIPT   (aula 04)
     RESERVATION · Balde plástico 8 L · Picking — rua A, módulo 01 · 10 · stock_reservation (aula 03)
     Entrada · Balde plástico 8 L · Picking — rua A, módulo 01 · 12 · manual       (implantação, aula 02)
   Ação: filtro Tipo = "Entrada" → só as duas entradas.

2. Ler o saldo por local
   Rota: /app/logistica/estoque
   Tela: "Saldo de estoque — Saldo derivado do ledger de movimentações — nunca alterado
   diretamente por esta tela." Colunas: Produto, Local, Em estoque, Reservado, Disponível.
   Visões: Sem disponibilidade, Com reserva.
   Resultado:
     Balde plástico 8 L · Doca de recebimento          · 50 ·  0 · 50
     Balde plástico 8 L · Picking — rua A, módulo 01   · 12 · 10 ·  2
   Ação: visão "Com reserva" → só a linha do Picking.

PERSONAGEM: Bruno — Logística · quinta, 10h

3. ⛔ Pedido PV-0002 — preparado fora da interface
   Quadro: "O pedido da Ferrovia foi registrado por integração e aprovado pelo Carlos."
   Rota: /app/comercial/pedidos-venda → aba "Em andamento"
   Resultado: PV-0002 · Ferrovia Comércio OD Ltda. · Total R$ 97,00 · Aprovado.

4. Reservar no Picking
   Ação: abrir PV-0002 → Reservar estoque
   Janela: "Reservar estoque — Reserva as quantidades pendentes do pedido no local
   escolhido. Itens sem saldo ficam com reserva pendente."
   Dados: Local de estoque* → "Picking — rua A, módulo 01"
   Ação: Reservar
   Resultado na tela:
     toast "Estoque reservado."        ← ⚠️ B5: a mensagem é a mesma de uma reserva completa
     selo "Reserva pendente"
     indicador Reservado 40% (2 de 5)
     Andamento: Reserva 40%
     Itens: Pedida 5 · Reservada 2
   O botão "Reservar estoque" continua disponível (há quantidade pendente).

5. Entender o que aconteceu
   Rota: /app/logistica/estoque
   Resultado:
     Doca de recebimento          · 50 ·  0 · 50
     Picking — rua A, módulo 01   · 12 · 12 ·  0   (aparece na visão "Sem disponibilidade")
   Conclusão: o Picking só tinha 2 livres; os 50 novos estão na Doca.

6. ⛔ Armazenagem: transferir da Doca para o Picking
   Quadro: "Nesta versão, a transferência entre locais não tem tela. Foi registrada por
   integração pelo Bruno (Logística): criada, enviada e recebida."
   Rota: /app/logistica/transferencias
   Tela: "Transferências entre locais — Transferências de estoque entre locais, do envio
   à confirmação de recebimento." Aba: Em trânsito.
   Colunas: Transferência, Origem, Destino, Envio, Status.
   Resultado: TRF-0001 · Doca de recebimento · Picking — rua A, módulo 01 · quinta ·
   Concluída.
   Rota: /app/logistica/movimentacoes
   Resultado: duas linhas novas:
     Transferência (saída)   · Doca de recebimento        · 50 · stock_transfer
     Transferência (entrada) · Picking — rua A, módulo 01 · 50 · stock_transfer

7. Reservar o restante
   Rota: PV-0002 → Reservar estoque → "Picking — rua A, módulo 01" → Reservar
   Resultado: toast "Estoque reservado."; selo "Reservado"; Reservado 100% (5 de 5).

8. Conferir
   Rota: /app/logistica/estoque
   Resultado:
     Doca de recebimento          ·  0 ·  0 ·  0
     Picking — rua A, módulo 01   · 62 · 15 · 47
   (62 = 12 + 50; 15 = 10 do Granito + 5 da Ferrovia; 47 = 62 − 15)

PERSONAGEM: Rafael — Operador

9. Caso realista: liberar uma reserva
   Situação: e se a Ferrovia desistisse?
   Ação: PV-0002 → Liberar reserva → mostrar a confirmação "As quantidades reservadas
   voltam a ficar disponíveis no estoque." → fechar com "Cancelar" (sem executar).
   Explicação: liberar devolve o pedido para "Aprovado" e o disponível sobe; o em
   estoque não muda. Repare: o Bruno reserva, mas não vê "Liberar reserva" (o papel
   Logística não tem essa permissão); o Rafael vê.

10. Mapa das outras telas (consulta)
    /app/logistica/inventario     "Contagens de inventário" (contagem e ajuste ⛔)
    /app/logistica/enderecamento  "Endereçamento de estoque"
    /app/logistica/almoxarifado   "Almoxarifado operacional" (requisições internas ⛔)
    /app/logistica/picking        "Separação (picking)" (aula 08)
    /app/logistica/packing · /app/logistica/expedicao "Expedições" (aula 08)
    /app/logistica/devolucoes
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Fórmula | Fundo escuro; três barras (em estoque, reservado, disponível) animadas com o balde | Fórmula em DM Sans; números em mono | 6 s |
| Planta do armazém | Motion: Doca → Picking → Expedição; caixas de baldes em cada local | Contadores por local | 4 s |
| Movimentações | Tela cheia → zoom 1,3× na coluna Origem | Callouts: `PURCHASE_RECEIPT` = compra, `stock_reservation` = reserva, `manual` = entrada avulsa | 2 s por linha |
| Ledger imutável | Zoom na descrição da tela | Callout "Nenhuma linha é editada: correções viram novas linhas" | 2,5 s |
| Saldo por local | Zoom nas duas linhas | Anel na coluna Local | 2 s |
| Visão "Com reserva" | Clique na visão | — | 1,5 s |
| Quadro ⛔ PV-0002 | Translúcido | — | 3 s |
| Reservar | Diálogo; lista de locais aberta | Callout no texto "Itens sem saldo ficam com reserva pendente" | 2,5 s |
| **Reserva parcial** | Toast "Estoque reservado." em destaque → câmera desce para o selo e o indicador | Quadro de erro ⚠️ B5: Mensagem · Por que · Como conferir | **4 s** |
| Indicador 40% | Zoom 1,6× em "Reservado 40% · 2 de 5" | Anel laranja | 2 s |
| Diagnóstico | Saldo: Picking 0 disponível, Doca 50 | Seta da Doca para o Picking (motion) | 3 s |
| Quadro ⛔ transferência | Translúcido | Stepper Rascunho → Em trânsito → Concluída | 3 s |
| Transferências | Zoom na linha TRF-0001 | — | 1,5 s |
| Movimentações da transferência | Zoom nas duas linhas novas | Callout "Sai de um local, entra no outro: o total não muda" | 2,5 s |
| Reservar de novo | Mesmo diálogo → selo "Reservado" → 100% | Stepper avança | toast 2,5 s · selo 1,5 s |
| Saldo final | Duas linhas; motion soma 12 + 50 = 62 | Fórmula com os números: 62 − 15 = 47 | 4 s |
| Liberar reserva (sem executar) | Diálogo | Callout "Cancelar fecha · Liberar reserva executa" | 2,5 s |
| Mapa das telas | Pan pelo menu Logística | Selo 🔎 em cada item | 4 s |

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula cinco: Estoque e WMS.

**[B — Contexto]**
Quinta-feira, sete e meia. Os cinquenta baldes da Polar chegaram e estão na doca. Às dez horas, chega um pedido novo: a Ferrovia quer cinco baldes. O Bruno, da logística, vai reservar.

**[C — Explicação]**
Antes da tela, três ideias. A primeira: no ATLAS.ERP, ninguém digita o saldo. Cada entrada, saída, transferência e reserva vira uma linha num livro que não pode ser editado. O saldo é a soma dessas linhas. A segunda: o saldo é por local. Cinquenta baldes na doca não são cinquenta baldes no picking. A terceira é a fórmula. Em estoque é o que está fisicamente no local. Reservado é o que já está prometido. E disponível é a diferença: o que ainda pode ser vendido.

**[D1 — Movimentações]**
O Rafael começa o dia nas movimentações. Cada linha diz o tipo, o produto, o local, a quantidade e a origem. A entrada de cinquenta veio do recebimento de compra. A reserva de dez é a do Granito. E a entrada de doze é o saldo de implantação. Nada aqui é editado: se algo estiver errado, a correção entra como uma nova linha.

**[D2 — Saldo]**
No saldo, o balde aparece duas vezes, uma por local. Na doca, cinquenta em estoque, todos disponíveis. No picking, doze em estoque, dez reservados, dois disponíveis.

**[D3 — Reservar]**
Dez horas. O pedido da Ferrovia já está aprovado. O Bruno clica em Reservar estoque e escolhe o picking, de onde os pedidos saem. Reservar.

**[D4 — A reserva parcial]**
Atenção a este momento. A mensagem diz "estoque reservado". Mas olhe o status: reserva pendente. E o indicador: quarenta por cento, dois de cinco. O picking só tinha dois baldes livres. A reserva foi parcial, e a mensagem, nesta versão, não faz essa diferença. Por isso, a regra é: depois de reservar, confira sempre o indicador Reservado e o status do pedido.

**[D5 — Armazenagem]**
Os baldes existem, mas estão na doca. O trabalho certo é a armazenagem: levar a mercadoria da doca para o picking. Nesta versão, a transferência entre locais ainda não tem tela. Ela foi registrada por integração pelo Bruno. Veja o resultado: a transferência TRF zero zero zero um está concluída. Nas movimentações, cinquenta saíram da doca e cinquenta entraram no picking. O total da empresa não mudou: só o lugar.

**[D6 — Completar a reserva]**
Agora, o Bruno reserva de novo no picking. A reserva vale só para o que estava pendente: os três baldes que faltavam. Reservado. Cem por cento.

**[E — Resultado]**
O saldo final conta a história da semana. No picking, sessenta e dois baldes em estoque: os doze iniciais mais os cinquenta da compra. Quinze reservados: dez do Granito e cinco da Ferrovia. Quarenta e sete disponíveis. E a doca está vazia, pronta para o próximo caminhão.

**[F — Erros e exceções]**
Alguns cuidados. Reservar sem escolher o local não é possível: o sistema pede o local. Reservar num local onde o produto não está gera uma reserva pendente, com a mesma mensagem de sucesso. E, se o cliente desistir, o pedido pode ter a reserva liberada: as quantidades voltam a ficar disponíveis, e o em estoque não muda. Repare que a liberação é feita pelo Rafael. O papel de logística do Bruno reserva, mas não libera. Por fim, nenhuma movimentação é editada nesta tela. Correções entram como ajuste, que exige aprovação do gerente e, nesta versão, é feito por integração.

**[G — Exercício]**
Sua vez. Encontre no saldo um produto com reserva. Calcule o disponível com a fórmula e confira com a coluna. Depois, nas movimentações, encontre a origem de cada linha desse produto.

**[H — Fechamento]**
Resumindo: o saldo é a soma das movimentações, por local. A reserva muda o disponível, não o em estoque. E a mensagem não basta: confira o indicador. Na próxima aula, o dinheiro entra em cena: a Fernanda gera as contas a receber desses pedidos.

## 8. Estados e fluxo

```
PEDIDO DE VENDA (parte de estoque)
Aprovado ──(Reservar, saldo suficiente)──► Reservado
         ──(Reservar, saldo insuficiente)──► Reserva pendente ──(Reservar de novo)──► Reservado
Reservado / Reserva pendente ──(Liberar reserva)──► Aprovado

TRANSFERÊNCIA ENTRE LOCAIS (⛔ API)
Rascunho ──(enviar)──► Em trânsito ──(receber)──► Concluída
                                    (Cancelada)

MOVIMENTAÇÕES (tipo → efeito no saldo do local)
Entrada (RECEIPT) ................. em estoque +
Saída (ISSUE) ..................... em estoque −
Transferência (saída / entrada) ... em estoque − na origem / + no destino
Ajuste (+ / −) .................... em estoque ±
RESERVATION ....................... reservado +   (rótulo técnico, D5)
RELEASE ........................... reservado −   (rótulo técnico, D5)
```

**Fluxo entre módulos:**

```
COMPRAS (recebimento) ──► ESTOQUE: Doca +50
                          └─ armazenagem ⛔ ──► Picking +50
COMERCIAL (pedido aprovado) ──► ESTOQUE: reserva (disponível −) ──► LOGÍSTICA: separação ⛔ → expedição ⛔ (em estoque −)
```

**Entrada:** Doca 50/0/50; Picking 12/10/2; PV-0002 aprovado (⛔).
**Processamento:** reserva parcial ✅ → transferência ⛔ → reserva do pendente ✅.
**Resultado:** PV-0002 Reservado (5 de 5); Doca 0/0/0; Picking 62/15/47.
**Segue para:** Financeiro (aula 06) e Logística (aula 08: separação e expedição dos dois pedidos).

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| **Reserva parcial** | Toast "Estoque reservado." | O local não tinha saldo para tudo; a mensagem não confere o resultado | Pedido não totalmente reservado; risco de prometer o que não está separado | Selo **Reserva pendente**; indicador **Reservado** < 100%; coluna Reservada | Levar saldo ao local (transferência) ou reservar em outro local; depois **Reservar estoque** de novo | ⚠️ **B5** |
| Reservar sem local | "Selecione o local de onde reservar." | Campo obrigatório | Não reserva | Mensagem sob o campo | Escolher o local | não |
| Local ausente da lista da reserva | — | O local foi cadastrado sem Descrição | Não dá para reservar nele pela tela | Lista da janela | Editar o local e preencher a Descrição | ⚠️ D8 (novo; confirmar na preparação) |
| Logística procura "Liberar reserva" | — (botão ausente) | O papel Logística não tem `sales_orders.update` | Precisa de outra pessoa para liberar | Cabeçalho do pedido | Operador ou Gerente libera | ⚠️ observação de modelo de papel |
| Tipos com rótulo técnico | "RESERVATION", "RELEASE"; origens `stock_reservation`, `stock_transfer`, `PURCHASE_RECEIPT`, `manual` | Tipos de reserva e origens sem tradução | Leitura difícil | Colunas Tipo e Origem | Usar a tabela da seção 8 | ⚠️ D5 (novo) |
| Saída ou transferência maior que o disponível (API) | "Saldo insuficiente: disponível 2.0000, solicitado 5" (exemplo) | Quantidade acima do disponível do local | Operação recusada | Mensagem da integração | Conferir reservas e saldo do local | não; ⚠️ **B15** (casas decimais) |
| Editar uma movimentação | — (não existe) | Por desenho: ledger imutável | — | Tela só de consulta | Corrigir com ajuste (Gerente, ⛔) ou estorno | não |
| Transferir, contar, ajustar, separar pela tela | — (sem botões) | ⛔ só pela API nesta versão | Depende de integração | Telas só de consulta | Integração; aulas 08 e futuras | ⛔ |
| Estoque abaixo do mínimo | — (nenhum aviso) | Sem alerta | — | Saldo × cadastro | Conferência manual | ⚠️ D6 |

## 10. Exercício prático

1. No Saldo de estoque, use a visão **Com reserva** e escolha uma linha. Calcule **em estoque − reservado** e compare com **Disponível**.
2. Nas Movimentações, filtre **Entrada** e explique a origem de cada linha.
3. Encontre um pedido com status **Reserva pendente** (ou crie a situação: reserve num local sem saldo suficiente). Leia a mensagem, o selo e o indicador.
4. Explique, com as palavras da aula, por que o em estoque **não muda** quando você reserva.
5. **Pergunta:** a Doca tinha 50 baldes disponíveis. A reserva da Ferrovia poderia ter sido feita lá? Por que a aula preferiu transferir para o Picking?

## 11. Checklist de conclusão

- [ ] Sei por que o estoque é um livro de movimentações imutável.
- [ ] Sei a fórmula em estoque − reservado = disponível.
- [ ] Sei que o saldo é por local e escolho o local certo na reserva.
- [ ] Leio as colunas Tipo e Origem das movimentações.
- [ ] Reservei um pedido e reconheci uma reserva parcial pelo selo e pelo indicador.
- [ ] Sei que a mensagem "Estoque reservado." não basta (B5).
- [ ] Entendi a armazenagem (Doca → Picking) e o efeito da transferência.
- [ ] Sei o que a liberação de reserva faz e quem pode liberá-la.
- [ ] Conheço as demais telas do WMS e o que ainda não tem tela.

## 12. Evidências

Salvar em `docs/academy/05-estoque-wms/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-movimentacoes-inicio.png` | Entrada 50 (PURCHASE_RECEIPT), reserva 10, entrada 12 (manual) |
| 02 | `02-saldo-doca-picking.png` | Doca 50/0/50 · Picking 12/10/2 |
| 03 | `03-pv0002-aprovado.png` | PV-0002 Aprovado (preparado ⛔) |
| 04 | `04-reservar-dialogo.png` | Janela de reserva com o Picking |
| 05 | `05-reserva-parcial.png` | Toast "Estoque reservado." + selo Reserva pendente + 40% |
| 06 | `06-saldo-picking-zero.png` | Picking 12/12/0 na visão Sem disponibilidade |
| 07 | `07-transferencia-concluida.png` | TRF-0001 Concluída |
| 08 | `08-movimentacoes-transferencia.png` | Transferência (saída) e (entrada) |
| 09 | `09-reservado-100.png` | PV-0002 Reservado 100% |
| 10 | `10-saldo-final.png` | Doca 0/0/0 · Picking 62/15/47 |
| 11 | `11-liberar-dialogo.png` | Confirmação de liberação |
| 12 | `12-bruno-sem-liberar.png` | Cabeçalho do pedido reservado para o papel Logística |

## 13. Preparação técnica

| # | Etapa | Endpoint | Usuário | Dados | Resultado esperado |
|---|---|---|---|---|---|
| 1 | Pré-requisito | — | — | Aulas 02–04 concluídas | Doca 50/0/50 · Picking 12/10/2 |
| 2 | Criar o pedido da Ferrovia | `POST /api/sales-orders` | Juliana (`sales_orders.create`) | `{ customerId: <Ferrovia>, expectedDeliveryAt: <sexta>, items: [{ productId: <BAL-08>, description: "Balde plástico 8 L", unit: "UN", quantity: 5, unitPrice: 19.40 }] }` | PV-0002 · Rascunho · R$ 97,00 |
| 3 | Enviar para aprovação | `POST /api/sales-orders/:id/submit` | Juliana (`sales_orders.update`) | — | Aguardando aprovação |
| 4 | Aprovar | `POST /api/sales-orders/:id/approve` | Carlos (`sales_orders.approve`) | — | Aprovado → **gravar as cenas 3–5** (a reserva parcial é feita **ao vivo** pelo Bruno) |
| 5 | Criar a transferência | `POST /api/stock-transfers` | Bruno (`stock.create`) | `{ fromLocationId: <REC-01>, toLocationId: <PCK-A01>, items: [{ productId: <BAL-08>, quantity: 50 }] }` | TRF-0001 · Rascunho |
| 6 | Enviar | `POST /api/stock-transfers/:id/ship` | Bruno (`stock.transfer`) | — | Em trânsito · Transferência (saída) 50 na Doca |
| 7 | Receber | `POST /api/stock-transfers/:id/receive` | Bruno (`stock.transfer`) | — | Concluída · Transferência (entrada) 50 no Picking → **gravar as cenas 6–8** |

- Os passos 2–4 também podiam ser feitos pela tela (enviar e aprovar), mas já foram ensinados na aula 03; aqui eles ficam na preparação para manter o foco no estoque.
- **Opcional (gravar "Em trânsito"):** gravar a lista de Transferências entre os passos 6 e 7 para mostrar o status intermediário na aba "Em trânsito".
- **Irreversível?** Reserva e transferência são movimentos reais. A liberação de reserva **não** é executada na aula. Executar só no ambiente Academy.
- **Confirmar antes da gravação:** que a segunda reserva reserva só as 3 unidades pendentes (comportamento observado nos testes de 02/10) e que o Picking termina em 62/15/47.
- **Sem ambiente limpo:** os números (PV, TRF) seguem a numeração global (B3); se o Picking tiver outros saldos de testes anteriores, usar uma empresa limpa para não confundir a conta.

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "05 · Estoque e WMS" |
| B | Contexto | 0:09–0:45 | Fundo escuro: "Quinta, 7h30" · baldes na doca · pílulas Rafael e Bruno |
| C | Explicação | 0:45–2:45 | Ledger imutável · saldo por local · fórmula animada · planta do armazém |
| D1 | Movimentações | 2:45–4:00 | Tipos, origens, filtro Entrada |
| D2 | Saldo | 4:00–4:50 | Duas linhas; visão Com reserva |
| D3 | Reservar | 4:50–5:40 | Quadro ⛔ PV-0002; diálogo |
| D4 | Reserva parcial | 5:40–7:20 | Toast × selo × indicador; quadro ⚠️ B5; diagnóstico no Saldo |
| D5 | Armazenagem | 7:20–9:00 | Quadro ⛔; Transferências; movimentações de saída e entrada |
| D6 | Completar | 9:00–9:50 | Nova reserva; 100% |
| E | Resultado | 9:50–11:10 | Saldo final 62/15/47 com a conta animada |
| F | Erros | 11:10–14:00 | B5, local sem descrição, Logística sem "Liberar", rótulos técnicos, saldo insuficiente, ledger imutável; liberar reserva (sem executar) |
| — | Mapa do WMS | 14:00–14:40 | Pan pelas telas de consulta |
| G | Exercício | 14:40–15:05 | Tela de exercício |
| H | Fechamento | 15:05–15:25 | 3 linhas → "Próxima aula: Financeiro" → lockup |
