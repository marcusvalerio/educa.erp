# ATLAS.ERP — Product tour: roteiro técnico e storyboard

Vídeo: `ATLAS-ERP-product-tour.mp4`. Duração **3:54,7**, 1920×1080, 30 fps, H.264 com áudio AAC estéreo.
Este documento é o roteiro de referência. O roteiro executável fica em `fontes/scenes.js`; os tempos abaixo saem de `fontes/timeline.json`.

Para cada uma das 16 cenas, o roteiro registra:

- o tempo de início e fim e a duração;
- o objetivo;
- as **telas reais** usadas (captura, rota e usuário);
- o que é **gravação** e o que é **motion graphics**;
- o texto em tela;
- os efeitos sonoros;
- a transição de saída;
- as observações de honestidade.

> **Convenções**
>
> **Gravação.** É uma captura real da aplicação no ambiente de demonstração local:
>
> - build de produção do app;
> - PostgreSQL 16;
> - dublê do Neon Auth;
> - empresa fictícia **Órbita Distribuidora**.
>
> As capturas têm 1600×900 com `deviceScaleFactor` 2. No vídeo elas recebem câmera, zoom, destaques e cursor. O cursor só aparece onde houve **clique real na interface**.
>
> **Motion graphics.** São elementos desenhados pelo compositor: fluxos, nós, legendas e símbolo. Eles explicam um conceito e nunca imitam uma tela.
>
> **API.** Quando uma etapa não tem tela de ação nesta versão, ela foi executada pela API com o usuário do papel correspondente. O vídeo mostra o **resultado** na tela real e exibe um aviso.

## Mapa geral

| # | Cena | Início | Fim | Dur. | Transição de saída |
|---|------|--------|-----|------|--------------------|
| 1 | Abertura | 0:00,0 | 0:11,0 | 11,0 s | o dashboard se dissolve (zoom + desfoque) |
| 2 | O problema | 0:10,1 | 0:25,1 | 15,0 s | mergulho pelo Núcleo (*through*) |
| 3 | Administração Central | 0:24,2 | 0:39,2 | 15,0 s | mergulho pela linha da Órbita Distribuidora |
| 4 | Empresa e usuários | 0:38,3 | 0:58,8 | 20,5 s | a tela desliza para o próximo módulo |
| 5 | Cadastros | 0:57,9 | 1:10,9 | 13,0 s | deslize com a linha de fluxo laranja atravessando a tela |
| 6 | Comercial | 1:10,0 | 1:28,8 | 18,8 s | mergulho pelo selo **Aprovado** (a mudança de status leva à cena seguinte) |
| 7 | Estoque · WMS | 1:27,9 | 1:51,9 | 24,0 s | deslize (a tabela segue para Compras) |
| 8 | Compras | 1:51,0 | 2:06,8 | 15,8 s | deslize com a linha de fluxo |
| 9 | Financeiro | 2:05,9 | 2:21,7 | 15,8 s | o painel recua e o próximo se expande |
| 10 | Fiscal | 2:20,8 | 2:36,8 | 16,0 s | deslize |
| 11 | Logística | 2:35,9 | 2:48,9 | 13,0 s | mergulho pelo painel **Andamento** |
| 12 | Auditoria | 2:48,0 | 2:59,0 | 11,0 s | fade para o palco escuro |
| 13 | O fluxo completo | 2:58,1 | 3:18,1 | 20,0 s | a composição encolhe e vira a "empresa A" |
| 14 | Multiempresa | 3:17,2 | 3:31,2 | 14,0 s | o tile da empresa A se expande e vira o dashboard |
| 15 | Dashboard | 3:30,4 | 3:42,4 | 12,0 s | continuidade (sem corte) |
| 16 | Encerramento | 3:41,7 | 3:54,7 | 13,0 s | fade para preto |

