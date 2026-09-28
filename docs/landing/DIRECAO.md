# Landing EDUCA — direção (fase 3)

## Conceito

**"Uma venda não termina na venda."** O EDUCA existe para que uma operação registrada em uma área chegue às outras sem retrabalho: o pedido aprovado reserva estoque, gera o título a receber, entra no fluxo da logística e aparece nos painéis de gestão. A página vende essa ideia mostrando o produto real, não com slogans.

## Narrativa

1. **Abertura** — tese e o produto funcionando (composição de telas reais + trilha da operação).
2. **O cenário** — cada área cuida de um registro diferente da mesma operação.
3. **O EDUCA** — uma base, três ambientes, números reais do produto.
4. **Siga um pedido** — rolagem guiada: Venda → Estoque → Financeiro → Fiscal → Logística → Gestão, cada passo com a tela real e o estado honesto (na tela / na API).
5. **Mapa das áreas** — índice com o estado de cada módulo.
6. **Áreas, uma a uma** — cada módulo responde às cinco perguntas: para que serve, o que você faz, como funciona, o que você controla, como se conecta. Visualizador de telas reais com abas.
7. **Base e em evolução** — Cadastros; Produção, Workflow e Importação apresentados como o que são hoje.
8. **Quem acessa o quê** — a cadeia Usuário → Papel → Permissões → Módulos, com o exemplo real do papel Comprador; convite de ponta a ponta.
9. **Administração Central** — empresas, módulos contratados, isolamento.
10. **A operação integrada** — o mapa de conexões entre áreas, com o tipo de cada ligação.
11. **Chamada** — entrar no EDUCA e ler os manuais.

## Direção gráfica

| Token | Valor | Uso |
|---|---|---|
| Tinta | `#100c08` | texto, estrutura, palco escuro |
| Papel | `#f5f6f6` | fundo das seções claras (igual ao app) |
| Folha | `#ffffff` | superfícies e molduras das telas |
| Palco | `#0e0b09` | abertura e momentos cinematográficos (escuro nos dois temas) |
| Merin's Fire | `#ff9408` | a barra do meio da marca: marca o que está em movimento (a operação), nunca texto corrido |
| Fogo profundo | `#a34d00` | links e números de destaque sobre claro (contraste AA) |

- **Tipografia:** Instrument Serif para títulos editoriais (grandes, itálico como ênfase), Instrument Sans para texto e interface, JetBrains Mono para o vocabulário do sistema: códigos (`PV-001013`, `CR-0092`), rotas (`/comercial/pedidos-venda`) e permissões (`sales_orders.approve`).
- **Grade:** 12 colunas, margens com marcas técnicas finas; composição assimétrica, telas sangrando para a borda no desktop.
- **Motivo:** as três barras da marca EDUCA viram as "raias" dos diagramas; a barra laranja é o registro passando de uma área para outra.
- **Estados como forma:** "Na tela" (sólido), "Consulta" (contorno), "Na API" (contorno tracejado, mono), "Em evolução" (âmbar). O visitante distingue o que está pronto sem ler legenda.
- **Telas reais:** capturas de `docs/manual/assets` em molduras com a rota real na barra; recortes e zoom por enquadramento, nunca mockups.

## Motion

- Uma sequência orquestrada na abertura (telas entram em camadas; a trilha da operação avança).
- "Siga um pedido" com palco fixo e troca de tela por etapa conforme a rolagem.
- Entradas discretas por rolagem (CSS `animation-timeline: view()` onde suportado; sem suporte, tudo aparece pronto).
- Pulso laranja percorrendo os conectores dos fluxos.
- `prefers-reduced-motion`: tudo estático.

## Implementação

Site estático em `landing/` (fora do app Next, para não mexer no proxy de autenticação). Conteúdo em `landing/src/content.mjs`, gerado por `npm run landing:build`. Fontes e telas copiadas do repositório pelo próprio build.

---

# Versão 2 — direção de arte, motion e narrativa

## Crítica da versão 1

