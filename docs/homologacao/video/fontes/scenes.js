// ATLAS.ERP — product tour: roteiro em código (16 cenas).
// Coordenadas de destaque/clique estão no espaço da captura (1600x900 CSS).
// Toda tela exibida é captura real do ambiente de demonstração (dados fictícios).
"use strict";

const ROW = (y, h = 35) => [289, y - h / 2, 1269, h];   // linha inteira de tabela (centro y)
const sp = (t0, t1, r, tag, o = {}) => ({ t0, t1, x: r[0], y: r[1], w: r[2], h: r[3], tag, ...o });
const CHIP_FULL = { left: "156px", bottom: "100px" };
const CHIP_STRIP = { left: "282px", bottom: "108px" };
const NOTE_FULL = { right: "156px", bottom: "100px" };
const NOTE_STRIP = { right: "282px", bottom: "108px" };
const WHO_FULL = { right: "150px", top: "86px" };
const WHO_STRIP = { right: "60px", top: "98px" };
const KICK = (txt) => [txt, { size: 15, sans: true, color: "#ff9408", cue: false }];

// janela que sobe por baixo até o layout STRIP (cenas com pipeline no topo)
const RISE = (t0, t1) => [ly(0, [250, 1110, 1420, 0, 0], 1, 0), ly(t0, [250, 1110, 1420, 0, 0], 1, 0), ly(t1, L.STRIP)];
// pipeline de abertura grande + faixa no topo
const INTRO = 0.8; // segundos extras da abertura com pipeline
function introPipe(add, root, nodes, { kick, l1, l2, size = 60 }) {
  add(new Stmt(root, { y: 250, t1: 3.2 + INTRO, lines: [[0.6, ...KICK(kick)], [0.75, l1, { size }], ...(l2 ? [[0.95, l2, { size, italic: true }]] : [])] }));
  add(new Pipe(root, { nodes: nodes.map((n) => ({ label: n })), lit: nodes.map((_, i) => 1.3 + i * 0.5), appear: 0.8, span: Math.min(1400, 330 * (nodes.length - 1)), pose: [[0, 960, 640, 1, 1], [2.9 + INTRO, 960, 640, 1, 1], [3.5 + INTRO, 960, 600, 0.92, 0]] }));
}
function stripPipe(add, root, nodes, lit, o = {}) {
  return add(new Pipe(root, { nodes, lit, span: o.span ?? Math.min(1300, 330 * (nodes.length - 1)), travel: o.travel ?? 0.8, token: o.token, tokenOut: o.tokenOut, pose: o.pose ?? [[3.0, 960, 128, 0.72, 0], [3.6, 960, 128, 0.72, 1]] }));
}

// ===================================================================== 01 ABERTURA
scene("Abertura", 11, { hud: false, out: "zoom", ov: 0.9 }, (root, add, ctx) => {
  // dashboard que aparece "atrás" do símbolo
  const wrap = el("div", "abs", root);
  st(wrap, { width: "1920px", height: "1080px" });
  const win = add(new Win(wrap, { shots: [[0, "d01-dashboard"]], layout: [ly(0, L.FULL, 0.55, 0), ly(7.5, L.FULL, 0.55, 0), ly(8.9, L.FULL, 1, 1)], cam: [[0, 800, 450, 1], [9.0, 800, 450, 1], [11, 700, 330, 1.12]], env: (t) => P(t, 8.5, 10.5) }));
  const glow = st(el("div", "abs", root), { width: "520px", height: "520px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(255,148,8,.30),transparent)", filter: "blur(10px)" });
  const g = st(el("div", "abs", root), { width: "1920px", height: "1080px" });
  const logo = st(el("div", "abs", g, nucleoSVG(150)), { width: "150px", height: "150px" });
  const word = st(el("div", "abs", g, WORDMARK), { fontWeight: 600, fontSize: "100px", letterSpacing: ".01em", whiteSpace: "nowrap", lineHeight: "1" });
  word.querySelector("i").style.cssText = "font-style:normal;color:rgba(243,244,245,.42)";
  const rects = [...logo.querySelectorAll(".nb")], core = logo.querySelector(".nc");
  const lines = add(new Stmt(root, { y: 640, t1: 5.5, lines: [[2.5, "Uma plataforma.", { size: 78 }], [3.4, "Toda a operação da empresa.", { size: 78, italic: true, color: "rgba(243,244,245,.78)" }]] }));
  cue(0.25, "build"); cue(1.55, "core"); cue(5.9, "lockup"); cue(6.6, "riser", { dur: 1.9 }); cue(8.45, "impact");
  const dirs = [[-11, 0], [0, -11], [11, 0], [0, 11]];
  return (t) => {
    // montagem do Núcleo
    rects.forEach((r, i) => {
      const p = P(t, 0.25 + i * 0.16, 1.25 + i * 0.16, E.o5);
      r.style.transform = `translate(${dirs[i][0] * (1 - p)}px,${dirs[i][1] * (1 - p)}px)`;
      r.style.opacity = p;
    });
    const cp = P(t, 1.45, 2.05, E.back);
    core.style.transform = `scale(${cp})`;
    // lockup: centro (960,410) → símbolo à esquerda + palavra
    const m = P(t, 5.7, 6.9, E.io5);
    const size = lerp(150, 132, m);
    const wordW = word.offsetWidth || 520, gap = 40, total = 132 + gap + wordW;
    const lx = lerp(960, 960 - total / 2 + 66, m), lyy = lerp(400, 540, m);
    const spin = lerp(-90, 0, P(t, 0.2, 1.9, E.o5));
    st(logo, { left: px(lx - size / 2), top: px(lyy - size / 2), transform: `rotate(${spin}deg) scale(${size / 150})`, transformOrigin: "50% 50%" });
    const wa = P(t, 6.0, 6.9, E.o);
    st(word, { left: px(960 - total / 2 + 132 + gap + 24 * (1 - wa)), top: px(540 - 50), opacity: wa, filter: `blur(${(8 * (1 - wa)).toFixed(2)}px)` });
    const ga = P(t, 1.5, 2.6, E.o) * (0.75 + 0.25 * Math.sin(t * 2.2));
    st(glow, { left: px(lx - 260), top: px(lyy - 260), opacity: ga * (1 - P(t, 7.6, 8.4)) });
    // mergulho pelo núcleo → dashboard
    const z = P(t, 7.5, 8.9, E.i);
    st(g, { transformOrigin: `${px(lx)} ${px(lyy)}`, transform: `scale(${1 + 9 * z})`, opacity: 1 - P(t, 7.9, 8.6), filter: `blur(${(14 * z).toFixed(2)}px)` });
    st(wrap, { filter: `blur(${(16 * (1 - P(t, 7.6, 9.0, E.o))).toFixed(2)}px)` });
  };
});

