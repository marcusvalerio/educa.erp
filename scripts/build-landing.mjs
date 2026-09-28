#!/usr/bin/env node
// Gera a landing do EDUCA (site estático em public/landing/) a partir de
// landing/src/content.mjs. O próprio app Next a serve em "/" (rewrite no
// next.config.ts); os arquivos ficam em /landing/… (fora do proxy).
//
//   npm run landing:build              # gera public/landing/
//   node scripts/build-landing.mjs --preview <arquivo.html>
//                                      # também gera uma versão de página única
//                                      # (CSS e JS embutidos, fontes do Google Fonts)
//
// O build:
//   1. recorta e redimensiona só as capturas usadas (docs/manual/assets → img/);
//   2. copia as fontes do app (src/app/fonts → fonts/) e os PDFs dos manuais
//      (docs/manual/pdf → manuais/, fora do Git — no deploy, quem copia é
//      scripts/copy-landing-manuals.mjs);
//   3. escreve index.html com o conteúdo, styles.css e main.js.

import { mkdir, copyFile, readFile, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import * as C from "../landing/src/content.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "landing/src");
const OUT = path.join(ROOT, "public/landing");
// Onde o site é servido. O index.html aparece em "/" (rewrite), então os
// endereços dos arquivos precisam ser absolutos; CSS e JS continuam
// relativos entre si (url(fonts/…) no styles.css resolve em /landing/).
const BASE = "/landing/";
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

// Marcador de ato. O nó fica na margem: é por ele que o fio da página passa.
const actHead = (i) => {
  const a = C.ACTS[i];
  return `<p class="act" data-act="${a.n}"><span class="act-node" aria-hidden="true"></span><span class="act-n">Ato ${a.n}</span><span class="act-name">${esc(a.name)}</span></p>`;
};

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
  return `<header class="topbar">
  <div class="wrap topbar-in">
    <a class="brand" href="#inicio" aria-label="EDUCA.ERP, início da página">${mark(24)}<span>EDUCA<span class="brand-dim">.ERP</span></span></a>
    <nav aria-label="Seções" class="topnav">${links.map(([h, l]) => `<a href="${h}" data-spy="${h.slice(1)}">${l}</a>`).join("")}<span class="topnav-ink" aria-hidden="true"></span></nav>
    <a class="btn btn-enter btn-sm" href="${esc(C.META.appUrl)}" aria-label="Entrar no EDUCA"><span class="be-long">Entrar no EDUCA</span><span class="be-short">Entrar</span><span aria-hidden="true">→</span></a>
  </div>
</header>`;
}

// ---------------------------------------------------------------------------
// Abertura: cena de produto. Tudo em unidades de um quadro de 1320 × 530;
// posições viram porcentagens, então a cena escala inteira com a largura.

const HS = { W: 1320, H: 515 };
const HS_LAYOUT = {
  order: { x: 0, y: 105, w: 660 },
  sats: [
    { x: 780, y: 22, w: 200 },
    { x: 780, y: 204, w: 300 },
    { x: 780, y: 314, w: 300 },
    { x: 780, y: 398, w: 300 },
  ],
  gestao: { x: 1150, y: 190, w: 190 },
};

function hsBox(s, box) {
  const im = images.get(imgKey(s));
  const h = (box.w * im.h) / im.w;
  return { ...box, h, im };
}
const pct = (v, t) => `${((v / t) * 100).toFixed(3)}%`;
const f1 = (v) => v.toFixed(1);

