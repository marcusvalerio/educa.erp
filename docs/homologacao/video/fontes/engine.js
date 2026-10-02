// ATLAS.ERP — product tour: motor de composição determinístico.
// Cada quadro é uma função pura do tempo t (segundos): seek(t) monta as
// cenas ativas, aplica câmera/transições e devolve quando as imagens estão
// decodificadas. O render.mjs captura quadro a quadro (30 fps).
"use strict";
const W = 1920, H = 1080;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  lin: (p) => p,
  io: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  io5: (p) => (p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2),
  o: (p) => 1 - Math.pow(1 - p, 3),
  o5: (p) => 1 - Math.pow(1 - p, 5),
  i: (p) => p * p * p,
  back: (p) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
};
const P = (t, a, b, e = E.io) => e(clamp((t - a) / (b - a)));
// 0 antes de a, sobe em fi, mantém, desce em fo até b
const win01 = (t, a, b, fi = 0.5, fo = 0.5, e = E.io) => Math.min(P(t, a, a + fi, e), 1 - P(t, b - fo, b, e));
function kf(keys, t, e = E.io) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b[0]) { const p = e(clamp((t - a[0]) / (b[0] - a[0]))); return a.slice(1).map((v, j) => (typeof v === "number" ? lerp(v, b[j + 1], p) : v)); }
  }
  return keys[keys.length - 1].slice(1);
}
function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const st = (e, o) => { for (const k in o) e.style[k] = o[k]; return e; };
const px = (v) => `${v.toFixed(2)}px`;

// --------------------------------------------------------------- marca
const NUCLEO_RECTS = [[3, 3, 16, 8], [21, 3, 8, 16], [13, 21, 16, 8], [3, 13, 8, 16]];
function nucleoSVG(size, { fg = "#f3f4f5", core = "#ff9408", id = "" } = {}) {
  const r = NUCLEO_RECTS.map((q, i) => `<rect class="nb nb${i}" x="${q[0]}" y="${q[1]}" width="${q[2]}" height="${q[3]}" rx="1.4" fill="${fg}" style="transform-box:fill-box;transform-origin:50% 50%"/>`).join("");
  return `<svg ${id ? `id="${id}"` : ""} width="${size}" height="${size}" viewBox="0 0 32 32">${r}<rect class="nc" x="13" y="13" width="6" height="6" rx="1.4" fill="${core}" style="transform-box:fill-box;transform-origin:50% 50%"/></svg>`;
}
const WORDMARK = `<b>ATLAS</b><i>.ERP</i>`;

// --------------------------------------------------------------- registro
const SHOT_EXT = "webp";   // capturas versionadas em WebP sem perdas
let DRY = false;           // true: só coleta deixas de áudio (sem decodificar)
let CUR = null;            // cena em construção
const SCENES = [];
function scene(name, dur, opt, build) { SCENES.push({ name, dur, ov: opt.ov ?? 0.9, inT: opt.in ?? "zoom", outT: opt.out ?? "zoom", inO: opt.inO ?? {}, outO: opt.outO ?? {}, hud: opt.hud ?? true, chapter: opt.chapter ?? "", flow: opt.flow ?? false, build }); }
let CUE_SHIFT = 0;
function cue(t, type, o = {}) { CUR.cues.push({ t: t + CUE_SHIFT, type, ...o }); }
// desloca no tempo um bloco de componentes (e suas deixas de áudio)
function shifted(dt, add, fn) {
  const prev = CUE_SHIFT;
  CUE_SHIFT += dt;
  try { return fn((c) => (add({ draw: (t) => c.draw(t - dt) }), c)); } finally { CUE_SHIFT = prev; }
}
function img(name, parent, cls = "layer") {
  const i = el("img", cls, parent);
  i.src = `shots/${name}.${SHOT_EXT}`;
  if (!DRY) CUR.loads.push(i.decode().catch(() => {}));
  return i;
}
function layoutTimes() {
  let s = 0;
  SCENES.forEach((sc, i) => { sc.start = s; sc.end = s + sc.dur; s = sc.end - (i < SCENES.length - 1 ? sc.ov : 0); });
  return SCENES[SCENES.length - 1].end;
}

