# Landing do EDUCA

Site institucional e demonstração do produto: o que o EDUCA é, para quem, como cada área funciona e como as áreas se conectam, sempre com as telas reais do manual.

É um **site estático** fora do app Next. O `proxy.ts` do app manda qualquer rota não pública para `/login`, e abrir uma rota pública exigiria mexer na autenticação. Por isso a landing não depende do app, do banco nem da API.

| O quê | Onde |
|---|---|
| Conteúdo (fonte de verdade) | `landing/src/content.mjs` |
| Estilos | `landing/src/styles.css` |
| Interações (abas, ampliar tela, mapa, menu) | `landing/src/main.js` |
| Cenas com movimento (GSAP + ScrollTrigger) | `landing/src/motion.js` |
| Gerador | `scripts/build-landing.mjs` (`npm run landing:build`) |
| Site gerado (versionado) | `landing/site/` |
| Inventário e direção | `docs/landing/INVENTARIO.md`, `docs/landing/DIRECAO.md` |

## Gerar

```bash
npm install            # sharp já vem com o Next
npm run landing:build  # gera landing/site/
```

O gerador:

1. lê `content.mjs` e escreve `landing/site/index.html`;
2. recorta as capturas de `docs/manual/assets`:
   - telas de 1440×900 perdem o menu lateral do app;
   - listas curtas perdem o fundo vazio;
   - recortes manuais (`crop`) e destaques (`focus`) vêm do conteúdo;
3. grava cada captura em WebP, com uma versão de 760 px para telas estreitas;
4. copia as fontes do app (`src/app/fonts`, licença OFL) e o GSAP 3.13 + ScrollTrigger de `node_modules/gsap` para `landing/site/vendor/`. O GSAP é distribuído pela licença padrão sem custo (gsap.com/standard-license), e o site não depende de CDN;
5. copia os PDFs de `docs/manual/pdf` para `landing/site/manuais/`. Essa pasta fica fora do Git, porque os PDFs já estão versionados em `docs/manual/pdf`.

Para ver localmente:

```bash
cd landing/site && python3 -m http.server 4310   # http://localhost:4310
```

Opção `--preview <arquivo.html>`: gera também uma página única, com CSS e JS embutidos e fontes do Google Fonts, para publicar como prévia. Os PDFs não entram nela.

## Publicar

Qualquer hospedagem estática serve. **Rode o build antes de publicar**, para que `manuais/` exista.

Exemplo na Vercel: um projeto separado do app, com

- diretório raiz na raiz do repositório;
- comando de build `npm run landing:build`;
- diretório de saída `landing/site`.

Assim o app, a autenticação e o banco não são tocados.

## Regras do conteúdo

- **Só entra o que foi conferido** no código, nos manuais ou nas telas. Cada capacidade leva um estado:
  - `tela`: ação executável na interface;
  - `consulta`: lista, filtros e detalhe;
  - `api`: está no núcleo, sem botão na tela;
  - `evolucao`: parcial ou com falha conhecida.
- **Códigos e valores** citados (PV-001013, CR-0002, R$ 36.011,62…) aparecem nas capturas. Ao trocar uma captura, confira de novo o texto que a cita.
- **Rotas de detalhe** aparecem como `/:id`, porque o app usa identificadores internos, não o código do registro.
- **Destaques (`focus`)** usam coordenadas da captura original em pixels: `[x, y, largura, altura]`.

## Cenas e movimento (v3)

A direção está em `docs/landing/DIRECAO.md`, na seção "Versão 3". Cada cena tem um estado final completo no HTML. O JavaScript apenas anima até esse estado.

| Cena | Desktop (≥ 1100 px) | Tablet e celular | Sem JS / movimento reduzido |
|---|---|---|---|
| Abertura | Timeline única, uma vez por sessão:<br>vazio → portas → molduras → códigos → varredura do pedido → marcadores → sinal por ligação e revelação de cada área → convergência em Gestão → câmera recua → título.<br><br>Depois: respiração, inclinação sob o ponteiro e foco por área. | Tablet: declaração e depois a grade.<br>Celular: declaração, pedido e espinha que desce com a rolagem. | Composição final estática |
| Cenário | Registros saem dos silos e se alinham num fio (scrub) | Idem, deslocamentos menores | Lista alinhada |
| Plataforma | Números como escala (pontos que acendem e valor que conta); ambientes em leque | Números em 2 × 2 | Pontos e valores finais |
| Siga um pedido | Cena fixa: origem "00 Pedido" e seis tempos com câmera, legenda "Em foco", cursor (na tela) ou endpoint (na API) | Lista com raia fixa; cada tela aproxima a sua região | Lista com destaques e legendas |
| Módulos | Tela 8/12, fixa ao ler; endireita ao entrar; troca de aba por máscara; numeral em parallax | Tela endireita (≥ 700 px) | Estático |
| Conexões | Capítulos acendem as cadeias; sinal origem → destino com resposta no destino | Mapa em camadas verticais | Todas as ligações acesas |
| Chamada | Seis áreas convergem para a marca EDUCA (SVG) | Versão vertical | Convergência desenhada |

Regras:

- Só se animam `transform`, `opacity` e `clip-path` (em revelações curtas). Não há blur na abertura.
- A câmera usa zoom com contratranslação calculado no build, a partir das coordenadas da captura (`focus`, `cursor`).
- Os traços com `non-scaling-stroke` são medidos em pixels de tela (`dashLen` em `motion.js`).
- Com `prefers-reduced-motion` ou sem GSAP, `motion.js` não roda e a página mostra o estado final.
- A abertura completa roda uma vez por sessão (`sessionStorage`, chave `educa-intro`). Para rever, abra uma aba nova.
- Não há CTA de cadastro. O único acesso é "Entrar no EDUCA", que leva a `/login` do app.

## Verificação

Os roteiros de QA ficam fora do repositório. Para repetir a verificação:

1. Gere o site: `npm run landing:build`.
2. Sirva o site: `cd landing/site && python3 -m http.server 4310`.
3. Rode as verificações com Playwright (Chromium já instalado):
   - `scrollWidth` em 1440, 1280, 1024, 820 e 390;
   - console limpo;
   - axe (`node_modules/axe-core`) com movimento reduzido e no estado final;
   - links e âncoras;
   - página com JavaScript desativado.
4. Rode `npm run lint`, `npx tsc --noEmit` e `npm test`.