Entre cenas há uma sobreposição de 0,7 a 0,9 s, que é onde a transição acontece. As transições são todas customizadas: nenhuma é um efeito pronto de apresentação.

O padrão de cada módulo é o seguinte:

1. **tela**;
2. **zoom**;
3. **destaque**;
4. **ação**;
5. **transição**;
6. **nova área**;
7. **explicação**.

Também se repetem estes recursos:

- **Legenda lateral.** Na abertura de cada cena, a janela fica à direita, levemente em perspectiva, com a legenda à esquerda. Depois a janela se expande para a tela cheia.
- **Rótulos de vidro.** Rótulos curtos no canto inferior esquerdo nomeiam o que está em foco.
- **Pipeline no topo.** Nos módulos com fluxo (Comercial, Estoque, Compras, Financeiro, Fiscal e Logística), um pipeline no topo acende a etapa atual.
- **Pílula de usuário.** Uma pílula no canto superior direito indica qual usuário (papel) está agindo.

---

## 1. Abertura (0:00 – 0:11)

- **Objetivo:** apresentar a marca e a promessa e entrar no produto.
- **Motion graphics:**
  - as quatro barras do símbolo **Núcleo** se montam girando (pinwheel);
  - o núcleo laranja `#FF9408` surge com brilho;
  - a frase aparece em duas linhas;
  - o símbolo forma o lockup com **ATLAS.ERP**;
  - a câmera mergulha pelo núcleo laranja e o dashboard surge "atrás" dele.
- **Gravação:** `d01-dashboard` — `/app`, Caio Nogueira (Gerente).
- **Texto:**
  - "Uma plataforma." / *"Toda a operação da empresa."*
  - depois **ATLAS.ERP**.
- **Som:**
  - pad atmosférico abrindo;
  - montagem (sopro suave);
  - batida grave no núcleo;
  - tom no lockup;
  - riser e impacto na entrada do dashboard.

## 2. O problema (0:10 – 0:25)

- **Objetivo:** mostrar o custo das áreas isoladas e a virada para a operação conectada.
- **Motion graphics:**
  - cinco cartões de módulo — Comercial, Estoque, Financeiro, Fiscal e Logística — à deriva, dessaturados;
  - linhas tracejadas quebradas e falhando entre eles;
  - os códigos de cada área (`PV-0223`, `CR-0119`, `DF-0058`, `EXP-0065`, "Balde 8 L · 10 un") se desfocam e somem: é a perda de contexto;
  - **corte seco** com 0,25 s de silêncio;
  - depois do corte, o Núcleo aparece no centro, os cartões se reorganizam em anel e linhas laranja sólidas os conectam ao centro, com pulsos circulando.
- **Gravação:** miniaturas recortadas das telas reais `m02-pedidos`, `e01-estoque-saldos`, `f01-contas-receber`, `s20-nfe-pronta` e `e05-expedicao`.
- **Texto:**
  - "Quando cada área trabalha isoladamente…"
  - *"…a operação perde contexto."*
  - (corte)
  - "Com o ATLAS.ERP, elas trabalham conectadas."
- **Som:**
  - trilha tensa, filtrada;
  - corte com silêncio quase total;
  - batida do núcleo;
  - brilho de conexão.

## 3. Administração Central (0:24 – 0:39)

- **Objetivo:** mostrar a camada central (empresas, módulos, ciclo de vida, acessos).
- **Gravação** (usuário Owner da plataforma):

| Captura | Rota | O que mostra |
|---|---|---|
| `c00-central-visao-geral` | `/app/admincentral` | aviso de **isolamento entre empresas** |
| `c03-central-modulos` | `/app/admincentral/modules` | catálogo de módulos, coluna "Permissões governadas" |
| `c01-central-empresas` | `/app/admincentral/companies` | empresas e coluna "Ciclo de vida" |
| `c02-central-empresa-detalhe` | idem (gaveta) | Órbita Distribuidora: ciclo de vida e módulos contratados |

