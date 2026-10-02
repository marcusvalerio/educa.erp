# Aula 09 — Auditoria

| | |
|---|---|
| **Público** | Administrador (e Gerente, que também lê a auditoria) |
| **Personagem** | **Ana** — Administrador · (opcional **Tiago** — Somente leitura) |
| **Viabilidade** | ✅ completa (a auditoria é consulta por natureza) · limitações reais ⚠️ B7 e B17 |
| **Duração estimada** | 7–9 min |

**O aluno sai sabendo:**

- encontrar **quem fez, o quê, quando e em qual registro**;
- filtrar e buscar;
- ler o histórico de um pedido;
- diferenciar a auditoria da empresa da auditoria da plataforma;
- saber **o que a trilha ainda não registra**.

## Cenário

**Sexta-feira, 16h.** O cliente Granito ligou: *"Quem mexeu no meu pedido?"* Ana vai rastrear o **PV-0001**:

- quem enviou (Juliana);
- quem aprovou (Carlos);
- quem reservou (Rafael);
- quem gerou o título (Fernanda);
- quem separou e expediu (Bruno).

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "Auditoria é a memória do sistema: cada ação relevante deixa uma linha com autor, data e registro." | — |
| 02 | Cenário | Ana, 16h, ligação do cliente. | — |
| 03 | Navegação | Administração → **Auditoria** (Data, Usuário, Entidade, Ação; busca por usuário; filtro Ação; exportar) · Controladoria → Auditoria · **Histórico** dentro do pedido (exige permissão de auditoria) · Central → Auditoria da plataforma (só membros da plataforma). | 🔎 |
| 04 | Operação principal | Buscar "Rafael" → linha **Pedido de venda · Reserva**. Filtrar a Ação "Aprovação" → Carlos aprovou. Ler cada coluna (usuário, ação, entidade, data e hora) e o contexto (abrir o registro). Montar a linha do tempo do PV-0001 na tela (motion sobre as linhas reais). | 🔎 |
| 05 | O que acontece no ERP | Cada papel deixou rastro: Juliana, Carlos, Rafael, Fernanda, Bruno, Lucas. O Owner aparece como `platform:OWNER:…`. **Isolamento**: nenhum autor de outra empresa aparece. | 🔎 + motion |
| 06 | Caso realista | "Quem criou o pedido?" A trilha **não mostra** a criação do pedido (⚠️ B7). Como responder hoje: o **Histórico** do registro e o que a trilha cobre. Ser franco: é uma limitação conhecida. | 🔎 |
| 07 | Erros e exceções | Ver tabela. | |
| 08 | Conferência | Checklist do auditor: autor, ação, data, entidade; cruzar com o status do documento. | 🔎 |
| 09 | Relação | A auditoria acompanha todos os módulos; a da plataforma é separada (aula 01). | motion |

## Limitações reais (mostradas, não escondidas)

| Limitação | Efeito | O que fazer |
|---|---|---|
| ⚠️ **B7** | Não registra **criação** de pedidos, movimentos de estoque, separações e expedições (só as mudanças de estado) | Usar o histórico do registro; débito registrado |
| ⚠️ **B17** | O filtro por registro específico é ignorado na API | Buscar pela tela (usuário, ação) |
| ⚠️ **B10** | O papel **Somente leitura** também abre a auditoria e a Administração da Empresa | Rever o papel (aula 10) |
| Horários | Exibidos no fuso do navegador; documentos datados em UTC (⚠️ B4) | Atenção a operações noturnas |

## Telas usadas

| Tela | Rota | Usuário | Legenda |
|---|---|---|---|
| Auditoria da empresa | `/app/admin/audit` | Ana | 🔎 |
| Auditoria (Controladoria) | `/app/gestao/auditoria` | Ana / Carlos | 🔎 |
| Pedido (Histórico) | `/app/comercial/pedidos-venda/:id` | Ana | 🔎 |
| Auditoria da plataforma | `/app/admincentral/audit` | Marcus (menção) | 🔎 |

## Preparação de cena

Nenhuma ⛔ nova: usa a trilha deixada pelas aulas 01–08.
