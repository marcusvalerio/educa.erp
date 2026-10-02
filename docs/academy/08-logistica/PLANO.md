# Aula 08 — Logística

> Plano de produção. Validado no código (`48775f5`) e ao vivo no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 08 |
| **Título** | Logística — do pedido reservado à mercadoria entregue |
| **Personagens** | **Bruno** (separa, embala, expede, registra a entrega) · **Carlos** (cadastra a transportadora e aprova a expedição) |
| **Papéis reais** | Bruno — **Logística** (personalizado) · Carlos — **Gerente** |
| **Duração estimada** | 11–13 min ("aula de acompanhamento", README decisão 1-A) |
| **Nível** | Intermediário |
| **Cobertura** | ✅ cadastro de transportadora (Carlos) · 🔎 Separação (picking), Embalagem (packing), Expedições, Transportes, Devoluções e o andamento do pedido · ⛔ criar e executar a separação, criar a expedição, volumes, liberar, embalar, aprovar, expedir, transporte, ocorrências e entrega · ⚠️ B11 (pedido entregue continua "Expedido") |
| **Objetivo principal** | Acompanhar o caminho físico do pedido (separação → embalagem → aprovação → expedição → entrega), saber quem faz cada etapa, ler os status e conferir o efeito no estoque e no pedido. |

## 2. Contexto de negócio

> Sexta-feira, 10h. A nota do Granito está pronta (aula 07). Os 10 baldes estão reservados no Picking desde terça (aula 03), e o cliente espera a entrega em Santos ainda hoje.
>
> O Carlos fechou com uma transportadora nova para o litoral: a Rota Litoral. Ela ainda não está cadastrada.
>
> O Bruno vai separar os baldes, embalar, pedir a aprovação do Carlos e despachar.

## 3. O que o aluno vai aprender

- O caminho físico do pedido e o documento de cada etapa: **lista de separação** (SEP) e **expedição** (EXP).
- Os status da separação (Pendente → Separando → Concluída) e da expedição (Liberada → Embalada → Pronta p/ expedir → Expedida → Em trânsito → Entregue).
- Quem faz cada etapa e por que o Gerente aprova a expedição.
- Cadastrar uma **transportadora** e vê-la em **Transportes**.
- O efeito da expedição no estoque: **Saída** e **Liberação de reserva** com origem **Expedição**; o **em estoque** cai.
- Conferir no pedido: indicador **Expedido** e **Andamento**.
- O que esta versão não registra pela tela, e o B11.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | A execução física da venda: tirar do endereço certo, conferir, embalar, despachar e comprovar a entrega. |
| Por que existe | A reserva separa o estoque no sistema; a logística separa a mercadoria no mundo real. Cada etapa deixa registro: quem separou, quantos volumes, qual transportadora, quando saiu, quem recebeu. |
| Quem executa | **Logística** e Operador: separação, expedição, entrega. **Gerente** (e Logística): aprova a expedição. **Gerente** e Operador: cadastram transportadoras (a Logística só consulta). |
| Módulo responsável | Logística e Estoque (`/app/logistica`) |
| Quem recebe o resultado | Estoque (saída), Comercial (pedido Expedido), Financeiro (cobrança já gerada, aula 06), Auditoria (Separação, Expedição, Entrega). |

**O caminho** (quadro da cena C, sobre a planta do armazém):

```
PCK-A01 Picking ──separar──► conferir ──embalar──► EXP-01 Expedição ──aprovar──► caminhão ──► cliente
   SEP-0001: Pendente → Separando → Concluída
   EXP-0001: Liberada → Embalada → Pronta p/ expedir → Expedida → Em trânsito → Entregue
```

**Quem pode o quê** (permissões reais):

| Ação | Logística | Operador | Gerente |
|---|---|---|---|
| Separação: criar, iniciar, separar, concluir (API) | ✅ | ✅ | ✅ |
| Expedição: criar, volumes, liberar, embalar, expedir (API) | ✅ | ✅ | ✅ |
| **Aprovar expedição** (API) | ✅ | — | ✅ |
| Entrega e ocorrências (API) | ✅ | ✅ | ✅ |
| Cadastrar transportadora (tela) | — (consulta) | ✅ | ✅ |

## 5. Roteiro de navegação