function hero() {
  const H = C.HERO;
  const L = HS_LAYOUT;
  const order = hsBox(H.order, L.order);
  const sats = H.satellites.map((s, i) => ({ s, b: hsBox(s, L.sats[i]) }));
  const g = hsBox(H.gestao, L.gestao);

  const posStyle = (b) => `left:${pct(b.x, HS.W)};top:${pct(b.y, HS.H)};width:${pct(b.w, HS.W)}`;
  const tag = (n, area, code, kind) =>
    `<p class="hs-tag">${n ? `<b>${n}</b>` : ""}<span>${esc(area)}</span><code>${esc(code)}</code>${kind === "api" ? `<i class="hs-apichip">API</i>` : ""}</p>`;
  // Abaixo de 1100 px (a cena V4 fica no desktop). Imagens lazy: o pedido é
  // pré-carregado no <head> só nessas larguras.
  const frag = (s, b) =>
    `<a class="hs-img" href="${b.im.file}" data-zoom data-w="${b.im.w}" data-h="${b.im.h}" data-caption="${esc(s.alt)}" aria-label="Ampliar tela: ${esc(s.alt)}">${picture(s, { sizes: "100vw" })}</a>`;

  // Marcadores sobre o pedido: coordenadas da captura → % da imagem recortada.
  const [ox, oy, ow, oh] = H.order.crop;
  const hots = sats
    .map(
      ({ s }) =>
        `<span class="hs-hot hs-hot-${s.kind}" data-hot="${s.n - 1}" style="left:${pct(s.hotspot[0] - ox, ow)};top:${pct(s.hotspot[1] - oy, oh)}" title="${esc(s.hotspotLabel)}">${s.n}</span>`,
    )
    .join("");

  // Linhas: saída na borda direita do pedido → borda esquerda de cada área;
  // depois cada área → Gestão.
  const portY = [120, 245, 342, 380];
  const outPaths = sats.map(({ s, b }, i) => {
    const y0 = portY[i];
    const x0 = order.x + order.w;
    const y1 = b.y + b.h / 2;
    const x1 = b.x;
    return { id: `hs-o${i}`, kind: s.kind, d: `M${f1(x0)} ${f1(y0)} C${f1(x0 + 60)} ${f1(y0)}, ${f1(x1 - 60)} ${f1(y1)}, ${f1(x1)} ${f1(y1)}` };
  });
  const gy = [216, 236, 256, 276];
  const inPaths = sats.map(({ b }, i) => {
    const x0 = b.x + b.w;
    const y0 = b.y + b.h / 2;
    const x1 = g.x;
    const y1 = gy[i];
    return { id: `hs-g${i}`, kind: "tela", d: `M${f1(x0)} ${f1(y0)} C${f1(x0 + 36)} ${f1(y0)}, ${f1(x1 - 44)} ${f1(y1)}, ${f1(x1)} ${f1(y1)}` };
  });
  const paths = [...outPaths, ...inPaths];
  // Portas: onde cada ligação sai e chega (aparecem primeiro, como sinais).
  const ends = (d) => {
    const n = d.match(/-?\d+(\.\d+)?/g).map(Number);
    return [
      [n[0], n[1]],
      [n[n.length - 2], n[n.length - 1]],
    ];
  };
  const ports = paths.flatMap((p, i) => ends(p.d).map(([x, y], k) => `<circle class="hs-port" data-port="${i}-${k}" cx="${f1(x)}" cy="${f1(y)}" r="3.2"/>`)).join("");
  const svg = `<svg class="hs-lines" viewBox="0 0 ${HS.W} ${HS.H}" aria-hidden="true" focusable="false">
    <defs>${paths.map((p) => `<mask id="${p.id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${HS.W}" height="${HS.H}"><path class="hs-draw" d="${p.d}"/></mask>`).join("")}</defs>
    <g class="hs-ports">${ports}</g>
    ${paths
      .map(
        (p, i) => `<g class="hs-link hs-${p.kind}" data-link="${i}">
      <path id="${p.id}" class="hs-path" d="${p.d}" mask="url(#${p.id}-m)"/>
      <circle class="hs-sig" r="3.2" cx="-20" cy="-20"><animateMotion dur="${(2.6 + (i % 4) * 0.35).toFixed(2)}s" repeatCount="indefinite" begin="indefinite" rotate="auto"><mpath href="#${p.id}"/></animateMotion></circle>
    </g>`,
      )
      .join("")}
  </svg>`;

  // Sinais soltos do começo da sequência (decorativos: repetem códigos das telas).
  const targets = [order, order, ...sats.map((x) => x.b), sats[3].b, g];
  const signals = H.signals
    .map((txt, i) => {
      const sx = [120, 380, 640, 900, 1130, 250, 760, 1040][i];
      const sy = [60, 150, 40, 110, 70, 320, 430, 370][i];
      const t = targets[Math.min(i, targets.length - 1)];
      return `<span class="hs-signal" style="left:${pct(sx, HS.W)};top:${pct(sy, HS.H)}" data-tx="${((t.x / HS.W) * 100).toFixed(2)}" data-ty="${(((t.y - 18) / HS.H) * 100).toFixed(2)}" data-sx="${((sx / HS.W) * 100).toFixed(2)}" data-sy="${((sy / HS.H) * 100).toFixed(2)}">${esc(txt)}</span>`;
    })
    .join("");

  const [l1, l2] = H.title;
  return `<section class="hero stage" id="inicio" aria-labelledby="hero-title">
  <div class="hero-bg" aria-hidden="true">${Array.from({ length: 13 }, (_, i) => `<i class="gl" style="--i:${i}"></i>`).join("")}<span class="hero-glow"></span></div>
  ${heroWorld()}
  <div class="wrap">
    <div class="hero-head">
      <div class="hero-title-col">
        <p class="eyebrow" data-intro><span class="act-node thread-start" aria-hidden="true"></span><span class="eyebrow-bar" aria-hidden="true"></span>${esc(H.eyebrow)}</p>
        <h1 id="hero-title" class="display"><span class="ln"><span>${esc(l1)}</span></span><span class="ln ln-last"><span><em>${esc(l2)}</em><i class="fire-bar" aria-hidden="true"></i></span></span></h1>
      </div>
      <div class="hero-side">
        <p class="lead" data-intro>${esc(H.lead)}</p>
        <div class="actions" data-intro>
          <a class="btn btn-fire" href="${esc(H.primary.href)}">${esc(H.primary.label)}<span aria-hidden="true">↓</span></a>
          <a class="btn btn-ghost" href="${esc(H.secondary.href)}">${esc(H.secondary.label)}<span aria-hidden="true">→</span></a>
        </div>
      </div>
    </div>
    <div class="hs" role="group" aria-label="Um pedido aprovado e o que ele gera em cada área, nas telas reais do EDUCA">
      <div class="hs-box">
        ${svg}
        <figure class="hs-frag hs-order" style="${posStyle(order)}" data-depth="0.5">
          ${tag(null, H.order.area, H.order.code, "tela")}
          <div class="hs-media">${frag(H.order, order)}${hots}<span class="hs-scan" aria-hidden="true"></span></div>
          <span class="hs-ghost" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <figcaption class="hs-cap">${esc(H.order.text)}</figcaption>
        </figure>
        ${sats
          .map(
            ({ s, b }, i) => `<figure class="hs-frag hs-sat hs-${s.kind}" style="${posStyle(b)}" data-sat="${i}" data-depth="${(0.9 + i * 0.15).toFixed(2)}">
          ${tag(s.n, s.area, s.code, s.kind)}
          <div class="hs-media">${frag(s, b)}</div>
          <span class="hs-ghost" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <figcaption class="hs-cap">${esc(s.text)}</figcaption>
        </figure>`,
          )
          .join("")}
        <figure class="hs-frag hs-gestao" style="${posStyle(g)}" data-depth="1.4">
          ${tag(null, H.gestao.area, H.gestao.code, "tela")}
          <div class="hs-media">${frag(H.gestao, g)}</div>
          <span class="hs-ghost" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <figcaption class="hs-cap">${esc(H.gestao.text)}</figcaption>
        </figure>
        <div class="hs-signals" aria-hidden="true">${signals}</div>
      </div>
      <p class="hs-legend" data-intro><span class="lg-solid" aria-hidden="true"></span>Ação na tela <span class="lg-dash" aria-hidden="true"></span>Pela API, sem botão na tela <span class="hs-legend-note">Telas reais do EDUCA, com dados fictícios. Toque numa tela para ampliar.</span></p>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Abertura V4 (≥ 1100 px): o pedido PV-001013 como objeto, em "vista
// explodida". Mundo de 1440 × 840 unidades; 1 unidade = 1/1440 da largura
// (var(--u) no CSS), então a cena escala inteira. O pedido fica em
// perspectiva; as partes que geram trabalho em outra área se destacam dele em
// profundidade e ligam-se às telas reais dessas áreas, que convergem em Gestão.
//
// As linhas do HTML estático (sem JS) saem da mesma projeção que o CSS faz:
// perspective P com origem O no mundo, rotateY/rotateX no pedido e translateZ
// nas partes. Com JS, main.js redesenha as linhas a partir das âncoras reais.

const HX = { W: 1440, H: 840, P: 1700, O: [940, 440] };
const HX_ORDER = { x: 650, y: 214, w: 574, ry: 17, rx: 6 };
// A câmera começa perto (≈1,7×): pede a captura grande já no primeiro quadro.
const HX_STAGE_SIZES = "80vw";
const HX_PART_Z = { cabecalho: 34, totais: 20, docfiscal: 28, andamento: 14, financeiro: 64 };
const HX_PART_SHIFT = { financeiro: [150, 26] };
const HX_POP = { w: 200, lift: 46, z: 90 }; // janela de reserva que nasce do botão
const HX_DEST = {
  fiscal: { x: 470, y: 704, w: 320, z: 0 },
  logistica: { x: 884, y: 722, w: 232, z: -20 },
  gestao: { x: 1146, y: 380, w: 190, z: 0 },
};

const m4 = {
  mul(a, b) {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
    return r;
  },
  T: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1],
  Ry(d) {
    const a = (d * Math.PI) / 180;
    return [Math.cos(a), 0, Math.sin(a), 0, 0, 1, 0, 0, -Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1];
  },
  Rx(d) {
    const a = (d * Math.PI) / 180;
    return [1, 0, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, 0, Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1];
  },
  apply(m, [x, y, z = 0]) {
    return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
  },
};
const hxProject = ([x, y, z]) => {
  const s = HX.P / (HX.P - z);
  return [HX.O[0] + (x - HX.O[0]) * s, HX.O[1] + (y - HX.O[1]) * s];
};

function heroWorld() {
  const H = C.HERO;
  const o = HX_ORDER;
  const stageIm = images.get(imgKey(H.stage));
  const oh = (o.w * stageIm.h) / stageIm.w;
  const s = o.w / H.stage.crop[2]; // px da captura → unidades do plano
  const [cx0, cy0] = H.stage.crop;
  const mOrder = m4.mul(m4.mul(m4.T(o.x, o.y + oh / 2, 0), m4.mul(m4.Ry(o.ry), m4.Rx(o.rx))), m4.T(0, -oh / 2, 0));
  // Ponto (x, y) em px da captura, numa parte levantada (z, desvio) → tela.
  const onOrder = (px, py, z = 0, [dx, dy] = [0, 0]) => hxProject(m4.apply(mOrder, [(px - cx0) * s + dx, (py - cy0) * s + dy, z]));
  const u = (v) => `calc(var(--u) * ${+v.toFixed(2)})`;
  const pc = (v, t) => `${((v / t) * 100).toFixed(3)}%`;

  // Partes do pedido (recortes da mesma captura), na posição exata delas.
  const partBox = (p) => {
    const [x, y, w, h] = p.crop;
    return { x: (x - cx0) * s, y: (y - cy0) * s, w: w * s, h: h * s };
  };
  const sat = Object.fromEntries(H.satellites.map((x) => [x.id, x]));
  const parts = H.parts
    .map((p) => {
      const b = partBox(p);
      const [dx, dy] = HX_PART_SHIFT[p.id] ?? [0, 0];
      const dest = p.to ? sat[p.to] : null;
      // Fiscal e Logística têm tela de destino no mundo (com a etiqueta); a
      // parte do pedido só ganha etiqueta quando é ela mesma o destino.
      const tag = dest && !HX_DEST[p.to]
        ? `<p class="hx-tag"><b>${dest.n}</b><span>${esc(dest.area)}</span><code>${esc(dest.code)}</code>${dest.kind === "api" ? '<i class="hs-apichip">API</i>' : ""}</p>`
        : "";
      return `<div class="hx-part${dest ? " hx-feeds" : ""}" data-part="${p.id}"${dest ? ` data-to="${p.to}"` : ""} style="left:${pc(b.x, o.w)};top:${pc(b.y, oh)};width:${pc(b.w, o.w)};height:${pc(b.h, oh)};--z:${HX_PART_Z[p.id]};--dx:${dx};--dy:${dy}">${picture(p, { alt: "", sizes: HX_STAGE_SIZES })}${tag}</div>`;
    })
    .join("");
  // Onde cada parte "encaixa" no pedido: a base escurece sob a parte levantada.
  const sockets = H.parts.map((p) => {
    const b = partBox(p);
    return `<span class="hx-socket" style="left:${pc(b.x, o.w)};top:${pc(b.y, oh)};width:${pc(b.w, o.w)};height:${pc(b.h, oh)}"></span>`;
  });

  // Estoque: a janela real de reserva nasce do botão Reservar estoque.
  const eb = H.buttons.estoque;
  const est = sat.estoque;
  const estIm = images.get(imgKey(est));
  const popW = HX_POP.w;
  const popH = (popW * estIm.h) / estIm.w;
  const bx = (eb[0] - cx0) * s;
  const by = (eb[1] - cy0) * s;
  const popX = bx + (eb[2] * s) / 2 - popW / 2;
  const popY = by - popH - HX_POP.lift;
  const pop = `<figure class="hx-part hx-pop hx-feeds" data-part="estoque" data-to="estoque" style="left:${pc(popX, o.w)};top:${pc(popY, oh)};width:${pc(popW, o.w)};height:${pc(popH, oh)};--z:${HX_POP.z}">
      ${picture(est, { alt: est.alt, sizes: "15vw" })}
      <figcaption class="hx-tag"><b>${est.n}</b><span>${esc(est.area)}</span><code>${esc(est.code)}</code></figcaption>
    </figure>`;

  // Telas de destino no mundo (Fiscal e Logística pela API; Gestão recebe tudo).
  const dest = (id, d) => {
    const it = id === "gestao" ? H.gestao : sat[id];
    const im = images.get(imgKey(it));
    const h = (d.w * im.h) / im.w;
    return {
      h,
      html: `<figure class="hx-dest hx-${it.kind ?? "tela"}" data-dest="${id}" style="left:${u(d.x)};top:${u(d.y)};width:${u(d.w)};height:${u(h)};--z:${d.z}">
      <p class="hx-tag">${it.n ? `<b>${it.n}</b>` : ""}<span>${esc(it.area)}</span><code>${esc(it.code)}</code>${it.kind === "api" ? '<i class="hs-apichip">API</i>' : ""}</p>
      ${picture(it, { alt: it.alt, sizes: `${Math.round((d.w / HX.W) * 100)}vw` })}
    </figure>`,
    };
  };
  const D = Object.fromEntries(Object.entries(HX_DEST).map(([id, d]) => [id, { ...d, ...dest(id, d) }]));
  const onDest = (id, fx, fy) => {
    const d = D[id];
    return hxProject([d.x + d.w * fx, d.y + d.h * fy, d.z]);
  };

  // Ligações: origem real no pedido → destino. Âncoras nomeadas: o JS usa as
  // mesmas para redesenhar as linhas com a câmera em movimento.
  const fb = H.buttons.financeiro;
  const pFin = H.parts.find((p) => p.id === "financeiro").crop;
  const pDoc = H.parts.find((p) => p.id === "docfiscal").crop;
  const pAnd = H.parts.find((p) => p.id === "andamento").crop;
  const shiftF = HX_PART_SHIFT.financeiro;
  const popPt = (fx, fy) => hxProject(m4.apply(mOrder, [popX + popW * fx, popY + popH * fy, HX_POP.z]));
  const L = [
    { id: "estoque", kind: "tela", mode: "v", a: onOrder(eb[0] + eb[2] / 2, eb[1], HX_PART_Z.cabecalho), b: popPt(0.5, 1) },
    { id: "financeiro", kind: "tela", mode: "v", a: onOrder(fb[0] + fb[2] / 2, fb[1] + fb[3], HX_PART_Z.cabecalho), b: onOrder(pFin[0] + pFin[2] * 0.62, pFin[1], HX_PART_Z.financeiro, shiftF) },
    { id: "fiscal", kind: "api", mode: "v", a: onOrder(pDoc[0] + 24, pDoc[1] + pDoc[3], HX_PART_Z.docfiscal), b: onDest("fiscal", 0.5, 0) },
    { id: "logistica", kind: "api", mode: "v", a: onOrder(pAnd[0] + pAnd[2] * 0.5, pAnd[1] + pAnd[3], HX_PART_Z.andamento), b: onDest("logistica", 0.5, 0) },
    { id: "g-estoque", kind: "tela", mode: "h", a: popPt(1, 0.5), b: onDest("gestao", 0.5, 0) },
    { id: "g-financeiro", kind: "tela", mode: "h", a: onOrder(pFin[0] + pFin[2], pFin[1] + pFin[3] / 2, HX_PART_Z.financeiro, shiftF), b: onDest("gestao", 0, 0.62) },
    { id: "g-fiscal", kind: "tela", mode: "h", a: onDest("fiscal", 1, 0.5), b: onDest("gestao", 0.2, 1) },
    { id: "g-logistica", kind: "tela", mode: "h", a: onDest("logistica", 1, 0.5), b: onDest("gestao", 0.55, 1) },
  ];
  const curve = ({ a, b, mode }) => {
    const [x0, y0] = a;
    const [x1, y1] = b;
    const c = mode === "v" ? [x0, y0 + (y1 - y0) * 0.55, x1, y1 - (y1 - y0) * 0.55] : [x0 + (x1 - x0) * 0.55, y0, x1 - (x1 - x0) * 0.55, y1];
    return `M${f1(x0)} ${f1(y0)} C${f1(c[0])} ${f1(c[1])}, ${f1(c[2])} ${f1(c[3])}, ${f1(x1)} ${f1(y1)}`;
  };
  const lines = `<svg class="hx-lines" viewBox="0 0 ${HX.W} ${HX.H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    ${L.map(
      (l, i) => `<g class="hx-link hx-${l.kind}" data-link="${l.id}" data-mode="${l.mode}">
      <path id="hx-l${i}" class="hx-path" d="${curve(l)}"/>
      <circle class="hx-end" r="3.2" cx="${f1(l.a[0])}" cy="${f1(l.a[1])}"/><circle class="hx-end" r="3.2" cx="${f1(l.b[0])}" cy="${f1(l.b[1])}"/>
      <circle class="hx-sig" r="3.4" cx="-20" cy="-20"><animateMotion dur="${(2.4 + (i % 4) * 0.4).toFixed(1)}s" repeatCount="indefinite" begin="indefinite"><mpath href="#hx-l${i}"/></animateMotion></circle>
    </g>`,
    ).join("")}
  </svg>`;

  // Âncoras DOM (pontos das ligações), em % do elemento que as contém.
  const anchor = (name, fx, fy) => `<i class="hx-a" data-a="${name}" style="left:${(fx * 100).toFixed(2)}%;top:${(fy * 100).toFixed(2)}%"></i>`;
  const cab = H.parts.find((p) => p.id === "cabecalho").crop;
  const cabA = [
    anchor("estoque-a", (eb[0] + eb[2] / 2 - cab[0]) / cab[2], (eb[1] - cab[1]) / cab[3]),
    anchor("financeiro-a", (fb[0] + fb[2] / 2 - cab[0]) / cab[2], (fb[1] + fb[3] - cab[1]) / cab[3]),
  ].join("");
  const withAnchors = (html, id, list) => html.replace(new RegExp(`(data-part="${id}"[^>]*>)`), `$1${list}`);
  let partsHtml = withAnchors(parts, "cabecalho", cabA);
  partsHtml = withAnchors(partsHtml, "financeiro", anchor("financeiro-b", 0.62, 0) + anchor("g-financeiro-a", 1, 0.5));
  partsHtml = withAnchors(partsHtml, "docfiscal", anchor("fiscal-a", 24 / pDoc[2], 1));
  partsHtml = withAnchors(partsHtml, "andamento", anchor("logistica-a", 0.5, 1));
  const popHtml = pop.replace(/(data-part="estoque"[^>]*>)/, `$1${anchor("estoque-b", 0.5, 1)}${anchor("g-estoque-a", 1, 0.5)}`);
  const destHtml = (id, list) => D[id].html.replace(/(<figure[^>]*>)/, `$1${list}`);

  return `<div class="hx" role="group" aria-label="O pedido PV-001013 aprovado no Comercial e o que ele gera no Estoque, no Financeiro, no Fiscal e na Logística, até a Gestão, nas telas reais do EDUCA">
    <div class="hx-world">
      <div class="hx-cam">
        <div class="hx-order" style="left:${u(o.x)};top:${u(o.y)};width:${u(o.w)};height:${u(oh)};--ry:${o.ry}deg;--rx:${o.rx}deg">
          <div class="hx-face">${picture(H.stage, { alt: H.stage.alt, cls: "hx-base", sizes: HX_STAGE_SIZES })}${sockets.join("")}<span class="hx-sheen" aria-hidden="true"></span></div>
          ${partsHtml}
          ${popHtml}
        </div>
        ${destHtml("fiscal", anchor("fiscal-b", 0.5, 0) + anchor("g-fiscal-a", 1, 0.5))}
        ${destHtml("logistica", anchor("logistica-b", 0.5, 0) + anchor("g-logistica-a", 1, 0.5))}
        ${destHtml("gestao", anchor("g-estoque-b", 0.5, 0) + anchor("g-financeiro-b", 0, 0.62) + anchor("g-fiscal-b", 0.2, 1) + anchor("g-logistica-b", 0.55, 1))}
      </div>
    </div>
    ${lines}
    <p class="hx-legend"><span class="lg-solid" aria-hidden="true"></span>Ação na tela <span class="lg-dash" aria-hidden="true"></span>Pela API, sem botão na tela <span class="hs-legend-note">Telas reais do EDUCA, com dados fictícios.</span></p>
  </div>`;
}

function legend() {
  return `<div class="legend" aria-labelledby="legenda-title">
    <p id="legenda-title" class="legend-title">Como ler os selos</p>
    <ul class="legend-list">
      ${Object.entries(C.STATES)
        .map(([k, v]) => `<li>${chip(k)}<span>${esc(v.hint)}</span></li>`)
        .join("")}
    </ul>
  </div>`;
}

// ---------------------------------------------------------------------------
// Siga um pedido. A mesma etapa é desenhada duas vezes: na lista (leitura,
// celular e sem JS) e no palco da cena fixa (desktop com movimento).
// A "câmera" aproxima a região da tela que a etapa explica: escala S e
// contratranslação calculadas aqui, das coordenadas da captura.

const VIEW_RATIO = 1.5; // proporção da janela do palco

function camParams(s, viewRatio, maxS = viewRatio ? 1.6 : 1.5) {
  const im = images.get(imgKey(s));
  const [ox, oy] = s._crop ?? [0, 0];
  const rImg = im.w / im.h;
  const k = viewRatio ? viewRatio / rImg : 1; // converte y da imagem para y da janela
  const toView = ([x, y, w, h]) => [(x - ox) / im.w, ((y - oy) / im.h) * k, w / im.w, (h / im.h) * k];
  const f = s.focus ? toView(s.focus) : null;
  let S = 1;
  let tx = 0;
  let ty = 0;
  if (f) {
    S = Math.max(1, Math.min(maxS, 0.8 / f[2], 0.8 / Math.max(f[3], 0.001)));
    const cx = f[0] + f[2] / 2;
    const cy = f[1] + f[3] / 2;
    // A imagem ocupa [0,1] na horizontal e [0,k] na vertical (em unidades da
    // janela). A câmera escala em torno do centro; o deslocamento fica entre
    // os limites que mantêm a janela coberta pela imagem.
    const clampT = (want, lo, hi) => (lo > hi ? want : Math.max(lo, Math.min(hi, want)));
    const tX = clampT(-S * (cx - 0.5), 0.5 - S * 0.5, S * 0.5 - 0.5);
    const tY = clampT(-S * (cy - 0.5), 0.5 - S * (k - 0.5), S * 0.5 - 0.5);
    tx = tX * 100;
    ty = tY * 100;
  }
  const cur = s.cursor ? [(s.cursor[0] - ox) / im.w, ((s.cursor[1] - oy) / im.h) * k] : null;
  return { im, f, S, tx, ty, cur };
}

const CURSOR_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3l14 8-6.2 1.6L10 19z" fill="#100c08" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

function cam(s, { viewRatio = null, alt, sizes, inert = false, maxS } = {}) {
  const p = camParams(s, viewRatio, maxS);
  const pc = (v) => `${(v * 100).toFixed(2)}%`;
  const focus = p.f
    ? `<span class="cam-focus" style="left:${pc(p.f[0])};top:${pc(p.f[1])};width:${pc(p.f[2])};height:${pc(p.f[3])}"></span>`
    : "";
  const cursor = p.cur
    ? `<span class="cam-cursor" style="left:${pc(p.cur[0])};top:${pc(p.cur[1])}" aria-hidden="true"><span class="cam-ripple"></span>${CURSOR_SVG}${s.action ? `<em>${esc(s.action)}</em>` : ""}</span>`
    : "";
  return `<div class="cam" data-s="${p.S.toFixed(3)}" data-tx="${p.tx.toFixed(2)}" data-ty="${p.ty.toFixed(2)}" style="--s:${p.S.toFixed(3)};--tx:${p.tx.toFixed(2)};--ty:${p.ty.toFixed(2)}">${picture(s, { alt: inert ? "" : alt ?? s.alt, sizes })}${focus}${cursor}</div>`;
}

function apiCard(s) {
  if (!s.api) return "";
  return `<div class="api-card">
    <p class="api-head">${chip("api")}<span>No núcleo da plataforma, sem botão na tela</span></p>
    <ul>${s.api.map((r) => { const [m, ...rest] = r.split(" "); return `<li><code><b>${esc(m)}</b> ${esc(rest.join(" "))}</code></li>`; }).join("")}</ul>
    <p class="api-foot">Na tela: ${esc(s.detail)}</p>
  </div>`;
}

function resultTag(s) {
  return s.result ? `<p class="result-tag"><span aria-hidden="true">✓</span>${esc(s.result)}</p>` : "";
}

function journey() {
  const J = C.JOURNEY;
  const steps = J.steps;
  const lane = `<ol class="lane" aria-hidden="true">
      <li class="lane-origin"><span class="lane-n">00</span><span class="lane-name">${esc(J.origin)}</span></li>
      ${steps.map((s, i) => `<li data-lane="${i}"${i === 0 ? ' class="is-active"' : ""}><span class="lane-n">${pad(i + 1)}</span><span class="lane-name">${esc(s.area)}</span><span class="lane-status">${esc(s.status)}</span></li>`).join("")}
      <li class="lane-track"><span class="lane-fire"></span><span class="lane-token"><i></i></span></li>
    </ol>`;
  const route = (s) => `<div class="shot-bar"><span class="shot-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="shot-route">${esc(s.route)}</span></div>`;
  return `<section class="journey stage act-dark" id="siga-um-pedido" aria-labelledby="journey-title">
  <div class="wrap">
    ${actHead(2)}
    <div class="section-head journey-head">
      <p class="thesis">${esc(J.thesis)}</p>
      <h2 id="journey-title" class="display-2">${esc(J.title)}</h2>
      <p class="section-lead">${esc(J.lead)}</p>
    </div>
  </div>
  <div class="jc">
    <div class="wrap jc-in">
      ${lane}
      <div class="jc-grid">
        <ol class="steps">
          ${steps
            .map(
              (s, i) => `<li class="step${i === 0 ? " is-active" : ""}" data-step="${i}">
            <div class="step-copy">
              <div class="step-head"><span class="step-n">${pad(i + 1)}</span><span class="step-area">${esc(s.area)}</span>${chip(s.state)}</div>
              <h3 class="step-title">${esc(s.title)}</h3>
              <p class="step-text">${esc(s.text)}</p>
              <dl class="step-meta">
                <div><dt>Na prática</dt><dd>${esc(s.detail)}</dd></div>
                <div><dt>Permissão</dt><dd><code>${esc(s.perm)}</code></dd></div>
              </dl>
            </div>
            <figure class="step-shot shot">
              ${route(s)}
              <div class="shot-frame cam-frame" style="aspect-ratio:${images.get(imgKey(s)).w}/${images.get(imgKey(s)).h}">${cam(s, { sizes: "(min-width: 1100px) 55vw, 100vw" })}</div>
              <p class="callout"><span>Em foco</span>${esc(s.callout)}</p>
              ${resultTag(s)}${apiCard(s)}
            </figure>
          </li>`,
            )
            .join("")}
        </ol>
        <div class="jc-stage" aria-hidden="true">
          <div class="jc-frame shot">
            <div class="shot-bar"><span class="shot-mark"><i></i><i></i><i></i></span>${steps.map((s, i) => `<span class="shot-route" data-route="${i}">${esc(s.route)}</span>`).join("")}</div>
            <div class="jc-view" style="aspect-ratio:${VIEW_RATIO}">
              ${steps.map((s, i) => `<div class="jc-layer" data-layer="${i}">${cam(s, { viewRatio: VIEW_RATIO, inert: true, sizes: "(min-width: 1100px) 58vw, 100vw" })}</div>`).join("")}
              ${steps.map((s, i) => `<p class="callout jc-callout" data-callout="${i}"><span>Em foco</span>${esc(s.callout)}</p>`).join("")}
            </div>
          </div>
          ${steps.map((s, i) => `<div class="jc-over" data-over="${i}">${resultTag(s)}${apiCard(s)}</div>`).join("")}
        </div>
      </div>
      <p class="jc-note">${esc(J.note)}</p>
    </div>
  </div>
</section>`;
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
    <span class="tab-ink" aria-hidden="true"></span>
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