- **Ação real:** clique na linha **Órbita Distribuidora**, que abre a gaveta.
- **Texto:**
  - "Controle central."
  - "Uma camada central controla empresas, módulos e acessos."
  - rótulos: *Catálogo de módulos e permissões · Empresas e ciclo de vida · Ciclo de vida · módulos contratados · Cada empresa, isolada das demais*.
- **Som:**
  - foco suave nos destaques;
  - clique;
  - troca de tela.
- **Honestidade.** A Central não "entra" na empresa: ela não acessa dados operacionais, como diz o próprio aviso da tela. A passagem para a cena 4 é um mergulho visual na linha da empresa. A cena seguinte é a **administração da própria empresa**, com o administrador dela.

## 4. Empresa e usuários (0:38 – 0:58)

- **Objetivo:** usuários, funções e permissões por empresa, e um bloqueio real.
- **Gravação:**

| Captura | Rota | Usuário |
|---|---|---|
| `a00-admin-visao-geral` | `/app/admin` | Marina Andrade (Administrador) — aviso "alterações aqui afetam somente esta empresa" |
| `a01-usuarios` | `/app/admin/users` | coluna Papéis (Administrador, Gerente, Vendedor, Operador, Financeiro, Fiscal, Logística, Somente leitura) |
| `a02-convite-papeis` | `/app/admin/users` | convite com a lista de funções aberta |
| `a03-papel-logistica` · `a04-papel-filtro` · `a05-permissao-aplicada` | `/app/admin/roles` | papel Logística, filtro "customers", permissão **Clientes · criar** marcada |
| `b01-vendedor-acesso-restrito` | `/app/financeiro/contas-pagar` | Helena Xavier (Vendedor): **"Sem acesso a este recurso"** |

- **Ação real:** clique no checkbox **Criar** de Clientes no papel Logística.
- **Texto:**
  - "Permissões por função."
  - "Cada empresa possui seus próprios usuários, funções e permissões."
  - frase final sobre véu escuro: "Cada usuário acessa apenas / *o que sua função permite.*"
- **Som:**
  - notificação de usuário (troca de perfil);
  - clique;
  - **bloqueio** (duas batidas graves abafadas).
- **Honestidade.** A permissão foi marcada e **descartada**; o papel não foi alterado. O vídeo mostra o aviso "Demonstração: a alteração foi descartada — o papel não foi modificado."

## 5. Cadastros (0:57 – 1:10)

- **Objetivo:** dados organizados como base da operação.
- **Gravação** (Caio Nogueira, Gerente):
  - `k01-clientes`;
  - `k03-fornecedores`;
  - `k04-produtos`;
  - `k05-produto-detalhe`, com a seção Classificação: categoria, subcategoria, unidade de medida e NCM;
  - `k06-locais` (locais de estoque);
  - `k08-cfop` (CFOP 5102).
- **Motion:**
  - telas deslizando lateralmente uma após a outra, com zoom curto em cada uma;
  - a linha de fluxo laranja atravessa a tela na saída.
- **Texto:**
  - "A operação começa com dados organizados."
  - "Clientes, fornecedores, produtos, categorias, unidades e dados fiscais."
- **Som:** deslizes suaves e foco.
- **Honestidade.** Categorias aparecem como **campo do produto** (já existente). A criação de categorias pela tela de catálogo tem um bug conhecido (B8), por isso não é mostrada. A tela de NCM (`k07-ncm`) não entra no vídeo porque contém registros de teste de permissão.

## 6. Comercial (1:10 – 1:28)

- **Objetivo:** do relacionamento com o cliente ao pedido aprovado.
- **Motion:** pipeline **Cliente → Orçamento → Pedido → Aprovação** em tela cheia, que depois vira faixa no topo e acende a etapa da tela atual.
- **Gravação:**

