# ATLAS.ERP — Product tour (vídeo institucional)

| Item | Valor |
|---|---|
| Arquivo | [`ATLAS-ERP-product-tour.mp4`](ATLAS-ERP-product-tour.mp4) |
| Duração | 3:54,7 |
| Vídeo | 1920×1080, 30 fps, H.264 (High), yuv420p, BT.709 |
| Áudio | AAC 192 kbps, 48 kHz, estéreo — trilha + sound design sintetizados |
| Conteúdo | 16 cenas: capturas reais do ambiente de demonstração (dados fictícios) + motion graphics |

O vídeo apresenta:

- o que é o ATLAS.ERP e para quem é;
- como uma empresa se estrutura na plataforma (Administração Central → empresa → usuários e funções);
- os módulos e como eles se conectam;
- um pedido real de ponta a ponta: **PV-0223**, da Órbita Distribuidora;
- o isolamento multiempresa;
- a centralização da operação.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| [`ROTEIRO.md`](ROTEIRO.md) | roteiro técnico e storyboard, com o detalhamento descrito abaixo |
| [`storyboard.jpg`](storyboard.jpg) | um quadro representativo por cena (16) |
| [`quadros-chave.jpg`](quadros-chave.jpg) | três quadros por cena, para revisão |
| `fontes/` | tudo o que é preciso para **reproduzir ou atualizar** o vídeo (ver abaixo) |

Para cada cena, o `ROTEIRO.md` traz:

- duração e tempos;
- telas reais usadas (captura, rota e usuário);
- o que é gravação e o que é motion graphics;
- o texto em tela;
- os efeitos sonoros;
- a transição;
- as notas de honestidade.

### `fontes/`

| Arquivo | Papel |
|---|---|
| `compositor.html` | palco 1920×1080: estilos, fontes da marca (Instrument Serif, Instrument Sans e JetBrains Mono, de `src/app/fonts`) |
| `engine.js` | motor determinístico. Cada quadro é função pura do tempo: janela com câmera (zoom/pan), destaques, cursor só nos cliques, legendas, pipelines e transições |
| `scenes.js` | **o roteiro executável**: 16 cenas com tempos, telas, câmera, destaques, textos e deixas de som |
| `render.mjs` | renderização com Playwright/Chromium: `timeline` (exporta cenas e deixas), `stills` (quadros para revisão) e `video` (MP4, com processos em paralelo) |
| `audio.py` | trilha e efeitos sintetizados (numpy/scipy), guiados por `timeline.json` |
| `timeline.json` | tempos de cada cena e as 212 deixas de áudio exportadas pelo compositor |
| `shots/` | as 65 capturas reais (1600×900 @2x), em WebP sem perdas |
| `captura/prep.mjs` | preparação dos dados da história pela API (orçamentos, pedido do orçamento aprovado, ciclo de compras) |
| `captura/capture.mjs` | captura das telas e execução da história (cliques reais onde há interface; API onde não há) |
| `revisao.py` | gera folhas de contato a partir dos quadros de revisão |

## Como reproduzir

Requisitos:

- Node 20+ com as dependências do repositório (`playwright`, com o Chromium instalado);
- `ffmpeg` com `libx264`;
- Python 3.11 com `numpy` e `scipy`.

```bash
cd docs/homologacao/video/fontes

# 1. tempos e deixas de áudio
node render.mjs timeline

# 2. revisão: quadros específicos (escala 0,5) e folha de contato
node render.mjs stills 5,20,45,90,150,190 revisao 0.5
python revisao.py revisao folha 4

# 3. trilha e efeitos
python audio.py timeline.json tour-audio.wav

# 4. vídeo (master sem áudio) e mux final
FFMPEG=ffmpeg node render.mjs video master.mp4 --workers 3 --crf 14
ffmpeg -i master.mp4 -i tour-audio.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 21 -tune animation -pix_fmt yuv420p \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest \
  ../ATLAS-ERP-product-tour.mp4
```

Para **atualizar** o vídeo:

- **Texto, tempo, câmera ou destaque:** edite `scenes.js`. As coordenadas são as da captura (1600×900 CSS).
- **A interface mudou:** recapture as telas com `captura/capture.mjs`.
  - Ela precisa do stack local de homologação (app em `:3200`, PostgreSQL, dublê do Neon Auth) e da empresa demo **Órbita Distribuidora** criada pelo teste de 7 empresas.
  - As senhas vêm **só** de variáveis de ambiente (`E2E7_PASSWORD`, `HOMOLOG_PASSWORD`) e nunca ficam no repositório.
  - Converta as PNG para WebP (`shots/<nome>.webp`).

Em qualquer caso, rode de novo `timeline` → `audio.py` → `video`.

## Processo seguido

1. **Roteiro.** Foram definidas as 16 cenas pedidas, com objetivo e texto curto por cena.
2. **Mapa cena → tela real.** A história é o pedido PV-0223, executado de verdade com o usuário de cada papel. As 65 telas foram capturadas em alta resolução.
3. **Gravação × motion graphics.** O que é tela real, o que é clique real, o que foi feito pela API e o que é explicação conceitual está na tabela do `ROTEIRO.md`.
4. **Trilha e sound design.** Foram sintetizados do zero (sem música genérica de banco), com arco dinâmico ligado às cenas.
5. **Gravação das cenas.** As capturas foram feitas com a interface real: Playwright, `deviceScaleFactor` 2, tema claro, `pt-BR`, fuso de São Paulo. O selo "HOMOLOGAÇÃO" é ocultado só na captura; o vídeo leva o aviso fixo "Capturas reais do ambiente de demonstração · dados fictícios".
6. **Primeiro corte.** Compositor + roteiro em código.
7. **Prévia.** Foram renderizados 127 quadros de revisão, um a cada 2 s, e montadas folhas de contato. O áudio foi revisado por espectrograma e envelope de volume.
8. **Revisão.** A prévia levou a estas correções:
   - a frase final da cena 4 ganhou +1,5 s de leitura;
   - as aberturas com pipeline (cenas 6, 8 e 9) foram adiadas e alongadas, para não sobrepor o texto da cena anterior;
   - a tela de NCM saiu do corte, porque continha registros de teste;
   - o enquadramento das listas de NF-e e de expedições foi corrigido;
   - os cartões do fluxo completo ficaram maiores;
   - no áudio: macro-dinâmica (abertura baixa, pico no fluxo), silêncio real no corte da cena 2 e rebalanceamento dos efeitos (cliques e transições estavam baixos demais).
9. **MP4 final.** O master foi renderizado em CRF 14 e o mux com o áudio saiu em CRF 21, `faststart`.

## Honestidade — o que o vídeo **não** afirma

- **NF-e para em "Pronta".** A autorização na SEFAZ exige certificado digital e não foi executada. A etapa "Autorizada" aparece tracejada e apagada, com aviso.
- **Sem tela "Novo pedido" nem "Gerar NF-e"** nesta versão. Pedido e documento fiscal foram criados pela API; o vídeo avisa.
- **Pela API, com aviso na tela:** separação, embalagem, expedição, entrega, recebimento de compra e baixa do título. O vídeo mostra o resultado nas telas reais e o aviso.
- **A permissão marcada na cena 4 foi descartada.** O papel não foi alterado.
- **Categorias** aparecem só como campo do produto. A criação pela tela de catálogo tem bug conhecido (B8).
- **Números:** não há números destacados ou inventados. Os valores visíveis são os da base fictícia.
- **Ambiente:** todas as telas vêm do ambiente local de homologação (build de produção do app), **não** da produção. Os dados são fictícios.