| Onde | Problema | Correção na v2 |
|---|---|---|
| Abertura | Três capturas empilhadas ao lado do título. Não mostra que as áreas estão ligadas, e a entrada é um fade genérico. A trilha de códigos embaixo é texto solto. | Cena de produto: o pedido real no centro, com marcadores numerados nos botões e campos que geram trabalho em outra área. Cada marcador tem uma linha até a tela real da área, e as linhas convergem em Gestão. Sequência de entrada orquestrada (sinais → tela → marcadores → ligações → título → convergência). |
| Faixa de legenda | Interrompe a abertura com uma tabela de selos. | Sai da abertura; a legenda vai para onde os selos são usados (áreas e conexões). Na abertura, só linha contínua = na tela, tracejada = na API. |
| Cenário | Tabela estática de registros; o problema (silos) não é mostrado. | Cena de rolagem: os registros começam soltos, cada um no seu silo, e se alinham em um fio único conforme a página rola. |
| Plataforma | Três cartões iguais com capturas pequenas. | Os três ambientes como camadas em profundidade, que se abrem com a rolagem. |
| Siga um pedido | Imagem estática com retângulo de destaque; espaços vazios entre as etapas; nada mostra continuidade. | Cena fixa com câmera: cada etapa entra, a câmera aproxima a região exata da tela, o cursor clica no botão real (etapas na tela) ou aparece o endpoint real (etapas na API). Uma raia mostra o pedido avançando. |
| Módulos | Dez seções idênticas, com três colunas de listas; muito texto e pouca hierarquia. | Cabeçalho com estado; problema × funcionamento lado a lado; processo desenhado como trilho com pulso; tela como objeto (perspectiva que endireita, troca com máscara); lados alternados. |
| Conexões | Diagrama numa caixa e uma lista longa; linhas finas; baixa hierarquia. | Rede viva em capítulos (venda, compra, serviço e manutenção, gestão): cada capítulo acende a sua cadeia, com sinais percorrendo as ligações. No celular, a rede é redesenhada em camadas verticais. |
| Chamada final | Título e botões num palco vazio. | "Sua operação não deveria funcionar em silos." As áreas separadas se juntam nas barras da marca, e o único convite é Entrar no EDUCA. |
| Motion geral | O mesmo "sobe e aparece" em toda seção. | Hierarquia macro → seção → componente → microinteração; easings e durações variados; quietude depois do movimento. |

## Ritmo (beats)

Abertura (build 0–3 s, breathe com sinais em loop, resolve com parallax ao rolar) → Cenário (scrub lento) → Plataforma (abertura em leque) → Siga um pedido (cena longa, seis tempos com câmera) → Áreas (ritmo médio, uma área por vez) → Conexões (cena fixa em quatro capítulos) → Final (convergência e silêncio).

## Motion (princípios HyperFrames aplicados à web)

- **Uma linha do tempo por cena.** A abertura usa uma timeline GSAP única. As cenas de rolagem usam ScrollTrigger com scrub.
- **Variação.**
  - As entradas vêm de direções diferentes.
  - `expo.out` para peso, `back.out` só em marcadores, `power3.in` para saídas.
  - A cena mais lenta dura cerca de 3× a mais rápida.
- **Linhas com âncora.** Cada linha liga um elemento real a outro: botão → tela da área → Gestão. Não há linha decorativa.
- **Câmera.** A aproximação usa zoom com contratranslação (`coordinate-target-zoom`) calculada das coordenadas da captura. Nada é medido durante a animação.
- **Performance.** Só `transform` e `opacity`; blur apenas em entradas curtas.
- **Movimento reduzido.** Com `prefers-reduced-motion`, a página mostra o estado final de cada cena, sem loops.
- **Sem JS ou sem GSAP.** A página continua completa, no layout da v1.
- **Biblioteca.** GSAP 3.13 + ScrollTrigger, copiados de `node_modules` para `landing/site/vendor/`, sem CDN.

## Honestidade

