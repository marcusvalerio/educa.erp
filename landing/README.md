# Landing do ATLAS.ERP

Site institucional e demonstração do produto: o que o ATLAS.ERP é, para quem, como cada área funciona e como as áreas se conectam, sempre com as telas reais do manual.

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
- **Destaques (`focus`)** usam coordenadas da captura original em pixels: `[x, y, largura, altura]`. Nos módulos, `zoom` (padrão 1.9) permite aproximar mais a câmera; é o que enquadra as telas que, no ambiente das capturas, ainda estão sem registros (título, abas e filtros ficam; o "Nenhum registro ainda" sai do quadro).

## Identidade e tipografia (refino de 29/09/2026)

- **Símbolo "Núcleo":** quatro módulos em torno de um centro em fogo. A geometria única está em `BRAND_MARK` (`src/lib/brand.ts`) e é repetida no gerador (cabeçalho, rodapé, nó da convergência e favicon) e em `src/app/icon.svg`.
- **Tipografia:** títulos em Instrument Serif; corpo, rótulos, metadados e selos em DM Sans (token `--label`); a JetBrains Mono fica só para código, rotas de tela, códigos de registro, a marca-d'água e as composições do hero e da convergência.
- **Hierarquia dos módulos:** título → problema (serifado) → como resolve → metadados (resumo de estados). Selos e blocos de API ficam um nível abaixo da narrativa.
- **Manuais:** os PDFs continuam gerados e publicados em `/landing/manuais/` (e os endereços antigos respondem 308), mas a landing não os oferece — os manuais completos são para quem já usa o sistema.

## Cenas e movimento (V4)

A direção está em `docs/landing/DIRECAO.md`, na seção "Versão 4". A página é um filme em sete atos, atravessado por um fio contínuo. Cada cena tem um estado final completo no HTML; o JavaScript apenas anima até esse estado.

| Ato | Desktop (≥ 1100 px) | Tablet e celular | Sem JS / movimento reduzido |
|---|---|---|---|
| 01 Ligação | O pedido PV-001013 como objeto 3D em vista explodida:<br>- câmera documental;<br>- partes que se destacam;<br>- consequências nas áreas;<br>- convergência em Gestão;<br>- declaração.<br><br>Uma vez por sessão. | Título, pedido e espinha vertical | Quadro final, com as ligações projetadas no build |
| 02 Silos | Registros soltos que se alinham num fio | Idem | Lista alinhada |
| 03 Um pedido atravessa a empresa | Cena fixa escura com câmera por etapa | Lista com raia fixa | Lista com destaques |
| 04 As áreas | 4 protagonistas em "teatro":<br>- tela fixa;<br>- câmera por etapa;<br>- alternância claro/escuro;<br>- ficha completa.<br><br>Mais capítulos compactos. | Lista: cada etapa com a sua tela | Lista |
| 05 Uma base, três níveis | Pilha fixa de três planos; o nível em leitura sobe | Cada nível com a sua tela | Estático |
| 06 O sistema | Mapa em capítulos; sinal origem → destino | Mapa em camadas verticais | Todas as ligações acesas |
| 07 Convergência | As áreas convergem na marca; o fio entra na convergência | Versão vertical | Convergência desenhada |

Arquivos novos da V4:
- `scripts/build-landing.mjs`:
  - `heroWorld()`: a cena 3D e a projeção das ligações;
  - `protagonist()` e `chapter()`: o Ato 04;
  - `levels()`: o Ato 05;
  - `actHead()`: o marcador de ato.
- `landing/src/content.mjs`:
  - `ACTS`;
  - `HERO.stage`, `HERO.parts` e `HERO.buttons`: recortes da captura do pedido;
  - `PROTAGONISTS`: etapas, enquadramentos e textos conferidos;
  - `LEVELS`.
- `landing/src/main.js`:
  - ligações da abertura (`EDUCA.hxDraw`);
  - o fio;
  - etapas dos protagonistas;
  - níveis.
- `landing/src/motion.js`: sequência da abertura (GSAP).

Regras:

- Só se animam `transform`, `opacity` e `clip-path` (em revelações curtas). Não há blur, glow ou vidro na abertura.
- As câmeras usam zoom com contratranslação calculado no build, a partir das coordenadas da captura (`focus`, `cursor`). O foco é anel e luz, nunca um véu sobre a tela.
- A imagem do pedido é o LCP no desktop e é pré-carregada só nessa largura. As telas do celular têm o próprio preload.
- A abertura completa roda uma vez por sessão (`sessionStorage`, chave `educa-intro`). Para rever, abra uma aba nova.
- Com `prefers-reduced-motion` ou sem GSAP, `motion.js` não roda: a página mostra o estado final, e o fio aparece inteiro.
- Não há CTA de cadastro. O único acesso é "Entrar no ATLAS.ERP" (topo, abertura e final), que leva a `/login` do app.

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