| Captura | Rota | Usuário / ação |
|---|---|---|
| `k01-clientes` | `/app/cadastros/clientes` | cliente **Granito Serviços OD Ltda.** |
| `m01-orcamentos` | `/app/comercial/orcamentos` | **ORC-0006 · Aprovado** |
| `s01-pedido-rascunho` | `/app/comercial/pedidos-venda/:id` | **PV-0223** em Rascunho, observação "Pedido gerado do orçamento ORC-0006" |
| `s02` → `s03` | idem | Helena Xavier (Vendedor) clica **Enviar para aprovação** e confirma: "Aguardando aprovação" |
| `s04` → `s05` | idem | Caio Nogueira (Gerente) clica **Aprovar**: "Aprovado" e o aviso "Pedido aprovado." |

- **Ações reais:** os três cliques (enviar, confirmar e aprovar).
- **Texto:**
  - "Do relacionamento com o cliente ao pedido."
  - rótulos: *Granito Serviços OD Ltda. · ORC-0006 Aprovado · Enviado para aprovação · Aprovado pelo Gerente*.
- **Som:**
  - etapas do pipeline (notas ascendentes);
  - cliques;
  - **aprovação** (arpejo curto em Ré maior).
- **Honestidade.** Nesta versão **não há tela "Novo pedido"**: o pedido foi criado a partir do orçamento aprovado **pela API** (`POST /api/sales-orders` com `salesQuoteId`). O vídeo exibe um aviso. Enviar e aprovar são cliques reais.

## 7. Estoque · WMS (1:27 – 1:51) — cena de destaque

- **Objetivo:** mostrar que o estoque acompanha o pedido da reserva à expedição.
- **Gravação:**

| Captura | Rota | Usuário / ação |
|---|---|---|
| `e01-estoque-saldos` | `/app/logistica/estoque` | colunas em estoque, reservado e disponível por local |
| `k06-locais` | `/app/cadastros/locais-estoque` | doca, picking, expedição e almoxarifado |
| `e02-movimentacoes` | `/app/logistica/movimentacoes` | ledger com origem (`PURCHASE_RECEIPT`, `stock_reservation`, `SHIPMENT`) |
| `s06` → `s07` | `/app/comercial/pedidos-venda/:id` | Rafael Sampaio (Operador) escolhe "Picking — rua A, módulo 01" e clica **Reservar**: Reservado 100% |
| `s11` → `s12` | `/app/logistica/picking` | SEP-0106: Separando → Concluída (Lívia Xavier, Logística) |
| `s16-pedido-expedido` | pedido | Reservado 100% · Expedido 100% |

- **Motion:**
  - pipeline **Pedido → Reserva → Estoque → Separação → Expedição** no topo;
  - um cartão do produto, "Balde plástico 8 L · 10 un", percorre o pipeline e muda de estado: Pedido aprovado → Reservado → Saldo comprometido → Separado → Expedido.
- **Ação real:** clique em **Reservar**.
- **Texto:**
  - "O estoque acompanha o pedido."
  - frase final: "O estoque acompanha o pedido / *desde a reserva até a expedição.*"
- **Som:**
  - etapas;
  - clique;
  - confirmação na separação concluída.
- **Honestidade.** Separação e expedição foram registradas **pela API do módulo** com a usuária de Logística (e a aprovação da expedição pelo Gerente). As telas mostram o resultado real, e o vídeo exibe um aviso.

## 8. Compras (1:51 – 2:06)

- **Objetivo:** mostrar que comprar também acontece dentro da plataforma.
- **Motion:** pipeline **Fornecedor → Compra → Recebimento → Estoque**.
- **Gravação:**
  - `k03-fornecedores`;
  - `p01-solicitacoes` (SC-0001);
  - `p02-pedidos-compra` (PC-0001…0003);
  - `p03-pedido-compra-detalhe` (PC-0003 · Aguardando aprovação);
  - `e03-recebimento` (REC-0001 · Confirmado);
  - `e02-movimentacoes` (entradas `PURCHASE_RECEIPT` na doca de recebimento).