- Etapas na tela mostram o cursor clicando no botão que existe.
- Etapas na API mostram o endpoint real (`POST /api/sales-orders/:id/generate-fiscal-document` etc.) e dizem que não há botão.
- As telas da jornada são de pedidos diferentes do ambiente de demonstração, e a página diz isso.
- Não há CTA de cadastro: a única ação pública de conta é **Entrar no EDUCA** → `/login`.

---

# Versão 3 — direção de arte cinematográfica e acabamento

A v3 parte da v2 aprovada. Conteúdo, inventário, estados (na tela, na API, em evolução), fluxo de login e arquitetura da landing não mudam. A rodada é de direção de arte e motion.

## Princípios

1. **Um sistema sendo revelado.** A abertura conta: vazio → sinais → estrutura → dados → pedido → ligações → áreas → convergência → sistema completo → declaração. O título entra por último: primeiro o visitante vê a operação acontecer.
2. **Causa antes do efeito.** Um destino só acende depois que o sinal chega até ele: na abertura, no mapa de conexões e no final.
3. **Precisão → escala → conexão → controle → inteligência operacional.**
   - Precisão: portas e molduras.
   - Escala: os números em unidades.
   - Conexão: ligações com origem e destino.
   - Controle: estado e permissões nos módulos.
   - Inteligência operacional: tudo chega à Gestão.
4. **Acabamento antes do efeito.** Microinterações curtas (60–350 ms), sem bounce e sem blur de enfeite.
5. **Honestidade.** Toda linha liga dois elementos reais. Toda ligação é do inventário (13: 5 na tela, 8 na API). Etapas só na API mostram "Na API" e o endpoint.

## Cenas

| Cena | v3 |
|---|---|
| Abertura (≥ 1100 px) | Timeline única de ~3,2 s (timeScale 1,3; o título entra em ~2,2 s, durante o recuo da câmera):<br>1. a grade das colunas sobe;<br>2. as portas das ligações acendem;<br>3. as molduras das áreas aparecem vazias, com o nome;<br>4. os códigos reais surgem soltos;<br>5. a varredura desenha o pedido de cima para baixo;<br>6. os marcadores aparecem nos botões;<br>7. para cada área: o sinal sai do marcador e percorre a ligação, a área é revelada da esquerda e o código "encaixa" na etiqueta;<br>8. as quatro áreas mandam sinal para a Gestão;<br>9. a câmera (que começou 3% mais próxima e centrada) recua;<br>10. entram o título e o texto.<br><br>Depois, as áreas respiram (oscilação lenta e desencontrada), a cena inclina com o ponteiro e passar sobre uma área acende a cadeia dela enquanto o resto recua. Roda uma vez por sessão. |
| Abertura (tablet) | Declaração primeiro; pedido e áreas em grade, revelados em ordem de causa. |
| Abertura (celular) | Composição vertical: declaração, pedido e depois a espinha. A linha desce com a rolagem e cada área é revelada quando a linha chega até ela. |
| Plataforma | Os números viram escala: 13, 15, 19 e 352 pontos, em ordem crescente. Os pontos se acendem em sequência e o valor conta. |
| Siga um pedido | Câmera documental:<br>- um tempo de abertura mostra o pedido na origem da raia ("00 Pedido");<br>- em cada etapa, a tela anterior sai para o lado e perde prioridade, e a próxima entra;<br>- a câmera aproxima a região explicada, com uma deriva lenta;<br>- a legenda "Em foco" mostra o dado que aparece na tela (ex.: "CR-0002 · vence 27/09/2026 · R$ 36.011,62 · em aberto");<br>- nas etapas na tela, o cursor clica no botão real; nas etapas na API, aparece o cartão do endpoint.<br><br>No celular: lista vertical, com a raia fixa no topo. |
| Módulos | Cena em seis tempos: problema → como o EDUCA resolve → processo (Entrada … Resultado) → controle → conexão → estado.<br>- A tela ocupa 8/12 da grade (≥ 1280 px) e fica fixa enquanto se lê a lateral.<br>- Um numeral vazado faz parallax no fundo.<br>- Em "Como se conecta", cada ligação mostra a direção (origem → destino) e o estado. |
| Conexões | Origem → processamento → destino: a origem ganha o traço, o sinal percorre a curva (mais lento na API) e o destino pulsa ao receber. Só correm as ligações do capítulo ou da área tocada, e param fora da tela. |
| Final | "Sua operação não deveria funcionar em silos."<br>- A cena toca inteira uma vez ao entrar na tela: as seis áreas (pílulas) se aproximam, as ligações se desenham até a marca, a marca e a palavra EDUCA aparecem, e sinais passam a correr.<br>- Depois entram "EDUCA conecta a operação." e o convite: Entrar no EDUCA e os manuais. |

