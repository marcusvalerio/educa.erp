#!/usr/bin/env node
// Gera a landing do EDUCA (site estático em landing/site/) a partir de
// landing/src/content.mjs.
//
//   npm run landing:build              # gera landing/site/
//   node scripts/build-landing.mjs --preview <arquivo.html>
//                                      # também gera uma versão de página única
//                                      # (CSS e JS embutidos, fontes do Google Fonts)
//
// O build:
//   1. recorta e redimensiona só as capturas usadas (docs/manual/assets → site/img);
//   2. copia as fontes do app (src/app/fonts → site/fonts) e os PDFs dos manuais
//      (docs/manual/pdf → site/manuais, fora do Git);
//   3. escreve site/index.html com o conteúdo, site/styles.css e site/main.js.

import { mkdir, copyFile, readFile, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import * as C from "../landing/src/content.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "landing/src");
const OUT = path.join(ROOT, "landing/site");
const ASSETS = path.join(ROOT, "docs/manual/assets");

const args = process.argv.slice(2);
const previewAt = args.includes("--preview") ? args[args.indexOf("--preview") + 1] : null;

// ---------------------------------------------------------------------------
// Utilitários de marcação

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== false && v !== null)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
    .join("");
const moduleById = Object.fromEntries(C.MODULES.map((m) => [m.id, m]));
const moduleName = (id) => (id === "cadastros" ? "Cadastros" : moduleById[id]?.name ?? id);
const pad = (n) => String(n).padStart(2, "0");

