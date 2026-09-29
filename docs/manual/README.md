# Manual oficial do ATLAS.ERP

| Documento | Fonte (Markdown) | PDF | Para quem |
|---|---|---|---|
| Manual do Usuário | [`MANUAL_DO_USUARIO.md`](MANUAL_DO_USUARIO.md) | [`pdf/ATLAS-ERP-Manual-do-Usuario.pdf`](pdf/ATLAS-ERP-Manual-do-Usuario.pdf) | Quem usa o ERP no dia a dia: navegação, módulos, cadastros, pedidos, painéis. |
| Manual de Administração | [`MANUAL_DE_ADMINISTRACAO.md`](MANUAL_DE_ADMINISTRACAO.md) | [`pdf/ATLAS-ERP-Manual-de-Administracao.pdf`](pdf/ATLAS-ERP-Manual-de-Administracao.pdf) | Administrador da empresa (usuários, convites, papéis, RBAC) e Owner/Admin da plataforma (Administração Central). |
| Cobertura do manual | [`MANUAL_COVERAGE.md`](MANUAL_COVERAGE.md) | — | Matriz funcionalidade × documentação × captura × fluxo validado, e os problemas encontrados. |

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Textos (fonte oficial) | `docs/manual/*.md` |
| Capturas de tela | `docs/manual/assets/<módulo>/*.webp` (248 imagens) |
| PDFs gerados | `docs/manual/pdf/` |
| Gerador dos PDFs | `scripts/build-manuals.mjs` (`npm run manuals:pdf`) |

- **Versão documentada:** ATLAS.ERP com a interface atual (landing em `/`, entrada em `/login`, sistema em `/app`), verificada em ambiente local de QA em 27/09/2026; convite pela Administração da Empresa e papéis Gerente/Vendedor verificados em 29/09/2026.
- **Nome do produto:** até 28/09/2026 o produto se chamava EDUCA.ERP. Os PDFs têm nomes novos (`ATLAS-ERP-*.pdf`); os endereços antigos (`/landing/manuais/EDUCA-*.pdf`) respondem 308 para os novos.
- **Capturas e a troca de marca:** as capturas originais (27/09) mostravam a marca anterior. A marca foi trocada **só nas regiões da marca**, a partir de referências renderizadas pelo próprio app (a mesma tela, no mesmo estado e tema, antes e depois da troca): uma região só é substituída se coincidir com a referência antiga, e o resultado é conferido por OCR. Quando a marca aparece no texto da tela ou a captura é um recorte, o trecho antigo é procurado em qualquer posição da captura e só é trocado se coincidir com a referência antiga. O conteúdo das telas não foi editado. Foram capturadas de novo na aplicação em 29/09/2026 as figuras cujo conteúdo mudou: o convite pela empresa (`admin/60`, `admin/61`, novas), Membros da plataforma (`central/13`–`15`, com o texto e o aviso de governança atuais) e o menu da conta do Owner (`central/20`, com **Sobre o ATLAS.ERP**).
- **E-mails fictícios nas capturas de 27/09:** a usuária convidada do manual aparece como `carla.mendes@educa-manual.test` (domínio `.test`, reservado para testes e inexistente). É um endereço de exemplo, não a marca; as capturas não foram alteradas por isso.
- **Imagens:** capturadas da aplicação real com dados fictícios. Nenhum segredo ou dado de cliente aparece nas figuras; o código de convite foi ocultado.
- **Regra editorial:** só está descrito como disponível o que foi aberto e, quando possível, executado na interface. O que existe só por API, o que falhou e o que foi apenas conferido na tela (sem executar) está marcado no texto.

## Como regenerar os PDFs

Os Markdown são a fonte. Depois de alterar um manual (ou uma captura), gere os PDFs de novo e faça commit dos arquivos em `docs/manual/pdf/`.

```bash
npm install                      # instala marked, pagedjs e playwright (devDependencies)
npx playwright install chromium  # só na primeira vez, se não houver Chromium compatível
npm run manuals:pdf              # gera os dois PDFs
```

Opções:

```bash
node scripts/build-manuals.mjs --only usuario          # só o Manual do Usuário (ou: administracao)
node scripts/build-manuals.mjs --snapshots /tmp/pags 1,2,10   # também salva PNG dessas páginas
CHROMIUM_PATH=/caminho/do/chromium npm run manuals:pdf  # usa um Chromium já instalado
```

O gerador:

1. converte o Markdown (marked) em HTML com a identidade do ATLAS.ERP: fontes de `src/app/fonts`, cores do tema, marca na capa;
2. monta capa, sumário com número de página, cabeçalho (manual e seção), rodapé (versão, aviso de dados fictícios, "Página X de Y");
3. transforma cada imagem seguida da legenda `*Figura N — ...*` em uma figura indivisível no PDF, logo abaixo do texto que a explica;
4. pagina com Paged.js no Chromium (Playwright) e grava o PDF (A4, marcadores e texto pesquisável);
5. **confere o resultado** e termina com erro se houver imagem que não carregou, figura faltando, imagem ou tabela fora da margem, título ou rótulo sozinho no pé da página, tabela partida só com o cabeçalho, página em branco ou link interno sem destino.

Convenções para quem editar os Markdown:

- Toda imagem deve vir seguida, na linha de baixo, da legenda `*Figura N — descrição.*`. O gerador avisa se alguma imagem estiver sem legenda.
- A versão impressa na capa e no rodapé vem do último commit do Markdown (`data · hash`). Faça commit do Markdown antes de gerar, para o PDF não sair marcado com "alterações locais".
- Os marcadores (🔐 ✅ 🟡 🔎 ⛔ ⚠️) precisam de uma fonte de emoji no sistema (ex.: Noto Color Emoji).
- Referências entre os dois manuais aparecem no PDF como texto com o nome do outro arquivo; os links do sumário e do próprio manual são clicáveis.