// ===================================================================== 02 O PROBLEMA
scene("O problema", 15, { hud: false, in: "zoom", out: "through", outO: { x: 960, y: 500 }, ov: 0.9 }, (root, add) => {
  const MODS = [["Comercial", "m02-pedidos", "PV-0223"], ["Estoque", "e01-estoque-saldos", "Balde 8 L · 10 un"], ["Financeiro", "f01-contas-receber", "CR-0119"], ["Fiscal", "s20-nfe-pronta", "DF-0058"], ["Logística", "e05-expedicao", "EXP-0065"]];
  const R = [260, 64, 840, 472.5];
  const A = st(el("div", "abs", root), { width: "1920px", height: "1080px" });
  const svgA = el("div", "abs", A, `<svg width="1920" height="1080"></svg>`).firstChild;
  const off = [-34, 46, -12, 58, -40], drift = [[-30, -14], [-12, 22], [0, -20], [16, 18], [30, -12]], rot = [-2.2, 1.6, -0.8, 2.0, -1.4];
  const cards = MODS.map(([lb, shot, code], i) => {
    const c = el("div", "card", A);
    crop(c, shot, R, 300);
    el("div", "lb", c, lb);
    const tag = el("div", "code", A, code);
    return { c, tag, x: 260 + i * 350, y: 560 + off[i] };
  });
  const broken = [0, 1, 2, 3].map(() => {
    const a = document.createElementNS("http://www.w3.org/2000/svg", "line"), b = document.createElementNS("http://www.w3.org/2000/svg", "line");
    [a, b].forEach((l) => { l.setAttribute("stroke", "rgba(243,244,245,.32)"); l.setAttribute("stroke-width", "1.5"); l.setAttribute("stroke-dasharray", "5 7"); svgA.appendChild(l); });
    return [a, b];
  });
  add(new Stmt(A, { y: 170, lines: [[1.0, "Quando cada área trabalha isoladamente…", { size: 62, t1: 5.0 }], [5.25, "…a operação perde contexto.", { size: 62, italic: true, t1: 7.6 }]] }));
  // depois do corte: conectadas ao Núcleo
  const B = st(el("div", "abs", root), { width: "1920px", height: "1080px" });
  const svgB = el("div", "abs", B, `<svg width="1920" height="1080"></svg>`).firstChild;
  const nuc = st(el("div", "abs", B, nucleoSVG(104)), { left: "908px", top: "448px" });
  const ng = st(el("div", "abs", B), { left: "760px", top: "300px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(255,148,8,.28),transparent)" });
  B.insertBefore(ng, nuc);
  const ring = MODS.map(([lb, shot], i) => {
    const ang = (-90 + i * 72) * (Math.PI / 180);
    const x = 960 + 540 * Math.cos(ang), y = 500 + 290 * Math.sin(ang);
    const c = el("div", "card", B);
    crop(c, shot, R, 280);
    el("div", "lb", c, lb);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", 960); line.setAttribute("y1", 500); line.setAttribute("x2", x); line.setAttribute("y2", y);
    line.setAttribute("stroke", "#ff9408"); line.setAttribute("stroke-width", "2");
    const len = Math.hypot(x - 960, y - 500);
    line.setAttribute("stroke-dasharray", `${len} ${len}`);
    svgB.appendChild(line);
    const dot = el("div", "pdot", B);
    return { c, x, y, line, len, dot };
  });
  add(new Stmt(B, { y: 935, lines: [[9.7, "Com o ATLAS.ERP, elas trabalham conectadas.", { size: 54 }]] }));
  cue(1.0, "text"); cue(7.95, "cut"); cue(8.2, "core"); cue(8.9, "connect");
  return (t) => {
    // fase A: módulos isolados, à deriva
    const aA = 1 - P(t, 7.7, 7.95, E.lin);
    st(A, { display: aA > 0.001 ? "block" : "none", opacity: aA });
    const dr = P(t, 0.5, 7.8, E.io);
    cards.forEach(({ c, tag, x, y }, i) => {
      const ap = P(t, 0.25 + i * 0.14, 1.05 + i * 0.14, E.o);
      const cx = x + drift[i][0] * dr * 1.6, cy = y + drift[i][1] * dr * 1.6 + 30 * (1 - ap);
      const lost = P(t, 5.2, 7.2);
      st(c, { left: px(cx), top: px(cy), opacity: ap * (1 - 0.35 * lost), transform: `translate(-50%,-50%) rotate(${rot[i] * dr}deg)`, filter: `grayscale(${0.55 + 0.4 * lost}) blur(${(1.6 * lost).toFixed(2)}px)` });
      const ta = P(t, 1.8 + i * 0.15, 2.4 + i * 0.15, E.o) * (1 - lost);
      st(tag, { left: px(cx + 40), top: px(cy - 132 - 46 * lost), opacity: ta, filter: `blur(${(6 * lost).toFixed(2)}px)` });
      c._x = cx; c._y = cy;
    });
    broken.forEach(([a, b], i) => {
      const c0 = cards[i].c, c1 = cards[i + 1].c;
      const x0 = c0._x + 160, x1 = c1._x - 160, y0 = c0._y, y1 = c1._y, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const gap = 10 + 30 * P(t, 4.5, 7.5);
      const k = gap / Math.max(1, Math.hypot(x1 - x0, y1 - y0));
      a.setAttribute("x1", x0); a.setAttribute("y1", y0); a.setAttribute("x2", mx - (x1 - x0) * k); a.setAttribute("y2", my - (y1 - y0) * k);
      b.setAttribute("x1", mx + (x1 - x0) * k); b.setAttribute("y1", my + (y1 - y0) * k); b.setAttribute("x2", x1); b.setAttribute("y2", y1);
      const op = P(t, 2.3 + i * 0.12, 2.9 + i * 0.12) * (0.55 + 0.45 * Math.sin(t * 6.3 + i * 1.7)) * (1 - P(t, 5.0, 7.0));
      a.setAttribute("opacity", op.toFixed(3)); b.setAttribute("opacity", (op * 0.8).toFixed(3));
    });
    // fase B: conectadas
    const on = t >= 8.15;
    B.style.display = on ? "block" : "none";
    if (!on) return;
    const np = P(t, 8.2, 8.9, E.back);
    st(nuc, { transform: `scale(${np})`, transformOrigin: "50% 50%" });
    st(ng, { opacity: P(t, 8.3, 9.2) * (0.7 + 0.3 * Math.sin(t * 2)) });
    ring.forEach(({ c, x, y, line, len, dot }, i) => {
      const ap = P(t, 8.45 + i * 0.1, 9.15 + i * 0.1, E.o);
      st(c, { left: px(x), top: px(y), opacity: ap, transform: `translate(-50%,-50%) scale(${0.9 + 0.1 * ap})` });
      const lp = P(t, 8.85 + i * 0.1, 9.55 + i * 0.1, E.o);
      line.setAttribute("stroke-dashoffset", (len * (1 - lp)).toFixed(1));
      line.setAttribute("opacity", (0.75 * lp).toFixed(3));
      const ph = ((t - 9.6 + i * 0.31) / 1.7) % 1;
      if (t > 9.6) st(dot, { display: "block", left: px(lerp(960, x, ph)), top: px(lerp(500, y, ph)), opacity: Math.sin(Math.PI * ph) });
      else dot.style.display = "none";
    });
  };
});

// ===================================================================== 03 ADMINISTRAÇÃO CENTRAL
scene("Administração Central", 15, { chapter: "Administração Central", in: "through", out: "through", ov: 0.9 }, (root, add, ctx) => {
  add(new Cap(root, { t0: 0.5, t1: 3.5, y: 360, kick: "Administração Central", title: "Controle central.", sub: "Uma camada central controla empresas, módulos e acessos." }));
  const win = add(new Win(root, {
    layout: [ly(0, L.SPLIT), ly(3.3, L.SPLIT), ly(4.3, L.FULL)],
    shots: [[0, "c00-central-visao-geral"], [3.6, "c03-central-modulos", "fade", 0.5], [6.0, "c01-central-empresas", "slide", 0.6], [8.5, "c02-central-empresa-detalhe", "fade", 0.35, false], [12.0, "c01-central-empresas", "fade", 0.45]],
    cam: [[0, 800, 450, 1], [1.2, 800, 450, 1], [2.6, 920, 270, 1.25], [3.5, 920, 280, 1.25], [4.4, 820, 460, 1.28], [5.8, 1000, 460, 1.32], [6.3, 900, 540, 1.3], [7.4, 760, 540, 1.38], [8.3, 640, 500, 1.4], [8.9, 1250, 440, 1.6], [10.1, 1250, 450, 1.6], [10.9, 1250, 730, 1.6], [11.9, 1250, 740, 1.6], [12.4, 640, 482, 1.42], [15, 600, 482, 1.46]],
    spots: [sp(1.4, 3.3, [289, 223, 1269, 63], "Isolamento entre empresas"), sp(4.6, 5.9, [1190, 270, 152, 362], "Permissões por módulo"), sp(6.5, 7.6, [745, 393, 130, 325], "Ciclo de vida"), sp(7.7, 8.55, ROW(482), null, { cue: false }), sp(9.0, 10.3, [930, 350, 650, 250], "Ciclo de vida"), sp(10.9, 11.95, [930, 640, 650, 250], "Módulos contratados"), sp(12.6, 14.6, ROW(482), "Órbita Distribuidora")],
    clicks: [{ t: 8.35, x: 352, y: 482 }],
  }));
  add(new Chip(root, { pos: CHIP_FULL, items: [[4.4, 5.9, "Plataforma", "Catálogo de módulos e permissões"], [6.3, 8.4, "Plataforma", "Empresas e ciclo de vida"], [8.9, 12.0, "Órbita Distribuidora", "Ciclo de vida · módulos contratados"], [12.5, 14.6, "Plataforma", "Cada empresa, isolada das demais"]] }));
  ctx.outPt = () => win.at(14.1, 352, 482);
});