- **Texto:** "Quando a empresa precisa comprar, / *o processo também permanece dentro da plataforma.*"
- **Som:** deslizes, foco e etapas.
- **Honestidade.** O recebimento REC-0001 foi lançado e confirmado **pela API**, com o Operador. A conta a pagar foi gerada pela API, com o Financeiro. O vídeo exibe um aviso.

## 9. Financeiro (2:05 – 2:21)

- **Objetivo:** os reflexos financeiros da operação.
- **Motion:** pipeline **Pedido aprovado → Conta a receber → Recebimento**.
- **Gravação:**

| Captura | Rota | Usuário / ação |
|---|---|---|
| `s08` → `s09` | pedido PV-0223 | Bianca Dantas (Financeiro) clica **Gerar conta a receber**; o painel Financeiro do pedido mostra CR-0119 Em aberto |
| `s10` → `s22` | `/app/financeiro/contas-receber` | CR-0119: Em aberto → **Recebido** |
| `f02-contas-pagar` | `/app/financeiro/contas-pagar` | CP-0057 "Recebimento REC-0001" (veio de Compras) |
| `f03-fluxo-caixa` | `/app/financeiro/fluxo-caixa` | saldo acumulado e projeção |

- **Ação real:** clique em **Gerar conta a receber**.
- **Texto:** "Cada operação pode gerar / *seus reflexos financeiros.*"
- **Som:** clique e confirmação no recebimento.
- **Honestidade.** A baixa (recebimento via PIX) foi registrada **pela API**, e o vídeo exibe um aviso.

## 10. Fiscal (2:20 – 2:36)

- **Objetivo:** mostrar que os dados da operação alimentam o processo fiscal.
- **Gravação** (Otávio Nogueira, Fiscal):
  - `s21-fiscal-painel`, com a checklist "Preparação para a primeira NF-e": estabelecimento emitente, CFOP, natureza, NCM e perfil fiscal;
  - `k08-cfop`;
  - `s18` → `s19` → `s20` em `/app/fiscal/notas-fiscais`: DF-0058, NF-e do pedido, Rascunho → Calculada → **Pronta**.
- **Motion:** stepper **Rascunho → Calculada → Pronta → Autorizada**. A etapa "Autorizada" fica **tracejada e apagada** o tempo todo.
- **Texto:** "Os dados da operação alimentam o processo fiscal."
- **Som:** confirmações a cada mudança de status.
- **Honestidade (obrigatória).**
  - **A NF-e para em "Pronta".** Transmissão e autorização na SEFAZ exigem certificado digital e integração com o provedor, e **não foram executadas** neste ambiente. O vídeo **não** mostra autorização.
  - O documento foi gerado a partir do pedido **pela API** (`POST /api/sales-orders/:id/generate-fiscal-document`). Não há botão "Gerar NF-e" nesta versão.
  - Cálculo e "pronta" também foram feitos pela API.
  - Tudo isso aparece no aviso da cena.

## 11. Logística (2:35 – 2:48)

- **Objetivo:** da operação interna até a saída da mercadoria.
- **Gravação:**
  - `s12-separacao-concluida`;
  - `s13` → `s14` → `s15` em `/app/logistica/expedicao`: EXP-0065, Granito Serviços, Embalada → Expedida → **Entregue**;
  - `s16-pedido-expedido`, painel Andamento (Reserva 100%, Expedição 100%).
- **Motion:** stepper **Separação → Embalagem → Expedição → Entrega**.
- **Texto:** "Da operação interna até a saída da mercadoria."
- **Som:** confirmações nas mudanças de status.
- **Honestidade.** As etapas foram registradas pela API da Logística, com a aprovação da expedição pelo Gerente. O vídeo exibe um aviso.

## 12. Auditoria (2:48 – 2:59)

