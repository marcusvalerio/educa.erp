#!/usr/bin/env node
// Gera os PDFs dos manuais do ATLAS.ERP a partir dos Markdown de docs/manual/.
//
//   npm run manuals:pdf                      # gera os dois PDFs em docs/manual/pdf/
//   node scripts/build-manuals.mjs --only usuario --snapshots /tmp/pags 1,5,12
//
// Pipeline: Markdown (marked) -> HTML com a identidade do ATLAS.ERP (fontes de
// src/app/fonts, tokens de cor do globals.css) -> paginação de impressão com
// Paged.js no Chromium (Playwright) -> PDF. As figuras são embutidas no PDF,
// logo abaixo do trecho que explicam, com a legenda "Figura N — ...".
//
// Depois de paginar, o script confere o resultado e falha (exit 1) se houver:
// imagem que não carregou, figura faltando, imagem fora da área útil, título
// sozinho no pé da página, página em branco ou link interno sem destino.
//
// Requisitos: devDependencies marked, pagedjs e playwright; um Chromium
// compatível (npx playwright install chromium) ou CHROMIUM_PATH apontando para
// um executável. Para os ícones dos marcadores (🔐 ⚠️ ✅ ...), uma fonte de emoji
// no sistema (ex.: Noto Color Emoji).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANUAL_DIR = path.join(ROOT, "docs/manual");
const OUT_DIR = path.join(MANUAL_DIR, "pdf");

const MANUALS = [
  { key: "usuario", source: "MANUAL_DO_USUARIO.md", output: "ATLAS-ERP-Manual-do-Usuario.pdf", title: "Manual do Usuário", audience: "Para quem usa o ATLAS.ERP no dia a dia" },
  { key: "administracao", source: "MANUAL_DE_ADMINISTRACAO.md", output: "ATLAS-ERP-Manual-de-Administracao.pdf", title: "Manual de Administração", audience: "Administrador da Empresa e Administração Central" },
];
// Referências entre manuais citam o PDF irmão pelo nome do arquivo.
const LINK_MAP = Object.fromEntries(MANUALS.map((m) => [m.source, m.output]));

// ---------------------------------------------------------------- argumentos
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag("--only");
const snapshotsDir = flag("--snapshots");
const snapshotPages = (args[args.indexOf("--snapshots") + 2] ?? "")
  .split(",")
  .map((n) => Number(n))
  .filter((n) => n > 0);

// ---------------------------------------------------------------- utilidades
/** Âncora no mesmo formato do GitHub, para os links internos dos Markdown continuarem valendo. */
function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "")
    .replace(/ /g, "-");
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function gitInfo(file) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs %h", "--", file], { cwd: ROOT, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", file], { cwd: ROOT, encoding: "utf8" }).trim() !== "";
    const [date, hash] = out.split(" ");
    return { date, hash: dirty ? `${hash}+alterações locais` : hash };
  } catch {
    return { date: new Date().toISOString().slice(0, 10), hash: "sem git" };
  }
}
const brDate = (iso) => iso.split("-").reverse().join("/");