// Marca EDUCA (mesmo desenho de src/components/brand/Brand.tsx).
const mark = (size = 22, cls = "mark") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="5" fill="currentColor"/><rect x="7" y="6.5" width="11" height="2.5" rx="1" class="mark-bar"/><rect x="7" y="10.75" width="8" height="2.5" rx="1" class="mark-fire"/><rect x="7" y="15" width="11" height="2.5" rx="1" class="mark-bar"/></svg>`;

const chip = (state, extra = "") =>
  `<span class="chip chip-${state}${extra}" title="${esc(C.STATES[state].hint)}">${esc(C.STATES[state].label)}</span>`;

// ---------------------------------------------------------------------------
// Imagens: cada captura usada vira um .webp (e uma versão de 760 px quando é larga).

const images = new Map(); // chave → { file, w, h, small }

// Capturas de 1440×900 trazem o menu lateral do app; fora da abertura, a
// página mostra só a área de trabalho (x ≥ 257), maior e mais legível.
const SHELL = { w: 1440, h: 900, content: [257, 0, 1183, 900] };

function effectiveCrop(s, meta) {
  if (s.crop) return s.crop;
  if (!s.full && meta.width === SHELL.w && meta.height === SHELL.h) return SHELL.content;
  return null;
}

function imgKey(s) {
  const base = s.img.replace("/", "-");
  return s._crop ? `${base}-${s._crop.join("-")}` : base;
}

async function prepareImage(s) {
  const src = path.join(ASSETS, `${s.img}.webp`);
  if (!existsSync(src)) throw new Error(`Captura não encontrada: ${s.img}`);
  let pipe = sharp(src);
  const meta = await pipe.metadata();
  s._crop = effectiveCrop(s, meta);
  let w = meta.width;
  let h = meta.height;
  if (s._crop === SHELL.content && !s.keepHeight) {
    // Listas curtas deixam a metade de baixo vazia: corta o fundo liso,
    // mantendo uma proporção mínima de tela (altura ≥ 50% da largura).
    const [x, y, cw, ch] = s._crop;
    const { data, info } = await sharp(src).extract({ left: x, top: y, width: cw, height: ch }).raw().toBuffer({ resolveWithObject: true });
    const ch3 = info.channels;
    const at = (px, py) => (py * info.width + px) * ch3;
    const b0 = at(Math.round(cw / 2), ch - 40);
    const bg = [data[b0], data[b0 + 1], data[b0 + 2]];
    // Ignora a moldura do painel do app (bordas e as últimas linhas).
    let last = ch - 16;
    for (; last > 0; last--) {
      let busy = false;
      for (let px = 40; px < cw - 40; px += 2) {
        const o = at(px, last);
        if (Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]) > 24) {
          busy = true;
          break;
        }
      }
      if (busy) break;
    }
    const trimmed = Math.min(ch, Math.max(Math.round(cw * 0.5), last + 28));
    if (trimmed < ch) s._crop = [x, y, cw, trimmed];
  }
  if (s._crop) {
    const [x, y, cw, ch] = s._crop;
    if (x + cw > w || y + ch > h) throw new Error(`Recorte fora da imagem: ${s.img} ${s._crop}`);
    pipe = pipe.extract({ left: x, top: y, width: cw, height: ch });
    w = cw;
    h = ch;
  }
  const key = imgKey(s);
  if (images.has(key)) return images.get(key);
  const buf = await pipe.webp({ quality: 84, effort: 5 }).toBuffer();
  const file = `img/${key}.webp`;
  await writeFile(path.join(OUT, file), buf);
  let small = null;
  if (w > 900) {
    const sw = 760;
    small = { file: `img/${key}-760.webp`, w: sw };
    await sharp(buf).resize({ width: sw }).webp({ quality: 80, effort: 5 }).toFile(path.join(OUT, small.file));
  }
  const rec = { file, w, h, small };
  images.set(key, rec);
  return rec;
}

// Coleta todas as telas citadas no conteúdo (qualquer objeto com `img`).
function collectScreens(node, acc = []) {
  if (Array.isArray(node)) node.forEach((n) => collectScreens(n, acc));
  else if (node && typeof node === "object") {
    if (typeof node.img === "string") acc.push(node);
    Object.values(node).forEach((v) => collectScreens(v, acc));
  }
  return acc;
}

function picture(s, { alt, sizes = "(min-width: 1100px) 60vw, 100vw", eager = false, cls = "" } = {}) {
  const im = images.get(imgKey(s));
  const srcset = im.small ? `${im.small.file} ${im.small.w}w, ${im.file} ${im.w}w` : undefined;
  return `<img${attrs({
    class: cls || undefined,
    src: im.file,
    srcset,
    sizes: srcset ? sizes : undefined,
    width: im.w,
    height: im.h,
    alt: alt ?? s.alt ?? s.caption ?? "",
    loading: eager ? "eager" : "lazy",
    decoding: "async",
    fetchpriority: eager ? "high" : undefined,
  })}>`;
}

// Moldura de tela: barra com a rota real + a captura. A captura é um link para
// a imagem inteira; com JS, abre ampliada na própria página.
function shot(s, opts = {}) {
  const { caption = true, cls = "", route = s.route, zoom = true, inert = false } = opts;
  const im = images.get(imgKey(s));
  const label = s.caption ?? s.alt ?? "";
  let inner = picture(s, opts);
  if (s.focus) {
    // Destaque da parte da tela que a etapa explica (coordenadas da captura original).
    const [ox, oy] = s._crop ?? [0, 0];
    const [fx, fy, fw, fh] = s.focus;
    const pc = (v, t) => `${((v / t) * 100).toFixed(2)}%`;
    inner += `<span class="focus" aria-hidden="true" style="left:${pc(fx - ox, im.w)};top:${pc(fy - oy, im.h)};width:${pc(fw, im.w)};height:${pc(fh, im.h)}"></span>`;
  }
  const frame = zoom
    ? `<a class="shot-zoom" href="${im.file}" data-zoom data-w="${im.w}" data-h="${im.h}" data-caption="${esc(label)}"${inert ? ' tabindex="-1"' : ` aria-label="Ampliar tela${label ? `: ${esc(label)}` : ""}"`}>${inner}<span class="zoom-hint" aria-hidden="true">Ampliar</span></a>`
    : inner;
  return `<figure class="shot ${cls}">
  <div class="shot-bar"><span class="shot-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="shot-route">${esc(route ?? "")}</span></div>
  <div class="shot-frame" style="aspect-ratio:${im.w}/${im.h}">${frame}</div>
  ${caption && s.caption ? `<figcaption>${esc(s.caption)}</figcaption>` : ""}
</figure>`;
}

// ---------------------------------------------------------------------------
// Seções

function header() {
  const links = [
    ["#siga-um-pedido", "Como funciona"],
    ["#areas", "Áreas"],
    ["#acesso", "Acesso"],
    ["#conexoes", "Conexões"],
  ];
  return `<header class="topbar" data-stage>
  <div class="wrap topbar-in">
    <a class="brand" href="#inicio" aria-label="EDUCA.ERP, início da página">${mark(24)}<span>EDUCA<span class="brand-dim">.ERP</span></span></a>
    <nav aria-label="Seções" class="topnav">${links.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}</nav>
    <a class="btn btn-ghost btn-sm" href="${esc(C.META.appUrl)}">Entrar</a>
  </div>