// Ligação de um módulo com outro, na linguagem de conexões: origem → destino.
// O sentido e o estado (na tela / na API) vêm das ligações conferidas em
// NETWORK; ligações sem aresta no mapa aparecem sem selo.
const shortName = (id) => ({ estoque: "Estoque", painel: "Painéis", projetos: "Projetos", ativos: "Ativos", cadastros: "Cadastros" })[id] ?? moduleName(id);
function connRow(m, to, what) {
  const edge = C.NETWORK.edges.find(([a, b]) => (a === m.id && b === to) || (a === to && b === m.id));
  const inbound = edge && edge[0] === to;
  const [from, dest] = inbound ? [to, m.id] : [m.id, to];
  const target = to === "cadastros" ? "#base" : `#mod-${to}`;
  return `<li><a href="${target}" data-conn="${edge ? edge[3] : "rel"}">
    <span class="lk-path"><span class="lk-node${from === m.id ? " is-self" : ""}">${esc(shortName(from))}</span><span class="lk-line" aria-hidden="true"><i></i></span><span class="lk-node${dest === m.id ? " is-self" : ""}">${esc(shortName(dest))}</span></span>
    <span class="lk-what">${esc(what)}</span>${edge ? chip(edge[3]) : ""}
  </a></li>`;
}