## Easings e tempos

| Uso | Easing | Duração |
|---|---|---|
| Entrada de peso (título, revelação de área) | `expo.out` | 0,55–1,1 s |
| Deslocamento entre posições (câmera, encaixe de código) | `power2/3.inOut` | 0,4–1,3 s |
| Sinal percorrendo ligação | `power1.inOut` | 0,5 s (abertura), 1,0 s na tela, 1,4 s na API |
| Marcadores e portas | `back.out(2.4–3)` | 0,35–0,45 s |
| Saída | `power2.in` | 0,1–0,2 s |
| Respiração | `sine.inOut` yoyo | 2,6–3,8 s |
| Microinteração (CSS) | `cubic-bezier(0.2, 0.7, 0.1, 1)` | 60–350 ms |

## Componentes novos

- `.hs-port`, `.hs-ghost`, `.hs-scan`: portas, molduras e varredura da abertura.
- `.numbers .nb .units`: número como escala.
- `.m-ghost`: numeral de fundo do módulo.
- `data-cap` no trilho: marca "Entrada" e "Resultado".
- `.conn` e `.lk-*`: ligação com direção e estado.
- `.lane-origin`: a origem da raia.
- `.callout` e `.jc-callout`: legenda "em foco".
- `.converge` (`.cv-d` e `.cv-m`): SVG do final.
- `.node.is-src` e `.node.is-arrive`: origem e chegada no mapa.

## Breakpoints

| Largura | Composição |
|---|---|
| ≥ 1440 | Abertura em cena única (pedido, quatro áreas e Gestão, 1320 × 515); jornada fixa; módulos 8/4 |
| 1280 | Idem, cena escalada; módulos 8/4 |
| 1100–1279 | Cena da abertura e jornada fixa; módulos 7/5 |
| 1024 / 820 | Abertura em grade; jornada em lista com câmera por etapa; módulos em coluna única |
| < 700 (390) | Abertura vertical com espinha; raia fixa no topo; mapa redesenhado em camadas verticais; final vertical (pílulas em duas colunas convergindo para a marca) |

## Desempenho

Medido em Chromium headless sem GPU, servidor local (`scratchpad/land/fps3.mjs`, `perf.mjs`, `lcp2.mjs`):

| Métrica | v2 | v3 |
|---|---|---|
| DOMContentLoaded (1440 / 390) | 430 / 406 ms | 494 / 468 ms |
| LCP 1ª visita (1440 / 390) | 1,46 / 1,31 s | 2,67 / 1,05 s |
| LCP nas visitas seguintes da sessão (1440) | 1,46 s | 0,49 s |
| CLS | 0 | 0 |
| Transferido (1440) | HTML 190 KB · CSS 62 KB · JS 139 KB · imagens 145 KB · fontes 111 KB | HTML 207 KB · CSS 71 KB · JS 152 KB · imagens 118 KB · fontes 111 KB |
| FPS abertura (1440 / 390) | 54 / 60 | 51 / 60 |
| FPS repouso, jornada rolando, rede viva, final (1440) | 61, 60, 60, 60 | 61, 60, 60, 60 |
| FPS em todas as cenas (390) | 60 | 60 |

- JS próprio: `main.js` 10 KB e `motion.js` 28 KB; o GSAP e o ScrollTrigger somam 120 KB, sem compressão.
- As imagens do site ocupam 3,3 MB no total. São carregadas sob demanda, em WebP, com uma versão de 760 px para telas estreitas.

