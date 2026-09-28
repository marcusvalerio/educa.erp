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