</header>`;
}

function hero() {
  const H = C.HERO;
  const [l1, l2, l3] = H.title;
  return `<section class="hero stage" id="inicio" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow"><span class="eyebrow-bar" aria-hidden="true"></span>${esc(H.eyebrow)}</p>
      <h1 id="hero-title" class="display"><span class="ln">${esc(l1)}</span> <span class="ln">${esc(l2)}</span> <span class="ln ln-last"><em>${esc(l3)}</em><span class="fire-bar" aria-hidden="true"></span></span></h1>
      <p class="lead">${esc(H.lead)}</p>
      <div class="actions">
        <a class="btn btn-fire" href="${esc(H.primary.href)}">${esc(H.primary.label)}<span aria-hidden="true">↓</span></a>
        <a class="btn btn-ghost" href="${esc(H.secondary.href)}">${esc(H.secondary.label)}<span aria-hidden="true">→</span></a>
      </div>
    </div>
    <div class="hero-visual" aria-label="O EDUCA em uso: um pedido, o título que ele gerou e as pendências da gestão">
      <div class="hv-main">${shot(H.screens.main, { caption: false, eager: true, sizes: "(min-width: 1100px) 56vw, 100vw" })}</div>
      <div class="hv-finance">${shot(H.screens.finance, { caption: false, eager: true, sizes: "(min-width: 1100px) 30vw, 70vw", route: "Financeiro · títulos do pedido" })}</div>
      <div class="hv-attention">${shot(H.screens.attention, { caption: false, eager: true, sizes: "(min-width: 1100px) 30vw, 80vw", route: "Início · Precisa de atenção" })}</div>
    </div>
  </div>
  <div class="wrap">
    <ol class="trail" aria-label="O mesmo pedido em três áreas">
      ${H.trail
        .map(
          (t, i) => `<li style="--i:${i}"><span class="trail-area">${esc(t.area)}</span><code>${esc(t.code)}</code><span class="trail-text">${esc(t.text)}</span></li>`,
        )
        .join("")}
    </ol>
  </div>
</section>`;
}

function legend() {
  return `<section class="legend-band" aria-labelledby="legenda-title">
  <div class="wrap legend-in">
    <p id="legenda-title" class="legend-title">Como ler esta página</p>
    <p class="legend-text">Tudo o que aparece aqui foi conferido no produto. Cada capacidade leva um selo que diz como ela está disponível hoje.</p>
    <ul class="legend-list">
      ${Object.entries(C.STATES)
        .map(([k, v]) => `<li>${chip(k)}<span>${esc(v.hint)}</span></li>`)
        .join("")}
    </ul>
  </div>