Decisões:

- Só `transform`, `opacity` e `clip-path` (em revelações curtas).
- Nenhum blur na abertura.
- O `backdrop-filter` ficou só na legenda "em foco".
- Os sinais do mapa são GSAP (param fora da tela). Os da abertura e do final são SMIL (pausados fora da tela).
- Traços com `non-scaling-stroke` são medidos em pixels de tela (`dashLen`), para que as linhas cheguem ao destino em qualquer largura.
- O LCP da primeira visita no desktop é a sequência de abertura, de propósito: o título e o texto entram por último. A sequência foi comprimida (de ~5 s para ~3,2 s) e a câmera passou a recuar enquanto os sinais convergem, com o título entrando no recuo: o LCP caiu de 4,8 s para 2,7 s. Além disso:
  - navegação e "Entrar no EDUCA" aparecem em ~0,5 s;
  - rolar ou usar o teclado acelera a sequência 5×;
  - nas visitas seguintes da sessão a página abre pronta (LCP ~0,5 s);
  - no celular o título vem primeiro (LCP ~1,2 s).

## Acessibilidade

- Axe: 0 violações.
  - Com movimento reduzido: 1440 e 390, claro e escuro.
  - Com movimento: no estado final de cada revelação por rolagem.
- Teclado: ordem de tabulação verificada; foco visível em laranja; nós do mapa acionáveis por Enter, Espaço e Esc.
- Movimento reduzido: `motion.js` não roda. A página mostra o estado final de cada cena: a abertura completa, a jornada em lista, todas as ligações acesas e a convergência desenhada.
- Sem JavaScript: a página está completa (abertura, seis etapas, quatro capítulos, final).

## Comparação v2 × v3

As imagens lado a lado (mesmos enquadramentos, v2 à esquerda) estão em `docs/landing/comparacao/v2-v3/`. As capturas finais da v3 estão em `docs/landing/capturas/`, e as da v2 em `capturas/v2/`.

| Onde | v2 | v3 |
|---|---|---|
| Abertura | Título cedo; telas aparecem com fade; linhas desenham. | Sistema revelado em ordem de causa; o sinal percorre cada ligação antes de a área acender; câmera; título por último; foco por área. |
| Números | Faixa de valores. | Escala visível (pontos), em ordem crescente. |
| Siga um pedido | Seis etapas com câmera. | Origem "00 Pedido"; saída lateral da etapa anterior; deriva da câmera; legenda "Em foco" com o dado da tela. |
| Módulos | Tela 7/12; ligações como lista. | Tela 8/12 e fixa; numeral em parallax; "Entrada" e "Resultado" no trilho; ligações com direção e estado. |
| Conexões | Sinais SMIL em todas as ligações acesas. | Origem → sinal → resposta do destino, por ligação; param fora da tela. |
| Final | Barra de silos que se une. | Convergência das seis áreas na marca EDUCA. |
| Microinterações | Hover de cor. | Luz e pressão nos botões, pressão nas abas, aproximação leve nas telas ampliáveis. |
| Desempenho | LCP 1,5 s (desktop). | LCP 2,7 s na 1ª visita do desktop (sequência intencional); 0,5 s nas seguintes; celular 1,1 s; FPS igual. |

## Áudio

Não há áudio. Uma possibilidade futura é um som discreto quando o sinal chega ao destino, só depois de um gesto do visitante, com controle visível para desligar. Fica documentado, não implementado.

---

# Versão 4 — a operação como um filme em atos

A V4 parte da V3 validada. A arquitetura, os conteúdos, os fluxos reais e a distinção de estados (na tela, consulta, na API, em evolução) não mudam. O que muda é a encenação: direção de arte, composição, ritmo de rolagem, motion, transições entre cenas e o tratamento das telas.

## Crítica da V3 (o que impedia a página de parecer produto premium)