// ===================================================================== 04 EMPRESA E USUÁRIOS
scene("Empresa e usuários", 20.5, { chapter: "Empresa e usuários", in: "through", out: "slide", ov: 0.9 }, (root, add) => {
  add(new Cap(root, { t0: 0.5, t1: 3.4, y: 340, kick: "Empresa e usuários", title: "Permissões por função.", sub: "Cada empresa possui seus próprios usuários, funções e permissões." }));
  add(new Win(root, {
    layout: [ly(0, L.SPLIT), ly(3.2, L.SPLIT), ly(4.2, L.FULL)],
    shots: [[0, "a00-admin-visao-geral"], [3.4, "a01-usuarios", "fade", 0.5], [6.6, "a02-convite-papeis", "fade", 0.4], [9.6, "a03-papel-logistica", "fade", 0.5], [11.4, "a04-papel-filtro", "fade", 0.35], [12.95, "a05-permissao-aplicada", "fade", 0.2, false], [14.4, "b01-vendedor-acesso-restrito", "slide", 0.6]],
    cam: [[0, 800, 450, 1], [1.0, 800, 450, 1], [2.2, 560, 60, 1.35], [3.2, 560, 60, 1.35], [4.0, 800, 520, 1.3], [5.0, 980, 520, 1.45], [6.4, 990, 520, 1.45], [7.0, 800, 650, 1.55], [9.4, 800, 680, 1.6], [10.0, 900, 520, 1.25], [11.2, 900, 520, 1.25], [11.8, 1080, 440, 1.8], [14.2, 1100, 450, 1.85], [14.8, 923, 240, 1.5], [17.5, 923, 240, 1.6], [20.5, 923, 240, 1.62]],
    spots: [sp(1.2, 3.2, [289, 11, 560, 32], "Somente esta empresa"), sp(4.6, 6.4, [965, 385, 115, 275], "Papéis"), sp(7.3, 9.4, [566, 552, 468, 262], "Funções disponíveis"), sp(10.1, 11.3, [289, 699, 288, 55], "Papel Logística"), sp(13.15, 14.3, [610, 447, 932, 36], "Clientes · criar"), sp(15.2, 17.9, [735, 160, 380, 125], "Sem acesso", { dim: 1.3 })],
    clicks: [{ t: 12.9, x: 1341, y: 464 }],
  }));
  add(new Who(root, { t0: 3.7, t1: 14.2, ini: "MA", name: "Marina Andrade", role: "Administrador", pos: WHO_FULL }));
  add(new Who(root, { t0: 14.6, t1: 18.3, ini: "HX", name: "Helena Xavier", role: "Vendedor", pos: WHO_FULL }));
  add(new Note(root, { t0: 13.2, t1: 14.4, text: "Demonstração: a alteração foi descartada — o papel não foi modificado.", pos: NOTE_FULL }));
  add(new Chip(root, { pos: CHIP_FULL, items: [[4.3, 6.4, "Órbita Distribuidora", "Usuários e papéis"], [7.0, 9.4, "Convite", "Cada usuário recebe uma função"], [10.0, 11.3, "Papéis e permissões", "Papel Logística"], [11.9, 13.0, "Papel Logística", "Filtrar permissões"], [14.9, 16.2, "Perfil Vendedor", "Tentativa: Contas a pagar"]] }));
  cue(15.05, "blocked");
  add(new Veil(root, { t0: 16.3, t1: 21.1 }));
  add(new Stmt(root, { y: 440, lines: [[16.6, "Cada usuário acessa apenas", { size: 70 }], [16.9, "o que sua função permite.", { size: 70, italic: true }]] }));
});

// ===================================================================== 05 CADASTROS
scene("Cadastros", 13, { chapter: "Cadastros", in: "slide", out: "slide", flow: true, ov: 0.9 }, (root, add) => {
  add(new Cap(root, { t0: 0.4, t1: 3.0, y: 330, kick: "Cadastros", title: "A operação começa com dados organizados.", size: 58, sub: "Clientes, fornecedores, produtos, categorias, unidades e dados fiscais." }));
  add(new Win(root, {
    layout: [ly(0, L.SPLIT), ly(2.8, L.SPLIT), ly(3.7, L.FULL)],
    shots: [[0, "k01-clientes"], [3.0, "k03-fornecedores", "slide", 0.6], [4.9, "k04-produtos", "slide", 0.6], [6.6, "k05-produto-detalhe", "fade", 0.45], [9.0, "k06-locais", "slide", 0.6], [10.7, "k08-cfop", "slide", 0.6]],
    cam: [[0, 800, 450, 1], [2.6, 800, 470, 1.04], [3.4, 700, 420, 1.35], [4.7, 760, 420, 1.35], [5.2, 700, 400, 1.35], [6.4, 760, 420, 1.35], [7.0, 1255, 480, 1.7], [8.8, 1255, 500, 1.75], [9.4, 800, 360, 1.4], [10.5, 860, 360, 1.4], [11.1, 800, 300, 1.5], [13, 830, 300, 1.55]],
    spots: [sp(3.6, 4.7, [289, 307, 1269, 108], "Fornecedores"), sp(5.4, 6.4, [289, 307, 1269, 72], "Produtos"), sp(7.2, 8.9, [930, 410, 650, 160], "Categoria · unidade · NCM"), sp(9.6, 10.6, [289, 307, 1269, 144], "Locais de estoque"), sp(11.3, 12.9, ROW(325), "CFOP 5102")],
  }));
  add(new Chip(root, { pos: CHIP_FULL, items: [[3.4, 4.7, "Cadastros", "Fornecedores"], [5.2, 6.4, "Cadastros", "Produtos"], [7.0, 8.8, "Produto OD-024", "Classificação e dados fiscais"], [9.4, 10.5, "Estoque", "Locais de armazenagem"], [11.1, 12.6, "Fiscal", "Natureza da operação"]] }));
});