// ---------------------------------------------------------------------------
// Ato 04: protagonistas e capítulos.

// Resumo de estados de um conjunto de capacidades ("4 na tela · 1 consulta …").
const SS_LABEL = {
  tela: (n) => `${n === 1 ? "ação" : "ações"} na tela`,
  consulta: (n) => (n === 1 ? "consulta" : "consultas"),
  api: () => "pela API",
  evolucao: () => "em evolução",
};
function stateSummary(does, cls = "") {
  const counts = {};
  does.forEach(([, st]) => (counts[st] = (counts[st] ?? 0) + 1));
  return `<p class="ssum ${cls}">${Object.keys(C.STATES)
    .filter((k) => counts[k])
    .map((k) => `<span class="ss ss-${k}" title="${esc(C.STATES[k].hint)}"><b>${counts[k]}</b> ${SS_LABEL[k](counts[k])}</span>`)
    .join('<i aria-hidden="true">·</i>')}</p>`;
}

// Junta os pedaços de módulos que formam a ficha de um protagonista.
function protagonistData(pr) {
  const pick = (arr, idx) => (idx ? idx.map((i) => arr[i]) : arr);
  const mods = pr.parts.map((pt) => ({ m: moduleById[pt.module], pt }));
  const first = mods[0].m;
  return {
    first,
    does: mods.flatMap(({ m, pt }) => pick(m.does, pt.does)),
    controls: mods.flatMap(({ m, pt }) => pick(m.controls, pt.controls)),
    links: mods.flatMap(({ m, pt }) => pick(m.links, pt.links).map((l) => ({ m, l }))),
    flows: mods.map(({ m }) => ({ name: m.name, flow: m.flow })),
    problems: mods.map(({ m }) => m.problem),
    serves: mods.map(({ m }) => m.serves),
    who: mods.map(({ m }) => m.who),
    names: mods.map(({ m }) => m.name),
  };
}