</section>`;
}

function journey() {
  const J = C.JOURNEY;
  const steps = J.steps;
  return `<section class="journey paper" id="siga-um-pedido" aria-labelledby="journey-title">
  <div class="wrap">
    <div class="section-head">
      <p class="kicker"><span>${esc(J.kicker)}</span></p>
      <h2 id="journey-title" class="display-2">${esc(J.title)}</h2>
      <p class="section-lead">${esc(J.lead)}</p>
    </div>
    <ol class="lane" aria-hidden="true">
      ${steps.map((s, i) => `<li data-lane="${i}"${i === 0 ? ' class="is-active"' : ""}><span class="lane-n">${pad(i + 1)}</span><span class="lane-name">${esc(s.area)}</span></li>`).join("")}
      <li class="lane-fire" style="--p:0"></li>
    </ol>
    <div class="journey-grid">
      <ol class="steps">
        ${steps
          .map(
            (s, i) => `<li class="step${i === 0 ? " is-active" : ""}" data-step="${i}">
          <div class="step-head"><span class="step-n">${pad(i + 1)}</span><span class="step-area">${esc(s.area)}</span>${chip(s.state)}</div>
          <h3 class="step-title">${esc(s.title)}</h3>
          <p class="step-text">${esc(s.text)}</p>
          <dl class="step-meta">
            <div><dt>Na prática</dt><dd>${esc(s.detail)}</dd></div>
            <div><dt>Permissão</dt><dd><code>${esc(s.perm)}</code></dd></div>
          </dl>
          <div class="step-shot">${shot(s, { caption: false, sizes: "100vw" })}</div>
        </li>`,
          )
          .join("")}
      </ol>
      <div class="journey-stage" aria-hidden="true">
        <div class="stage-stack">
          ${steps
            .map(
              (s, i) => `<div class="stage-item${i === 0 ? " is-active" : ""}" data-stage-item="${i}">${shot(s, { caption: false, alt: "", inert: true, sizes: "(min-width: 1100px) 58vw, 100vw" })}</div>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function stateCounts(does) {
  const counts = {};
  does.forEach(([, st]) => (counts[st] = (counts[st] ?? 0) + 1));
  return Object.keys(C.STATES)
    .filter((k) => counts[k])
    .map((k) => `<li>${chip(k)}<b>${counts[k]}</b></li>`)
    .join("");
}

function viewer(id, screens, { label }) {
  return `<div class="viewer" data-viewer>
  <div class="viewer-tabs" role="tablist" aria-label="${esc(label)}">
    ${screens
      .map(
        (s, i) =>
          `<button role="tab" type="button" id="${id}-tab-${i}" aria-controls="${id}-panel-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(s.label)}</button>`,
      )
      .join("")}
  </div>
  <div class="viewer-panels">
    ${screens
      .map(
        (s, i) =>
          `<div role="tabpanel" id="${id}-panel-${i}" aria-labelledby="${id}-tab-${i}"${i === 0 ? ' class="is-on"' : ' aria-hidden="true" inert'}>${shot(s, { alt: s.caption })}</div>`,
      )
      .join("")}
  </div>
</div>`;
}

function moduleSection(m, index) {
  return `<article class="module" id="mod-${m.id}" aria-labelledby="mod-${m.id}-title">
  <div class="module-top">
    <div class="module-intro">
      <p class="module-index"><span>${pad(index + 1)}</span>${esc(m.name)}</p>
      <h3 id="mod-${m.id}-title" class="display-3">${esc(m.tagline)}</h3>
      <div class="ps">
        <div class="ps-row ps-problem"><p class="q">O problema</p><p>${esc(m.problem)}</p></div>
        <div class="ps-row ps-solution"><p class="q">No EDUCA</p><p>${esc(m.serves)}</p></div>
      </div>
      <p class="who"><span>Para quem</span>${esc(m.who)}</p>
      <ul class="state-sum" aria-label="Capacidades por estado">${stateCounts(m.does)}</ul>
    </div>
    <div class="module-screens">${viewer(`v-${m.id}`, m.screens, { label: `Telas do módulo ${m.name}` })}</div>
  </div>
  <div class="module-body">
    <div class="mb-col">
      <h4 id="mod-${m.id}-does" class="q-title"><span>1</span>O que você faz</h4>
      <ul class="does">${m.does.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
    </div>
    <div class="mb-col">
      <h4 id="mod-${m.id}-flow" class="q-title"><span>2</span>Como funciona</h4>
      <ol class="flow">${m.flow.map((f, i) => `<li style="--i:${i}"><span>${esc(f)}</span></li>`).join("")}</ol>
    </div>
    <div class="mb-col">
      <div class="mb-part">
        <h4 id="mod-${m.id}-ctl" class="q-title"><span>3</span>O que você controla</h4>
        <ul class="controls">${m.controls.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      </div>
      <div class="mb-part">
        <h4 id="mod-${m.id}-links" class="q-title"><span>4</span>Como se conecta</h4>
        <ul class="links">${m.links
          .map(([to, what]) => {
            const target = to === "cadastros" ? "#base" : `#mod-${to}`;
            return `<li><a href="${target}"><span class="links-to">${esc(moduleName(to))}</span><span class="links-what">${esc(what)}</span></a></li>`;
          })
          .join("")}</ul>
      </div>
    </div>
  </div>
</article>`;
}

function scenario() {
  const S = C.SCENARIO;
  return `<section class="scenario paper" id="cenario" aria-labelledby="scenario-title">
  <div class="wrap scenario-grid">
    <div class="section-head scenario-head">
      <p class="kicker"><span>${esc(S.kicker)}</span></p>
      <h2 id="scenario-title" class="display-2">${esc(S.title)}</h2>
      ${S.body.map((b) => `<p class="section-lead">${esc(b)}</p>`).join("")}
    </div>
    <figure class="ledger">
      <ol>
        ${S.records.map((r, i) => `<li style="--i:${i}"><span class="lg-area">${esc(r.area)}</span><span class="lg-record">${esc(r.record)}</span><code class="lg-code">${esc(r.code)}</code></li>`).join("")}
      </ol>
      <figcaption>Um registro típico de cada área, com os códigos que aparecem nas telas do EDUCA (dados fictícios).</figcaption>
    </figure>
  </div>
</section>`;
}

function platform() {
  const P = C.PLATFORM;
  return `<section class="platform stage" id="plataforma" aria-labelledby="platform-title">
  <div class="wrap">
    <div class="platform-head">
      <div class="section-head">
        <p class="kicker"><span>${esc(P.kicker)}</span></p>
        <h2 id="platform-title" class="display-2">${esc(P.title)}</h2>
        <p class="section-lead">${esc(P.body)}</p>
      </div>
      <dl class="numbers">
        ${P.numbers.map((n) => `<div><dt>${esc(n.label)}</dt><dd class="num"><span data-count="${n.value}">${n.value.toLocaleString("pt-BR")}</span></dd><dd class="num-note">${esc(n.note)}</dd></div>`).join("")}
      </dl>
    </div>
    <ol class="envs">
      ${P.environments
        .map(
          (e, i) => `<li class="env">
        <div class="env-copy">
          <p class="env-n">${pad(i + 1)}</p>
          <h3 class="env-name">${esc(e.name)}</h3>
          <p class="env-who">${esc(e.who)}</p>
          <p class="env-what">${esc(e.what)}</p>
        </div>
        ${shot(e, { caption: false, sizes: "(min-width: 1100px) 30vw, 100vw" })}
      </li>`,
        )
        .join("")}
    </ol>
  </div>
</section>`;
}

function stateBar(does) {
  const counts = {};
  does.forEach(([, st]) => (counts[st] = (counts[st] ?? 0) + 1));
  const total = does.length;
  const keys = Object.keys(C.STATES).filter((k) => counts[k]);
  const summary = keys.map((k) => `${counts[k]} ${C.STATES[k].label.toLowerCase()}`).join(", ");
  return `<span class="sbar" role="img" aria-label="${esc(`${total} capacidades: ${summary}`)}">${keys
    .map((k) => `<i class="sb-${k}" style="flex:${counts[k]}"></i>`)
    .join("")}</span>`;
}

function areaIndex() {
  const tiles = C.MODULES.map(
    (m, i) => `<li><a href="#mod-${m.id}" class="tile">
      <span class="tile-n">${pad(i + 1)}</span>
      <span class="tile-name">${esc(m.name)}</span>
      <span class="tile-tag">${esc(m.tagline)}</span>
      ${stateBar(m.does)}
    </a></li>`,
  );
  tiles.push(`<li><a href="#base" class="tile tile-base">
      <span class="tile-n">${pad(C.MODULES.length + 1)}</span>
      <span class="tile-name">Cadastros</span>
      <span class="tile-tag">Clientes, fornecedores, transportadoras, motoristas e veículos.</span>
      ${stateBar(C.CADASTROS.items)}
    </a></li>`);
  tiles.push(`<li><a href="#evolucao" class="tile tile-evo">
      <span class="tile-n">${pad(C.MODULES.length + 2)}</span>
      <span class="tile-name">Em evolução</span>
      <span class="tile-tag">${C.EVOLVING.items.map((e) => esc(e.name)).join(", ")}: o que já existe e o que falta.</span>
      <span class="sbar" aria-hidden="true"><i class="sb-evolucao" style="flex:1"></i></span>
    </a></li>`);
  return `<nav class="area-index" aria-label="Mapa das áreas"><ol>${tiles.join("")}</ol>
    <p class="area-index-note">A barra de cada área mostra como as capacidades dela estão disponíveis hoje: ${Object.entries(C.STATES)
      .map(([k, v]) => `<span class="ai-key"><i class="sb-${k}"></i>${esc(v.label)}</span>`)
      .join("")}</p>
  </nav>`;
}

function base() {
  const B = C.CADASTROS;
  const E = C.EVOLVING;
  return `<section class="base sheet" id="base" aria-labelledby="base-title">
  <div class="wrap">
    <div class="module-top">
      <div class="module-intro">
        <p class="kicker"><span>${esc(B.kicker)}</span></p>
        <h2 id="base-title" class="display-3">${esc(B.title)}</h2>
        <p class="lead-p">${esc(B.body)}</p>
        <ul class="does">${B.items.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
      </div>
      <div class="module-screens">${viewer("v-cadastros", B.screens, { label: "Telas de Cadastros" })}</div>
    </div>
    <div class="evolving" id="evolucao" aria-labelledby="evo-title">
      <div class="section-head">
        <p class="kicker"><span>${esc(E.kicker)}</span></p>
        <h2 id="evo-title" class="display-3">${esc(E.title)}</h2>
        <p class="section-lead">${esc(E.body)}</p>
      </div>
      <ul class="evo-list">
        ${E.items
          .map(
            (it) => `<li class="evo">
          <div class="evo-head"><h3>${esc(it.name)}</h3>${chip("evolucao")}</div>
          <dl>
            <div><dt>Hoje</dt><dd>${esc(it.now)}</dd></div>
            <div><dt>Ainda não</dt><dd>${esc(it.missing)}</dd></div>
          </dl>
        </li>`,
          )
          .join("")}
      </ul>
    </div>
  </div>
</section>`;
}

function access() {
  const A = C.ACCESS;
  return `<section class="access paper" id="acesso" aria-labelledby="access-title">
  <div class="wrap">
    <div class="section-head">
      <p class="kicker"><span>${esc(A.kicker)}</span></p>
      <h2 id="access-title" class="display-2">${esc(A.title)}</h2>
      <p class="section-lead">${esc(A.body)}</p>
    </div>
    <ol class="chain" aria-label="Como o acesso é montado, no exemplo real do manual">
      ${A.chain
        .map(
          (c, i) => `<li style="--i:${i}"><span class="ch-label">${esc(c.label)}</span><span class="ch-value">${esc(c.value)}</span><span class="ch-note">${esc(c.note)}</span></li>`,
        )
        .join("")}
    </ol>
    <div class="access-grid">
      <div class="access-copy">
        <h3 class="q-title"><span>✓</span>Na Administração da Empresa</h3>
        <ul class="does">${A.admin.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
        <p class="note">Exemplo do manual: a usuária convidada entra sem papel, recebe o papel Comprador e passa a ver Suprimentos, mas continua sem acesso ao Financeiro.</p>
      </div>
      <div class="module-screens">${viewer("v-acesso", A.story, { label: "Do convite ao acesso, passo a passo" })}</div>
    </div>
  </div>
</section>`;
}

function central() {
  const X = C.CENTRAL;
  return `<section class="central sheet" id="central" aria-labelledby="central-title">
  <div class="wrap module-top">
    <div class="module-intro">
      <p class="kicker"><span>${esc(X.kicker)}</span></p>
      <h2 id="central-title" class="display-3">${esc(X.title)}</h2>
      <p class="lead-p">${esc(X.body)}</p>
      <ul class="does">${X.points.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
    </div>
    <div class="module-screens">${viewer("v-central", X.screens, { label: "Telas da Administração Central" })}</div>
  </div>
</section>`;
}

function closing(sizes, { preview = false } = {}) {
  const K = C.CLOSING;
  return `<section class="closing stage" id="comecar" aria-labelledby="closing-title">
  <div class="wrap closing-in">
    <p class="closing-mark" aria-hidden="true">${mark(56, "mark mark-xl")}</p>
    <h2 id="closing-title" class="display-2">${esc(K.title)}</h2>
    <p class="section-lead">${esc(K.body)}</p>
    <div class="actions">
      ${K.actions
        .map((a) => {
          const size = sizes[a.href];
          if (preview && a.href.endsWith(".pdf"))
            // A prévia não publica os PDFs (tamanho): indica onde eles estão.
            return `<span class="btn btn-ghost is-static">${esc(a.label)}<small class="btn-meta">${size} · docs/manual/pdf</small></span>`;
          return `<a class="btn ${a.primary ? "btn-fire" : "btn-ghost"}" href="${esc(a.href)}"${a.href.endsWith(".pdf") ? " download" : ""}>${esc(a.label)}${size ? `<small class="btn-meta">${size}</small>` : ""}<span aria-hidden="true">${a.href.endsWith(".pdf") ? "↓" : "→"}</span></a>`;
        })
        .join("")}
    </div>
    <ol class="coda" aria-label="O caminho de uma venda no EDUCA">
      ${C.JOURNEY.steps.map((st, i) => `<li style="--i:${i}"><span>${pad(i + 1)}</span>${esc(st.area)}</li>`).join("")}
    </ol>
  </div>
</section>`;
}

function areas(list) {
  return `<section class="areas paper" id="areas" aria-labelledby="areas-title">
  <div class="wrap">
    <div class="section-head">
      <p class="kicker"><span>Áreas, uma a uma</span></p>
      <h2 id="areas-title" class="display-2">O que cada área faz, e com quem ela fala.</h2>
      <p class="section-lead">Para cada área: o problema que ela resolve, o que dá para fazer hoje, como o trabalho anda, que informação ela guarda e para onde essa informação vai.</p>
    </div>
    ${areaIndex()}
    ${list.map((m) => moduleSection(m, C.MODULES.indexOf(m))).join("\n")}
  </div>
</section>`;
}

// Mapa de conexões: SVG desenhado a partir de NETWORK (coordenadas em 1000×520).
function network() {
  const N = C.NETWORK;
  const byId = Object.fromEntries(N.nodes.map((n) => [n.id, n]));
  const W = 1000;
  const H = 520;
  const halfW = (n) => Math.max(92, n.label.length * 9.4 + 34) / 2;
  // Ponto na borda do nó (retângulo) na direção de (tx, ty), com folga para a seta.
  const border = (n, tx, ty, gap) => {
    const dx = tx - n.x;
    const dy = ty - n.y;
    const k = Math.min(halfW(n) / Math.abs(dx || 1e-6), 19 / Math.abs(dy || 1e-6));
    const len = Math.hypot(dx, dy) || 1;
    return [n.x + dx * k + (dx / len) * gap, n.y + dy * k + (dy / len) * gap];
  };
  const edges = N.edges.map(([a, b, label, kind, e5], i) => {
    const p0 = byId[a];
    const q0 = byId[b];
    const p = p0;
    const q = q0;
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (e5 ?? 0.1) * len;
    const cx = mx - (dy / len) * bend;
    const cy = my + (dx / len) * bend;
    const [sx, sy] = border(p0, cx, cy, 4);
    const [ex, ey] = border(q0, cx, cy, 6);
    const f = (v) => v.toFixed(1);
    const d = `M${f(sx)} ${f(sy)} Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`;
    return { a, b, label, kind, d, i };
  });
  const svg = `<svg class="net-svg" viewBox="0 0 ${W} ${H}" role="group" aria-labelledby="net-svg-title">
    <title id="net-svg-title">Mapa das ligações entre as áreas do EDUCA</title>
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5 L8 5 L1 8.5" fill="none" stroke="#a9a29a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>
    </defs>
    <g class="net-edges">
      ${edges
        .map(
          (e) => `<g class="edge edge-${e.kind}" data-a="${e.a}" data-b="${e.b}">
        <path class="edge-line" d="${e.d}" marker-end="url(#arrow)"/>
        <path class="edge-pulse" d="${e.d}" pathLength="100" style="--d:${(e.i * 0.37).toFixed(2)}s"/>
      </g>`,
        )
        .join("")}
    </g>
    <g class="net-nodes">
      ${N.nodes
        .map((n) => {
          const w = Math.max(92, n.label.length * 9.4 + 34);
          return `<g class="node" data-node="${n.id}" transform="translate(${n.x} ${n.y})" tabindex="0" role="button" aria-label="${esc(n.label)}: destacar ligações">
          <rect x="${-w / 2}" y="-19" width="${w}" height="38" rx="9"/>
          <rect class="node-bar" x="${-w / 2 + 12}" y="-2.5" width="10" height="5" rx="1.5"/>
          <text x="${-w / 2 + 30}" y="5">${esc(n.label)}</text>
        </g>`;
        })
        .join("")}
    </g>
  </svg>`;
  return `<section class="network stage" id="conexoes" aria-labelledby="net-title">
  <div class="wrap">
    <div class="section-head">
      <p class="kicker kicker-stage"><span>${esc(N.kicker)}</span></p>
      <h2 id="net-title" class="display-2">${esc(N.title)}</h2>
      <p class="section-lead">Linha contínua: a ligação acontece por uma ação na tela. Linha tracejada: a ligação existe no núcleo da plataforma (API e regras no banco), ainda sem botão na interface. Toque em uma área para ver só as ligações dela.</p>
    </div>
    <div class="net-grid">
      <div><div class="net-canvas">${svg}</div><p class="net-hint">Arraste o mapa para o lado para ver todas as áreas. A lista abaixo traz as mesmas ligações.</p></div>
      <div class="net-side">
      <p class="net-sum"><b>${edges.length}</b> ligações conferidas · <b>${edges.filter((e) => e.kind === "tela").length}</b> na tela · <b>${edges.filter((e) => e.kind === "api").length}</b> no núcleo, pela API</p>
      <ul class="net-list" aria-label="Ligações entre áreas">
        ${edges
          .map(
            (e) => `<li data-a="${e.a}" data-b="${e.b}"><span class="nl-path"><b>${esc(byId[e.a].label)}</b><span aria-hidden="true">→</span><b>${esc(byId[e.b].label)}</b></span><span class="nl-what">${esc(e.label)}</span>${chip(e.kind)}</li>`,
          )
          .join("")}
      </ul>
      </div>
    </div>
  </div>
</section>`;
}

function footer() {
  return `<footer class="footer stage">
  <div class="wrap footer-in">
    <a class="brand" href="#inicio">${mark(22)}<span>EDUCA<span class="brand-dim">.ERP</span></span></a>
    <p class="footer-note">${esc(C.META.edition)}. Os selos seguem o inventário em <code>docs/landing/INVENTARIO.md</code>.</p>
  </div>
</footer>`;
}

// ---------------------------------------------------------------------------
// Documento

const FONT_FACES = `
@font-face{font-family:"Instrument Sans";src:url(fonts/instrument-sans-latin-wght-normal.woff2) format("woff2");font-weight:400 700;font-style:normal;font-display:swap;unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"Instrument Sans";src:url(fonts/instrument-sans-latin-ext-wght-normal.woff2) format("woff2");font-weight:400 700;font-style:normal;font-display:swap;unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Instrument Serif";src:url(fonts/instrument-serif-latin-400-normal.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Instrument Serif";src:url(fonts/instrument-serif-latin-400-italic.woff2) format("woff2");font-weight:400;font-style:italic;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(fonts/jetbrains-mono-latin-wght-normal.woff2) format("woff2");font-weight:400 700;font-style:normal;font-display:swap}
`;

function body(sections) {
  return `<a class="skip" href="#conteudo">Pular para o conteúdo</a>
${header()}
<main id="conteudo">
${sections.join("\n")}
</main>
${footer()}
<dialog class="lightbox" aria-label="Tela ampliada">
  <div class="lb-bar"><p class="lb-caption"></p><button type="button" class="btn btn-ghost btn-sm" data-close>Fechar <span aria-hidden="true">✕</span></button></div>
  <div class="lb-body"><img alt=""></div>
</dialog>`;
}

function sectionsList(sizes, opts) {
  return [hero(), legend(), scenario(), platform(), journey(), areas(C.MODULES), base(), access(), central(), network(), closing(sizes, opts)];
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "img"), { recursive: true });
  await mkdir(path.join(OUT, "fonts"), { recursive: true });

  const screens = collectScreens(C);
  for (const s of screens) await prepareImage(s);

  const fontDir = path.join(ROOT, "src/app/fonts");
  for (const f of [
    "instrument-sans-latin-wght-normal.woff2",
    "instrument-sans-latin-ext-wght-normal.woff2",
    "instrument-serif-latin-400-normal.woff2",
    "instrument-serif-latin-400-italic.woff2",
    "jetbrains-mono-latin-wght-normal.woff2",
    "InstrumentSans-OFL.txt",
    "InstrumentSerif-OFL.txt",
    "JetBrainsMono-OFL.txt",
  ])
    await copyFile(path.join(fontDir, f), path.join(OUT, "fonts", f));

  const pdfDir = path.join(ROOT, "docs/manual/pdf");
  const sizes = {};
  await mkdir(path.join(OUT, "manuais"), { recursive: true });
  for (const href of [C.META.manualUser, C.META.manualAdmin]) {
    const f = path.join(pdfDir, path.basename(href));
    if (!existsSync(f)) throw new Error(`Manual não encontrado: ${f} (rode npm run manuals:pdf)`);
    await copyFile(f, path.join(OUT, href));
    sizes[href] = `PDF · ${((await stat(f)).size / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} MB`;
  }

  const css = await readFile(path.join(SRC, "styles.css"), "utf8");
  const js = await readFile(path.join(SRC, "main.js"), "utf8");
  await writeFile(path.join(OUT, "styles.css"), FONT_FACES + css);
  await writeFile(path.join(OUT, "main.js"), js);

  const html = body(sectionsList(sizes));
  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(C.META.title)} · Uma venda não termina na venda</title>
<meta name="description" content="${esc(C.META.description)}">
<meta name="color-scheme" content="light dark">
<meta property="og:title" content="${esc(C.META.title)}">
<meta property="og:description" content="${esc(C.META.description)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(mark(24).replace('class="mark"', 'xmlns="http://www.w3.org/2000/svg"').replace(/class="mark-bar"/g, 'fill="#f5f6f6"').replace('class="mark-fire"', 'fill="#ff9408"').replace('fill="currentColor"', 'fill="#100c08"'))}">
<link rel="preload" href="fonts/instrument-serif-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/instrument-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css">`;
  await writeFile(
    path.join(OUT, "index.html"),
    `<!doctype html>\n<html lang="pt-BR">\n<head>\n${head}\n</head>\n<body>\n${html}\n<script src="main.js" defer></script>\n</body>\n</html>\n`,
  );

  if (previewAt) {
    // Página única para a prévia: sem doctype/html/head/body (o publicador envolve),
    // CSS e JS embutidos, fontes do Google Fonts; imagens publicadas ao lado.
    const previewHtml = body(sectionsList(sizes, { preview: true }));
    const preview = `<title>EDUCA.ERP</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400..700&display=swap">
<style>${css}</style>
${previewHtml}
<script>${js}</script>
`;
    await writeFile(previewAt, preview);
  }

  const total = [...images.values()].length;
  console.log(`landing/site gerado: ${screens.length} referências de tela, ${total} imagens.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