1. Metade da página (os 10 módulos, ~17.400 de 35.200 px) repetia o mesmo molde.
2. Nenhum módulo tinha identidade própria.
3. Nos módulos, as telas ainda pareciam capturas: listas inteiras e pequenas.
4. A abertura era um diagrama de cartões num plano só, sem protagonista.
5. Na jornada, o escurecimento em volta do foco deixava a tela lavada.
6. ~25.000 px seguidos de fundo claro no meio da página.
7. A tipografia não tinha picos: quase todos os títulos no mesmo tamanho.
8. Base, Acesso e Central eram três seções parecidas logo antes do clímax.
9. Cada cena terminava em um corte seco, e a ideia de conexão não atravessava a página.
10. Dezenas de selos pequenos repetidos: a honestidade virava textura.

Decisões aprovadas: direção "filme em atos" com o fio contínuo; módulos na opção A (quatro protagonistas e capítulos compactos); Base, Acesso e Central fundidos em uma cena.

## Estrutura

| Ato | Tom | Cena |
|---|---|---|
| 01 Ligação | escuro | O pedido PV-001013 como objeto de produto, em vista explodida, até a convergência em Gestão e a declaração. |
| 02 Silos | claro, curto | Os registros de cada área soltos, que se alinham num fio. Título e uma frase: "a empresa perde o fio". |
| 03 Um pedido atravessa a empresa | escuro | Cena fixa com câmera documental: Venda → Estoque → Financeiro → Fiscal → Logística → Gestão. |
| 04 As áreas | claro, com cenas escuras | Quatro protagonistas (Comercial, Estoque, Financeiro, Fiscal e Logística) e capítulos compactos (CRM, Suprimentos, Qualidade, Projetos, Ativos, Painéis, Cadastros, Em evolução). |
| 05 Uma base, três níveis | claro, arquitetural | Base → Acesso → Central como três planos do mesmo sistema. |
| 06 O sistema | escuro | O mapa de conexões conferidas, em capítulos. |
| 07 Convergência | escuro | As áreas convergem na marca; "EDUCA conecta a operação."; Entrar no EDUCA e os manuais. |

Ritmo: respiro → informação → demonstração → movimento → conclusão, com costuras em degradê entre atos claros e escuros (no espaço vazio antes do marcador, nunca sob texto).

## O fio (assinatura)

Uma linha na margem atravessa a página do Ato 01 à convergência final:
- passa pelo nó de cada ato;
- desenha-se com a rolagem, com um ponto na frente (a mesma operação avançando);
- acende cada nó quando passa;
- entra na convergência das áreas.

Detalhes de implementação:
- É SVG gerado pelo `main.js`, recalculado com o layout (`ResizeObserver`), inclusive com a cena fixa da jornada.
- Com movimento reduzido, aparece inteira e sem o ponto.
- Sem JS, não aparece: é decorativa, e o conteúdo não depende dela.

## Ato 01: o pedido como objeto

No desktop (≥ 1100 px), a abertura é uma cena 3D. O mundo tem 1440 × 840 unidades; `--u` é 1/1440 da largura, então a cena inteira escala com a tela.

- **Objeto.** A captura real do pedido PV-001013 em perspectiva sutil (`rotateY 17°`, `rotateX 6°`), com luz controlada: uma faixa de luz atravessa a tela quando ela acende, e as sombras são longas e suaves.
- **Vista explodida.** As partes que geram trabalho em outra área são recortes da mesma captura e se destacam do pedido em profundidade:
  - cabeçalho com as ações;
  - totais;
  - Documento fiscal;
  - Andamento;
  - bloco Financeiro.

  Onde uma parte saiu, a base escurece de leve.
- **Consequências, uma a uma, do lugar exato que as causa.**
  - A janela real de reserva nasce do botão Reservar estoque.
  - O título CR-0002 sai do bloco Financeiro.
  - Documento fiscal e Andamento ligam-se, em tracejado (pela API), às telas reais de Faturamento e do fluxo do Início.
  - Tudo converge em Gestão.
