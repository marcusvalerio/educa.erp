# Aula 06 — Financeiro

> Plano de produção. Validado no código (`48775f5`) e ao vivo no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 06 |
| **Título** | Financeiro — do pedido aprovado ao título, e do título ao caixa |
| **Personagem** | **Fernanda** |
| **Papel real** | **Financeiro** (papel personalizado, criado pela Ana na aula 10) |
| **Coadjuvante** | **Juliana** (Vendedor), só para mostrar o acesso negado |
| **Duração estimada** | 11–13 min |
| **Nível** | Intermediário |
| **Cobertura** | 🟡 mista: **Gerar conta a receber** ✅ (no pedido) · contas a receber, contas a pagar, fluxo de caixa e centros de custo 🔎 · baixa, pagamento, contas financeiras e títulos avulsos ⛔ · ⚠️ D9 (o vencimento depende da condição de pagamento do pedido) · ⚠️ B6/D11 (cartão de erro no Início) |
| **Objetivo principal** | Transformar as vendas aprovadas em contas a receber, acompanhar o que entra e o que sai, ler o fluxo de caixa e saber o que esta versão ainda faz só por integração (baixa e pagamento). |

> **Atualização pós-estabilização — rodada de teste com 48 usuários em 7 empresas (02/10/2026).** (1) **B6/D11 corrigido:** o Início dos papéis personalizados não mostra mais "Não foi possível carregar o relatório executivo"; o bloco executivo só aparece para quem tem `reports.view` **e** `controlling.view`. (2) 🔴 **R48-01 aberto:** gerar a conta a receber do mesmo pedido **duas vezes ao mesmo tempo** (duplo clique ou duas pessoas) cria **dois títulos**. Na gravação: clicar **uma vez** e aguardar o toast. Em sequência continua seguro ("devolve o título existente"). (3) Baixa duplicada de parcela (duas pessoas ou duplo clique) **não** duplica: o segundo recebe "Parcela no status PAID não pode receber pagamentos."
> Vale para a build da branch `claude/e2e-empresa-nova-correcoes` (commits `3ca2878`, `081edc1` e seguinte); **enquanto não houver merge, produção continua com o comportamento anterior** — grave na build corrigida. Detalhes em [`RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md`](../../homologacao/RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md).

## 2. Contexto de negócio

> Quinta-feira, 14h. A semana da Órbita já tem movimento: o Granito e a Ferrovia têm pedidos aprovados e reservados, e a compra da Polar chegou de manhã.
>
> A Fernanda cuida do dinheiro. Para ela, um pedido aprovado ainda não é dinheiro: é uma promessa. Ela precisa registrar o que cada cliente vai pagar e quando, conferir o que a empresa deve à Polar e olhar o caixa das próximas semanas.
>
> No meio da tarde, a Ferrovia avisa que pagou o pedido por PIX, adiantado.

## 3. O que o aluno vai aprender

- A diferença entre **pedido aprovado**, **título a receber** e **dinheiro recebido**.
- **Gerar conta a receber** a partir do pedido e entender de onde vêm o valor e o vencimento.
- Ler **Contas a receber** e **Contas a pagar**: abas, colunas, status e vencidos.
- Ler o **Fluxo de caixa**: saldo em contas, a receber, a pagar e projeção por semana.
- Entender por que a conta a pagar da Polar nasceu do **recebimento**, e não do pedido de compra.
- O que é **baixa** e por que, nesta versão, ela é feita por integração.
- Por que o Vendedor não vê o Financeiro (segregação).

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | O registro de tudo o que a empresa tem a receber e a pagar, com vencimento e situação, e a visão do caixa que resulta disso. |
| Por que existe | Vender e comprar não é o mesmo que receber e pagar. O Financeiro transforma cada venda e cada compra em um título com data, acompanha a liquidação e mostra se o caixa aguenta as próximas semanas. |
| Quem executa | **Financeiro** (e Gerente): gera títulos a partir de pedidos e recebimentos, registra baixas e pagamentos. O Operador consulta e cria títulos (⚠️ B9). O Vendedor não acessa. |
| Módulo responsável | Financeiro (`/app/financeiro`) + ação no pedido (`/app/comercial/pedidos-venda/:id`) |
| Quem recebe o resultado | Controladoria (relatórios), Gerência (painéis) e o próprio Comercial, que vê no pedido o bloco **Financeiro** com os títulos gerados. |