// ===================================================================== 06 COMERCIAL
scene("Comercial", 18.8, { chapter: "Comercial", in: "slide", out: "through", ov: 0.9 }, (root, add, ctx) => {
  introPipe(add, root, ["Cliente", "Orçamento", "Pedido", "Aprovação"], { kick: "Comercial", l1: "Do relacionamento com o cliente ao pedido." });
  shifted(INTRO, add, (sadd) => {
  stripPipe(sadd, root, [{ label: "Cliente" }, { label: "Orçamento" }, { label: "Pedido" }, { label: "Aprovação" }], [4.0, 5.9, 8.3, 13.95]);
  const win = sadd(new Win(root, {
    layout: RISE(3.0, 4.0),
    shots: [[0, "k01-clientes"], [5.6, "m01-orcamentos", "slide", 0.6], [8.0, "s01-pedido-rascunho", "fade", 0.5], [9.85, "s02-enviar-dialogo", "fade", 0.25, false], [10.95, "s03-aguardando-aprovacao", "fade", 0.3, false], [12.4, "s04-aprovar-dialogo", "fade", 0.45], [13.85, "s05-aprovado", "fade", 0.3, false]],
    cam: [[3.0, 700, 600, 1.3], [3.8, 700, 600, 1.3], [5.4, 740, 610, 1.35], [6.0, 800, 440, 1.4], [7.8, 800, 450, 1.45], [8.4, 560, 420, 1.3], [9.0, 700, 330, 1.3], [9.9, 880, 440, 1.45], [10.9, 880, 440, 1.45], [11.4, 560, 190, 1.6], [12.3, 560, 190, 1.6], [12.7, 880, 440, 1.45], [13.85, 880, 440, 1.45], [14.3, 560, 170, 1.7], [18, 560, 170, 1.72]],
    spots: [sp(4.2, 5.4, ROW(613), "Cliente"), sp(6.3, 7.8, ROW(472), "Orçamento aprovado"), sp(8.5, 9.15, [280, 570, 300, 46], "Origem: ORC-0006"), sp(11.3, 12.3, [553, 147, 160, 26], "Aguardando aprovação"), sp(14.3, 17.4, [553, 147, 90, 26], "Aprovado")],
    clicks: [{ t: 9.65, x: 1470, y: 179 }, { t: 10.8, x: 921, y: 496, from: [1300, 600] }, { t: 13.7, x: 963, y: 486 }],
  }));
  sadd(new Who(root, { t0: 4.0, t1: 12.2, ini: "HX", name: "Helena Xavier", role: "Vendedor", pos: WHO_STRIP }));
  sadd(new Who(root, { t0: 12.45, t1: 17.2, ini: "CN", name: "Caio Nogueira", role: "Gerente", pos: WHO_STRIP }));
  sadd(new Note(root, { t0: 8.2, t1: 10.7, text: "O pedido foi criado a partir do orçamento aprovado pela API — nesta versão não há tela “Novo pedido”.", pos: NOTE_STRIP }));
  sadd(new Chip(root, { pos: CHIP_STRIP, items: [[4.1, 5.4, "Cliente", "Granito Serviços OD Ltda."], [6.1, 7.8, "Orçamento ORC-0006", "Aprovado"], [11.2, 12.3, "Pedido PV-0223", "Enviado para aprovação"], [14.2, 16.9, "Pedido PV-0223", "Aprovado pelo Gerente"]] }));
  cue(13.95, "approve");
  ctx.outPt = () => win.at(17.1, 597, 159);
});
  });
// ===================================================================== 07 ESTOQUE / WMS
scene("Estoque e WMS", 24, { chapter: "Estoque · WMS", in: "through", out: "slide", ov: 0.9 }, (root, add) => {
  add(new Cap(root, { t0: 0.5, t1: 3.4, y: 330, kick: "Estoque · WMS", title: "O estoque acompanha o pedido.", sub: "Saldos por local, movimentações rastreáveis, reserva, separação e expedição." }));
  add(new Win(root, {
    layout: [ly(0, L.SPLIT), ly(3.2, L.SPLIT), ly(4.1, L.FULL), ly(8.4, L.FULL), ly(9.4, L.STRIP)],
    shots: [[0, "e01-estoque-saldos"], [3.6, "k06-locais", "slide", 0.6], [5.9, "e02-movimentacoes", "slide", 0.6], [9.6, "s06-reservar-dialogo", "fade", 0.5], [11.05, "s07-reservado", "fade", 0.3, false], [13.0, "e01-estoque-saldos", "slide", 0.6], [15.2, "s11-separacao-em-andamento", "slide", 0.6], [16.9, "s12-separacao-concluida", "fade", 0.45, "confirm"], [18.6, "s16-pedido-expedido", "slide", 0.6]],
    cam: [[0, 800, 450, 1], [1.2, 800, 450, 1], [3.0, 1100, 420, 1.2], [3.9, 800, 360, 1.45], [5.6, 860, 360, 1.45], [6.2, 1200, 420, 1.45], [7.4, 1250, 400, 1.5], [8.8, 1000, 420, 1.3], [9.8, 800, 470, 1.4], [10.8, 800, 490, 1.45], [11.3, 1080, 270, 1.55], [12.7, 1080, 270, 1.6], [13.3, 1150, 470, 1.4], [15.0, 1180, 470, 1.45], [15.5, 800, 380, 1.5], [18.3, 820, 380, 1.55], [18.9, 1100, 300, 1.35], [21, 1100, 300, 1.4], [24, 1100, 300, 1.4]],
    spots: [sp(1.4, 3.1, [1050, 270, 470, 610], "Em estoque · reservado · disponível"), sp(4.2, 5.6, [289, 307, 1269, 144], "Locais"), sp(6.5, 8.1, [1290, 305, 170, 575], "Origem"), sp(9.9, 10.8, [629, 474, 342, 32], "Local da reserva"), sp(11.4, 12.8, [926, 219, 314, 103], "Reservado 100%"), sp(13.5, 15.0, [1300, 305, 210, 575], "Reservado · disponível"), sp(15.6, 16.85, ROW(365, 33), "SEP-0106 · Separando"), sp(17.1, 18.4, ROW(365, 33), "Concluída"), sp(19.1, 21.3, [1242, 219, 316, 103], "Expedido 100%")],
    clicks: [{ t: 10.9, x: 930, y: 553 }],
  }));
  stripPipe(add, root, [{ label: "Pedido" }, { label: "Reserva" }, { label: "Estoque" }, { label: "Separação" }, { label: "Expedição" }], [9.0, 11.05, 13.3, 16.95, 18.8], {
    pose: [[8.4, 960, 124, 0.7, 0], [9.0, 960, 124, 0.7, 1]], span: 1340,
    token: { label: "Balde plástico 8 L · 10 un", states: ["Pedido aprovado", "Reservado", "Saldo comprometido", "Separado", "Expedido"], dy: 40 }, tokenOut: 21.2,
  });
  add(new Who(root, { t0: 9.5, t1: 12.9, ini: "RS", name: "Rafael Sampaio", role: "Operador", pos: WHO_STRIP }));
  add(new Who(root, { t0: 15.3, t1: 18.5, ini: "LX", name: "Lívia Xavier", role: "Logística", pos: WHO_STRIP }));
  add(new Note(root, { t0: 15.5, t1: 18.5, text: "Separação e expedição registradas pela API do módulo; as telas mostram o resultado real.", pos: NOTE_STRIP }));
  add(new Chip(root, { pos: CHIP_FULL, items: [[4.1, 5.6, "Estoque", "Locais de armazenagem"], [6.2, 8.2, "Estoque", "Movimentações por origem"]] }));
  add(new Chip(root, { pos: CHIP_STRIP, items: [[11.3, 12.8, "Pedido PV-0223", "Estoque reservado"], [13.3, 15.0, "Saldo de estoque", "Reservado × disponível"], [19.0, 21.2, "Pedido PV-0223", "Reservado 100% · Expedido 100%"]] }));
  add(new Veil(root, { t0: 21.4, t1: 24.6 }));
  add(new Stmt(root, { y: 440, lines: [[21.7, "O estoque acompanha o pedido", { size: 68 }], [22.0, "desde a reserva até a expedição.", { size: 68, italic: true }]] }));
});