```
PERSONAGEM: Carlos — Gerente · sexta, 9h45

1. Cadastrar a transportadora (✅ tela)
   Rota: /app/cadastros/transportadoras → "Nova transportadora"
   Dados:
     Razão social*         Rota Litoral Transportes OD Ltda.
     Nome fantasia         Rota Litoral
     CNPJ*                 (CNPJ fictício válido, gerado na preparação)
     Responsável           Setor de coletas
     E-mail / Telefone     coletas@rotalitoral.test · (13) 4000-3000
     CEP / Estado / Cidade 11010-000 / SP / Santos
     Tipo de transporte    Rodoviário
     Região de atendimento Sudeste
     Status                Ativo
   Ação: Salvar → toast "Transportadora criado." (⚠️ concordância: o texto é genérico)

PERSONAGEM: Bruno — Logística · sexta, 10h

2. Entrar e ver o painel
   Rota: /login → /app → /app/logistica
   Tela: "Logística e Estoque — Recebimento, estoque, separação, expedição e entrega."
   Resultado: "Painel da área" (Expedições, Entregues, Em trânsito, Falhas de entrega) ·
   "Pendências do módulo" · "Expedições recentes".
   Mostrar: em Cadastros → Transportadoras, o Bruno vê a lista, mas sem "Nova
   transportadora" (papel só consulta).

3. ⛔ Separação SEP-0001
   Quadro: "Nesta versão, a separação não tem tela de ação. Foi registrada por
   integração pelo Bruno: criada a partir do pedido, iniciada, separada e concluída."
   Rota: /app/logistica/picking
   Tela: "Separação (picking) — Listas de separação geradas a partir de pedidos de venda
   confirmados." Abas: Todos, Na fila, Separando. Colunas: Lista, Início, Conclusão,
   Status.
   Resultado (dois momentos): SEP-0001 · Separando → SEP-0001 · Concluída.

4. ⛔ Expedição EXP-0001 até a embalagem
   Rota: /app/logistica/packing
   Tela: "Embalagem (packing) — Expedições na etapa de embalagem — volumes e pesagem ficam
   nos itens da expedição." Abas: Todos, Expedição atrasada, Aguardando embalagem,
   Embaladas.
   Resultado: EXP-0001 · Granito Serviços OD Ltda. · Santos · sexta · Embalada.

PERSONAGEM: Carlos — Gerente

5. ⛔ Aprovar a expedição
   Rota: /app/logistica/expedicao
   Tela: "Expedições — Expedições de pedidos de venda, da liberação ao despacho."
   Abas: Todos, Expedição atrasada, Prontas para expedir.
   Resultado: depois da aprovação (integração, conta do Carlos), EXP-0001 em
   "Prontas para expedir" com o status "Pronta p/ expedir".

PERSONAGEM: Bruno — Logística

6. ⛔ Expedir e entregar
   Rota: /app/logistica/transportes
   Tela: "Transportes — Expedições sob a ótica do transporte: transportadora, despacho e
   entrega." Abas: Todos, Expedição atrasada, Em trânsito, Entregues.
   Colunas: Expedição, Transportadora, Cidade, Expedição prevista, Status.
   Resultado (três momentos): EXP-0001 · Rota Litoral Transportes OD Ltda. · Santos ·
   Expedida → Em trânsito → Entregue.

7. O efeito no estoque
   Rota: /app/logistica/movimentacoes
   Resultado: duas linhas novas:
     Saída                · Balde plástico 8 L · Picking — rua A, módulo 01 · 10 · Expedição
     Liberação de reserva · Balde plástico 8 L · Picking — rua A, módulo 01 · 10 · Expedição
   Rota: /app/logistica/estoque
   Resultado: Picking — rua A, módulo 01 · Em estoque 52 · Reservado 5 · Disponível 47
   (antes: 62 / 15 / 47).

8. O efeito no pedido
   Rota: /app/comercial/pedidos-venda → PV-0001
   Resultado: status "Expedido" · indicador Expedido 100% (10 de 10) · Andamento:
   Expedição 100% · bloco "Expedições — Remessas geradas a partir deste pedido." com
   EXP-0001 · Saída · Entregue.
   ⚠️ B11: a entrega foi confirmada, mas o pedido continua "Expedido" (não chega a
   "Concluído").

9. Devoluções (consulta)
   Rota: /app/logistica/devolucoes
   Tela: "Devoluções — Movimentações de devolução (RETURN_IN/RETURN_OUT) do ledger de
   estoque." → "Nenhum registro ainda".
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Transportadora (Carlos) | Gaveta "Nova transportadora"; zoom em Tipo de transporte e Região | Callout "Quem cadastra: Gerente ou Operador" | toast 2,5 s |
| Bruno sem "Nova" | Corte para a lista do Bruno | Anel na ausência do botão | 2 s |
| Painel da Logística | Pan pelos indicadores | — | 2 s |
| Caminho físico | Planta do armazém (motion), com os dois documentos | Stepper SEP e stepper EXP | 6 s |
| Quadro ⛔ separação | Translúcido | — | 3 s |
| Picking | Zoom na linha SEP-0001 em dois estados | Abas Na fila / Separando | 1,5 s por estado |
| Packing | Zoom na linha EXP-0001 "Embalada" | Callout "Volumes e peso ficam na expedição" | 2 s |
| Aprovação | Pílula Carlos; aba "Prontas para expedir" | Callout "Segunda conferência antes de sair" | 2 s |
| Transportes | Zoom na coluna Transportadora | Três estados | 1,5 s por estado |
| Estoque | Movimentações (duas linhas) → Saldo 52 / 5 / 47 | Motion 62 → 52 em estoque; 15 → 5 reservado | 4 s |
| Pedido | Indicador Expedido 100% e bloco Expedições | Quadro ⚠️ B11 | 3 s |

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula oito: Logística.

**[B — Contexto]**
Sexta-feira, dez horas. A nota do Granito está pronta, e os dez baldes estão reservados no picking desde terça. Hoje eles saem para Santos, por uma transportadora nova.

**[C — Explicação]**
A reserva separou os baldes no sistema. Agora a logística separa os baldes no mundo real. O caminho tem dois documentos. A lista de separação registra quem tirou o quê de qual endereço. A expedição registra a embalagem, a aprovação, a transportadora, a saída e a entrega. Cada etapa tem um responsável, e a expedição passa por uma aprovação antes de sair.

**[D1 — A transportadora]**
Primeiro, o cadastro que falta. O Carlos cadastra a Rota Litoral em Transportadoras: razão social, CNPJ, tipo de transporte e região. Repare que o Bruno, da logística, consulta as transportadoras, mas não cadastra.

**[D2 — Separação]**
Nesta versão, a separação e a expedição ainda não têm telas de ação: elas são registradas por integração, e as telas mostram o resultado. Em Separação, a lista SEP zero zero zero um passa de separando para concluída: os dez baldes saíram do picking da rua A.

**[D3 — Embalagem e aprovação]**
Em Embalagem, a expedição EXP zero zero zero um está embalada. Volumes e peso ficam registrados nela. Antes de sair, o Carlos aprova. A expedição entra na aba Prontas para expedir.

**[D4 — Expedição e entrega]**
Em Transportes, a mesma expedição aparece com a transportadora, a cidade e o status: expedida, em trânsito e, no fim da manhã, entregue.

**[E — Resultado]**
O que mudou? No estoque, a expedição gerou uma saída de dez baldes e liberou a reserva correspondente. O picking agora tem cinquenta e dois em estoque, cinco reservados para a Ferrovia e quarenta e sete disponíveis. No pedido do Granito, o indicador expedido está em cem por cento, e a expedição aparece no próprio pedido.

**[F — Erros e exceções]**
Dois cuidados. Primeiro: a entrega foi confirmada, mas o status do pedido continua expedido. Nesta versão, o pedido não passa para concluído; para saber se foi entregue, confira a expedição. Segundo: as ocorrências de entrega, como destinatário ausente, são registradas pela integração, mas ainda não aparecem na tela. E lembre-se: sem reserva, não há separação.

**[G — Exercício]**
Sua vez. Encontre uma expedição em Transportes, diga a transportadora e o status, e confira no pedido o indicador expedido. Depois, nas movimentações, encontre a saída que essa expedição gerou.

**[H — Fechamento]**
Resumindo: separar, embalar, aprovar, expedir e entregar, cada etapa com dono e registro. O estoque baixa na saída, não na reserva. Na próxima aula, a Ana usa a auditoria para contar a história completa deste pedido.

## 8. Estados e fluxo

```
LISTA DE SEPARAÇÃO
Pendente ("Na fila") ──(iniciar ⛔)──► Separando ──(separar itens, concluir ⛔)──► Concluída     (Cancelada)