// ---------------------------------------------------------------- Markdown -> HTML
function prepareMarkdown(md) {
  // H1 e o bloco de avisos logo abaixo viram a capa.
  const lines = md.split("\n");
  const h1 = lines.findIndex((l) => l.startsWith("# "));
  let i = h1 + 1;
  while (i < lines.length && (lines[i].trim() === "" || lines[i].startsWith(">"))) i++;
  const headerNotes = lines
    .slice(h1 + 1, i)
    .filter((l) => l.startsWith(">"))
    .map((l) => l.replace(/^>\s?/, ""));
  let body = lines.slice(i).join("\n");

  // O índice do Markdown é substituído pelo sumário paginado do PDF.
  body = body.replace(/^## Índice\n[\s\S]*?(?=^#{2,3} )/m, "");
  body = body.replace(/^### Como ler este manual$/m, "## Como ler este manual");

  // Figura: imagem + legenda "*Figura N — ...*" viram um <figure> indivisível.
  let figures = 0;
  body = body.replace(/^!\[([^\]]*)\]\((assets\/[^)]+)\)\n\*(Figura \d+ — [^\n]*?)\*$/gm, (_, alt, src, caption) => {
    figures += 1;
    return `<figure><img src="/docs/manual/${src}" alt="${escapeHtml(alt)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
  });
  const orphanImages = (body.match(/^!\[/gm) ?? []).length;

  // Links para outros documentos: o Chromium resolveria um link relativo contra o
  // servidor temporário do build, então a referência vira texto com o nome do arquivo.
  body = body.replace(/\[([^\]]+)\]\(([A-Z_]+\.md)(#[^)]*)?\)/g, (_, text, file) =>
    LINK_MAP[file] ? `**${text}** (arquivo \`${LINK_MAP[file]}\`)` : `**${text}** (\`docs/manual/${file}\`)`
  );
  return { headerNotes, body, figures, orphanImages };
}

function renderHtml(markdown) {
  const toc = [];
  const used = new Map();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let id = githubSlug(text);
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        // O sumário usa uma âncora própria (seletor CSS válido para o Paged.js);
        // o id no formato do GitHub continua servindo aos links do texto.
        let anchor = "";
        if (depth === 2 || depth === 3) {
          const tocId = `sec-${toc.length + 1}`;
          toc.push({ depth, id: tocId, text: inner });
          anchor = `<span id="${tocId}"></span>`;
        }
        return `<h${depth} id="${id}">${anchor}${inner}</h${depth}>\n`;
      },
      blockquote({ tokens }) {
        const inner = this.parser.parse(tokens);
        const kind = inner.includes("⚠️") ? "warn" : inner.includes("⛔") ? "blocked" : "note";
        return `<blockquote class="callout ${kind}">${inner}</blockquote>\n`;
      },
      table(token) {
        const head = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</th>`).join("");
        const rows = token.rows
          .map((r) => `<tr>${r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`)
          .join("\n");
        const cols = token.header.length;
        return `<table class="cols-${cols}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>\n`;
      },
    },
  });
  return { html: marked.parse(markdown), toc };
}

// ---------------------------------------------------------------- página
// Símbolo "Núcleo" — mesma geometria de BRAND_MARK (src/lib/brand.ts),
// conferida por tests/brand.test.ts. Na capa escura: módulos claros e o
// centro em fogo.
const MARK = { modules: [[3, 3, 16, 8], [21, 3, 8, 16], [13, 21, 16, 8], [3, 13, 8, 16]], core: [13, 13, 6, 6], r: 1.4 };
const MARK_SVG = (size) =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">` +
  MARK.modules.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${MARK.r}" class="mark-mod"/>`).join("") +
  `<rect x="${MARK.core[0]}" y="${MARK.core[1]}" width="${MARK.core[2]}" height="${MARK.core[3]}" rx="${MARK.r}" class="mark-core"/></svg>`;