// ===================================================================== 08 COMPRAS
scene("Compras", 15.8, { chapter: "Compras", in: "slide", out: "slide", flow: true, ov: 0.9 }, (root, add) => {
  introPipe(add, root, ["Fornecedor", "Compra", "Recebimento", "Estoque"], { kick: "Compras", l1: "Quando a empresa precisa comprar,", l2: "o processo também permanece dentro da plataforma.", size: 54 });
  shifted(INTRO, add, (sadd) => {
  stripPipe(sadd, root, [{ label: "Fornecedor" }, { label: "Compra" }, { label: "Recebimento" }, { label: "Estoque" }], [4.0, 6.0, 10.6, 12.6]);
  sadd(new Win(root, {
    layout: RISE(3.0, 4.0),
    shots: [[0, "k03-fornecedores"], [5.8, "p01-solicitacoes", "slide", 0.6], [7.6, "p02-pedidos-compra", "slide", 0.6], [9.2, "p03-pedido-compra-detalhe", "fade", 0.4], [10.5, "e03-recebimento", "slide", 0.6], [12.4, "e02-movimentacoes", "slide", 0.6]],
    cam: [[3.0, 760, 420, 1.35], [3.8, 760, 420, 1.35], [5.6, 800, 420, 1.38], [6.1, 800, 400, 1.45], [7.4, 820, 400, 1.45], [7.9, 850, 430, 1.4], [9.0, 850, 430, 1.4], [9.5, 1250, 220, 1.6], [10.3, 1250, 230, 1.6], [10.8, 800, 400, 1.45], [12.2, 820, 400, 1.45], [12.7, 800, 360, 1.5], [15, 830, 360, 1.5]],
    spots: [sp(4.2, 5.6, [289, 307, 1269, 108], "Fornecedores"), sp(6.3, 7.5, ROW(365, 33), "SC-0001"), sp(8.0, 9.1, [289, 349, 1269, 105], "Pedidos de compra"), sp(9.6, 10.4, [930, 70, 180, 36], "Aguardando aprovação"), sp(11.0, 12.3, ROW(365, 33), "REC-0001 · Confirmado"), sp(12.9, 14.8, [289, 307, 1269, 108], "Entrada · PURCHASE_RECEIPT")],
  }));
  sadd(new Note(root, { t0: 10.7, t1: 12.4, text: "Recebimento registrado pela API do módulo; a tela mostra o resultado real.", pos: NOTE_STRIP }));
  sadd(new Chip(root, { pos: CHIP_STRIP, items: [[4.1, 5.6, "Compras", "Fornecedores"], [6.1, 7.5, "Compras", "Solicitação de compra"], [7.9, 9.1, "Compras", "Pedidos de compra"], [9.4, 10.3, "Pedido PC-0003", "Aprovação de compra"], [12.7, 14.6, "Estoque", "Entrada registrada"]] }));
});
  });
// ===================================================================== 09 FINANCEIRO
scene("Financeiro", 15.8, { chapter: "Financeiro", in: "slide", out: "zoom", ov: 0.9 }, (root, add) => {
  introPipe(add, root, ["Pedido aprovado", "Conta a receber", "Recebimento"], { kick: "Financeiro", l1: "Cada operação pode gerar", l2: "seus reflexos financeiros." });
  shifted(INTRO, add, (sadd) => {
  stripPipe(sadd, root, [{ label: "Pedido aprovado" }, { label: "Conta a receber" }, { label: "Recebimento" }], [3.9, 5.25, 8.65], { span: 900 });
  sadd(new Win(root, {
    layout: RISE(3.0, 4.0),
    shots: [[0, "s08-gerar-receber-dialogo"], [5.15, "s09-financeiro-do-pedido", "fade", 0.35, false], [7.0, "s10-contas-receber-aberto", "slide", 0.6], [8.6, "s22-contas-receber-recebido", "fade", 0.5, "confirm"], [10.4, "f02-contas-pagar", "slide", 0.6], [12.6, "f03-fluxo-caixa", "slide", 0.6]],
    cam: [[3.0, 880, 440, 1.45], [4.9, 900, 450, 1.45], [5.5, 600, 640, 1.5], [6.8, 600, 650, 1.5], [7.3, 900, 430, 1.45], [10.1, 950, 430, 1.45], [10.7, 880, 440, 1.4], [12.3, 900, 440, 1.4], [12.9, 900, 400, 1.25], [15, 920, 400, 1.3]],
    spots: [sp(5.5, 6.9, [289, 577, 625, 143], "CR-0119 · Em aberto"), sp(7.4, 8.5, ROW(437), "CR-0119"), sp(8.75, 10.2, [1352, 420, 140, 34], "Recebido"), sp(10.9, 12.3, ROW(472), "Do recebimento REC-0001")],
    clicks: [{ t: 5.0, x: 923, y: 496 }],
  }));
  sadd(new Who(root, { t0: 3.6, t1: 10.3, ini: "BD", name: "Bianca Dantas", role: "Financeiro", pos: WHO_STRIP }));
  sadd(new Note(root, { t0: 8.7, t1: 10.3, text: "Baixa do título registrada pela API; a tela mostra o resultado real.", pos: NOTE_STRIP }));
  sadd(new Chip(root, { pos: CHIP_STRIP, items: [[5.5, 6.9, "Pedido PV-0223", "Conta a receber gerada"], [10.7, 12.3, "Financeiro", "Contas a pagar"], [12.9, 14.6, "Financeiro", "Fluxo de caixa"]] }));
});
  });
// ===================================================================== 10 FISCAL
scene("Fiscal", 16, { chapter: "Fiscal", in: "rise", out: "slide", ov: 0.9 }, (root, add) => {
  add(new Cap(root, { t0: 0.5, t1: 3.4, y: 320, kick: "Fiscal", title: "Os dados da operação alimentam o processo fiscal.", size: 54, sub: "Estabelecimento emitente, NCM, CFOP e o documento fiscal do pedido." }));
  add(new Win(root, {
    layout: [ly(0, L.SPLIT), ly(3.2, L.SPLIT), ly(4.1, L.FULL), ly(6.0, L.FULL), ly(6.8, L.STRIP)],
    shots: [[0, "s21-fiscal-painel"], [3.4, "k08-cfop", "slide", 0.6], [6.4, "s18-nfe-gerada", "slide", 0.6], [8.4, "s19-nfe-calculada", "fade", 0.45, "confirm"], [10.2, "s20-nfe-pronta", "fade", 0.45, "confirm"]],
    cam: [[0, 800, 450, 1], [1.0, 800, 450, 1], [2.8, 900, 510, 1.15], [3.6, 780, 300, 1.45], [5.9, 800, 300, 1.5], [6.8, 880, 380, 1.3], [12.0, 880, 380, 1.34], [16, 880, 380, 1.34]],
    spots: [sp(1.2, 3.2, [289, 337, 1269, 349], "Preparação para a NF-e"), sp(3.8, 5.9, ROW(325), "CFOP 5102 · venda"), sp(6.9, 8.3, ROW(365, 33), "DF-0058 · Rascunho"), sp(8.6, 10.1, ROW(365, 33), "Calculada"), sp(10.4, 12.6, ROW(365, 33), "Pronta")],
  }));
  stripPipe(add, root, [{ label: "Rascunho" }, { label: "Calculada" }, { label: "Pronta" }, { label: "Autorizada", dash: true }], [6.9, 8.5, 10.3, null], { pose: [[6.0, 960, 128, 0.72, 0], [6.6, 960, 128, 0.72, 1]] });
  add(new Note(root, { t0: 11.0, t1: 15.7, text: "Neste ambiente a NF-e para em <b>“Pronta”</b>: transmissão e autorização na SEFAZ exigem certificado digital e não foram executadas. O documento foi gerado do pedido pela API (sem botão “Gerar NF-e” nesta versão).", pos: NOTE_STRIP }));
  add(new Chip(root, { pos: CHIP_FULL, items: [[3.6, 5.9, "Fiscal", "CFOP da natureza de operação"]] }));
  add(new Chip(root, { pos: CHIP_STRIP, items: [[7.0, 10.6, "Documento fiscal DF-0058", "NF-e do pedido PV-0223"]] }));
});

