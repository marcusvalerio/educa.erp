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

## Cenas e movimento (v2)

A direção está em `docs/landing/DIRECAO.md`, na seção "Versão 2". Cada cena tem um estado final completo no HTML. O JavaScript apenas anima até esse estado.

| Cena | Desktop (≥ 1100 px) | Tablet e celular | Sem JS / movimento reduzido |
|---|---|---|---|
| Abertura | Sequência orquestrada em uma timeline:<br>1. sinais soltos;<br>2. o pedido;<br>3. marcadores nos botões;<br>4. linhas até cada área;<br>5. título;<br>6. convergência em Gestão;<br>7. sinais percorrendo as linhas. | Tablet: pedido e áreas em grade.<br>Celular: espinha vertical. | Composição final estática |
| Cenário | Os registros saem dos silos e se alinham num fio (scrub) | Mesma cena, deslocamentos menores | Lista alinhada |
| Siga um pedido | Cena fixa em seis tempos:<br>- a câmera aproxima a região da tela;<br>- o cursor clica no botão real (etapas na tela);<br>- o cartão mostra o endpoint real (etapas na API). | Lista; cada tela aproxima a sua região ao passar | Lista com destaques |
| Módulos | A tela endireita ao entrar; a troca de aba é por máscara; inclinação leve sob o ponteiro | A tela endireita ao entrar (a partir de 700 px) | Estático |
| Conexões | Mapa fixo; os quatro capítulos acendem as suas cadeias; sinais nas ligações | Mapa em camadas verticais no celular | Todas as ligações acesas |
| Chamada | Os silos se juntam e a resposta aparece | Idem, em grade 3 × 2 | Barra unida |

Regras:

- Só se animam `transform` e `opacity`. Blur aparece só em entradas curtas da abertura.
- A câmera usa zoom com contratranslação calculado no build, a partir das coordenadas da captura (`focus`, `cursor`).
- Com `prefers-reduced-motion` ou sem GSAP, `motion.js` não roda e a página mostra o estado final.
- Não há CTA de cadastro. O único acesso é "Entrar no EDUCA", que leva a `/login` do app.