- **Objetivo:** a trilha operacional.
- **Gravação:** `u01-auditoria` (`/app/admin/audit`, Administrador).
- **Câmera:** destaque sucessivo das colunas **Data**, **Usuário**, **Entidade** e **Ação**, e depois da linha "Rafael Sampaio · Pedido de venda · Reserva".
- **Texto:**
  - "Tudo o que acontece pode deixar uma trilha operacional."
  - "Quem fez, o quê, quando e em qual registro."
- **Honestidade.** O texto diz "pode deixar" de propósito: a auditoria cobre as ações registradas pelo banco, e o vídeo não promete cobertura total.

## 13. O fluxo completo (2:58 – 3:18) — cena-assinatura

- **Objetivo:** um pedido atravessando a empresa inteira.
- **Motion:**
  - trilho horizontal com seis nós: **Cliente → Comercial → Estoque → Financeiro → Fiscal → Logística**;
  - o token **PV-0223** percorre o trilho e, a cada chegada, o nó acende, o cartão ganha cor e brilho e o estado aparece;
  - a câmera acompanha o token;
  - depois recua para a frase final.
- **Gravação:** miniaturas das telas reais de cada etapa:
  - `k01` — Granito Serviços;
  - `s05` — PV-0223 Aprovado;
  - `s07` — Reservado 100%;
  - `s22` — CR-0119 Recebido;
  - `s20` — DF-0058 NF-e pronta;
  - `s15` — EXP-0065 Entregue.
- **Texto:** "Uma operação." · "Vários módulos." · *"Um único sistema."*
- **Som:**
  - notas ascendentes em pentatônica de Ré menor, uma por etapa;
  - a trilha atinge o pico (filtro abre, chimbal aberto);
  - swell suave na frase.
- **Honestidade.** O estado de cada nó é o da captura real. "NF-e pronta" **não** significa autorizada.

## 14. Multiempresa (3:17 – 3:31)

- **Objetivo:** uma plataforma preparada para múltiplas empresas, com isolamento.
- **Motion:**
  - a composição da cena 13 encolhe e vira o tile **A · Órbita Distribuidora**;
  - surgem B · Aster Industrial, C · Vita Suprimentos e D · Horizon Serviços;
  - a **Administração Central** conecta-se a todas (contrata módulos e governa o ciclo de vida);
  - paredes com cadeado separam as empresas ("usuários próprios · dados próprios");
  - um token "Órbita → Aster" tenta atravessar, bate na parede e volta: "acesso entre empresas: negado".
- **Gravação:** dashboards reais de cada empresa:
  - `d01-dashboard` — Olá, Caio;
  - `x-aster-dashboard` — Olá, Igor;
  - `x-vita-dashboard` — Olá, Henrique;
  - `x-horizon-dashboard` — Olá, Pedro.
- **Texto:** "Uma plataforma preparada para múltiplas empresas."
- **Som:**
  - conexão;
  - cadeados;
  - bloqueio.
- **Honestidade.** O isolamento entre empresas foi verificado no teste E2E com 7 empresas (`docs/homologacao/evidencias/e2e-7-empresas.md`). A animação do bloqueio é ilustrativa daquele resultado.

## 15. Dashboard (3:30 – 3:42)

- **Objetivo:** a visão consolidada.
- **Gravação:**
  - `d01-dashboard` (Início: resumo, "Precisa de atenção", "O que mudou");
  - `d02-dashboard-fluxo` (Fluxo do ERP);
  - `d04-painel-executivo` (`/app/gestao/dashboard`).
- **Câmera:** lenta, sobre saudação → indicadores → pendências → fluxo → painel executivo.
- **Texto:** só rótulos — *Visão consolidada do perfil · Pendências reais dos módulos · Fluxo do ERP · Painel executivo*.
- **Honestidade.** Não há números destacados nem inventados. Os valores são os da base fictícia de demonstração e aparecem só como parte da tela.

## 16. Encerramento (3:41 – 3:54)

