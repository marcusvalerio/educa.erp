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