- **Câmera documental.**
  1. Close no título do pedido (PV-001013, cliente, Aprovado).
  2. Panorâmica até as ações.
  3. Silêncio curto.
  4. Recuo com perspectiva.
  5. As partes se destacam.
  6. As consequências chegam.
  7. Convergência.
  8. Só então a declaração.
- **Sistema vivo.** Depois da sequência:
  - as partes flutuam de leve, cada uma no seu tempo;
  - sinais percorrem as ligações;
  - a câmera inclina com o ponteiro;
  - passar sobre uma parte acende a cadeia dela até a Gestão, e o resto recua.
- **Ligações.**
  - Com JS, são redesenhadas a cada quadro a partir das âncoras reais (`main.js`, com o corte da curva por de Casteljau para revelar sem desmanchar o tracejado).
  - No HTML estático, as mesmas linhas saem de uma projeção feita no build, com a mesma matemática do CSS (perspectiva, `rotateY`, `rotateX`, `translateZ`).
- **LCP.** A própria imagem do pedido é o maior elemento e aparece em ~0,3 s. Ela é pré-carregada por largura (`<link rel=preload media>`), e as telas de desktop e celular não baixam uma a outra.

Abaixo de 1100 px, a abertura segue a composição vertical (título, pedido e a espinha que desce com a rolagem).

## Ato 03: jornada escura e foco sem véu

A jornada vira palco escuro: os mesmos componentes, com os tokens redefinidos na seção. O foco sobre as telas passou a ser anel e luz. Nenhum véu escurece a captura; a câmera aproxima a região explicada. O escurecimento que aparece atrás de alguns diálogos é o do próprio app.

## Ato 04: protagonistas e capítulos

**Protagonistas.** Cada um é uma cena:
- a tela fica fixa, e a câmera anda entre as capturas reais de cada etapa, aproximando exatamente o que é explicado (troca por CSS: `translate` + `scale` com `cubic-bezier(0.65, 0, 0.25, 1)`, ~1,25 s);
- o texto da etapa rola ao lado;
- a etapa fora de foco recua pela cor.

| Protagonista | Tom | Etapas | Assinatura |
|---|---|---|---|
| Comercial | claro | Pedido → Aprovação → Cliente → Financeiro | PV-001013 |
| Estoque | escuro | Endereço → Produto no local → Estoque → Movimentação → Separação | FIL03 rua 05 |
| Financeiro | claro | Título → Vencimento → Contas → Caixa | CR-0002 |
| Fiscal e Logística | escuro | Documento → Documento calculado → Expedição → Transporte → Entrega | DF-0004 |

Cada protagonista traz:
- o problema;
- como o EDUCA resolve e para quem;
- um resumo de estados ("4 ações na tela · 1 consulta · 1 pela API · 1 em evolução");
- a ficha completa: o que você faz (com os selos), o que o sistema controla, as etapas no sistema e como se conecta (origem → destino, com o estado da ligação).

Nas etapas que existem só na API, aparece o cartão "Na API" com o endpoint real.

Honestidade nas cenas novas:
- Estoque e Fiscal/Logística dividem entre si os itens já conferidos do módulo Estoque e Logística; nenhum item foi criado.
- A palavra "rota" não existe no inventário; a cena usa "transporte".
- Telas vazias no ambiente das capturas (Saldo, Movimentações, Picking, Expedição, Transportes) aparecem com o aviso "No ambiente das capturas, ainda sem registros". Nelas, a câmera foca a estrutura e a regra da tela (por exemplo: "saldo derivado do registro de movimentações, nunca alterado diretamente pela tela").

**Capítulos compactos.** CRM, Suprimentos, Qualidade, Projetos e Serviços, Ativos e Manutenção, e Início, Painéis e Controladoria. Cada capítulo mantém:
- o problema;
- o funcionamento;
- o resumo de estados;
- as etapas (mini fluxo);
- o que você faz, com selos;
- o que o sistema controla;
- as ligações;
- todas as telas: a principal e as demais em miniaturas que ampliam.

Cadastros e Em evolução seguem no ato.

Sem JS e abaixo de 1100 px, os protagonistas viram lista: cada etapa com a tela já enquadrada.