**Três momentos do dinheiro** (quadro da cena C):

```
PEDIDO APROVADO ──(Gerar conta a receber ✅)──► TÍTULO EM ABERTO ──(baixa ⛔)──► RECEBIDO
RECEBIMENTO CONFIRMADO ──(gerar conta a pagar ⛔)──► TÍTULO EM ABERTO ──(pagamento ⛔)──► PAGO
```

**De onde vem o vencimento** (D9): da **condição de pagamento do pedido** (ex.: "28 dias" = uma parcela de 100% a 28 dias). Nesta versão, essa condição é um cadastro sem tela; o campo "Condição de pagamento" do cliente é só informativo. Sem condição no pedido, o título nasce com uma parcela vencendo no próprio dia.

**Quem pode o quê** (permissões reais):

| Ação | Financeiro | Gerente | Operador | Vendedor |
|---|---|---|---|---|
| Ver contas a receber e a pagar, fluxo de caixa | ✅ | ✅ | ✅ | — |
| **Gerar conta a receber** do pedido | ✅ | ✅ | — | — |
| Gerar conta a pagar do recebimento (API) | ✅ | ✅ | — | — |
| Baixa / pagamento (API) | ✅ | ✅ | criar ⚠️ | — |
| Cancelar título / estornar pagamento (API) | ✅ | ✅ | — | — |

## 5. Roteiro de navegação