// ===================================================================== 11 LOGÍSTICA
scene("Logística", 13, { chapter: "Logística", in: "slide", out: "through", ov: 0.9 }, (root, add, ctx) => {
  add(new Cap(root, { t0: 0.5, t1: 3.0, y: 330, kick: "Logística", title: "Da operação interna até a saída da mercadoria.", size: 56, sub: "Separação, embalagem, expedição e entrega, etapa por etapa." }));
  const win = add(new Win(root, {
    layout: [ly(0, L.SPLIT), ly(2.8, L.SPLIT), ly(3.7, L.STRIP)],
    shots: [[0, "s12-separacao-concluida"], [3.3, "s13-expedicao-embalada", "slide", 0.6], [5.4, "s14-expedicao-expedida", "fade", 0.45, "confirm"], [7.3, "s15-expedicao-entregue", "fade", 0.45, "confirm"], [9.2, "s16-pedido-expedido", "slide", 0.6]],
    cam: [[0, 800, 450, 1], [2.6, 820, 420, 1.1], [3.6, 860, 380, 1.4], [9.0, 870, 380, 1.42], [9.6, 1350, 480, 1.6], [13, 1350, 480, 1.65]],
    spots: [sp(1.2, 2.8, ROW(365, 33), "SEP-0106 · Concluída"), sp(3.95, 5.3, [1352, 349, 110, 33], "Embalada"), sp(5.6, 7.2, [1352, 349, 110, 33], "Expedida"), sp(7.5, 9.1, [1352, 349, 110, 33], "Entregue"), sp(9.7, 12.2, [1146, 339, 412, 180], "Andamento do pedido")],
  }));
  stripPipe(add, root, [{ label: "Separação" }, { label: "Embalagem" }, { label: "Expedição" }, { label: "Entrega" }], [3.4, 3.95, 5.5, 7.4], { pose: [[2.8, 960, 128, 0.72, 0], [3.4, 960, 128, 0.72, 1]] });
  add(new Note(root, { t0: 3.7, t1: 9.0, text: "Etapas registradas pela API do módulo (Logística; aprovação da expedição pelo Gerente). As telas mostram o resultado real.", pos: NOTE_STRIP }));
  add(new Chip(root, { pos: CHIP_STRIP, items: [[3.9, 9.0, "Expedição EXP-0065", "Granito Serviços OD Ltda."], [9.7, 12.2, "Pedido PV-0223", "Reserva 100% · Expedição 100%"]] }));
  ctx.outPt = () => win.at(12.1, 1350, 480);
});

// ===================================================================== 12 AUDITORIA
scene("Auditoria", 11, { chapter: "Auditoria", in: "through", out: "fade", ov: 0.9 }, (root, add) => {
  add(new Cap(root, { t0: 0.4, t1: 2.9, y: 330, kick: "Auditoria", title: "Tudo o que acontece pode deixar uma trilha operacional.", size: 52, sub: "Quem fez, o quê, quando e em qual registro." }));
  add(new Win(root, {
    layout: [ly(0, L.SPLIT), ly(2.6, L.SPLIT), ly(3.5, L.FULL)],
    shots: [[0, "u01-auditoria"]],
    cam: [[0, 800, 450, 1], [2.4, 800, 450, 1.05], [3.3, 560, 520, 1.55], [5.6, 560, 520, 1.55], [6.2, 1000, 520, 1.55], [7.0, 1000, 520, 1.55], [7.4, 1250, 520, 1.55], [8.3, 1250, 520, 1.55], [9.0, 900, 700, 1.42], [11, 900, 700, 1.44]],
    spots: [sp(3.6, 4.6, [335, 300, 150, 580], "Data"), sp(4.6, 5.6, [490, 300, 210, 580], "Usuário"), sp(6.0, 7.0, [862, 300, 240, 580], "Entidade"), sp(7.3, 8.4, [1385, 300, 115, 580], "Ação"), sp(8.9, 10.6, ROW(721), "Reserva do pedido")],
  }));
  add(new Chip(root, { pos: CHIP_FULL, items: [[8.9, 10.6, "Trilha operacional", "Rafael Sampaio · Pedido de venda · Reserva"]] }));
});

// ===================================================================== 13 O FLUXO COMPLETO
scene("O fluxo completo", 20, { chapter: "O fluxo completo", in: "fade", out: "fade", ov: 0.9 }, (root, add) => {
  const comp = st(el("div", "abs", root), { width: "1920px", height: "1080px", transformOrigin: "960px 540px" });
  const N = [
    ["Cliente", "k01-clientes", [289, 470, 760, 427.5], "Granito Serviços OD Ltda."],
    ["Comercial", "s05-aprovado", [289, 95, 760, 427.5], "PV-0223 · Aprovado"],
    ["Estoque", "s07-reservado", [700, 120, 760, 427.5], "Reservado 100%"],
    ["Financeiro", "s22-contas-receber-recebido", [289, 260, 760, 427.5], "CR-0119 · Recebido"],
    ["Fiscal", "s20-nfe-pronta", [289, 240, 760, 427.5], "DF-0058 · NF-e pronta"],
    ["Logística", "s15-expedicao-entregue", [289, 240, 760, 427.5], "EXP-0065 · Entregue"],
  ];
  const XS = N.map((_, i) => 260 + i * 280), RY = 540, CW = 340, CH = (CW * 9) / 16;
  const rail = st(el("div", "abs", comp), { left: "120px", top: px(RY - 1), width: "1680px", height: "2px", background: "rgba(243,244,245,.12)" });
  const fill = st(el("div", "abs", comp), { left: "120px", top: px(RY - 1), height: "2px", background: "linear-gradient(90deg,rgba(255,148,8,.2),#ff9408)", boxShadow: "0 0 14px rgba(255,148,8,.55)" });
  const ARR = [1.8, 3.8, 5.8, 7.8, 9.8, 11.8];
  const nodes = N.map(([lb, shot, r, code], i) => {
    const up = i % 2 === 0, cy = up ? RY - 70 : RY + 70;
    const stem = st(el("div", "abs", comp), { left: px(XS[i] - 1), top: px(up ? RY - 70 : RY + 9), width: "2px", height: "61px", background: "rgba(243,244,245,.14)" });
    const dot = st(el("div", "abs", comp), { left: px(XS[i] - 10), top: px(RY - 10), width: "20px", height: "20px", borderRadius: "50%", border: "2px solid rgba(243,244,245,.3)", background: "#0e0b09", boxSizing: "border-box" });
    const c = st(el("div", "card", comp), { left: px(XS[i]), top: px(cy) });
    const th = crop(c, shot, r, CW);
    const lbl = el("div", "lb", null, lb);
    const sb = el("div", "sb", null, code);
    st(lbl, { fontSize: "18px" }); st(sb, { fontSize: "15px" });
    // rótulos sempre do lado de fora do trilho
    if (up) { c.insertBefore(sb, th); c.insertBefore(lbl, sb); st(lbl, { margin: "0 0 6px" }); st(sb, { margin: "0 0 12px" }); }
    else { c.appendChild(lbl); c.appendChild(sb); }
    return { stem, dot, c, th, lbl, sb, up };
  });
  const tok = st(el("div", "token", comp, `<div class="a">PV-0223</div>`), { top: px(RY - 22), padding: "9px 16px", transform: "translate(-50%,0)", zIndex: 5 });
  const kick = add(new Stmt(root, { y: 96, lines: [[0.4, ...KICK("Um pedido atravessa a empresa")]], t1: 12.6 }));
  const words = st(el("div", "abs", root), { left: "0", top: "860px", width: "1920px", display: "flex", justifyContent: "center", gap: "42px", fontFamily: "ISerif", fontSize: "64px" });
  const W3 = ["Uma operação.", "Vários módulos.", "<i>Um único sistema.</i>"].map((h) => el("span", "line", words, h));
  ARR.forEach((a, i) => cue(a, "step", { i }));
  cue(13.2, "text"); cue(14.2, "text"); cue(15.2, "swell");
  return (t) => {
    // posição do token no trilho
    let x = XS[0], k = -1;
    for (let i = 0; i < ARR.length; i++) if (t >= ARR[i] - 1.0) k = i;
    if (k >= 0) { const from = Math.max(0, k - 1); x = k === 0 ? XS[0] : lerp(XS[from], XS[k], P(t, ARR[k] - 1.0, ARR[k], E.io)); }
    st(tok, { left: px(x), opacity: P(t, 0.9, 1.5) * (1 - P(t, 12.4, 13.0)) });
    st(fill, { width: px(Math.max(0, x - 120)) });
    st(rail, { opacity: P(t, 0.2, 1.0) });
    nodes.forEach((n, i) => {
      const ap = P(t, 0.3 + i * 0.12, 1.0 + i * 0.12, E.o), lit = P(t, ARR[i] - 0.05, ARR[i] + 0.45, E.o);
      const pulse = Math.max(0, 1 - Math.abs(t - ARR[i]) / 0.4);
      st(n.c, { opacity: ap, transform: `translate(-50%,${n.up ? "-100%" : "0%"}) translateY(${px((n.up ? -1 : 1) * 18 * (1 - ap))}) scale(${1 + 0.05 * pulse})`, transformOrigin: n.up ? "50% 100%" : "50% 0%" });
      st(n.th, { filter: `grayscale(${(1 - lit).toFixed(2)}) brightness(${(0.45 + 0.55 * lit).toFixed(2)})`, boxShadow: lit > 0 ? `0 0 0 ${(1.5 * lit).toFixed(2)}px rgba(255,148,8,${(0.9 * lit).toFixed(2)}),0 24px 60px rgba(0,0,0,.5),0 0 ${(40 * lit).toFixed(0)}px rgba(255,148,8,${(0.25 * lit).toFixed(2)})` : "" });
      n.lbl.style.color = lit > 0.5 ? "#f3f4f5" : "rgba(243,244,245,.5)";
      n.sb.style.opacity = 0.35 + 0.65 * lit;
      st(n.stem, { opacity: ap, background: lit > 0.01 ? `rgba(255,148,8,${(0.2 + 0.7 * lit).toFixed(2)})` : "rgba(243,244,245,.14)" });
      st(n.dot, { opacity: ap, borderColor: lit > 0.01 ? "#ff9408" : "rgba(243,244,245,.3)", background: lit > 0.5 ? "#ff9408" : "#0e0b09", boxShadow: lit > 0.01 ? `0 0 ${(20 * lit + 16 * pulse).toFixed(0)}px rgba(255,148,8,.7)` : "" });
    });
    // câmera: acompanha o token, depois recua para o texto e encolhe para o "tile" da empresa A
    const follow = 1 - P(t, 12.2, 13.2);
    const up = P(t, 12.3, 13.4, E.io5);
    const shr = P(t, 17.4, 19.2, E.io5);
    const s = (1.03 + 0.02 * P(t, 0, 12)) * lerp(1, 0.86, up) * lerp(1, 0.198, shr);
    const tx = (-(x - 960) * 0.06 * follow) * (1 - shr) + (300 - 960) * shr, ty = lerp(0, -70, up) * (1 - shr) + (560 - 540) * shr;
    st(comp, { transform: `translate(${px(tx)},${px(ty)}) scale(${s.toFixed(4)})`, opacity: 1 - P(t, 18.8, 19.4) });
    W3.forEach((w, i) => reveal(w, t, 13.0 + i * 1.0, 17.6, { dy: 26, blur: 12, fi: 0.9, fo: 0.6 }));
  };
});