## Ato 05: uma base, três níveis

**No desktop.** Uma pilha fixa de três planos (ERP, Administração da Empresa, Administração Central); o plano do nível em leitura sobe e ganha contorno. O texto de cada nível rola ao lado:

- **Base, a operação da empresa:** ERP · toda a empresa; 15 áreas; 13 painéis.
- **Acesso, cada pessoa vê o que as permissões permitem:**
  - convite;
  - cadeia Carla Mendes → Comprador → 23 permissões de Compras → Suprimentos;
  - o que a Administração da Empresa faz;
  - o passo a passo do convite ao limite de acesso;
  - 352 permissões.
- **Central, a plataforma controla empresas, ciclo de vida e módulos:** os pontos da Central; as telas; 19 módulos contratáveis; e a garantia de que ela não enxerga dados operacionais.

**Abaixo de 1100 px.** Cada nível mostra a própria tela.

## Motion

| Uso | Easing | Duração |
|---|---|---|
| Câmera (close, panorâmica, recuo) | `power2/3.inOut` | 0,95–1,6 s |
| Partes que se destacam | `power3.out` | 0,9 s |
| Consequências que surgem | `expo.out` | 0,75 s |
| Ligação desenhada | `power1.inOut` | 0,4–0,55 s |
| Troca de etapa (protagonistas) | `cubic-bezier(0.65, 0, 0.25, 1)` | 1,25 s |
| Plano do nível (Ato 05) | `cubic-bezier(0.2, 0.7, 0.1, 1)` | 0,8 s |
| Respiração | `sine.inOut` yoyo | 2,8–4,1 s |

A abertura completa roda uma vez por sessão, e rolar ou usar o teclado acelera a sequência (5×). Nada bloqueia conteúdo: sem JS, sem GSAP ou com movimento reduzido, cada cena está no estado final.

## Responsivo

| Largura | Composição |
|---|---|
| ≥ 1100 (1440, 1280) | Cena 3D da abertura; jornada fixa; protagonistas em teatro (texto 4/12, tela 8/12); pilha fixa do Ato 05 |
| 1024 / 820 | Abertura em grade; jornada, protagonistas e níveis em lista, cada etapa com a sua tela |
| < 700 (390) | Abertura vertical (título, pedido, espinha); raia fixa na jornada; protagonistas em lista vertical; mapa em camadas; convergência vertical; o fio corre rente à borda |

## Desempenho (V3 × V4)

Mesma máquina, Chromium headless sem GPU:

| Métrica | V3 | V4 |
|---|---|---|
| LCP 1ª visita (1440 / 390) | 2,67 / 1,05 s | 0,35 / 1,05 s |
| CLS | 0 | 0 |
| FPS abertura (1440) | 51 | 53 |
| FPS repouso na abertura (1440) | 61 | 57 (as ligações acompanham as partes que flutuam) |
| FPS jornada, rede, final (1440) | 60 | 60 |
| FPS Ato 04 rolando (1440) | — | 56 |
| FPS em todas as cenas (390) | 60 | 60 |
| Transferido na carga (1440) | JS 152 KB · CSS 71 KB · imagens 118 KB | JS 160 KB · CSS 92 KB · imagens 222 KB (partes do pedido, em WebP) |

As imagens abaixo da dobra são lazy. As telas da abertura de desktop e de celular são pré-carregadas só na largura delas.

## Acessibilidade

- **Axe:** 0 violações em 1440 e 390, claro e escuro, com movimento e com movimento reduzido.
- **Teclado:** mesma ordem de tabulação da V3; o foco visível segue em laranja.
- **Etapas fora de foco:** recuam pela cor, com contraste AA, nunca por transparência.
- **Sem JS:** a página fica completa, com todas as cenas em lista e as ligações da abertura já desenhadas.

## Comparação V3 × V4

As imagens lado a lado estão em `docs/landing/comparacao/v3-v4/`. As capturas finais da V4 estão em `docs/landing/capturas/`, e as da V3 em `capturas/v3/`.