```
PERSONAGEM: Fernanda — Financeiro · quinta, 14h

1. Entrar
   Rota: /login → /app
   Resultado: Início com o menu do papel: Painéis (Executivo, Financeiro), Pedidos de
   venda, Financeiro (Contas a pagar, Contas a receber, Fluxo de caixa, Centros de custo),
   Relatórios e cadastros em consulta.
   ✅ B6/D11 (corrigido na rodada 48): o Início do papel Financeiro não mostra mais os
   cartões "Resumo" e "O que mudou" do relatório executivo (o papel não tem a
   controladoria); "Precisa de atenção", "Seu foco" e "Fluxo do ERP" aparecem normalmente.

2. Painel do Financeiro
   Rota: /app/financeiro
   Tela: "Financeiro — Contas a pagar e a receber, fluxo de caixa e centros de custo."
   Resultado: "Painel da área" (Saldo em caixa, Recebido no período, Pago no período,
   Recebíveis vencidos) · "Pendências do módulo" · "Títulos a receber recentes".
   Antes da aula: nenhum título a receber; Saldo em caixa = saldo inicial da conta
   (⛔ preparação).

3. Gerar a conta a receber do Granito
   Rota: Comercial → Pedidos de venda → PV-0001
   Resultado: pedido "Reservado"; para a Fernanda o cabeçalho mostra só
   "Gerar conta a receber" (ela não reserva, não aprova, não cancela).
   Ação: Gerar conta a receber
   Confirmação: "Gera o título a receber a partir do valor do pedido e das condições de
   pagamento." → Gerar conta a receber
   Resultado: toast "Conta a receber gerada."; bloco "Financeiro — Títulos a receber
   originados deste pedido." com CR-0001 · vencimento quinta + 28 dias · R$ 194,00 ·
   Em aberto.

4. Repetir para a Ferrovia
   Rota: PV-0002 → Gerar conta a receber
   Resultado: CR-0002 · vencimento quinta + 30 dias · R$ 97,00 · Em aberto.

5. Contas a receber
   Rota: /app/financeiro/contas-receber
   Tela: "Contas a receber — Títulos a receber de clientes, do lançamento à liquidação."
   Abas: Todos, Vencidos, Em aberto. Colunas: Título, Descrição, Cliente, Vencimento,
   Valor, Status.
   Resultado: CR-0001 "Pedido de venda PV-0001" Granito · CR-0002 "Pedido de venda
   PV-0002" Ferrovia.

6. Contas a pagar
   Rota: /app/financeiro/contas-pagar
   Tela: "Contas a pagar — Títulos a pagar a fornecedores, do lançamento à liquidação."
   Resultado: CP-0001 · "Recebimento REC-0001" · Polar · vencimento (+28 dias) ·
   R$ 490,00 · Em aberto. Origem: o recebimento confirmado da aula 04 (⛔ gerado na
   preparação pela própria Fernanda).

7. Fluxo de caixa
   Rota: /app/financeiro/fluxo-caixa
   Tela: "Fluxo de caixa — Saldo das contas financeiras e projeção pelos vencimentos dos
   títulos em aberto."
   Resultado: Saldo em contas · A receber em aberto R$ 291,00 · A pagar em aberto
   R$ 490,00 · Saldo projetado ("Após liquidar todos os títulos") · "Saldo acumulado por
   semana" (Gráfico/Tabela) · "Projeção por semana" (Período, Entradas, Saídas, Saldo
   acumulado).

8. ⛔ Caso realista: a Ferrovia pagou por PIX
   Quadro: "Nesta versão, a baixa do título não tem tela. Foi registrada por integração
   pela Fernanda."
   Resultado: CR-0002 "Recebido"; Fluxo de caixa: Saldo em contas +R$ 97,00, A receber em
   aberto R$ 194,00; painel: "Recebido no período" R$ 97,00.
   No pedido PV-0002, o bloco Financeiro mostra o título "Recebido".

9. Centros de custo (consulta)
   Rota: /app/financeiro/centro-custos
   Resultado: "Nenhum registro ainda" (cadastro sem tela; citado, não usado na história).

PERSONAGEM: Juliana — Vendedor

10. A fronteira
    Ação: Juliana abre /app/financeiro/contas-receber
    Resultado: "Sem acesso a este recurso — Seu perfil não tem a permissão necessária
    para esta área."
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Início da Fernanda | Tela cheia; zoom no cartão de erro | Selo ⚠️ B6 "cartão do painel executivo sem permissão" | 2,5 s |
| Painel do Financeiro | Pan pelos quatro indicadores | Rótulo "O saldo vem das contas financeiras" | 2 s |
| Três momentos | Fundo escuro; trilho Pedido → Título → Recebido | Nó "baixa" tracejado (⛔) | 5 s |
| Pedido PV-0001 | Zoom no cabeçalho com um único botão | Callout "Cada papel vê só a sua ação" | 1,5 s |
| Confirmação | Diálogo | Sublinhar "condições de pagamento" | 2 s |
| Bloco Financeiro do pedido | Zoom na linha CR-0001 | Callout "Vencimento = condição do pedido (28 dias)" + selo ⚠️ D9 | 3 s |
| Contas a receber | Zoom nas abas e nas colunas Vencimento e Status | — | 2 s |
| Contas a pagar | Zoom na descrição "Recebimento REC-0001" | Callout "Nasce do que foi recebido" | 2,5 s |
| Fluxo de caixa | Quatro números → gráfico → tabela | Fórmula saldo + a receber − a pagar = projetado | 4 s |
| Quadro ⛔ baixa | Translúcido | — | 3 s |
| Depois da baixa | Status "Recebido" e saldo em contas | Motion +R$ 97,00 | 2,5 s |
| Juliana | Corte seco | Tela "Sem acesso a este recurso" | 2,5 s |

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula seis: Financeiro.

**[B — Contexto]**
Quinta-feira, duas da tarde. A Órbita vendeu para o Granito e para a Ferrovia, e recebeu a compra da Polar. A Fernanda, do financeiro, precisa transformar tudo isso em datas e valores.

**[C — Explicação]**
No financeiro, o dinheiro passa por três momentos. O pedido aprovado é uma promessa. O título a receber é a promessa com valor e vencimento. E o recebimento é o dinheiro de fato no caixa. Com as compras é igual: o recebimento da mercadoria gera o título a pagar, e o pagamento liquida o título. Repare num detalhe: a conta a pagar nasce do que foi recebido, não do que foi pedido.

**[D1 — O Início]**
A Fernanda entra. O papel dela é personalizado e vê só o financeiro e os pedidos de venda. Nesta versão, o cartão de resumo do Início mostra uma mensagem de falta de permissão. É uma limitação conhecida: o resto da tela funciona normalmente.

**[D2 — Gerar a conta a receber]**
No pedido do Granito, o único botão que a Fernanda vê é Gerar conta a receber. O sistema avisa: o título nasce do valor do pedido e das condições de pagamento. Pronto. O título CR zero zero zero um aparece no próprio pedido: cento e noventa e quatro reais, vencendo em vinte e oito dias. Esse prazo vem da condição de pagamento do pedido. Nesta versão, essa condição é cadastrada por integração; o campo do cadastro do cliente é só informativo. A Fernanda faz o mesmo com o pedido da Ferrovia.

**[D3 — Contas a receber e a pagar]**
Em Contas a receber, cada título mostra a descrição, o cliente, o vencimento, o valor e o status. As abas separam os vencidos e os em aberto. Em Contas a pagar, está a conta da Polar: quatrocentos e noventa reais, com a descrição do recebimento que a originou.

**[D4 — Fluxo de caixa]**
O fluxo de caixa junta tudo. O saldo em contas é o que a empresa tem hoje. Somando o que tem a receber e subtraindo o que tem a pagar, chega-se ao saldo projetado. A tabela mostra, semana a semana, quando cada entrada e cada saída deve acontecer.

**[E — Resultado]**
No meio da tarde, a Ferrovia avisa que pagou por PIX. Nesta versão, a baixa do título é registrada por integração. Veja o efeito: o título da Ferrovia está recebido, o saldo em contas subiu noventa e sete reais e o a receber em aberto caiu para cento e noventa e quatro.

**[F — Erros e exceções]**
Alguns cuidados. O botão de gerar a conta a receber só aparece para pedidos aprovados e para quem tem a permissão do financeiro. Se você clicar de novo, o sistema não duplica o título: devolve o mesmo. Se o pedido não tiver condição de pagamento, o título vence no mesmo dia; confira sempre a coluna Vencimento. E a Juliana, vendedora, não acessa o financeiro: quem vende não controla o que recebe.

**[G — Exercício]**
Sua vez. Gere a conta a receber de um pedido aprovado, encontre o título em Contas a receber e explique de onde veio o vencimento. Depois, no fluxo de caixa, encontre em que semana esse valor entra.

**[H — Fechamento]**
Resumindo: o pedido vira título, o título vira caixa, e a compra vira conta a pagar a partir do recebimento. Na próxima aula, o Lucas prepara a nota fiscal do pedido do Granito.

## 8. Estados e fluxo

```
CONTA A RECEBER / A PAGAR
Em aberto ──(baixa parcial ⛔)──► Recebido parcial / Pago parcial ──(baixa ⛔)──► Recebido / Pago
    │                                                                  (estorno ⛔ volta)
    ├──(vencimento passa)──► Vencido
    └──(cancelar ⛔)──► Cancelado
