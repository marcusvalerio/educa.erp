# Aula 03 — Comercial

> Plano de produção. Revalidado no código (`2b9112b`) e no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 03 |
| **Título** | Comercial — do pedido do cliente ao pedido aprovado e reservado |
| **Personagens** | **Juliana** (atende o cliente e envia o pedido) · **Carlos** (aprova) · **Rafael** (reserva o estoque) |
| **Papéis reais** | Juliana — **Vendedor** · Carlos — **Gerente** · Rafael — **Operador** |
| **Duração estimada** | 14–16 min |
| **Nível** | Intermediário (fluxo entre papéis) |
| **Cobertura** | 🟡 mista: enviar para aprovação, aprovar e reservar ✅ · consultar orçamentos, pedidos e saldo 🔎 · **criar orçamento e pedido ⛔ (B1)** · pipeline do CRM ⛔ (sem configuração de funil) |
| **Objetivo principal** | Acompanhar um pedido de venda do rascunho até a reserva, entendendo cada status, quem age em cada etapa e por que quem vende não aprova. |

## 2. Contexto de negócio

> Terça-feira, 8h30. A Juliana chega e encontra um e-mail do Granito: o cliente precisa de **10 baldes plásticos de 8 litros** até quinta-feira, para repor o estoque de uma obra no porto de Santos.
>
> Antes de prometer qualquer coisa, a Juliana confere duas coisas: as condições do cliente e se há balde no armazém. Há 12 no Picking. Ela monta a proposta, o cliente aceita e o pedido nasce.
>
> A partir daí, o pedido passa por três mãos: a Juliana envia, o Carlos aprova e o Rafael separa o estoque para ninguém mais vender aqueles baldes.

## 3. O que o aluno vai aprender

- O caminho comercial do ATLAS.ERP: **orçamento → pedido → aprovação → reserva**.
- Ler os **status** do orçamento e do pedido de venda.
- Consultar cliente e saldo **antes** de prometer prazo.
- Ler o detalhe do pedido: cabeçalho, indicadores (Total, Itens, Reservado, Expedido), Informações, Andamento, Itens, Histórico.
- **Enviar para aprovação** (Vendedor) e **Aprovar** (Gerente): segregação de funções.
- **Reservar estoque** e entender o que a reserva faz com o saldo.
- Conferir o resultado em três lugares: pedido, saldo e movimentações.
- O que esta versão **ainda não faz pela tela**: criar orçamento, criar pedido e editar pedido.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | O Comercial registra o que o cliente quer comprar e transforma esse pedido num compromisso da empresa: aprovado, com estoque separado e pronto para seguir para o financeiro, o fiscal e a logística. |
| Por que existe | Sem pedido aprovado, ninguém sabe o que foi prometido. Sem reserva, dois vendedores podem vender o mesmo balde. A aprovação garante que preço, prazo e cliente foram conferidos por alguém além de quem vendeu. |
| Quem executa | Vendedor: registra e envia (orçamento e pedido). Gerente: aprova. Operador ou Logística: reserva o estoque. Financeiro: gera a conta a receber (aula 06). |
| Módulo responsável | Comercial (`/app/comercial`) |
| Quem recebe o resultado | Estoque (a reserva baixa o **disponível**, aula 05) · Financeiro (conta a receber, aula 06) · Fiscal (NF-e, aula 07) · Logística (separação e expedição, aula 08). |

**Segregação de funções** (permissões reais):

| Ação no pedido | Vendedor | Gerente | Operador | Logística | Financeiro |
|---|---|---|---|---|---|
| Ver pedidos | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar (pela API) | ✅ | ✅ | ✅ | — | — |
| Enviar para aprovação | ✅ | ✅ | ✅ | — | — |
| **Aprovar** | — | ✅ | — | — | — |
| **Reservar estoque** | — | ✅ | ✅ | ✅ | — |
| Liberar reserva | ✅ | ✅ | ✅ | — | — |
| Gerar conta a receber | — | ✅ | — | — | ✅ |
| Cancelar pedido | — | ✅ | — | — | — |

Botões sem permissão **não aparecem**.

## 5. Roteiro de navegação