// ===================================================================== 14 MULTIEMPRESA
scene("Multiempresa", 14, { chapter: "Multiempresa", in: "fade", out: "none", ov: 0.8 }, (root, add) => {
  const T = [["A", "Órbita Distribuidora", "d01-dashboard"], ["B", "Aster Industrial", "x-aster-dashboard"], ["C", "Vita Suprimentos", "x-vita-dashboard"], ["D", "Horizon Serviços", "x-horizon-dashboard"]];
  const XS = [300, 740, 1180, 1620], TY = 560, TW = 380, TH = 213.75;
  const svg = el("div", "abs", root, `<svg width="1920" height="1080"></svg>`).firstChild;
  const cen = st(el("div", "abs", root), { left: "760px", top: "120px", width: "400px", textAlign: "center" });
  cen.innerHTML = nucleoSVG(54) + `<div style="margin-top:12px;font-weight:600;font-size:17px;letter-spacing:.2em;text-transform:uppercase">Administração Central</div><div style="margin-top:6px;font-family:JMono;font-size:13px;letter-spacing:.06em;color:rgba(243,244,245,.5)">contrata módulos · governa o ciclo de vida</div>`;
  const paths = XS.map((x) => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", `M960 252 C 960 330, ${x} 340, ${x} ${TY - TH / 2 - 16}`);
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "#ff9408"); p.setAttribute("stroke-width", "1.6"); p.setAttribute("opacity", ".7");
    svg.appendChild(p);
    return p;
  });
  const tiles = T.map(([L_, name, shot], i) => {
    const w = st(el("div", "abs", root), { left: px(XS[i] - TW / 2), top: px(TY - TH / 2), width: px(TW) });
    const th = crop(w, shot, [0, 0, 1600, 900], TW);
    th.style.borderRadius = "10px";
    const lb = el("div", "", w, `<span style="font-family:JMono;color:#ff9408;margin-right:10px">${L_}</span>${name}`);
    st(lb, { marginTop: "16px", fontWeight: 600, fontSize: "19px", textAlign: "center" });
    const sb = el("div", "", w, "usuários próprios · dados próprios");
    st(sb, { marginTop: "6px", fontFamily: "JMono", fontSize: "13px", letterSpacing: ".06em", color: "rgba(243,244,245,.5)", textAlign: "center" });
    return { w, th, lb, sb };
  });
  const LOCK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff9408" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;
  const walls = [520, 960, 1400].map((x) => {
    const l = st(el("div", "abs", root), { left: px(x - 0.75), top: px(TY - 150), width: "1.5px", height: "300px", background: "linear-gradient(180deg,transparent,rgba(243,244,245,.35),transparent)", transformOrigin: "50% 50%" });
    const k = st(el("div", "abs", root, LOCK), { left: px(x - 17), top: px(TY - 17), width: "34px", height: "34px", borderRadius: "50%", background: "#0e0b09", border: "1.5px solid rgba(255,148,8,.6)", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" });
    return { l, k };
  });
  const probe = st(el("div", "code", root, "Órbita → Aster"), { top: px(TY + 150) });
  const deny = st(el("div", "abs", root, "acesso entre empresas: negado"), { left: "330px", top: px(TY + 200), width: "380px", textAlign: "center", fontFamily: "JMono", fontSize: "16px", letterSpacing: ".08em", color: "#ff9408" });
  add(new Stmt(root, { y: 900, lines: [[5.0, "Uma plataforma preparada para múltiplas empresas.", { size: 56 }]], t1: 11.8 }));
  cue(1.0, "swap"); cue(2.0, "connect"); cue(3.6, "lock"); cue(8.15, "blocked");
  return (t) => {
    const out = P(t, 11.4, 12.3);
    tiles.forEach(({ w, th, lb, sb }, i) => {
      const ap = i === 0 ? P(t, 0.0, 0.7) : P(t, 0.8 + i * 0.18, 1.5 + i * 0.18, E.o);
      if (i === 0) {
        // expansão do tile A até a janela cheia (continua na cena 15)
        const e = P(t, 11.8, 13.15, E.io5);
        const x = lerp(XS[0] - TW / 2, L.FULL[0], e), y = lerp(TY - TH / 2, L.FULL[1], e), ww = lerp(TW, L.FULL[2], e);
        st(w, { left: px(x), top: px(y), width: px(ww), opacity: ap });
        const s = ww / TW;
        st(th, { width: px(ww), height: px((ww * 9) / 16), backgroundSize: `${px(ww)} ${px((ww * 9) / 16)}`, borderRadius: px(lerp(10, 14, e)) });
        lb.style.opacity = sb.style.opacity = String(1 - out);
      } else st(w, { opacity: ap * (1 - out), transform: `translateY(${px(24 * (1 - ap))})` });
      sb.style.visibility = t > 4.0 ? "visible" : "hidden";
      if (i > 0 || t < 11.4) sb.style.opacity = String(P(t, 4.0, 4.6) * (1 - out));
    });
    st(cen, { opacity: P(t, 1.6, 2.3, E.o) * (1 - out), transform: `translateY(${px(-16 * (1 - P(t, 1.6, 2.3, E.o)))})` });
    paths.forEach((p, i) => {
      const L0 = p.getTotalLength ? p.getTotalLength() : 400;
      const dp = P(t, 1.9 + i * 0.12, 2.7 + i * 0.12, E.o);
      p.setAttribute("stroke-dasharray", `${L0} ${L0}`);
      p.setAttribute("stroke-dashoffset", (L0 * (1 - dp)).toFixed(1));
      p.setAttribute("opacity", (0.7 * (1 - out)).toFixed(3));
    });
    walls.forEach(({ l, k }, i) => {
      const a = P(t, 3.3 + i * 0.1, 4.0 + i * 0.1, E.o) * (1 - out);
      const flash = i === 0 ? Math.max(0, 1 - Math.abs(t - 8.15) / 0.5) : 0;
      st(l, { opacity: a, transform: `scaleY(${a})` });
      st(k, { opacity: a, transform: `scale(${1 + 0.35 * flash})`, boxShadow: flash > 0 ? `0 0 ${(30 * flash).toFixed(0)}px rgba(255,148,8,.8)` : "" });
    });
    // tentativa de acesso cruzado: o token bate na parede e volta
    const go = P(t, 7.0, 8.1, E.io), back = P(t, 8.2, 9.0, E.o);
    st(probe, { left: px(lerp(330, 455, go) - 125 * back * 0.6), opacity: P(t, 6.8, 7.2) * (1 - P(t, 10.0, 10.5)) });
    st(deny, { opacity: P(t, 8.25, 8.7) * (1 - P(t, 10.0, 10.5)) });
  };
});