- **Motion:**
  - zoom-out do painel;
  - sete áreas em círculo — Comercial, Estoque, Compras, Financeiro, Fiscal, Logística e Administração — ligadas ao centro;
  - elas convergem enquanto a tela encolhe até o núcleo laranja;
  - o Núcleo se forma.
- **Texto:**
  - "Uma plataforma." / *"Toda a operação."*
  - lockup **ATLAS.ERP**;
  - "Capturas reais do ambiente de demonstração ATLAS.ERP · dados fictícios".
- **Som:**
  - convergência (riser);
  - **resolução** em Ré maior com batida grave e cauda longa de reverb;
  - fade.

---

## Trilha e sound design

A trilha foi **sintetizada** do zero em `fontes/audio.py`, sem amostras ou bibliotecas de música, a partir das deixas exportadas pelo compositor (`timeline.json`).

- **Estilo:** eletrônico/corporativo discreto, 100 BPM, Ré menor.
- **Progressão:** Dm9 → B♭maj7 → Fmaj7/A → Gm9. A resolução final é em **Ré maior com 9ª**.
- **Camadas:**
  - pad de serras desafinadas com filtro que abre e fecha conforme a seção;
  - sub-baixo;
  - pluck em colcheias com eco pingue-pongue;
  - sinos agudos lentos (*shimmer*);
  - bumbo suave, chimbal e shaker baixos;
  - reverb por convolução com resposta sintética.
- **Arco:**
  - atmosférica na abertura;
  - tensão filtrada no "problema" e **silêncio** no corte;
  - pulso suave a partir da cena 4;
  - bateria completa nos módulos;
  - **pico leve no fluxo completo** (cena 13);
  - recua na multiempresa e no dashboard;
  - resolve no encerramento.

Os efeitos estão sempre abaixo da trilha:

| Deixa | Som | Onde |
|---|---|---|
| clique | blip curto de 2,3 kHz + transiente | cliques reais na interface |
| foco | sino agudo, muito baixo | cada destaque |
| troca/deslize | sopro filtrado curto | mudança de tela |
| transição | sopro com filtro varrendo (o "through" tem um grave descendente) | entre cenas |
| etapa | nota de sino (pentatônica, sobe por etapa) | pipelines e fluxo completo |
| confirmação | duas notas (A5 → D6) | mudança de status concluída |
| aprovação | arpejo D–F♯–A–D | pedido aprovado |
| usuário | "pop" ascendente | troca de perfil |
| bloqueio | duas batidas graves abafadas | acesso negado, isolamento |
| núcleo, impacto e resolução | grave + sino | marca, entrada e final |

Mixagem final: cerca de −16,7 dBFS RMS, pico em −2 dBFS, 48 kHz estéreo e AAC 192 kbps no MP4.

## O que é gravação e o que é motion graphics

| Tipo | Elementos |
|---|---|
| **Gravação (tela real)** | todas as telas da aplicação: 57 capturas usadas, de 65 feitas (fora do corte: `c04`, `d03`, `e04`, `f04`, `k02`, `k07`, `s17`, `x-lumen`) |
| **Ação real de interface** | abrir a empresa na Central; marcar a permissão (descartada); enviar para aprovação; confirmar; aprovar; reservar estoque; gerar conta a receber |
| **Ação pela API, com resultado em tela real** | criação do pedido a partir do orçamento; separação; embalagem; expedição; entrega; NF-e (gerar, calcular e "pronta"); recebimento de compra; conta a pagar; baixa da conta a receber |
| **Motion graphics** | símbolo e lockup; cartões de módulo e conexões; pipelines e steppers; token do pedido; cartão do produto; tiles multiempresa e paredes; legendas, rótulos e avisos; linha de fluxo das transições |
| **Não mostrado (fora do escopo deste ambiente)** | autorização SEFAZ; criação de categoria pela tela de catálogo (bug B8) |