function pageCss(manual, meta) {
  const footerLeft = `Versão ${brDate(meta.date)} · ${meta.hash}`;
  return `
@font-face { font-family: "Instrument Sans"; src: url("/src/app/fonts/instrument-sans-latin-wght-normal.woff2") format("woff2"); font-weight: 400 700; }
@font-face { font-family: "Instrument Sans"; src: url("/src/app/fonts/instrument-sans-latin-ext-wght-normal.woff2") format("woff2"); font-weight: 400 700; unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: "Instrument Serif"; src: url("/src/app/fonts/instrument-serif-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Instrument Serif"; font-style: italic; src: url("/src/app/fonts/instrument-serif-latin-400-italic.woff2") format("woff2"); }
@font-face { font-family: "JetBrains Mono"; src: url("/src/app/fonts/jetbrains-mono-latin-wght-normal.woff2") format("woff2"); font-weight: 100 800; }

:root { --ink: #100c08; --muted: #5d5a57; --subtle: #8a8784; --paper: #ffffff; --sheet: #f5f6f6; --line: #dedfe0; --accent: #ff9408; --accent-soft: #fff1de; --warn-bg: #fff4e5; --warn-line: #e07b00; --danger-bg: #fdecea; --danger-line: #c8372d; --note-bg: #f2f4f5; }

@page {
  size: A4;
  margin: 20mm 17mm 20mm 17mm;
  @top-left { content: "ATLAS.ERP · ${manual.title}"; font: 600 7.5pt "Instrument Sans"; color: var(--muted); letter-spacing: .02em; }
  @top-right { content: string(section); font: 500 7.5pt "Instrument Sans"; color: var(--subtle); }
  @bottom-left { content: "${footerLeft}"; font: 400 7pt "Instrument Sans"; color: var(--subtle); }
  @bottom-center { content: "Dados fictícios de demonstração"; font: 400 7pt "Instrument Sans"; color: var(--subtle); }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 600 7.5pt "Instrument Sans"; color: var(--ink); }
}
@page cover { margin: 0; @top-left { content: none; } @top-right { content: none; } @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; } }
@page toc { @top-right { content: "Sumário"; } }

html { font-family: "Instrument Sans", "Noto Color Emoji", sans-serif; font-size: 9.6pt; line-height: 1.5; color: var(--ink); }
body { margin: 0; }

/* capa */
.cover { page: cover; break-after: page; height: 297mm; width: 210mm; box-sizing: border-box; padding: 26mm 22mm 20mm; background: var(--ink); color: #f3f4f5; display: flex; flex-direction: column; position: relative; }
.cover .brand { display: flex; align-items: center; gap: 10px; font: 600 12pt "Instrument Sans"; letter-spacing: .02em; }
.cover .brand .mark-mod { fill: #f3f4f5; }
.cover .brand .mark-core { fill: var(--accent); }
.cover .brand .erp { opacity: .55; }
.cover .eyebrow { margin-top: 62mm; font: 600 8.5pt "Instrument Sans"; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
.cover h1 { font: 400 46pt/1.02 "Instrument Serif"; margin: 6mm 0 0; letter-spacing: -.01em; string-set: none; }
.cover .audience { margin-top: 5mm; font-size: 12pt; color: #c9c7c4; }
.cover .bar { margin-top: 12mm; width: 26mm; height: 2.2mm; background: var(--accent); border-radius: 1mm; }
.cover .meta { margin-top: auto; display: grid; grid-template-columns: 38mm 1fr; row-gap: 2.2mm; font-size: 8.8pt; color: #c9c7c4; }
.cover .meta dt { color: #8f8c88; }
.cover .meta dd { margin: 0; color: #f3f4f5; }
.cover code { background: none; border: 0; padding: 0; color: #ffb454; }
.cover .credit { margin-top: 6mm; font-size: 7.8pt; letter-spacing: .02em; color: #8f8c88; }
.cover .notice { margin-top: 9mm; padding: 4mm 5mm; border: 1px solid #3a342e; border-radius: 2mm; font-size: 8.4pt; color: #d9d7d4; }

/* sumário */
.toc { page: toc; break-after: page; }
.toc h2.toc-title { font: 400 26pt "Instrument Serif"; margin: 0 0 6mm; string-set: none; break-before: avoid; border: 0; padding: 0; }
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc li { display: flex; align-items: baseline; gap: 2mm; break-inside: avoid; }
.toc li.d2 { margin-top: 1.9mm; font-weight: 600; font-size: 9.8pt; }
.toc li.d3 { padding-left: 6mm; font-size: 8.6pt; line-height: 1.38; color: var(--muted); margin-top: .2mm; }
.toc li a { color: inherit; text-decoration: none; flex: 1; display: flex; gap: 2mm; }
.toc li a .t { flex: 0 1 auto; }
.toc li a .dots { flex: 1; border-bottom: 1px dotted #b9b7b4; transform: translateY(-1.2mm); }
.toc li a::after { content: target-counter(attr(href), page); font-variant-numeric: tabular-nums; min-width: 8mm; text-align: right; }

/* corpo */
h2 { font: 400 22pt/1.1 "Instrument Serif"; margin: 0 0 5mm; padding-bottom: 3mm; border-bottom: 2px solid var(--ink); break-before: page; break-after: avoid; string-set: section content(text); }
main > h2:first-of-type { break-before: auto; }
h2::before { content: ""; display: block; width: 14mm; height: 1.6mm; background: var(--accent); border-radius: .8mm; margin-bottom: 4mm; }
h3 { font-size: 12.5pt; font-weight: 650; margin: 7mm 0 2.5mm; break-after: avoid; }
h4 { font-size: 10.5pt; font-weight: 650; margin: 5mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; }
li { margin: .6mm 0; }
a { color: #a55300; text-decoration: none; }
strong { font-weight: 650; }
code { font-family: "JetBrains Mono", monospace; font-size: .86em; background: #f0f1f2; border: 1px solid #e3e4e5; border-radius: 1mm; padding: 0 .9mm; word-break: break-word; }
pre { font-family: "JetBrains Mono", monospace; font-size: 8pt; background: #f4f5f6; border: 1px solid var(--line); border-radius: 1.5mm; padding: 3mm 4mm; white-space: pre-wrap; break-inside: avoid; }
pre code { background: none; border: 0; padding: 0; }
hr { display: none; }
.keep { break-inside: avoid; }

table { width: 100%; border-collapse: collapse; margin: 1.5mm 0 4mm; font-size: 8.2pt; line-height: 1.38; }
thead { display: table-header-group; }
th { text-align: left; font-weight: 650; background: #f1f2f3; border-bottom: 1.5px solid var(--ink); padding: 1.6mm 2mm; }
td { border-bottom: 1px solid var(--line); padding: 1.5mm 2mm; vertical-align: top; }
tr { break-inside: avoid; }
table { break-inside: avoid; } /* tabelas maiores que a página ainda quebram, por linha */
table.cols-6 { font-size: 7.3pt; }
table.cols-5 { font-size: 7.7pt; }

figure { margin: 3mm 0 5mm; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 150mm; width: auto; height: auto; border: 1px solid var(--line); border-radius: 1.5mm; box-shadow: 0 .6mm 2mm rgba(16,12,8,.08); }
figcaption { margin-top: 1.8mm; font-size: 8pt; color: var(--muted); font-style: normal; text-align: center; }

.callout { margin: 3mm 0 4mm; padding: 2.6mm 4mm; border-left: 1.2mm solid #9aa0a6; background: var(--note-bg); border-radius: 0 1.5mm 1.5mm 0; break-inside: avoid; }
.callout p:last-child { margin-bottom: 0; }
.callout.warn { background: var(--warn-bg); border-left-color: var(--warn-line); }
.callout.blocked { background: var(--danger-bg); border-left-color: var(--danger-line); }
`;
}