// ===================================================================== 15 DASHBOARD
scene("Dashboard", 12, { chapter: "Dashboard", in: "none", out: "none", ov: 0.7 }, (root, add) => {
  add(new Win(root, {
    layout: [ly(0, L.FULL)],
    shots: [[0, "d01-dashboard"], [6.2, "d02-dashboard-fluxo", "fade", 0.6], [8.8, "d04-painel-executivo", "fade", 0.6]],
    cam: [[0, 800, 450, 1], [0.6, 800, 450, 1], [2.4, 540, 250, 1.45], [3.8, 920, 380, 1.5], [5.6, 680, 600, 1.4], [6.6, 800, 330, 1.15], [8.4, 800, 300, 1.22], [9.4, 900, 330, 1.25], [10.8, 800, 450, 1], [12, 800, 450, 1]],
    spots: [sp(4.7, 5.9, [289, 475, 754, 319], "Precisa de atenção")],
    env: (t) => P(t, 0, 2) * (1 - P(t, 9.6, 11.0)),
  }));
  add(new Chip(root, { pos: CHIP_FULL, items: [[1.0, 3.7, "Início", "Visão consolidada do perfil"], [4.0, 6.0, "Início", "Pendências reais dos módulos"], [6.8, 8.6, "Início", "Fluxo do ERP"], [9.2, 10.6, "Painéis", "Painel executivo"]] }));
});

// ===================================================================== 16 ENCERRAMENTO
scene("Encerramento", 13, { hud: [0, 1.0], in: "none", out: "fade", ov: 0 }, (root, add) => {
  const win = add(new Win(root, { shots: [[0, "d04-painel-executivo"]], layout: [ly(0, L.FULL), ly(0.4, L.FULL), ly(3.0, [840, 472.5, 240, 0, 0]), ly(4.3, [930, 523.1, 60, 0, 0], 1, 0)], cam: [[0, 800, 450, 1]], drift: 0 }));
  const MODS = ["Comercial", "Estoque", "Compras", "Financeiro", "Fiscal", "Logística", "Administração"];
  const svg = el("div", "abs", root, `<svg width="1920" height="1080"></svg>`).firstChild;
  const labs = MODS.map((m, i) => {
    const a = (-90 + (i * 360) / MODS.length) * (Math.PI / 180);
    const e = st(el("div", "abs", root, `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff9408;margin-right:12px;vertical-align:middle"></span>${m}`), { fontWeight: 600, fontSize: "19px", letterSpacing: ".2em", textTransform: "uppercase", whiteSpace: "nowrap" });
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l.setAttribute("stroke", "#ff9408"); l.setAttribute("stroke-width", "1.4");
    svg.appendChild(l);
    return { e, l, x: 960 + 520 * Math.cos(a), y: 540 + 330 * Math.sin(a) };
  });
  const glow = st(el("div", "abs", root), { left: "660px", top: "240px", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(closest-side,rgba(255,148,8,.32),transparent)" });
  const logo = st(el("div", "abs", root, nucleoSVG(180)), { width: "180px", height: "180px" });
  const rects = [...logo.querySelectorAll(".nb")], core = logo.querySelector(".nc");
  const word = st(el("div", "abs", root, WORDMARK), { fontWeight: 600, fontSize: "104px", letterSpacing: ".01em", whiteSpace: "nowrap", lineHeight: "1" });
  word.querySelector("i").style.cssText = "font-style:normal;color:rgba(243,244,245,.42)";
  add(new Stmt(root, { y: 640, t1: 9.0, lines: [[6.3, "Uma plataforma.", { size: 80 }], [7.2, "Toda a operação.", { size: 80, italic: true, color: "rgba(243,244,245,.8)" }]] }));
  const disc = st(el("div", "abs", root, "Capturas reais do ambiente de demonstração ATLAS.ERP · dados fictícios"), { left: "0", top: "980px", width: "1920px", textAlign: "center", fontSize: "15px", letterSpacing: ".06em", color: "rgba(243,244,245,.42)" });
  const black = st(el("div", "abs", root), { width: "1920px", height: "1080px", background: "#000" });
  cue(1.7, "connect"); cue(3.2, "converge", { dur: 1.6 }); cue(4.75, "resolve"); cue(9.4, "lockup");
  const dirs = [[-30, 0], [0, -30], [30, 0], [0, 30]];
  return (t) => {
    labs.forEach(({ e, l, x, y }, i) => {
      const ap = P(t, 1.5 + i * 0.1, 2.2 + i * 0.1, E.o), cv = P(t, 3.2 + i * 0.04, 4.6, E.io5);
      const cx = lerp(x, 960, cv), cy = lerp(y, 540, cv);
      st(e, { left: px(cx), top: px(cy), opacity: ap * (1 - cv), transform: `translate(-50%,-50%) scale(${1 - 0.6 * cv})`, filter: `blur(${(6 * cv).toFixed(2)}px)` });
      const lp = P(t, 2.0 + i * 0.08, 2.8 + i * 0.08, E.o);
      const ex = lerp(960, cx, lp), ey = lerp(540, cy, lp);
      l.setAttribute("x1", lerp(cx, 960, 0.0)); l.setAttribute("y1", cy); l.setAttribute("x2", lerp(cx, 960, lp * 0.82)); l.setAttribute("y2", lerp(cy, 540, lp * 0.82));
      l.setAttribute("opacity", (0.55 * lp * (1 - cv)).toFixed(3));
    });
    // Núcleo se forma onde a janela some
    const m = P(t, 9.2, 10.2, E.io5);
    const wordW = word.offsetWidth || 540, gap = 44, total = 150 + gap + wordW;
    const lx = lerp(960, 960 - total / 2 + 75, m), lyy = lerp(lerp(540, 420, P(t, 5.8, 6.6, E.io5)), 540, m), size = lerp(180, 150, m);
    st(logo, { left: px(lx - 90), top: px(lyy - 90), transform: `scale(${size / 180})`, transformOrigin: "50% 50%" });
    rects.forEach((r, i) => {
      const p = P(t, 4.0 + i * 0.08, 5.0 + i * 0.08, E.o5);
      r.style.transform = `translate(${dirs[i][0] * (1 - p)}px,${dirs[i][1] * (1 - p)}px)`;
      r.style.opacity = p;
    });
    core.style.transform = `scale(${P(t, 3.9, 4.6, E.back)})`;
    st(glow, { left: px(lx - 300), top: px(lyy - 300), opacity: P(t, 4.5, 5.3) * (0.8 + 0.2 * Math.sin(t * 2.4)) * (1 - P(t, 11.6, 12.6)) });
    const wa = P(t, 9.5, 10.4, E.o);
    st(word, { left: px(960 - total / 2 + 150 + gap + 24 * (1 - wa)), top: px(540 - 52), opacity: wa, filter: `blur(${(8 * (1 - wa)).toFixed(2)}px)` });
    reveal(disc, t, 10.3, null, { dy: 10, blur: 4 });
    black.style.opacity = P(t, 11.7, 12.9, E.io);
  };
});