const PRO_RATIO = 1.5;
function protagonist(pr, i) {
  const d = protagonistData(pr);
  const title = pr.id === "fiscal" ? "Fiscal e Logística" : pr.id === "estoque" ? "Estoque" : d.first.name;
  const beats = pr.beats;
  const route = (b) => `<span class="shot-route">${esc(b.route)}</span>`;
  const apiBlock = (b) =>
    b.api
      ? `<div class="api-card"><p class="api-head">${chip("api")}<span>No núcleo da plataforma, sem botão na tela</span></p><ul>${b.api
          .map((r) => {
            const [m, ...rest] = r.split(" ");
            return `<li><code><b>${esc(m)}</b> ${esc(rest.join(" "))}</code></li>`;
          })
          .join("")}</ul></div>`
      : "";
  // Alterna claro e escuro entre os protagonistas: ritmo e identidade.
  return `<article class="pro${i % 2 ? " pro-dark" : ""}" id="mod-${pr.id}" data-pro="${pr.id}" aria-labelledby="pro-${pr.id}-title" style="--beats:${beats.length}">
  <header class="pro-head">
    <span class="pro-sig" aria-hidden="true">${esc(pr.signature)}</span>
    <div class="pro-title-col">
      <p class="pro-kicker"><b>${pad(i + 1)}</b>${esc(title)}</p>
      <h3 id="pro-${pr.id}-title" class="display-2 pro-mood">${esc(pr.mood)}</h3>
      <p class="pro-chain" aria-label="Etapas da cena">${beats.map((b) => `<span>${esc(b.label)}</span>`).join('<i aria-hidden="true">→</i>')}</p>
    </div>
    <div class="pro-intro">
      <p class="m-label">O problema</p>
      ${d.problems.map((t) => `<p class="pro-problem">${esc(t)}</p>`).join("")}
      <p class="m-label">Como o EDUCA resolve</p>
      ${d.serves.map((t) => `<p class="pro-serves">${esc(t)}</p>`).join("")}
      <p class="who">Para ${esc(d.who.map((w) => w.charAt(0).toLowerCase() + w.slice(1).replace(/\.$/, "")).join("; "))}.</p>
      ${stateSummary(d.does, "pro-ssum")}
    </div>
  </header>
  <div class="pro-theatre">
    <ol class="pro-beats">
      ${beats
        .map(
          (b, k) => `<li class="pro-beat${k === 0 ? " is-on" : ""}" data-beat="${k}">
        <p class="pro-beat-n"><b>${pad(k + 1)}</b>${esc(b.label)}${chip(b.state)}</p>
        <p class="pro-beat-text">${esc(b.text)}</p>
        ${b.note ? `<p class="pro-beat-note">${esc(b.note)}</p>` : ""}
        ${apiBlock(b)}
        <figure class="pro-beat-shot shot">
          <div class="shot-bar"><span class="shot-mark" aria-hidden="true"><i></i><i></i><i></i></span>${route(b)}</div>
          <div class="shot-frame cam-frame" style="aspect-ratio:${PRO_RATIO}">${cam(b, { viewRatio: PRO_RATIO, alt: b.text, sizes: "(min-width: 1100px) 1px, 100vw", maxS: 1.9 })}</div>
        </figure>
      </li>`,
        )
        .join("")}
    </ol>
    <div class="pro-stage" aria-hidden="true">
      <div class="pro-screen shot">
        <div class="shot-bar"><span class="shot-mark"><i></i><i></i><i></i></span>${beats.map((b, k) => `<span class="shot-route${k === 0 ? " is-on" : ""}" data-route="${k}">${esc(b.route)}</span>`).join("")}</div>
        <div class="pro-view" style="aspect-ratio:${PRO_RATIO}">
          ${beats.map((b, k) => `<div class="pro-layer${k === 0 ? " is-on" : ""}" data-layer="${k}">${cam(b, { viewRatio: PRO_RATIO, inert: true, sizes: "(min-width: 1100px) 90vw, 1px", maxS: 1.9 })}</div>`).join("")}
        </div>
      </div>
      <ol class="pro-dots">${beats.map((b, k) => `<li${k === 0 ? ' class="is-on"' : ""} data-dot="${k}"><span>${esc(b.label)}</span></li>`).join("")}</ol>
    </div>
  </div>
  <div class="pro-sheet">
    <div class="m-part">
      <h4 class="m-label">O que você faz</h4>
      <ul class="does">${d.does.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
    </div>
    <div class="m-part">
      <h4 class="m-label">O que o sistema controla</h4>
      <ul class="controls">${d.controls.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    </div>
    <div class="m-part">
      <h4 class="m-label">Etapas no sistema</h4>
      ${d.flows.map((f) => `<ol class="pro-flow" aria-label="${esc(f.name)}">${f.flow.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`).join("")}
    </div>
    <div class="m-part">
      <h4 class="m-label">Como se conecta</h4>
      <ul class="links conn">${d.links.map(({ m, l: [to, what] }) => connRow(m, to, what)).join("")}</ul>
    </div>
  </div>
</article>`;
}

// Capítulo compacto: a mesma informação funcional, em ritmo editorial.
function chapter(m, n) {
  const [main, ...more] = m.screens;
  return `<article class="chap" id="mod-${m.id}" aria-labelledby="chap-${m.id}-title">
  <div class="chap-meta">
    <p class="chap-n"><b>${pad(n)}</b>${esc(m.name)}</p>
    <h3 id="chap-${m.id}-title" class="display-3 chap-title">${esc(m.tagline)}</h3>
    <p class="chap-problem">${esc(m.problem)}</p>
    <p class="chap-serves">${esc(m.serves)} <span class="who">Para ${esc(m.who.charAt(0).toLowerCase() + m.who.slice(1))}</span></p>
    ${stateSummary(m.does)}
    <ol class="chap-flow" aria-label="Etapas no sistema">${m.flow.map((f, i) => `<li style="--i:${i}">${esc(f)}</li>`).join("")}</ol>
  </div>
  <div class="chap-body">
    <div class="chap-shot">${shot(main, { alt: main.caption, sizes: "(min-width: 1100px) 50vw, 100vw" })}
      ${
        more.length
          ? `<ul class="chap-more" aria-label="Mais telas de ${esc(m.name)}">${more
              .map((x) => {
                const im = images.get(imgKey(x));
                return `<li><a href="${im.file}" data-zoom data-w="${im.w}" data-h="${im.h}" data-caption="${esc(x.caption)}"><span>${esc(x.label)}</span>${picture(x, { alt: x.caption, sizes: "12vw" })}</a></li>`;
              })
              .join("")}</ul>`
          : ""
      }
    </div>
    <div class="chap-cols">
      <div class="m-part"><h4 class="m-label">O que você faz</h4><ul class="does">${m.does.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul></div>
      <div class="m-part"><h4 class="m-label">O que o sistema controla</h4><ul class="controls">${m.controls.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
      <div class="m-part"><h4 class="m-label">Como se conecta</h4><ul class="links conn">${m.links.map(([to, what]) => connRow(m, to, what)).join("")}</ul></div>
    </div>
  </div>
</article>`;
}

function scenario() {
  const S = C.SCENARIO;
  return `<section class="scenario paper act-light" id="cenario" aria-labelledby="scenario-title">
  <div class="wrap">${actHead(1)}</div>
  <div class="wrap scenario-grid">
    <div class="section-head scenario-head">
      <h2 id="scenario-title" class="display-2">${esc(S.title)}</h2>
      <p class="section-lead scenario-short">${esc(S.short)}</p>
    </div>
    <figure class="ledger">
      <span class="ledger-thread" aria-hidden="true"></span>
      <ol>
        ${S.records.map((r, i) => `<li style="--i:${i}"><span class="lg-area">${esc(r.area)}</span><span class="lg-record">${esc(r.record)}</span><code class="lg-code">${esc(r.code)}</code></li>`).join("")}
      </ol>
      <figcaption>Um registro típico de cada área, com os códigos que aparecem nas telas do EDUCA (dados fictícios). No EDUCA, todos ficam na mesma base.</figcaption>
    </figure>
  </div>
</section>`;
}

// Números da plataforma como escala: cada unidade é um ponto.
function numbersBand(values) {
  return `<dl class="numbers">
      ${C.PLATFORM.numbers
        .filter((n) => values.includes(n.value))
        .sort((a, b) => a.value - b.value)
        .map(
          (n) => `<div class="nb${n.value > 100 ? " nb-dense" : ""}">
        <dd class="units" aria-hidden="true">${"<i></i>".repeat(n.value)}</dd>
        <dt>${esc(n.label)}</dt>
        <dd class="num"><span data-count="${n.value}">${n.value.toLocaleString("pt-BR")}</span></dd>
        <dd class="num-note">${esc(n.note)}</dd>
      </div>`,
        )
        .join("")}
    </dl>`;
}

// Ato 05: Base → Acesso → Central, três planos do mesmo sistema. No desktop,
// a pilha fica fixa ao lado e o plano do nível em leitura sobe; abaixo de
// 1100 px, cada nível mostra a própria tela.
function levels() {
  const L = C.LEVELS;
  const P = C.PLATFORM;
  const A = C.ACCESS;
  const X = C.CENTRAL;
  const ids = ["nivel-base", "acesso", "central"];
  const extra = [
    "",
    `<p class="lv-text">${esc(A.body)}</p>
        <ol class="chain" aria-label="Como o acesso é montado, no exemplo real do manual">
          ${A.chain.map((c, i) => `<li style="--i:${i}"><span class="ch-label">${esc(c.label)}</span><span class="ch-value">${esc(c.value)}</span><span class="ch-note">${esc(c.note)}</span></li>`).join("")}
        </ol>
        <h4 class="m-label">Na Administração da Empresa</h4>
        <ul class="does">${A.admin.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
        <p class="note">Exemplo do manual: a usuária convidada entra sem papel, recebe o papel Comprador e passa a ver Suprimentos, mas continua sem acesso ao Financeiro.</p>
        <div class="module-screens lv-screens">${viewer("v-acesso", A.story, { label: "Do convite ao acesso, passo a passo" })}</div>`,
    `<p class="lv-text">${esc(X.body)}</p>
        <ul class="does">${X.points.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
        <div class="module-screens lv-screens">${viewer("v-central", X.screens, { label: "Telas da Administração Central" })}</div>`,
  ];
  return `<section class="levels paper act-light" id="niveis" aria-labelledby="levels-title">
  <div class="wrap">
    ${actHead(4)}
    <div class="section-head">
      <h2 id="levels-title" class="display-2">${esc(L.title)}</h2>
      <p class="section-lead">${esc(L.lead)}</p>
    </div>
    <div class="lv-grid">
      <div class="lv-stack" aria-hidden="true">
        <div class="lv-planes">
          ${L.levels
            .map((lv, i) => {
              const e = P.environments[lv.env];
              return `<div class="lv-plane${i === 0 ? " is-on" : ""}" data-lv="${i}"><span class="lv-plane-tag"><b>${pad(i + 1)}</b>${esc(lv.name)}<i>${esc(e.name)}</i></span>${picture(e, { alt: "", sizes: "34vw" })}</div>`;
            })
            .join("")}
        </div>
      </div>
      <ol class="lv-list">
        ${L.levels
          .map((lv, i) => {
            const e = P.environments[lv.env];
            return `<li class="lv" id="${ids[i]}" data-lv="${i}">
          <p class="lv-n"><b>${pad(i + 1)}</b>${esc(lv.name)}</p>
          <h3 class="display-3 lv-claim">${esc(lv.claim)}</h3>
          <p class="lv-env"><b>${esc(e.name)}</b> · ${esc(e.who)}</p>
          <p class="lv-what">${esc(e.what)}</p>
          ${numbersBand(lv.numbers)}
          <div class="lv-shot">${shot(e, { caption: false, sizes: "(min-width: 1100px) 1px, 100vw" })}</div>
          ${extra[i]}
        </li>`;
          })
          .join("")}
      </ol>
    </div>
  </div>
</section>`;
}

// Mapa de conexões: dois desenhos das mesmas ligações (1000×520 e 360×640).
function netSvg({ W, H, key, px, py, fs, nodeH, minW, charW, id }) {
  const N = C.NETWORK;
  const byId = Object.fromEntries(N.nodes.map((n) => [n.id, { ...n, X: n[px], Y: n[py] }]));
  const halfW = (n) => Math.max(minW, n.label.length * charW + 30) / 2;
  const hh = nodeH / 2;
  const border = (n, tx, ty, gap) => {
    const dx = tx - n.X;
    const dy = ty - n.Y;
    const k = Math.min(halfW(n) / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
    const len = Math.hypot(dx, dy) || 1;
    return [n.X + dx * k + (dx / len) * gap, n.Y + dy * k + (dy / len) * gap];
  };
  const edges = N.edges.map(([a, b, label, kind, e5], i) => {
    const p = byId[a];
    const q = byId[b];
    const dx = q.X - p.X;
    const dy = q.Y - p.Y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (e5 ?? (key === "m" ? (i % 2 ? 0.14 : -0.14) : 0.1)) * len;
    const cx = (p.X + q.X) / 2 - (dy / len) * bend;
    const cy = (p.Y + q.Y) / 2 + (dx / len) * bend;
    const [sx, sy] = border(p, cx, cy, 4);
    const [ex, ey] = border(q, cx, cy, 6);
    return { a, b, label, kind, i, d: `M${f1(sx)} ${f1(sy)} Q${f1(cx)} ${f1(cy)} ${f1(ex)} ${f1(ey)}` };
  });
  return {
    edges,
    svg: `<svg class="net-svg net-${key}" viewBox="0 0 ${W} ${H}" role="group" aria-labelledby="${id}-title">
    <title id="${id}-title">Mapa das ligações entre as áreas do EDUCA</title>
    <defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5 L8 5 L1 8.5" fill="none" stroke="#a9a29a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
    <g class="net-edges">
      ${edges
        .map(
          (e) => `<g class="edge edge-${e.kind}" data-edge="${e.i}" data-a="${e.a}" data-b="${e.b}">
        <path id="${id}-e${e.i}" class="edge-line" d="${e.d}" marker-end="url(#${id}-arrow)"/>
        <circle class="edge-sig" r="${key === "m" ? 2.6 : 3.4}" cx="-20" cy="-20"/>
      </g>`,
        )
        .join("")}
    </g>
    <g class="net-nodes">
      ${N.nodes
        .map((n0) => {
          const n = byId[n0.id];
          const w = halfW(n) * 2;
          return `<g class="node" data-node="${n.id}" transform="translate(${n.X} ${n.Y})" tabindex="0" role="button" aria-label="${esc(n.label)}: destacar ligações">
          <rect x="${f1(-w / 2)}" y="${-hh}" width="${f1(w)}" height="${nodeH}" rx="9"/>
          <rect class="node-bar" x="${f1(-w / 2 + 11)}" y="-2.5" width="9" height="5" rx="1.5"/>
          <text x="${f1(-w / 2 + 27)}" y="${(fs * 0.34).toFixed(1)}" style="font-size:${fs}px">${esc(n.label)}</text>
        </g>`;
        })
        .join("")}
    </g>
  </svg>`,
  };
}

function network() {
  const N = C.NETWORK;
  const byId = Object.fromEntries(N.nodes.map((n) => [n.id, n]));
  const desk = netSvg({ W: 1000, H: 520, key: "d", px: "x", py: "y", fs: 15, nodeH: 38, minW: 92, charW: 9.4, id: "netd" });
  const mob = netSvg({ W: 360, H: 640, key: "m", px: "mx", py: "my", fs: 12, nodeH: 30, minW: 70, charW: 6.6, id: "netm" });
  const edges = desk.edges;
  const tela = edges.filter((e) => e.kind === "tela").length;
  return `<section class="network stage act-dark" id="conexoes" aria-labelledby="net-title">
  <div class="wrap">
    ${actHead(5)}
    <div class="section-head">
      <h2 id="net-title" class="display-2">${esc(N.title)}</h2>
      <p class="section-lead">Cada ligação abaixo foi conferida no código. Linha contínua: acontece por uma ação na tela. Tracejada: existe no núcleo (API e regras no banco), ainda sem botão na interface.</p>
    </div>
  </div>
  <div class="net-scene">
    <div class="wrap net-grid">
      <div class="net-canvas">${desk.svg}${mob.svg}
        <p class="net-sum"><b>${edges.length}</b> ligações · <b>${tela}</b> na tela · <b>${edges.length - tela}</b> pela API</p>
      </div>
      <ol class="chapters">
        ${N.chapters
          .map(
            (c, ci) => `<li class="chapter${ci === 0 ? " is-active" : ""}" data-chapter="${ci}" data-edges="${c.edges.join(",")}">
          <p class="ch-n">${pad(ci + 1)} <span>/ ${pad(N.chapters.length)}</span></p>
          <h3 class="ch-title">${esc(c.title)}</h3>
          <p class="ch-text">${esc(c.text)}</p>
          <ul class="net-list">${c.edges
            .map((ei) => {
              const e = edges[ei];
              return `<li data-a="${e.a}" data-b="${e.b}"><span class="nl-path"><b>${esc(byId[e.a].label)}</b><span aria-hidden="true">→</span><b>${esc(byId[e.b].label)}</b></span><span class="nl-what">${esc(e.label)}</span>${chip(e.kind)}</li>`;
            })
            .join("")}</ul>
        </li>`,
          )
          .join("")}
      </ol>
    </div>
  </div>
</section>`;
}

// Final: as áreas separadas convergem para uma marca só (desktop: da
// esquerda para a direita; celular: de cima para baixo).
function converge(labels) {
  const markSvg = (cx, cy, size) => {
    const u = size / 24;
    const x = cx - size / 2;
    const y = cy - size / 2;
    return `<g class="cv-mark"><rect x="${f1(x + u)}" y="${f1(y + u)}" width="${f1(22 * u)}" height="${f1(22 * u)}" rx="${f1(5 * u)}" class="cv-mark-bg"/><rect x="${f1(x + 7 * u)}" y="${f1(y + 6.5 * u)}" width="${f1(11 * u)}" height="${f1(2.5 * u)}" rx="${f1(u)}" class="cv-mark-bar"/><rect x="${f1(x + 7 * u)}" y="${f1(y + 10.75 * u)}" width="${f1(8 * u)}" height="${f1(2.5 * u)}" rx="${f1(u)}" class="cv-mark-fire"/><rect x="${f1(x + 7 * u)}" y="${f1(y + 15 * u)}" width="${f1(11 * u)}" height="${f1(2.5 * u)}" rx="${f1(u)}" class="cv-mark-bar"/></g>`;
  };
  const pill = (x, y, w, h, label, i) =>
    `<g class="cv-silo" data-silo="${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/><text x="${x + w / 2}" y="${f1(y + h / 2 + 4)}" text-anchor="middle">${esc(label.toUpperCase())}</text></g>`;
  // desktop 1000 × 380
  const dPaths = labels.map((_, i) => {
    const y = 28 + i * 62 + 22;
    return `M200 ${y} C 430 ${y}, 560 190, 690 190`;
  });
  const desk = `<svg class="cv cv-d" viewBox="0 0 1000 380" aria-hidden="true" focusable="false">
    ${dPaths.map((d, i) => `<path id="cvd${i}" class="cv-path" d="${d}"/><circle class="cv-sig" r="3.4" cx="-20" cy="-20"><animateMotion dur="${(2.4 + i * 0.22).toFixed(2)}s" repeatCount="indefinite" begin="indefinite"><mpath href="#cvd${i}"/></animateMotion></circle>`).join("")}
    ${labels.map((l, i) => pill(0, 28 + i * 62, 200, 44, l, i)).join("")}
    ${markSvg(745, 190, 110)}
    <text class="cv-word" x="815" y="206">EDUCA</text>
  </svg>`;
  // celular 360 × 470
  const cols = [15, 195];
  const mPill = labels.map((_, i) => ({ x: cols[i % 2], y: 8 + Math.floor(i / 2) * 50 }));
  const mPaths = mPill.map(({ x, y }) => `M${x + 75} ${y + 36} C ${x + 75} ${y + 150}, 180 ${f1(210)}, 180 285`);
  const mob = `<svg class="cv cv-m" viewBox="0 0 360 470" aria-hidden="true" focusable="false">
    ${mPaths.map((d, i) => `<path id="cvm${i}" class="cv-path" d="${d}"/><circle class="cv-sig" r="3" cx="-20" cy="-20"><animateMotion dur="${(2.2 + i * 0.2).toFixed(2)}s" repeatCount="indefinite" begin="indefinite"><mpath href="#cvm${i}"/></animateMotion></circle>`).join("")}
    ${labels.map((l, i) => pill(mPill[i].x, mPill[i].y, 150, 36, l, i)).join("")}
    ${markSvg(180, 335, 100)}
    <text class="cv-word" x="180" y="440" text-anchor="middle">EDUCA</text>
  </svg>`;
  return `<div class="converge"><span class="thread-end" aria-hidden="true"></span>${desk}${mob}</div>`;
}

function closing(sizes, { preview = false } = {}) {
  const K = C.CLOSING;
  return `<section class="closing stage act-dark" id="comecar" aria-labelledby="closing-title">
  <div class="wrap closing-in">
    ${actHead(6)}
    <h2 id="closing-title" class="display-2 closing-q">${esc(K.title)}</h2>
    ${converge(K.silos)}
    <p class="closing-a">${esc(K.answer)}</p>
    <p class="section-lead">${esc(K.body)}</p>
    <div class="actions">
      ${K.actions
        .map((a) => {
          const size = sizes[a.href];
          if (preview && a.href.endsWith(".pdf"))
            // A prévia não publica os PDFs (tamanho): indica onde eles estão.
            return `<span class="btn btn-ghost is-static">${esc(a.label)}<small class="btn-meta">${size} · docs/manual/pdf</small></span>`;
          return `<a class="btn ${a.primary ? "btn-fire btn-lg" : "btn-ghost"}" href="${esc(a.href)}"${a.href.endsWith(".pdf") ? " download" : ""}>${esc(a.label)}${size ? `<small class="btn-meta">${size}</small>` : ""}<span aria-hidden="true">${a.href.endsWith(".pdf") ? "↓" : "→"}</span></a>`;
        })
        .join("")}
    </div>
    <p class="closing-note">O acesso ao EDUCA é por convite do administrador da sua empresa.</p>
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

// Ordem das cenas do Ato 04: protagonistas (com o módulo de cada um), depois
// os capítulos. O índice segue a mesma numeração.
function sceneOrder() {
  const proMods = C.PROTAGONISTS.map((pr) => pr.parts[0].module);
  const rest = C.MODULES.filter((m) => !C.PROTAGONISTS.some((pr) => pr.parts.some((pt) => pt.module === m.id)));
  return [...proMods.map((id) => moduleById[id]), ...rest];
}

function areaIndex() {
  const tiles = sceneOrder().map(
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
  return `<div class="base-block">
    <div class="module-top" id="base">
      <div class="module-intro">
        <p class="kicker"><span>${esc(B.kicker)}</span></p>
        <h3 id="base-title" class="display-3">${esc(B.title)}</h3>
        <p class="lead-p">${esc(B.body)}</p>
        <ul class="does">${B.items.map(([t, st]) => `<li class="does-${st}"><span>${esc(t)}</span>${chip(st)}</li>`).join("")}</ul>
      </div>
      <div class="module-screens">${viewer("v-cadastros", B.screens, { label: "Telas de Cadastros" })}</div>
    </div>
    <div class="evolving" id="evolucao" aria-labelledby="evo-title">
      <div class="section-head">
        <p class="kicker"><span>${esc(E.kicker)}</span></p>
        <h3 id="evo-title" class="display-3">${esc(E.title)}</h3>
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
  </div>`;
}

function areas(list) {
  return `<section class="areas paper act-light" id="areas" aria-labelledby="areas-title">
  <div class="wrap">
    ${actHead(3)}
    <div class="section-head">
      <h2 id="areas-title" class="display-2">O que cada área faz, e com quem ela fala.</h2>
      <p class="section-lead">Para cada área: o problema que ela resolve, o que dá para fazer hoje, como o trabalho anda, que informação ela guarda e para onde essa informação vai.</p>
    </div>
    ${legend()}
    ${areaIndex()}
    <div class="pros">${C.PROTAGONISTS.map((pr, i) => protagonist(pr, i)).join("\n")}</div>
    <div class="chaps">
      <div class="chaps-head">
        <p class="m-label">E as outras áreas</p>
        <h3 class="display-3">Cada uma com o seu trabalho, na mesma base.</h3>
      </div>
      ${list
        .filter((m) => !C.PROTAGONISTS.some((pr) => pr.parts.some((pt) => pt.module === m.id)))
        .map((m, i) => chapter(m, C.PROTAGONISTS.length + i + 1))
        .join("\n")}
      ${base()}
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

// Arquivos do site no index.html servido em "/": img/…, fonts/…, vendor/…,
// manuais/…, styles.css, main.js e motion.js ganham o prefixo BASE. Âncoras
// (#…), /login e data: não mudam. A prévia (--preview) continua relativa.
const SITE_FILE = /^(?:(?:img|fonts|vendor|manuais)\/|(?:styles\.css|main\.js|motion\.js)$)/;
function atBase(html) {
  return html.replace(/(\s(src|href|srcset|imagesrcset)=")([^"]*)"/g, (_, pre, attr, value) => {
    const fix = (url) => (SITE_FILE.test(url) ? BASE + url : url);
    const out = attr.endsWith("srcset") ? value.split(", ").map((c) => c.replace(/^\S+/, fix)).join(", ") : fix(value);
    return `${pre}${out}"`;
  });
}

// Links do Supabase Auth que caem no Site URL ("/") trazem a sessão no
// fragmento (#access_token=…, #error_code=…). Antes da landing, "/" levava a
// /login, que trata o fragmento (src/lib/onboarding/auth-hash.ts); o
// encaminhamento mantém esse caminho. Âncoras da página não casam.
const AUTH_HASH_FORWARD = `<script>(function(){var h=location.hash;if(/^#(?:.*&)?(?:access_token|error|error_code|error_description)=/.test(h))location.replace("/login"+h)})();</script>`;

// Antes da abertura: marca o documento para a sequência de entrada (evita o
// quadro final piscar antes da animação). Sem GSAP em 3 s, a página aparece.
const INTRO_GUARD = `<script>(function(){var d=document.documentElement;d.classList.add("js");if(!window.matchMedia||!matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("intro");setTimeout(function(){d.classList.remove("intro")},3000)}})();</script>`;

const SCRIPTS = ["vendor/gsap.min.js", "vendor/ScrollTrigger.min.js", "main.js", "motion.js"];

function body(sections) {
  return `${INTRO_GUARD}
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
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

// A imagem principal da abertura (LCP) é pré-carregada conforme a largura:
// o pedido inteiro no desktop, o recorte do pedido abaixo de 1100 px.
function heroPreload() {
  const big = images.get(imgKey(C.HERO.stage));
  const small = images.get(imgKey(C.HERO.order));
  return [
    big.small
      ? `<link rel="preload" as="image" imagesrcset="${big.small.file} ${big.small.w}w, ${big.file} ${big.w}w" imagesizes="${HX_STAGE_SIZES}" media="(min-width: 1100px)" fetchpriority="high">`
      : `<link rel="preload" as="image" href="${big.file}" media="(min-width: 1100px)" fetchpriority="high">`,
    small.small
      ? `<link rel="preload" as="image" imagesrcset="${small.small.file} ${small.small.w}w, ${small.file} ${small.w}w" imagesizes="100vw" media="(max-width: 1099px)" fetchpriority="high">`
      : `<link rel="preload" as="image" href="${small.file}" media="(max-width: 1099px)" fetchpriority="high">`,
  ].join("\n");
}

function sectionsList(sizes, opts) {
  return [hero(), scenario(), journey(), areas(C.MODULES), levels(), network(), closing(sizes, opts)];
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
  await writeFile(path.join(OUT, "styles.css"), FONT_FACES + css);
  for (const f of ["main.js", "motion.js"]) await copyFile(path.join(SRC, f), path.join(OUT, f));
  // GSAP (licença padrão sem custo, gsap.com/standard-license): copiado do
  // node_modules para o site não depender de CDN.
  await mkdir(path.join(OUT, "vendor"), { recursive: true });
  for (const f of ["gsap.min.js", "ScrollTrigger.min.js"])
    await copyFile(path.join(ROOT, "node_modules/gsap/dist", f), path.join(OUT, "vendor", f));

  const html = body(sectionsList(sizes));
  const head = `<meta charset="utf-8">
${AUTH_HASH_FORWARD}
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(C.META.title)} · Uma operação inteira, conectada</title>
<meta name="description" content="${esc(C.META.description)}">
<link rel="canonical" href="${esc(C.META.siteUrl)}">
<meta name="color-scheme" content="light dark">
<meta property="og:title" content="${esc(C.META.title)}">
<meta property="og:description" content="${esc(C.META.description)}">
<meta property="og:url" content="${esc(C.META.siteUrl)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(mark(24).replace('class="mark"', 'xmlns="http://www.w3.org/2000/svg"').replace(/class="mark-bar"/g, 'fill="#f5f6f6"').replace('class="mark-fire"', 'fill="#ff9408"').replace('fill="currentColor"', 'fill="#100c08"'))}">
${heroPreload()}
<link rel="preload" href="fonts/instrument-serif-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/instrument-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css">`;
  await writeFile(
    path.join(OUT, "index.html"),
    atBase(`<!doctype html>\n<html lang="pt-BR">\n<head>\n${head}\n</head>\n<body>\n${html}\n${SCRIPTS.map((f) => `<script src="${f}" defer></script>`).join("\n")}\n</body>\n</html>\n`),
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
${SCRIPTS.slice(0, 2).map((f) => `<script src="${f}"></script>`).join("\n")}
<script>${await readFile(path.join(SRC, "main.js"), "utf8")}</script>
<script>${await readFile(path.join(SRC, "motion.js"), "utf8")}</script>
`;
    await writeFile(previewAt, preview);
  }

  const total = [...images.values()].length;
  console.log(`public/landing gerado: ${screens.length} referências de tela, ${total} imagens.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