```
PERSONAGEM: Juliana — Vendedor

1. Entrar
   Rota: /login → /app
   Resultado: menu com Comercial, CRM, Estoque (consulta), Relatórios, Produtos e Clientes.

2. Conferir o cliente
   Rota: /app/cadastros/clientes → busca "Granito" → clicar na linha
   Resultado: gaveta com CNPJ, endereço em Santos/SP, Limite de crédito R$ 20.000,00,
   Condição de pagamento 28 dias, Status Ativo.

3. Conferir o estoque
   Rota: /app/logistica/estoque (Saldo de estoque) → busca "Balde"
   Resultado: Balde plástico 8 L · Picking — rua A, módulo 01 · Em estoque 12 ·
   Reservado 0 · Disponível 12.

4. ⛔ Orçamento ORC-0001 — preparado fora da interface
   Quadro: "Nesta versão, o orçamento não é criado pela tela. Ele foi registrado por
   integração (API) pela Juliana e aprovado pelo Carlos quando o cliente aceitou."
   Rota: /app/comercial/orcamentos
   Tela: "Orçamentos — Propostas de venda enviadas a clientes, do rascunho à aprovação
   ou expiração." Abas: Validade vencida, Aguardando cliente.
   Resultado: ORC-0001 · Granito Serviços OD Ltda. · Emissão (terça) · Validade (+7 dias)
   · Total R$ 194,00 · Aprovado.

5. ⛔ Pedido PV-0001 — gerado do orçamento, fora da interface
   Rota: /app/comercial/pedidos-venda
   Tela: "Pedidos de venda — Pedidos confirmados com clientes — da aprovação à expedição
   e conclusão." Abas: Entrega atrasada, Aguardando aprovação, Em andamento.
   Resultado: PV-0001 · Granito · Data (terça) · Entrega prevista (quinta) ·
   Total R$ 194,00 · Rascunho.

6. Ler o detalhe do pedido
   Ação: clicar em PV-0001 → /app/comercial/pedidos-venda/:id
   Resultado:
     Cabeçalho     PV-0001 · Granito Serviços OD Ltda. · selo Rascunho ·
                   "Emitido em …" · "Entrega prevista …" · botão "Enviar para aprovação"
     Indicadores   Total do pedido R$ 194,00 (Itens R$ 194,00 · frete R$ 0,00 · desconto R$ 0,00)
                   Itens 1 (10 unidade(s) pedidas) · Reservado 0% (0 de 10) · Expedido 0% (0 de 10)
     Informações   Cliente, Data do pedido, Entrega prevista, Endereço de entrega, CEP,
                   Documento fiscal "—", Chave de acesso "—", Observações
     Andamento     Reserva 0% · Expedição 0%
     Itens         Balde plástico 8 L · Un. · Pedida 10 · Reservada 0 · Expedida 0 ·
                   Preço unit. R$ 19,40 · Total R$ 194,00
     Histórico     "O histórico de alterações exige a permissão de auditoria."
                   (o Vendedor não tem acesso à auditoria)

7. Enviar para aprovação
   Ação: Enviar para aprovação
   Confirmação: "O pedido segue para aprovação e deixa de ser editável como rascunho."
   Ação: Enviar para aprovação (no diálogo)
   Resultado: toast "Pedido enviado para aprovação."; selo "Aguardando aprovação".
   Repare: a Juliana não vê "Aprovar".

PERSONAGEM: Carlos — Gerente

8. Encontrar o que espera por ele
   Rota: /app/comercial/pedidos-venda → aba "Aguardando aprovação"
   Resultado: PV-0001.

9. Aprovar
   Ação: abrir PV-0001 → conferir cliente, itens, preço (R$ 19,40, acima do mínimo
   R$ 17,00 do cadastro) e total → Aprovar
   Confirmação: "Aprovar libera o pedido para reserva de estoque."
   Resultado: toast "Pedido aprovado."; selo "Aprovado". Botões agora visíveis para o
   Carlos: Reservar estoque, Gerar conta a receber, Cancelar pedido.
   (O Carlos não gera a conta a receber agora: é tarefa da Fernanda, aula 06.)

PERSONAGEM: Rafael — Operador

10. Reservar o estoque
    Rota: /app/comercial/pedidos-venda → aba "Em andamento" → PV-0001
    Ação: Reservar estoque
    Janela: "Reservar estoque — Reserva as quantidades pendentes do pedido no local
    escolhido. Itens sem saldo ficam com reserva pendente."
    Dados: Local de estoque* → "Picking — rua A, módulo 01"
    Ação: Reservar
    Resultado: toast "Estoque reservado."; selo "Reservado"; indicador Reservado 100%
    (10 de 10); Andamento Reserva 100%; Itens: Reservada 10.

11. Conferir no estoque
    Rota: /app/logistica/estoque
    Resultado: Balde plástico 8 L · Picking — rua A, módulo 01 · Em estoque 12 ·
    Reservado 10 · Disponível 2. Aba "Com reserva" mostra a linha.
    Rota: /app/logistica/movimentacoes
    Resultado: nova linha · Tipo "RESERVATION" · Balde plástico 8 L · Picking — rua A,
    módulo 01 · 10 · Origem "stock_reservation" (rótulos técnicos — ver seção 9).

PERSONAGEM: Carlos — Gerente

12. Conferir o histórico
    Rota: PV-0001 → Histórico
    Resultado: "Aprovação" (Carlos) e "Reserva" (Rafael), com data e hora.
    O envio para aprovação e a criação não aparecem (⚠️ B7).

13. Caso realista: o cliente quer mudar a quantidade
    Situação: às 11h, o Granito pede 12 em vez de 10.
    Ação: Cancelar pedido → mostrar a confirmação "O cancelamento libera reservas e não
    pode ser desfeito." → fechar com "Cancelar" (sem executar).
    Explicação: não há edição de pedido pela tela; o caminho é um pedido complementar
    ou cancelar e gerar um novo, e os dois exigem criar pedido (⛔). Nesta aula, o
    PV-0001 segue com 10 unidades.
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Menu da Juliana | Tela cheia; zoom no menu lateral | Callout "O Vendedor vê só o que usa" | 2 s |
| Cliente | Gaveta; zoom em Condições comerciais | Anel em Limite de crédito e Condição de pagamento | 2 s |
| Saldo | Zoom 1,4× na linha do balde | Três colunas destacadas em sequência: Em estoque, Reservado, Disponível | 1,5 s em cada |
| Quadro ⛔ orçamento | Fundo escuro translúcido sobre a lista de orçamentos | Selo ⛔ + texto do quadro | 3 s → corte para a lista real |
| Lista de orçamentos | Zoom na linha ORC-0001; selo "Aprovado" | Stepper Rascunho → Enviado → **Aprovado** | 1,5 s no selo |
| Quadro ⛔ pedido | Igual ao do orçamento | — | 3 s |
| Detalhe do pedido | Tela cheia → zoom nos indicadores → desce para Informações, Andamento, Itens, Histórico | Callouts: **Reservado** ("o indicador que você vai conferir sempre"), **Andamento**, **Histórico** (mensagem de permissão) | 2 s em cada bloco |
| Enviar | Zoom no botão → diálogo → toast → selo | Stepper avança para **Aguardando aprovação** | toast 2,5 s; selo 1,5 s |
| Troca para Carlos | Pílula de personagem | — | — |
| Aba "Aguardando aprovação" | Zoom na aba e na linha | — | 1,5 s |
| Aprovar | Zoom no preço unitário e no total antes do clique | Callout "Preço acima do mínimo do cadastro (R$ 17,00)" | diálogo 2 s → toast 2,5 s |
| Botões após aprovação | Zoom no cabeçalho | Rótulos: Reservar estoque · Gerar conta a receber · Cancelar pedido | 2 s |
| Troca para Rafael | Pílula | — | — |
| Reservar | Diálogo centralizado; lista de locais aberta | Callout no texto "Itens sem saldo ficam com reserva pendente" | 2 s no texto; toast 2,5 s |
| Resultado da reserva | Zoom no indicador Reservado 100% e na coluna Reservada | Stepper avança para **Reservado** | 2 s |
| Saldo depois | Lado a lado (motion): antes 12/0/12 → depois 12/10/2 | Fórmula "em estoque − reservado = disponível" | 3 s |
| Movimentações | Zoom na nova linha | Selo ⚠️ "rótulo técnico" | 2 s |
| Histórico | Zoom nas duas linhas | Anel no autor | 2 s |
| Cancelar (sem executar) | Diálogo vermelho | Callout "Cancelar fecha a janela · Cancelar pedido executa" | 2,5 s |

Transições: o stepper do pedido (Rascunho → Aguardando aprovação → Aprovado → Reservado) fica no topo da tela, discreto, durante toda a demonstração e avança a cada etapa.

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula três: Comercial.

**[B — Contexto]**
Terça-feira, oito e meia. O Granito precisa de dez baldes de oito litros até quinta. A Juliana, vendedora da Órbita, vai cuidar desse pedido. Mas, antes de prometer, ela confere duas coisas.

**[C — Explicação]**
O Comercial transforma o que o cliente quer num compromisso da empresa. O caminho tem quatro passos: o orçamento, que é a proposta; o pedido, quando o cliente aceita; a aprovação, feita por um gerente; e a reserva, que separa o estoque para aquele cliente. Repare que três pessoas participam. Quem vende não aprova o próprio pedido: é a segregação de funções. E quem reserva é quem cuida do armazém.

**[D1 — Cliente e saldo]**
Primeiro, o cliente. No cadastro do Granito, a Juliana vê o limite de crédito e a condição de pagamento: vinte e oito dias. Depois, o estoque. No saldo, o balde de oito litros tem doze unidades no picking, nenhuma reservada. Doze disponíveis. Dá para atender.

**[D2 — Orçamento e pedido]**
Agora, uma observação importante sobre esta versão. O orçamento e o pedido ainda não são criados pela tela. Eles foram registrados por integração: a Juliana montou a proposta de dez baldes a dezenove reais e quarenta, o cliente aceitou e o Carlos registrou a aprovação. Veja o resultado: o orçamento ORC zero zero zero um está aprovado. E dele nasceu o pedido PV zero zero zero um, em rascunho.

**[D3 — O detalhe do pedido]**
Abra o pedido. No topo, o número, o cliente e o status. Logo abaixo, quatro indicadores: o total, os itens, quanto já foi reservado e quanto já foi expedido. Guarde o indicador Reservado: você vai conferi-lo sempre. Mais abaixo, as informações de entrega, o andamento e os itens. O histórico pede permissão de auditoria, que o papel de vendedor não tem.

**[D4 — Enviar]**
A Juliana confere os itens e o total. Está tudo certo. Ela clica em Enviar para aprovação. O sistema avisa: o pedido deixa de ser um rascunho. Pronto: aguardando aprovação. E repare: não existe um botão de aprovar para ela.

**[D5 — Aprovar]**
Agora é o Carlos. Na lista de pedidos, a aba Aguardando aprovação mostra o que espera por ele. Ele abre o pedido e confere o preço: dezenove e quarenta, acima do mínimo de dezessete do cadastro. Aprova. O pedido está liberado para a reserva de estoque. Novos botões aparecem para ele: reservar, gerar a conta a receber e cancelar.

**[D6 — Reservar]**
Quem reserva é o Rafael, do armazém. Ele clica em Reservar estoque e escolhe o local onde os baldes estão: o picking da rua A. A reserva vale para as quantidades pendentes. Se faltasse saldo, o item ficaria com reserva pendente. Reservado. O indicador mostra cem por cento.

**[E — Resultado]**
O que mudou no estoque? Os doze baldes continuam no armazém: o em estoque não muda. Mas dez estão reservados para o Granito. Por isso, o disponível caiu para dois. Nas movimentações, a reserva aparece como uma nova linha. E, no histórico do pedido, o Carlos encontra quem aprovou e quem reservou.

**[F — Erros e exceções]**
Alguns cuidados. Se você reservar sem escolher o local, o sistema pede: selecione o local de onde reservar. Escolha o local onde o produto está, porque o saldo é por local. Atenção a um comportamento desta versão: quando falta saldo, a mensagem também diz "estoque reservado", mesmo que a reserva tenha sido parcial. Por isso, confira sempre o indicador Reservado e o status do pedido. Pedidos feitos à noite podem aparecer com a data do dia seguinte. E, se o cliente mudar a quantidade, não há edição de pedido pela tela. Repare na janela de cancelamento: o botão Cancelar só fecha a janela; Cancelar pedido executa, e não pode ser desfeito.

**[G — Exercício]**
Sua vez. Encontre um pedido aguardando aprovação, leia os indicadores e diga, só olhando a tela: quem pode aprovar, quem pode reservar e quanto do pedido já foi reservado.

**[H — Fechamento]**
Resumindo: a Juliana enviou, o Carlos aprovou e o Rafael reservou. O pedido agora é um compromisso, e o estoque já sabe disso. Na próxima aula, o Rafael percebe que o estoque de baldes ficou baixo, e começa uma compra.

## 8. Estados e fluxo

```
ORÇAMENTO
Rascunho ──► Enviado ──► Aprovado ──► (gera pedido)
                   └──► Recusado · Expirado        Cancelado (antes de aprovado)