function buildDocument(manual) {
  const md = fs.readFileSync(path.join(MANUAL_DIR, manual.source), "utf8");
  const meta = gitInfo(path.join("docs/manual", manual.source));
  const prepared = prepareMarkdown(md);
  const { html, toc } = renderHtml(prepared.body);
  const notes = prepared.headerNotes.map((n) => new Marked().parseInline(n));
  const find = (label) => notes.find((n) => n.includes(label))?.replace(/<strong>[^<]*<\/strong>\s*/, "") ?? "";

  const tocHtml = toc
    .map((t) => `<li class="d${t.depth}"><a href="#${t.id}"><span class="t">${t.text}</span><span class="dots"></span></a></li>`)
    .join("\n");

  const doc = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>ATLAS.ERP — ${manual.title}</title>
<style>${pageCss(manual, meta)}</style>
<script>window.PagedConfig = { auto: false };</script>
<script src="/node_modules/pagedjs/dist/paged.polyfill.js"></script>
</head><body>
<section class="cover">
  <div class="brand">${MARK_SVG(30)}<span>ATLAS<span class="erp">.ERP</span></span></div>
  <div class="eyebrow">Manual oficial</div>
  <h1>${manual.title}</h1>
  <div class="audience">${manual.audience}</div>
  <div class="bar"></div>
  <dl class="meta">
    <dt>Versão documentada</dt><dd>${find("Versão documentada")}</dd>
    <dt>Edição</dt><dd>${brDate(meta.date)} · conteúdo ${meta.hash}</dd>
    <dt>Figuras</dt><dd>${prepared.figures} capturas da aplicação real</dd>
  </dl>
  <div class="notice">${notes.filter((n) => /Dados das telas|Arquitetura|Atenção/.test(n)).join("<br>")}</div>
  <div class="credit">ATLAS.ERP · Criado por Marcus Valério</div>
</section>
<nav class="toc"><h2 class="toc-title">Sumário</h2><ol>${tocHtml}</ol></nav>
<main>${html}</main>
</body></html>`;
  return { doc, meta, expectedFigures: prepared.figures, orphanImages: prepared.orphanImages, tocEntries: toc.length };
}

// ---------------------------------------------------------------- servidor local
function serve(pages) {
  const types = { ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8" };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pages[url]) {
      res.writeHead(200, { "content-type": types[".html"] });
      return res.end(pages[url]);
    }
    const file = path.join(ROOT, url);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---------------------------------------------------------------- verificação
/* Roda no navegador depois da paginação. */
function inspectPages() {
  const pages = [...document.querySelectorAll(".pagedjs_page")];
  const problems = [];
  const imgs = [...document.querySelectorAll("main figure img")];
  imgs.forEach((img) => {
    if (!img.complete || img.naturalWidth === 0) problems.push(`imagem não carregou: ${img.dataset.source ?? img.getAttribute("src")}`);
  });
  pages.forEach((page, i) => {
    const n = i + 1;
    const area = page.querySelector(".pagedjs_page_content");
    if (!area) return;
    const box = area.getBoundingClientRect();
    const isCover = page.classList.contains("pagedjs_cover_page");
    const text = area.innerText.trim();
    if (!isCover && !text && !area.querySelector("img")) problems.push(`página ${n} em branco`);
    area.querySelectorAll("img").forEach((img) => {
      const r = img.getBoundingClientRect();
      if (r.right > box.right + 1 || r.left < box.left - 1 || r.bottom > box.bottom + 1) problems.push(`página ${n}: imagem ultrapassa a margem (${img.dataset.source ?? img.getAttribute("src")})`);
    });
    area.querySelectorAll("table").forEach((t) => {
      if (t.getBoundingClientRect().right > box.right + 1) problems.push(`página ${n}: tabela ultrapassa a margem`);
    });
    // Último bloco da página não pode ser um título.
    const blocks = [...area.querySelectorAll("h2, h3, h4, p, figure, table, ul, ol, blockquote, pre, li")].filter((el) => el.getBoundingClientRect().height > 0);
    // Tabela partida com só o cabeçalho nesta página.
    area.querySelectorAll("table").forEach((t) => {
      const rows = [...t.querySelectorAll("tbody tr")].filter((r) => r.getBoundingClientRect().height > 0);
      if (t.querySelector("thead") && rows.length === 0) problems.push(`página ${n}: cabeçalho de tabela sem linhas (tabela partida)`);
    });
    const last = blocks.sort((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom).at(-1);
    if (last && last.tagName === "P" && last.textContent.trim().endsWith(":") && last.textContent.trim().length <= 80) problems.push(`página ${n}: rótulo sozinho no pé da página ("${last.textContent.trim()}")`);
    if (last && /^H[234]$/.test(last.tagName)) problems.push(`página ${n}: título sozinho no pé da página ("${last.textContent.trim().slice(0, 60)}")`);
  });
  const ids = new Set([...document.querySelectorAll("[id]")].map((e) => e.id));
  [...document.querySelectorAll('a[href^="#"]')].forEach((a) => {
    const id = decodeURIComponent(a.getAttribute("href").slice(1));
    if (!ids.has(id)) problems.push(`link interno sem destino: #${id}`);
  });
  return { pages: pages.length, figures: imgs.length, loaded: imgs.filter((i) => i.naturalWidth > 0).length, problems };
}