```

```
COMERCIAL (PV aprovado/reservado) ──► FINANCEIRO: CR ✅ ──► baixa ⛔ ──► caixa
COMPRAS (REC confirmado) ─────────► FINANCEIRO: CP ⛔ ──► pagamento ⛔ ──► caixa
FINANCEIRO ──► CONTROLADORIA (relatórios) · PAINÉIS
```

**Entrada:** PV-0001 (R$ 194,00, 28 dias) e PV-0002 (R$ 97,00, 30 dias) reservados; REC-0001 confirmado.
**Processamento:** CR-0001 ✅, CR-0002 ✅, CP-0001 ⛔, baixa da CR-0002 ⛔.
**Resultado:** a receber em aberto R$ 194,00; a pagar em aberto R$ 490,00; caixa +R$ 97,00.
**Segue para:** Fiscal (aula 07) e Logística (aula 08).

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Início do papel personalizado | — (antes: "Não foi possível carregar o relatório executivo…") | O bloco executivo agora só aparece para quem tem reports.view e controlling.view | — | — | — | B6/D11 ✅ (rodada 48) |
| Título vencendo no mesmo dia | — | Pedido sem condição de pagamento relacional | Título "vencido" cedo demais | Coluna Vencimento | Garantir a condição no pedido (integração, D9) | ⚠️ D9 |
| Gerar duas vezes, uma depois da outra | "Conta a receber gerada." (de novo) | A função devolve o título existente | Nenhum (não duplica) | O bloco Financeiro continua com 1 título | — | não |
| Gerar duas vezes **ao mesmo tempo** (duplo clique ou duas pessoas no mesmo segundo) | "Conta a receber gerada." nas duas | A função confere e grava sem travar o pedido | **Dois títulos para o mesmo pedido** (cobrança dobrada) | Contas a receber filtradas pelo pedido | Cancelar o título excedente; na gravação, clicar uma vez | 🔴 **R48-01 (aberto)** — não provocar |
| Pedido não aprovado | — (botão ausente) · pela API: "Só é possível gerar título a receber a partir de um pedido aprovado (status atual: …)." | Regra | — | Status do pedido | Aprovar antes | não |
| Vendedor abre o Financeiro | "Sem acesso a este recurso" | Segregação | — | Tela de acesso negado | — | não (regra) |
| Baixa e pagamento pela tela | — (sem botões) | ⛔ só pela API | Depende de integração | Listas só de consulta | Integração | ⛔ |
| Operador cria títulos | — | Papel padrão amplo (`accounts_payable.create`) | Segregação fraca | Matriz de permissões | Ajustar o papel (aula 10) | ⚠️ **B9** |
| Datas à noite | Data do dia seguinte | UTC | Vencimentos e emissão | Coluna de data | Gravar antes das 21h | ⚠️ **B4** |
| Margem bruta no painel | "100%" | Custo não apurado no painel | Indicador enganoso | Painel executivo | Não usar na aula | ⚠️ **B12** (evitar) |

## 10. Exercício prático

1. Abra um pedido aprovado e gere a conta a receber. Anote número, valor e vencimento.
2. Clique de novo em "Gerar conta a receber" e confira que nada foi duplicado.
3. Em Contas a receber, use as abas **Vencidos** e **Em aberto**.
4. No Fluxo de caixa, explique a conta: saldo em contas + a receber − a pagar = saldo projetado.
5. **Pergunta:** por que a conta a pagar da Polar não nasceu quando o pedido de compra foi aprovado?

## 11. Checklist de conclusão

- [ ] Sei a diferença entre pedido aprovado, título e recebimento.
- [ ] Gerei a conta a receber de um pedido e sei de onde vêm o valor e o vencimento.
- [ ] Leio Contas a receber e Contas a pagar (abas, colunas, status).
- [ ] Leio o Fluxo de caixa e a projeção por semana.
- [ ] Sei que a conta a pagar nasce do recebimento confirmado.
- [ ] Sei que baixa e pagamento são feitos por integração nesta versão.
- [ ] Sei por que o Vendedor não acessa o Financeiro.

## 12. Evidências

Salvar em `docs/academy/06-financeiro/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-inicio-fernanda.png` | Menu do papel e cartão B6 |
| 02 | `02-painel-financeiro.png` | Painel da área |
| 03 | `03-pv0001-gerar.png` | Botão único e confirmação |
| 04 | `04-pv0001-cr.png` | Bloco Financeiro com CR-0001 (+28 dias) |
| 05 | `05-contas-receber.png` | CR-0001 e CR-0002 |
| 06 | `06-contas-pagar.png` | "Recebimento REC-0001" |
| 07 | `07-fluxo-caixa.png` | Quatro números e projeção |
| 08 | `08-cr0002-recebido.png` | Depois da baixa ⛔ |
| 09 | `09-juliana-sem-acesso.png` | "Sem acesso a este recurso" |

## 13. Preparação técnica

| # | Etapa | Endpoint | Usuário | Dados | Resultado esperado |
|---|---|---|---|---|---|
| 1 | Pré-requisitos | — | — | Aulas 02–05 concluídas, com as condições "28 dias" e "30 dias" nos pedidos (aula 03, passo 4b) | PV-0001 e PV-0002 reservados |
| 2 | Conta financeira (sem tela) | `POST /api/financial-accounts` | Fernanda (`financial_accounts.create`) | `{ code: "BCO-01", name: "Banco conta movimento", type: "BANK", openingBalance: 15000 }` | Saldo em contas R$ 15.000,00 |
| 3 | Categorias (sem tela) | `POST /api/financial-categories` | Fernanda | `{ code: "REC-VENDAS", name: "Receita de vendas", type: "INCOME" }` e `{ code: "DSP-COMPRAS", name: "Compras de mercadorias", type: "EXPENSE" }` | Categorias para os títulos |
| 4 | Conta a pagar do recebimento | `POST /api/purchase-receipts/:id/generate-payable` | Fernanda (`accounts_payable.approve`) | `{ categoryId: <DSP-COMPRAS>, paymentTermsId: <COND 28 dias> }` | CP-0001 "Recebimento REC-0001" R$ 490,00 a 28 dias (é o passo 11 da aula 04) |
| 5 | **Ao vivo** | botão "Gerar conta a receber" | Fernanda | PV-0001 e PV-0002 | CR-0001 e CR-0002 |
| 6 | Baixa da Ferrovia (entre as cenas 7 e 8) | `POST /api/accounts-receivable-installments/:id/receive` | Fernanda (`payments.create`) | `{ financialAccountId: <BCO-01>, amount: 97.00, method: "PIX", idempotencyKey: "academy-cr0002" }` | CR-0002 "Recebido"; saldo +R$ 97,00 |

- **Irreversível?** A baixa gera movimento financeiro (estorno só pela API). Executar só no ambiente Academy.
- **Sem ambiente limpo:** os números (CR, CP) seguem a numeração global (B3); a narração cita "o título do Granito".

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "06 · Financeiro" |
| B | Contexto | 0:09–0:40 | "Quinta, 14h" · pílula Fernanda/Financeiro |
| C | Explicação | 0:40–1:50 | Três momentos do dinheiro; quadro de permissões |
| D1 | Início | 1:50–2:30 | Menu do papel; cartão B6 |
| D2 | Gerar CR | 2:30–4:30 | PV-0001 e PV-0002; bloco Financeiro; D9 |
| D3 | Listas | 4:30–6:00 | Contas a receber e a pagar |
| D4 | Fluxo de caixa | 6:00–7:40 | Números, gráfico, tabela |
| E | Resultado | 7:40–8:50 | Quadro ⛔ baixa; CR-0002 Recebido; saldo |
| F | Erros | 8:50–10:50 | B6, D9, duplicidade, pedido não aprovado, Juliana sem acesso, B9 |
| G | Exercício | 10:50–11:15 | Tela de exercício |
| H | Fechamento | 11:15–11:35 | 3 linhas → "Próxima aula: Fiscal" → lockup |