EXPEDIÇÃO
Rascunho ──(liberar ⛔)──► Liberada ──(embalar ⛔)──► Embalada ──(aprovar ⛔)──► Pronta p/ expedir
        ──(expedir ⛔)──► Expedida ──(saída para entrega ⛔)──► Em trânsito ──(entregar ⛔)──► Entregue ──► Concluída
                                    └──(ocorrência ⛔: falha, recusa, ausente, devolvida)

PEDIDO DE VENDA
Reservado ──(separação criada)──► Em separação ──(separação concluída)──► Pronto p/ expedir ──(expedir)──► Expedido parcial / Expedido ┄┄► Concluído (⚠️ B11: não ocorre)
```

**Entrada:** PV-0001 reservado (10 no Picking); DF-0001 pronta (aula 07).
**Processamento:** transportadora ✅ → SEP-0001 ⛔ → EXP-0001 ⛔ (embalada, aprovada, expedida, entregue).
**Resultado:** Saída 10 e Liberação de reserva 10 (origem Expedição); Picking 52 / 5 / 47; pedido Expedido 100%.
**Segue para:** Auditoria (aula 09).

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Pedido entregue continua "Expedido" | — | Nenhuma rotina grava a conclusão | Lista de pedidos não mostra "Concluído" | Status do pedido × status da expedição (Entregue) | Conferir na Expedição/Transportes | ⚠️ **B11** |
| Ocorrência de entrega | — (não aparece na tela) | Eventos de entrega só pela API, sem tela | Histórico da entrega invisível | — | Débito registrado | ⚠️ D12 (novo) |
| Expedir quantidade acima do reservado (API) | "Item …: quantidade a expedir (…) excede o saldo reservado disponível (…)." | A expedição sai da reserva | Expedição recusada | Mensagem da integração | Reservar antes (aula 05) | não |
| Registrar entrega de expedição não expedida (API) | "Só é possível confirmar entrega de uma expedição expedida (status atual: …)." | Etapa pulada | Recusada | Status | Expedir antes | não |
| Logística cadastra transportadora | — (botão ausente) | Papel só consulta (`carriers.read`) | — | Lista sem "Nova transportadora" | Gerente ou Operador cadastra | não (regra) |
| Logística abre Contas a receber ou NF-e | "Sem acesso a este recurso" | Fora do papel | — | Tela de acesso negado | — | não |
| Texto técnico em Devoluções | "(RETURN_IN/RETURN_OUT)" na descrição da tela | Texto não traduzido | Leitura | Subtítulo da tela | Ler como "devoluções de entrada e saída" | ⚠️ D10 |
| Concordância no estado vazio | "Nenhum transportadora cadastrado" | Texto genérico | Estética | Lista vazia | — | ⚠️ observação |
| Início do papel personalizado | "Não foi possível carregar o relatório executivo…" | Ver aula 06 | Visual | Cartão "Resumo" | — | ⚠️ **B6** |

## 10. Exercício prático

1. Cadastre uma transportadora (como Gerente ou Operador) e tente fazer o mesmo como Logística.
2. Em **Separação**, use as abas **Na fila** e **Separando** e diga o que cada uma significa.
3. Em **Transportes**, encontre a EXP-0001 e diga a transportadora e o status.
4. Nas **Movimentações**, encontre a **Saída** e a **Liberação de reserva** da expedição e explique por que são duas linhas.
5. **Pergunta:** a expedição está "Entregue". Por que o pedido ainda está "Expedido"?

## 11. Checklist de conclusão

- [ ] Sei o caminho separação → embalagem → aprovação → expedição → entrega.
- [ ] Leio os status da separação e da expedição.
- [ ] Sei quem faz cada etapa e por que o Gerente aprova.
- [ ] Cadastrei uma transportadora e a encontrei em Transportes.
- [ ] Sei que o em estoque cai na expedição, não na reserva.
- [ ] Confiro o pedido pelo indicador Expedido e pelo bloco Expedições.
- [ ] Conheço o B11 e a falta de tela para ocorrências de entrega.

## 12. Evidências

Salvar em `docs/academy/08-logistica/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-transportadora-criada.png` | Rota Litoral cadastrada (Carlos) |
| 02 | `02-bruno-sem-nova.png` | Lista sem "Nova transportadora" (Logística) |
| 03 | `03-sep-separando.png` | SEP-0001 Separando |
| 04 | `04-sep-concluida.png` | SEP-0001 Concluída |
| 05 | `05-exp-embalada.png` | EXP-0001 Embalada |
| 06 | `06-exp-pronta.png` | Aba "Prontas para expedir" |
| 07 | `07-transportes-entregue.png` | Rota Litoral · Entregue |
| 08 | `08-movimentacoes-saida.png` | Saída e Liberação de reserva · Expedição |
| 09 | `09-saldo-52-5-47.png` | Picking 52 / 5 / 47 |
| 10 | `10-pedido-expedido.png` | Expedido 100% e bloco Expedições (B11) |

## 13. Preparação técnica

| # | Etapa | Endpoint | Usuário | Dados | Resultado esperado |
|---|---|---|---|---|---|
| 1 | Pré-requisitos | — | — | Aulas 03–07 concluídas | PV-0001 Reservado; Picking 62 / 15 / 47 |
| 2 | **Ao vivo** | tela Transportadoras | Carlos | Rota Litoral (seção 5) | Transportadora ativa |
| 3 | Criar a separação | `POST /api/sales-orders/:id/pick-lists` | Bruno (`pick_lists.create`) | `{ warehouseId: <PRINCIPAL> }` | SEP-0001 Pendente |
| 4 | Iniciar | `POST /api/pick-lists/:id/start` | Bruno | — | Separando → **gravar** |
| 5 | Separar o item | `POST /api/pick-lists/:id/items/:itemId/pick` | Bruno | `{ pickedQuantity: 10 }` | — |
| 6 | Concluir | `POST /api/pick-lists/:id/complete` | Bruno (`pick_lists.complete`) | — | Concluída → **gravar** |
| 7 | Criar a expedição | `POST /api/sales-orders/:id/shipments` | Bruno (`shipments.create`) | `{ warehouseId: <PRINCIPAL>, pickListId: <SEP-0001>, carrierId: <Rota Litoral>, expectedShipDate: <sexta>, items: [{ salesOrderItemId: <item>, locationId: <PCK-A01>, quantity: 10 }] }` | EXP-0001 Rascunho |
| 8 | Volume | `POST /api/shipments/:id/packages` | Bruno | `{ packageNumber: 1, weight: 9.5, trackingCode: "RL-0001" }` | — |
| 9 | Liberar e embalar | `POST /api/shipments/:id/ready` → `/pack` | Bruno | — | Embalada → **gravar** |
| 10 | Aprovar | `POST /api/shipments/:id/approve` | Carlos (`shipments.approve`) | — | Pronta p/ expedir → **gravar** |
| 11 | Expedir | `POST /api/shipments/:id/ship` | Bruno (`shipments.ship`) | `{ idempotencyKey: "academy-exp-0001" }` | Expedida; Saída e Liberação de reserva → **gravar** |
| 12 | Saída para entrega | `POST /api/shipments/:id/delivery-events` | Bruno (`deliveries.create`) | `{ notes: "Saiu para entrega — Rota Litoral" }` | Em trânsito → **gravar** (a transportadora já veio no passo 7; `POST /api/shipments/:id/transport` só troca transportadora, motorista e veículo) |
| 13 | Entregar | `POST /api/shipments/:id/deliver` | Bruno (`deliveries.confirm`) | `{ recipientName: "Recebedor fictício", podType: "signature" }` | Entregue → **gravar** |

- **Irreversível?** A expedição gera saída de estoque (movimento imutável). Executar só no ambiente Academy.
- Transições conferidas no banco: `ready` → Liberada, `pack` → Embalada, `approve` → Pronta p/ expedir, `ship` → Expedida, `delivery-events` → Em trânsito, `deliver` → Entregue. No pedido: separação criada → Em separação; separação concluída → Pronto p/ expedir; expedição → Expedido.

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "08 · Logística" |
| B | Contexto | 0:09–0:40 | "Sexta, 10h" · pílulas Bruno e Carlos |
| C | Explicação | 0:40–1:50 | Caminho físico; dois documentos; quem faz o quê |
| D1 | Transportadora | 1:50–3:10 | Carlos cadastra; Bruno só consulta |
| D2 | Separação | 3:10–4:30 | Quadro ⛔; SEP-0001 |
| D3 | Embalagem e aprovação | 4:30–5:50 | Packing; aprovação do Carlos |
| D4 | Expedição e entrega | 5:50–7:00 | Transportes em três estados |
| E | Resultado | 7:00–8:40 | Movimentações, saldo 52/5/47, pedido Expedido 100% |
| F | Erros | 8:40–10:30 | B11, D12, reserva, segregação, D10 |
| G | Exercício | 10:30–10:55 | Tela de exercício |
| H | Fechamento | 10:55–11:15 | 3 linhas → "Próxima aula: Auditoria" → lockup |