PEDIDO DE VENDA
Rascunho ──(Enviar para aprovação ✅ Vendedor)──► Aguardando aprovação
         ──(Aprovar ✅ Gerente)──► Aprovado
         ──(Reservar estoque ✅ Operador/Logística/Gerente)──► Reservado
                                                         └──► Reserva pendente (saldo insuficiente)
         ──► Em separação ──► Pronto p/ expedir ──► Expedido parcial / Expedido ──► Concluído (⚠️ B11)
Cancelado: a partir de Rascunho, Aguardando aprovação, Aprovado, Reserva pendente ou Reservado (Gerente)
Liberar reserva: Reservado / Reserva pendente ──► Aprovado
```

**Fluxo entre módulos:**

```
COMERCIAL (pedido aprovado)
   ├──► ESTOQUE: reserva → disponível cai (aula 05)
   ├──► FINANCEIRO: Gerar conta a receber (aula 06)
   ├──► FISCAL: NF-e do pedido ⛔ (aula 07)
   └──► LOGÍSTICA: separação e expedição ⛔ (aula 08)
```

**Entrada:** cliente e produto cadastrados (aula 02); saldo de 12 no Picking (⛔ aula 02).
**Processamento:** orçamento ⛔ → pedido ⛔ → envio ✅ → aprovação ✅ → reserva ✅.
**Resultado:** PV-0001 **Reservado** (10 de 10); Picking: em estoque 12, reservado 10, disponível 2.
**Segue para:** Compras (aula 04: o disponível 2 está abaixo do mínimo 20).

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Criar orçamento ou pedido | — (não há botão "Novo") | ⛔ Criação só pela API | O vendedor depende de integração | Listas sem botão de criação | Registrar por integração; a aula mostra o resultado | ⚠️ **B1** |
| Vendedor procura "Aprovar" | — (botão ausente) | Sem `sales_orders.approve` (segregação) | — | Cabeçalho só com "Enviar para aprovação" | O Gerente aprova | não (regra) |
| Vendedor abre Contas a pagar | "Sem acesso a este recurso" | Fora do papel | — | Tela de acesso negado | Pedir ao administrador, se fizer sentido | não |
| Reservar sem local | "Selecione o local de onde reservar." | Campo obrigatório | Não reserva | Mensagem sob o campo | Escolher o local | não |
| Reservar num local sem o produto | Toast "Estoque reservado.", mas Reservado fica abaixo de 100% e o status vira "Reserva pendente" | O saldo é por local; a mensagem não confere o resultado | Pedido não totalmente reservado | Indicador **Reservado** e selo **Reserva pendente** | Ver no Saldo onde o produto está e reservar de novo (o botão continua disponível) | ⚠️ **B5** |
| Histórico do pedido para o Vendedor | "O histórico de alterações exige a permissão de auditoria." | Sem `audit_logs.read` | Não vê quem aprovou | Mensagem no bloco | Perguntar ao Gerente | não (regra) |
| Histórico sem criação e envio | — (só Aprovação, Reserva, Liberação, Cancelamento) | A auditoria não registra criação nem envio | Lacuna de rastreio | Comparar com a linha do tempo do pedido | Débito registrado (aula 09) | ⚠️ **B7** |
| Movimentação da reserva com rótulo técnico | Tipo "RESERVATION", Origem "stock_reservation" | Tipos de reserva sem tradução na tela | Leitura difícil | Coluna Tipo | Ler como "Reserva" | ⚠️ D5 (novo) |
| Item com "Un." vazio ou "—" | — | O item do pedido não herda a unidade do produto | Leitura da unidade | Coluna Un. | Débito registrado | ⚠️ **B18** (confirmar na preparação) |
| Pedido criado à noite | Data do dia seguinte | Datas gravadas em UTC | Relatórios do dia | Coluna Data | Gravar antes das 21h | ⚠️ **B4** |
| Número do documento "pula" | Ex.: PV-0224 em vez de PV-0001 | Numeração global entre empresas | Estética | Coluna Pedido | Ambiente limpo para a gravação | ⚠️ **B3** |
| Cliente quer mudar a quantidade | — | Não há edição de pedido pela tela | Precisa de um novo pedido | — | Pedido complementar ou cancelar e recriar (⛔ criação) | ⛔ |
| Limite de crédito ultrapassado | — (nenhum aviso) | O limite é informativo: o pedido não o verifica | Risco de crédito | Comparar total × limite no cadastro | Conferência manual do Gerente | ⚠️ limitação |
| Diálogo de cancelamento | Botões "Cancelar" e "Cancelar pedido" | "Cancelar" fecha; "Cancelar pedido" executa | Risco de confusão | Diálogo vermelho | Ler o botão antes de clicar | ⚠️ usabilidade |
| Vendedor pode liberar reserva | Botão "Liberar reserva" visível para a Juliana | `sales_orders.update` cobre a liberação | Segregação fraca | Cabeçalho do pedido reservado | Avaliar o papel (aula 10) | ⚠️ observação |
| Funil do CRM | — | Nenhum pipeline/estágio configurado na empresa nova; não há tela para criá-los | Pipeline vazio | `/app/crm/pipeline` sem colunas | Fora do escopo desta aula | ⛔ |

## 10. Exercício prático

1. Entre como Vendedor e encontre um pedido em **Aguardando aprovação**. Abra e leia os quatro indicadores.
2. Responda só pela tela: quem pode aprovar? Quem pode reservar? Por que a Juliana não vê o histórico?
3. Entre como Gerente, aprove o pedido e confira os botões que aparecem.
4. Entre como Operador, reserve no local onde o produto **não** está. Leia a mensagem, confira o indicador Reservado e o status. Depois, reserve no local certo.
5. No Saldo de estoque, explique por que o **em estoque** não mudou e o **disponível** caiu.

## 11. Checklist de conclusão

- [ ] Sei o caminho orçamento → pedido → aprovação → reserva.
- [ ] Leio os status do orçamento e do pedido.
- [ ] Confiro cliente e saldo antes de prometer prazo.
- [ ] Sei ler os indicadores e o andamento do pedido.
- [ ] Enviei para aprovação (Vendedor) e aprovei (Gerente).
- [ ] Reservei estoque e conferi o indicador Reservado, não só a mensagem.
- [ ] Sei explicar em estoque × reservado × disponível.
- [ ] Sei o que esta versão não faz pela tela (criar e editar orçamento e pedido).

## 12. Evidências

Salvar em `docs/academy/03-comercial/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-menu-vendedor.png` | Menus do Vendedor |
| 02 | `02-saldo-antes.png` | BAL-08 no Picking: 12 / 0 / 12 |
| 03 | `03-orcamento-aprovado.png` | ORC-0001 Aprovado (preparado ⛔) |
| 04 | `04-pedido-rascunho.png` | PV-0001 Rascunho na lista |
| 05 | `05-detalhe-rascunho.png` | Indicadores, Andamento, Itens |
| 06 | `06-historico-sem-permissao.png` | Mensagem de permissão de auditoria |
| 07 | `07-enviado.png` | "Pedido enviado para aprovação." |
| 08 | `08-aba-aguardando.png` | Aba "Aguardando aprovação" do Carlos |
| 09 | `09-aprovado.png` | "Pedido aprovado." e novos botões |
| 10 | `10-reservar-dialogo.png` | Janela "Reservar estoque" |
| 11 | `11-reservado-100.png` | Reservado 100% (10 de 10) |
| 12 | `12-saldo-depois.png` | 12 / 10 / 2 |
| 13 | `13-movimentacao-reserva.png` | RESERVATION · stock_reservation |
| 14 | `14-historico-carlos.png` | Aprovação e Reserva com autores |
| 15 | `15-cancelar-dialogo.png` | Confirmação de cancelamento |

## 13. Preparação técnica

Todas as etapas ⛔ são feitas **fora da gravação**, cada uma com a conta do papel correto, e anunciadas no vídeo pelo quadro "Preparado fora da interface".

| # | Etapa | Endpoint | Usuário | Dados | Resultado esperado |
|---|---|---|---|---|---|
| 1 | Pré-requisito | — | — | Aula 02 concluída, com o saldo de implantação de 12 × BAL-08 em PCK-A01 | Saldo 12 / 0 / 12 |
| 2 | Criar o orçamento | `POST /api/sales-quotes` | Juliana (`sales_quotes.create`) | `{ customerId: <Granito>, validUntil: <terça + 7>, notes: "Reposição de baldes — obra no porto", items: [{ productId: <BAL-08>, description: "Balde plástico 8 L", unit: "UN", quantity: 10, unitPrice: 19.40 }] }` | ORC-0001 · Rascunho · R$ 194,00 |
| 3 | Enviar ao cliente | `POST /api/sales-quotes/:id/send` | Juliana (`sales_quotes.update`) | — | Enviado |
| 4 | Registrar o aceite | `POST /api/sales-quotes/:id/approve` | Carlos (`sales_quotes.approve`) | — | Aprovado |
| 5 | Gerar o pedido | `POST /api/sales-orders` | Juliana (`sales_orders.create`) | `{ customerId: <Granito>, salesQuoteId: <ORC-0001>, expectedDeliveryAt: <quinta> }` (itens copiados do orçamento) | PV-0001 · Rascunho · R$ 194,00 |
| 6 | Conferir B18 | — | — | Abrir o PV-0001 | Registrar se a coluna Un. mostra "UN" ou "—" e ajustar a narração |

- **Ações ao vivo** (na gravação): enviar (Juliana), aprovar (Carlos), reservar (Rafael). Não preparar nada disso antes.
- **Irreversível?** A aprovação e a reserva são registros reais; o cancelamento **não** é executado na aula. Executar só no ambiente Academy.
- **Horário:** gravar antes das 21h (B4).
- **Sem ambiente limpo:** os números (ORC, PV) seguem a numeração global (B3); o roteiro usa "o orçamento do Granito" e "o pedido do Granito" na narração se os números não forem 0001.

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "03 · Comercial" |
| B | Contexto | 0:09–0:40 | Fundo escuro: "Terça, 8h30" · e-mail do Granito · pílula Juliana/Vendedor |
| C | Explicação | 0:40–1:50 | Stepper orçamento → pedido → aprovação → reserva; quadro de segregação |
| D1 | Cliente e saldo | 1:50–2:50 | Gaveta do cliente; Saldo 12/0/12 |
| D2 | Orçamento e pedido ⛔ | 2:50–3:50 | Dois quadros ⛔ e as listas reais |
| D3 | Detalhe | 3:50–5:20 | Indicadores, Informações, Andamento, Itens, Histórico |
| D4 | Enviar | 5:20–6:10 | Juliana envia; sem "Aprovar" |
| D5 | Aprovar | 6:10–7:30 | Carlos: aba Aguardando aprovação, conferência, aprovação |
| D6 | Reservar | 7:30–8:50 | Rafael: diálogo, local, Reservado 100% |
| E | Resultado | 8:50–10:20 | Saldo antes/depois, movimentação, histórico |
| F | Erros | 10:20–13:30 | Sem local, B5, B4, B7, rótulos técnicos, sem edição de pedido, diálogo de cancelamento |
| G | Exercício | 13:30–13:55 | Tela de exercício |
| H | Fechamento | 13:55–14:15 | 3 linhas de resumo → "Próxima aula: Compras" → lockup |