// ---------------------------------------------------------------- execução
const selected = MANUALS.filter((m) => !only || m.key === only);
const built = selected.map((m) => ({ manual: m, ...buildDocument(m) }));
const server = await serve(Object.fromEntries(built.map((b) => [`/__manual/${b.manual.key}.html`, b.doc])));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
fs.mkdirSync(OUT_DIR, { recursive: true });
let failed = false;

for (const b of built) {
  const page = await browser.newPage();
  await page.goto(`${base}/__manual/${b.manual.key}.html`, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    // As capturas são WebP; o Chromium as embute sem perda no PDF (arquivo enorme).
    // Recodificar em JPEG (largura máx. 1400 px ≈ 200 dpi na largura útil do A4)
    // mantém a nitidez do texto das telas e deixa o PDF com uma fração do tamanho.
    for (const img of document.querySelectorAll("main figure img")) {
      if (!img.naturalWidth) continue;
      const scale = Math.min(1, 1400 / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.dataset.source = img.getAttribute("src");
      img.src = canvas.toDataURL("image/jpeg", 0.86);
      await img.decode();
    }
    // Título de subseção + introdução curta + primeira figura/tabela ficam juntos:
    // evita título e uma linha no pé da página com a figura na página seguinte.
    for (const h of document.querySelectorAll("main h3, main h4")) {
      const group = [h];
      let el = h.nextElementSibling;
      let chars = 0;
      while (el && (el.tagName === "P" || el.tagName === "BLOCKQUOTE") && group.length < 4) {
        chars += el.textContent.length;
        group.push(el);
        el = el.nextElementSibling;
      }
      if (!el || !["FIGURE", "TABLE"].includes(el.tagName) || chars > 450) continue;
      group.push(el);
      const keep = document.createElement("div");
      keep.className = "keep";
      h.before(keep);
      group.forEach((node) => keep.append(node));
    }
    // Rótulo curto terminado em ":" (ex.: "Cuidados:") fica junto da lista ou tabela que introduz.
    for (const p of document.querySelectorAll("main p")) {
      const next = p.nextElementSibling;
      const label = p.textContent.trim();
      if (!next || !["UL", "OL", "TABLE", "FIGURE"].includes(next.tagName) || label.length > 80 || !label.endsWith(":")) continue;
      if (p.parentElement.classList.contains("keep") || next.querySelectorAll("li, tr").length > 14) continue;
      const keep = document.createElement("div");
      keep.className = "keep";
      p.before(keep);
      keep.append(p, next);
    }
    await window.PagedPolyfill.preview();
  });
  // A capa é a primeira página: marca para a verificação não tratá-la como corpo.
  await page.evaluate(() => document.querySelector(".pagedjs_page")?.classList.add("pagedjs_cover_page"));
  const report = await page.evaluate(inspectPages);
  if (b.orphanImages) report.problems.push(`${b.orphanImages} imagem(ns) sem legenda "Figura N —" no Markdown`);
  if (report.figures !== b.expectedFigures) report.problems.push(`figuras no PDF: ${report.figures}, esperado: ${b.expectedFigures}`);

  const out = path.join(OUT_DIR, b.manual.output);
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });

  if (snapshotsDir) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const list = snapshotPages.length ? snapshotPages : [1, 2, 3];
    for (const n of list) {
      const el = page.locator(".pagedjs_page").nth(n - 1);
      if (await el.count()) await el.screenshot({ path: path.join(snapshotsDir, `${b.manual.key}-p${String(n).padStart(3, "0")}.png`) });
    }
  }
  await page.close();

  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`${b.manual.output}: ${report.pages} páginas, ${report.loaded}/${report.figures} figuras carregadas, sumário com ${b.tocEntries} entradas, ${kb} KB`);
  for (const p of report.problems) console.log(`  PROBLEMA ${p}`);
  if (report.problems.length) failed = true;
}

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