// --------------------------------------------------------------- layouts da janela  [x, y, w, rotY, rotX]
const L = {
  FULL: [120, 67.5, 1680, 0, 0],
  SPLIT: [650, 215, 1150, -5, 1.5],
  STRIP: [250, 205, 1420, 0, 0],
  LOW: [300, 250, 1320, 0, 0],
};
// chave de layout completa: [t, x, y, w, rotY, rotX, escala, opacidade]
const ly = (t, l, sc = 1, op = 1) => [t, ...l, sc, op];

// --------------------------------------------------------------- janela com captura real
class Win {
  constructor(parent, o) {
    this.o = o;
    this.glow = el("div", "winglow", parent);
    this.root = el("div", "win", parent);
    this.cam = el("div", "cam", this.root);
    this.ov = el("div", "ov", this.root);
    this.layout = o.layout ?? [[0, ...L.FULL]];
    this.camk = o.cam ?? [[0, 800, 450, 1]];
    this.shots = o.shots;               // [[t, nome, modo='fade', dur=.45, som?]]
    this.spots = (o.spots ?? []).map((s) => ({ ...s, e: el("div", "spot", this.ov) }));
    this.spots.forEach((s) => { if (s.tag) el("div", "tag", s.e, s.tag); if (s.cue !== false) cue(s.t0 + 0.05, "focus"); });
    this.clicks = (o.clicks ?? []).map((c) => ({ ...c, cur: el("div", "cursor", this.ov, CURSOR), rip: el("div", "ripple", this.ov) }));
    this.clicks.forEach((c) => cue(c.t, "click"));
    this.layers = {};
    this.shots.forEach((s, i) => {
      if (!this.layers[s[1]]) this.layers[s[1]] = img(s[1], this.cam);
      if (i > 0 && s[4] !== false) cue(s[0], s[4] || (s[2] === "slide" ? "swipe" : "swap"));
    });
    this.drift = o.drift ?? 1;
  }
  geom(t) {
    const [x, y, w, ry = 0, rx = 0, sc = 1, op = 1] = kf(this.layout, t, E.io5);
    return { x, y, w, h: (w * 9) / 16, ry, rx, sc, op };
  }
  proj(px_, py_) { return [this.tx + this.S * px_, this.ty + this.S * py_]; }
  camAt(t) {
    const g = this.geom(t);
    let [cx, cy, z] = kf(this.camk, t, E.io);
    const d = this.drift * (this.o.env ? this.o.env(t) : 1);
    z *= 1 + d * 0.006 * Math.sin(t * 0.55 + 1.3);
    cx += d * 5 * Math.sin(t * 0.31); cy += d * 3.5 * Math.cos(t * 0.27);
    const S = (g.w / 1600) * Math.max(1, z);
    const tx = clamp(g.w / 2 - S * cx, g.w - S * 1600, 0), ty = clamp(g.h / 2 - S * cy, g.h - S * 900, 0);
    return { g, S, tx, ty };
  }
  // posição na tela (palco) de um ponto da captura no instante t
  at(t, x, y) { const { g, S, tx, ty } = this.camAt(t); return [g.x + tx + S * x, g.y + ty + S * y]; }
  draw(t) {
    const { g, S, tx, ty } = this.camAt(t);
    this.g = g;
    st(this.root, { left: px(g.x), top: px(g.y), width: px(g.w), height: px(g.h), opacity: g.op, display: g.op > 0.001 ? "block" : "none", transform: `perspective(2400px) rotateY(${g.ry}deg) rotateX(${g.rx}deg) scale(${g.sc})` });
    st(this.glow, { left: px(g.x + g.w * 0.1), top: px(g.y + g.h * 0.55), width: px(g.w * 0.8), height: px(g.h * 0.6), opacity: 0.8 * g.op });
    this.S = S; this.tx = tx; this.ty = ty;
    st(this.cam, { transform: `translate(${px(tx)},${px(ty)}) scale(${S.toFixed(5)})` });
    // camadas (troca de tela)
    let ai = 0;
    for (let i = 0; i < this.shots.length; i++) if (t >= this.shots[i][0]) ai = i;
    const cur = this.shots[ai], prev = ai > 0 ? this.shots[ai - 1] : null;
    const mode = cur[2] ?? "fade", dur = cur[3] ?? 0.45;
    const p = ai > 0 ? P(t, cur[0], cur[0] + dur, E.io) : 1;
    for (const k in this.layers) st(this.layers[k], { display: "none", zIndex: 0 });
    const L1 = this.layers[cur[1]];
    if (prev && p < 1 && prev[1] !== cur[1]) {
      const L0 = this.layers[prev[1]];
      if (mode === "slide") {
        st(L0, { display: "block", zIndex: 1, opacity: 1 - p, transform: `translateX(${-12 * p}%)`, filter: `blur(${(4 * p).toFixed(2)}px)` });
        st(L1, { display: "block", zIndex: 2, opacity: p, transform: `translateX(${12 * (1 - p)}%)`, filter: `blur(${(4 * (1 - p)).toFixed(2)}px)` });
      } else {
        st(L0, { display: "block", zIndex: 1, opacity: 1, transform: "none", filter: "none" });
        st(L1, { display: "block", zIndex: 2, opacity: p, transform: "none", filter: "none" });
      }
    } else st(L1, { display: "block", zIndex: 2, opacity: 1, transform: "none", filter: "none" });
    // destaques
    for (const s of this.spots) {
      const a = win01(t, s.t0, s.t1, 0.45, 0.4);
      if (a <= 0.001) { s.e.style.display = "none"; continue; }
      const [x0, y0] = this.proj(s.x, s.y), [x1, y1] = this.proj(s.x + s.w, s.y + s.h);
      const pad = 6 + 16 * (1 - P(t, s.t0, s.t0 + 0.55, E.o));
      st(s.e, { display: "block", left: px(x0 - pad), top: px(y0 - pad), width: px(x1 - x0 + 2 * pad), height: px(y1 - y0 + 2 * pad), opacity: a, "--dim": (0.38 * (s.dim ?? 1)).toFixed(3) });
      s.e.style.setProperty("--dim", ((s.dim ?? 1) * 0.38).toFixed(3));
    }
    // cursor só perto do clique
    for (const c of this.clicks) {
      const a = Math.min(P(t, c.t - 1.15, c.t - 0.85), 1 - P(t, c.t + 0.35, c.t + 0.75));
      if (a <= 0.001) { c.cur.style.display = "none"; c.rip.style.display = "none"; continue; }
      const m = P(t, c.t - 1.15, c.t - 0.12, E.io);
      const fx = c.from ?? [c.x + 160, c.y + 120];
      const [ax, ay] = this.proj(lerp(fx[0], c.x, m), lerp(fx[1], c.y, m));
      const press = 1 - 0.14 * Math.max(0, 1 - Math.abs(t - c.t) / 0.09);
      st(c.cur, { display: "block", left: px(ax), top: px(ay), opacity: a, transform: `scale(${press})` });
      const rp = clamp((t - c.t) / 0.55);
      if (t >= c.t && rp < 1) {
        const [rx_, ry_] = this.proj(c.x, c.y), r = 6 + 40 * E.o(rp);
        st(c.rip, { display: "block", left: px(rx_ - r), top: px(ry_ - r), width: px(2 * r), height: px(2 * r), opacity: 1 - rp });
      } else c.rip.style.display = "none";
    }
  }
}
const CURSOR = `<svg width="30" height="30" viewBox="0 0 28 28"><path d="M5 2.5 L5 22.5 L10.2 17.6 L13.7 25.4 L17.2 23.9 L13.8 16.3 L21 16 Z" fill="#111" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

// --------------------------------------------------------------- textos
function reveal(e, t, t0, t1, { dy = 26, blur = 10, fi = 0.75, fo = 0.5 } = {}) {
  const a = P(t, t0, t0 + fi, E.o), b = t1 == null ? 0 : P(t, t1 - fo, t1, E.io);
  const op = a * (1 - b);
  if (op <= 0.001) { e.style.opacity = 0; e.style.visibility = "hidden"; return; }
  st(e, { visibility: "visible", opacity: op, transform: `translateY(${px(dy * (1 - a) - 14 * b)})`, filter: `blur(${(blur * (1 - a) + 6 * b).toFixed(2)}px)` });
}
// legenda lateral (layout SPLIT): {x,y,w,t0,t1,kick,title,sub}
class Cap {
  constructor(parent, o) {
    this.o = o;
    this.e = st(el("div", "cap", parent), { left: px(o.x ?? 120), top: px(o.y ?? 330), width: px(o.w ?? 470) });
    this.k = el("div", "kick line", this.e, o.kick);
    this.t = el("div", "ttl line", this.e, o.title);
    if (o.size) this.t.style.fontSize = px(o.size);
    this.s = o.sub ? el("div", "sub line", this.e, o.sub) : null;
    cue(o.t0, "text");
  }
  draw(t) {
    const o = this.o;
    reveal(this.k, t, o.t0, o.t1);
    reveal(this.t, t, o.t0 + 0.15, o.t1 && o.t1 + 0.05);
    if (this.s) reveal(this.s, t, o.t0 + 0.4, o.t1 && o.t1 + 0.1);
  }
}
// rótulo de vidro sobre a tela: items [[t0,t1,kick,text]]
class Chip {
  constructor(parent, o) {
    this.o = o;
    this.items = o.items.map((it) => {
      const e = st(el("div", "chip", parent), o.pos ?? { left: "156px", bottom: "100px" });
      el("div", "k", e, it[2]); el("div", "t", e, it[3]);
      return { it, e };
    });
  }
  draw(t) { for (const { it, e } of this.items) reveal(e, t, it[0], it[1], { dy: 18, blur: 8, fi: 0.6, fo: 0.45 }); }
}
class Note {
  constructor(parent, o) { this.o = o; this.e = st(el("div", "note", parent, o.text), o.pos ?? { right: "156px", bottom: "100px" }); }
  draw(t) { reveal(this.e, t, this.o.t0, this.o.t1, { dy: 14, blur: 6 }); }
}
// frase centralizada: lines [[t0, html, {size, y, italic, color}]] , t1 = saída
class Stmt {
  constructor(parent, o) {
    this.o = o;
    this.e = st(el("div", "stmt", parent), { top: px(o.y ?? 470) });
    this.lines = o.lines.map((l) => {
      const e = st(el("div", "line", this.e, l[1]), { fontSize: px(l[2]?.size ?? o.size ?? 72), color: l[2]?.color ?? "", fontStyle: l[2]?.italic ? "italic" : "normal", marginTop: px(l[2]?.gap ?? 6) });
      if (l[2]?.sans) st(e, { fontFamily: "ISans", fontWeight: 600, letterSpacing: ".02em" });
      if (l[2]?.cue !== false) cue(l[0], "text");
      return { l, e };
    });
  }
  draw(t) { for (const { l, e } of this.lines) reveal(e, t, l[0], l[2]?.t1 ?? this.o.t1, { dy: 30, blur: 14, fi: 0.9, fo: 0.6 }); }
}
// usuário em ação (troca de perfil)
class Who {
  constructor(parent, o) {
    this.o = o;
    this.e = st(el("div", "who", parent, `<div class="av">${o.ini}</div><div><div class="n">${o.name}</div><div class="r">${o.role}</div></div>`), o.pos ?? { right: "156px", top: "100px" });
    cue(o.t0, "user");
  }
  draw(t) { reveal(this.e, t, this.o.t0, this.o.t1, { dy: -14, blur: 6, fi: 0.5, fo: 0.4 }); }
}
// véu escuro sobre a cena (para frases sobre tela)
class Veil {
  constructor(parent, o) { this.o = o; this.e = st(el("div", "abs", parent), { width: "1920px", height: "1080px", background: "rgba(10,8,6,.78)", backdropFilter: "blur(8px)" }); }
  draw(t) { const a = win01(t, this.o.t0, this.o.t1, this.o.fi ?? 0.7, this.o.fo ?? 0.6); st(this.e, { opacity: a, display: a > 0.001 ? "block" : "none" }); }
}

// --------------------------------------------------------------- pipeline (fluxo de etapas)
// nodes: [{label, sub, dash}] ; lit: [t por nó] ; pose: [[t, cx, cy, escala]] ; token: {label, states:[...]} opcional
class Pipe {
  constructor(parent, o) {
    this.o = o;
    this.e = el("div", "pipe", parent);
    const n = o.nodes.length, span = o.span ?? 1400;
    this.xs = o.nodes.map((_, i) => (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)));
    this.links = [];
    for (let i = 0; i < n - 1; i++) {
      const l = el("div", "plink" + (o.nodes[i + 1].dash ? " dash" : ""), this.e);
      const b = el("b", "", l);
      const d = el("div", "pdot", this.e);
      this.links.push({ l, b, d });
    }
    this.nodes = o.nodes.map((nd) => {
      const e = el("div", "pnode" + (nd.dash ? " dash" : ""), this.e, `<i></i>${nd.label}${nd.sub ? `<small>${nd.sub}</small>` : ""}`);
      return { nd, e };
    });
    this.widths = null;
    if (o.token) { this.tok = el("div", "token", this.e, `<div class="a">${o.token.label}</div><div class="b"></div>`); this.tokB = this.tok.querySelector(".b"); }
    o.lit.forEach((tl, i) => tl != null && cue(tl, "step", { i }));
  }
  draw(t) {
    const o = this.o;
    const [cx, cy, sc, op = 1] = kf(o.pose, t, E.io5);
    st(this.e, { transform: `translate(${px(cx)},${px(cy)}) scale(${sc})`, opacity: op, display: op > 0.001 ? "block" : "none" });
    if (op <= 0.001) return;
    if (!this.widths) this.widths = this.nodes.map(({ e }) => e.offsetWidth);
    this.nodes.forEach(({ nd, e }, i) => {
      const lt = o.lit[i];
      const on = lt != null && t >= lt;
      e.classList.toggle("lit", on);
      const pop = lt != null ? Math.max(0, 1 - Math.abs(t - lt) / 0.35) : 0;
      const a = o.appear ? P(t, o.appear + i * 0.12, o.appear + i * 0.12 + 0.6, E.o) : 1;
      st(e, { left: px(this.xs[i]), top: "0px", opacity: a, transform: `translate(-50%,-50%) scale(${1 + 0.06 * pop})` });
    });
    this.links.forEach(({ l, b, d }, i) => {
      const x0 = this.xs[i] + this.widths[i] / 2 + 10, x1 = this.xs[i + 1] - this.widths[i + 1] / 2 - 10;
      const a = o.appear ? P(t, o.appear + i * 0.12 + 0.2, o.appear + i * 0.12 + 0.8, E.o) : 1;
      st(l, { left: px(x0), top: "0px", width: px(Math.max(0, x1 - x0)), opacity: a });
      const t0 = o.lit[i], t1 = o.lit[i + 1];
      let f = 0;
      if (t0 != null && t1 != null) f = P(t, Math.max(t0, t1 - (o.travel ?? 0.8)), t1, E.io);
      b.style.width = `${(f * 100).toFixed(2)}%`;
      if (f > 0 && f < 1) st(d, { display: "block", left: px(lerp(x0, x1, f)), top: "0px" });
      else d.style.display = "none";
    });
    if (this.tok) {
      // token acompanha o último nó aceso
      let k = -1;
      o.lit.forEach((tl, i) => { if (tl != null && t >= tl - (o.travel ?? 0.8)) k = i; });
      const tl = o.lit[Math.max(0, k)];
      const from = Math.max(0, k - 1);
      const m = k <= 0 ? 1 : P(t, tl - (o.travel ?? 0.8), tl, E.io);
      const x = lerp(this.xs[from], this.xs[Math.max(0, k)], m);
      const a = k < 0 ? 0 : P(t, o.lit[0] - 0.4, o.lit[0] + 0.2) * (o.tokenOut ? 1 - P(t, o.tokenOut, o.tokenOut + 0.5) : 1);
      st(this.tok, { left: px(x), top: px(o.token.dy ?? 52), opacity: a });
      this.tokB.textContent = o.token.states[Math.max(0, k)] ?? "";
    }
  }
}

// --------------------------------------------------------------- recorte de captura (miniaturas)
// r = [x,y,w,h] em coordenadas da captura (1600x900); ow = largura na tela
function crop(parent, name, r, ow) {
  const s = ow / r[2], oh = r[3] * s;
  const e = st(el("div", "th", parent), { width: px(ow), height: px(oh), backgroundImage: `url(shots/${name}.${SHOT_EXT})`, backgroundSize: `${px(1600 * s)} ${px(900 * s)}`, backgroundPosition: `${px(-r[0] * s)} ${px(-r[1] * s)}` });
  if (!DRY) { const im = new Image(); im.src = `shots/${name}.${SHOT_EXT}`; CUR.loads.push(im.decode().catch(() => {})); }
  return e;
}

// --------------------------------------------------------------- transições entre cenas
function applyTrans(root, sc, lt, ovIn, ovOut) {
  let s = 1, tx = 0, blur = 0, op = 1, ox = 960, oy = 540;
  const pin = ovIn > 0 ? clamp(lt / ovIn) : 1;
  const pout = ovOut > 0 ? clamp((lt - (sc.dur - ovOut)) / ovOut) : 0;
  const tin = sc.inT, tout = sc.outT;
  if (pin < 1) {
    const p = pin;
    if (tin === "fade") op *= E.io(p);
    else if (tin === "zoom") { s *= 1.05 - 0.05 * E.o(p); blur += 12 * (1 - E.o(p)); op *= E.o(p); }
    else if (tin === "through") { s *= 1 + 0.32 * (1 - E.o5(p)); blur += 16 * (1 - E.o(p)); op *= E.o(clamp(p * 1.4)); ox = sc.inO.x ?? 960; oy = sc.inO.y ?? 540; }
    else if (tin === "slide") { tx += 620 * (1 - E.io5(p)); blur += 8 * (1 - p); op *= E.o(p); }
    else if (tin === "rise") { tx += 0; s *= 0.94 + 0.06 * E.o(p); blur += 10 * (1 - p); op *= E.o(p); }
  }
  if (pout > 0) {
    const p = pout;
    if (tout === "fade") op *= 1 - E.io(p);
    else if (tout === "zoom") { s *= 1 - 0.06 * E.io(p); blur += 12 * E.i(p); op *= 1 - E.io(p); }
    else if (tout === "through") { s *= 1 + 2.4 * E.i(p); blur += 18 * E.i(p); op *= 1 - E.io(clamp((p - 0.3) / 0.7)); const o = sc.outPt ? sc.outPt() : [sc.outO.x ?? 960, sc.outO.y ?? 540]; ox = o[0]; oy = o[1]; }
    else if (tout === "slide") { tx -= 620 * E.io5(p); blur += 8 * p; op *= 1 - E.io(p); }
  }
  st(root, { transformOrigin: `${ox}px ${oy}px`, transform: `translateX(${px(tx)}) scale(${s.toFixed(5)})`, filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none", opacity: op });
  return op;
}

// --------------------------------------------------------------- linha de fluxo (assinatura das transições)
const fx = {};
function drawFlow(t) {
  if (!fx.line) {
    const host = document.getElementById("fx");
    fx.line = st(el("div", "abs", host), { height: "2px", background: "linear-gradient(90deg,transparent,rgba(255,148,8,.0) 10%,#ff9408 80%,#ffe0b0)", boxShadow: "0 0 18px 4px rgba(255,148,8,.45)", display: "none" });
  }
  let shown = false;
  SCENES.forEach((sc, i) => {
    if (!sc.flow || i === SCENES.length - 1) return;
    const a = sc.end - sc.ov - 0.35, b = sc.end + 0.25;
    if (t < a || t > b) return;
    const p = (t - a) / (b - a), head = lerp(-300, 2220, E.io(p)), len = 900;
    st(fx.line, { display: "block", left: px(head - len), top: px(sc.flowY ?? 540), width: px(len), opacity: Math.sin(Math.PI * p) });
    shown = true;
  });
  if (!shown) fx.line.style.display = "none";
}

// --------------------------------------------------------------- HUD
let hudInit = false;
function drawHud(t, total, act) {
  const brand = document.getElementById("brand"), chap = document.getElementById("chapter");
  if (!hudInit) { brand.innerHTML = nucleoSVG(22) + `<span>${WORDMARK}</span>`; hudInit = true; }
  let a = 0, label = "", la = 0;
  for (const { sc, op, idx } of act) {
    if (Array.isArray(sc.hud)) a = Math.max(a, op * (1 - P(t - sc.start, sc.hud[0], sc.hud[1])));
    else if (sc.hud) a = Math.max(a, op);
    if (sc.chapter) { const lt = t - sc.start; const v = win01(lt, 0.2, sc.dur - 0.3, 0.6, 0.5) * op; if (v >= la) { la = v; label = `<b>${String(idx + 1).padStart(2, "0")}</b><span>${sc.chapter}</span>`; } }
  }
  st(document.getElementById("hud"), { opacity: a });
  if (chap.dataset.l !== label) { chap.innerHTML = label; chap.dataset.l = label; }
  chap.style.opacity = la;
  document.querySelector("#prog i").style.width = `${((t / total) * 100).toFixed(3)}%`;
  const bg = document.getElementById("bg"), grid = document.getElementById("grid");
  bg.style.setProperty("--gx", `${(62 + 14 * Math.sin(t * 0.05)).toFixed(2)}%`);
  bg.style.setProperty("--gy", `${(24 + 10 * Math.cos(t * 0.04)).toFixed(2)}%`);
  grid.style.transform = `translate(${px((t * 6) % 64)},${px((t * 3) % 64)})`;
}

// --------------------------------------------------------------- execução
const built = new Map();
let TOTAL = 0;
function buildScene(i, host) {
  const sc = SCENES[i];
  const root = el("div", "scene", host);
  const ctx = { root, comps: [], cues: [], loads: [], extra: null };
  CUR = ctx;
  const add = (c) => (ctx.comps.push(c), c);
  ctx.extra = sc.build(root, add, ctx) || null;
  if (ctx.outPt) sc.outPt = ctx.outPt;
  CUR = null;
  return ctx;
}
async function seek(t) {
  if (!TOTAL) TOTAL = layoutTimes();
  const host = document.getElementById("scenes");
  const act = [];
  for (let i = 0; i < SCENES.length; i++) {
    const sc = SCENES[i];
    if (t >= sc.start && t < sc.end + 1e-6) act.push(i);
  }
  for (const i of act) if (!built.has(i)) built.set(i, buildScene(i, host));
  await Promise.all(act.flatMap((i) => built.get(i).loads));
  for (const [i, ctx] of built) {
    if (!act.includes(i)) {
      if (t > SCENES[i].end) { ctx.root.remove(); built.delete(i); } else ctx.root.style.display = "none";
    }
  }
  const info = [];
  act.forEach((i, k) => {
    const sc = SCENES[i], ctx = built.get(i), lt = t - sc.start;
    ctx.root.style.display = "block";
    ctx.root.style.zIndex = String(i);
    const ovIn = i > 0 ? SCENES[i - 1].ov : 0, ovOut = i < SCENES.length - 1 ? sc.ov : 0;
    const op = applyTrans(ctx.root, sc, lt, ovIn, ovOut);
    for (const c of ctx.comps) c.draw(lt);
    if (ctx.extra) ctx.extra(lt);
    info.push({ sc, op, idx: i });
  });
  drawFlow(t);
  drawHud(t, TOTAL, info);
  return true;
}
// deixas de áudio (tempo global) e mapa de cenas, sem decodificar imagens
function allCues() {
  TOTAL = layoutTimes();
  DRY = true;
  const tmp = el("div", "", null);
  const out = [];
  SCENES.forEach((sc, i) => {
    const ctx = buildScene(i, tmp);
    for (const c of ctx.cues) if (c.t >= 0 && c.t <= sc.dur) out.push({ ...c, t: +(sc.start + c.t).toFixed(3), scene: i + 1 });
    if (i > 0) out.push({ t: +sc.start.toFixed(3), type: sc.inT === "through" ? "whooshDeep" : sc.inT === "slide" ? "whoosh" : sc.inT === "none" ? "none" : "whooshSoft", scene: i + 1 });
  });
  DRY = false;
  out.sort((a, b) => a.t - b.t);
  return { total: TOTAL, scenes: SCENES.map((s, i) => ({ n: i + 1, name: s.name, chapter: s.chapter, start: +s.start.toFixed(3), end: +s.end.toFixed(3), dur: s.dur, in: s.inT, out: s.outT })), cues: out.filter((c) => c.type !== "none") };
}
window.seek = seek;
window.allCues = allCues;
window.totalTime = () => (TOTAL = layoutTimes());
