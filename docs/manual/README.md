# Manual oficial do EDUCA.ERP

| Documento | Fonte (Markdown) | PDF | Para quem |
|---|---|---|---|
| Manual do Usuário | [`MANUAL_DO_USUARIO.md`](MANUAL_DO_USUARIO.md) | [`pdf/EDUCA-Manual-do-Usuario.pdf`](pdf/EDUCA-Manual-do-Usuario.pdf) | Quem usa o ERP no dia a dia: navegação, módulos, cadastros, pedidos, painéis. |
| Manual de Administração | [`MANUAL_DE_ADMINISTRACAO.md`](MANUAL_DE_ADMINISTRACAO.md) | [`pdf/EDUCA-Manual-de-Administracao.pdf`](pdf/EDUCA-Manual-de-Administracao.pdf) | Administrador da empresa (usuários, convites, papéis, RBAC) e Owner/Admin da plataforma (Administração Central). |
| Cobertura do manual | [`MANUAL_COVERAGE.md`](MANUAL_COVERAGE.md) | — | Matriz funcionalidade × documentação × captura × fluxo validado, e os problemas encontrados. |

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Textos (fonte oficial) | `docs/manual/*.md` |
| Capturas de tela | `docs/manual/assets/<módulo>/*.webp` (246 imagens) |
| PDFs gerados | `docs/manual/pdf/` |
| Gerador dos PDFs | `scripts/build-manuals.mjs` (`npm run manuals:pdf`) |

- **Versão documentada:** interface redesenhada (`claude/educa-redesign`) em modo PostgreSQL/Neon Auth, verificada em ambiente local de QA em 27/09/2026. A produção ainda usa a interface anterior.
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

1. converte o Markdown (marked) em HTML com a identidade do EDUCA: fontes de `src/app/fonts`, cores do tema, marca na capa;
2. monta capa, sumário com número de página, cabeçalho (manual e seção), rodapé (versão, aviso de dados fictícios, "Página X de Y");
3. transforma cada imagem seguida da legenda `*Figura N — ...*` em uma figura indivisível no PDF, logo abaixo do texto que a explica;
4. pagina com Paged.js no Chromium (Playwright) e grava o PDF (A4, marcadores e texto pesquisável);
5. **confere o resultado** e termina com erro se houver imagem que não carregou, figura faltando, imagem ou tabela fora da margem, título ou rótulo sozinho no pé da página, tabela partida só com o cabeçalho, página em branco ou link interno sem destino.

Convenções para quem editar os Markdown:

- Toda imagem deve vir seguida, na linha de baixo, da legenda `*Figura N — descrição.*`. O gerador avisa se alguma imagem estiver sem legenda.
- A versão impressa na capa e no rodapé vem do último commit do Markdown (`data · hash`). Faça commit do Markdown antes de gerar, para o PDF não sair marcado com "alterações locais".
- Os marcadores (🔐 ✅ 🟡 🔎 ⛔ ⚠️) precisam de uma fonte de emoji no sistema (ex.: Noto Color Emoji).
- Referências entre os dois manuais aparecem no PDF como texto com o nome do outro arquivo; os links do sumário e do próprio manual são clicáveis.
