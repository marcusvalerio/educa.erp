// EDUCA.ERP — landing: cenas com GSAP + ScrollTrigger (v3).
//
// Direção (HyperFrames aplicado à web):
// - uma linha do tempo por cena; entradas com .out, saídas com .in,
//   deslocamentos entre posições com .inOut;
// - causa e efeito: um sinal percorre a ligação e só então o destino acende;
// - cada linha liga dois elementos reais; a câmera aproxima exatamente a região
//   explicada (escala + contratranslação calculadas no build);
// - só transform e opacity (clip-path nas revelações curtas).
// Sem GSAP ou com prefers-reduced-motion, nada aqui roda e a página fica no
// estado final, completa.
(() => {
  const root = document.documentElement;
  const done = () => root.classList.remove("intro");
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!gsap || !ST || reduce) {
    done();
    return;
  }
  gsap.registerPlugin(ST);
  const EDUCA = (window.EDUCA = window.EDUCA || {});
  const q = (sel, el = document) => el.querySelector(sel);
  const qa = (sel, el = document) => [...el.querySelectorAll(sel)];
  const wide = (px) => window.matchMedia(`(min-width: ${px}px)`).matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // Um ponto que percorre um <path> SVG (o "sinal"): tween de 0 a 1 sobre o
  // comprimento. Retorna o tween para ser posto na linha do tempo.
  const travel = (dot, path, opts = {}) => {
    const len = path.getTotalLength();
    const s = { t: 0 };
    return gsap.to(s, {
      t: 1,
      duration: opts.duration ?? 0.5,
      ease: opts.ease ?? "power1.inOut",
      onStart: () => gsap.set(dot, { opacity: 1 }),
      onUpdate: () => {
        const pt = path.getPointAtLength(s.t * len);
        dot.setAttribute("cx", pt.x.toFixed(1));
        dot.setAttribute("cy", pt.y.toFixed(1));
      },
      onComplete: opts.onComplete,
    });
  };

  // Comprimento do traço na tela: com vector-effect: non-scaling-stroke o
  // tracejado é medido em pixels de tela, não em unidades do viewBox.
  const dashLen = (p) => {
    const len = p.getTotalLength();
    if (getComputedStyle(p).vectorEffect !== "non-scaling-stroke") return len;
    const m = p.getScreenCTM();
    return m ? len * Math.hypot(m.a, m.b) : len;
  };

  /* ================================================================== abertura */
  const hero = q(".hero");
  if (hero) {
    // Abaixo de 1100 px: composição vertical (.hs).
    const order = q(".hs-order", hero);
    const sats = qa(".hs-sat", hero);
    const gest = q(".hs-gestao", hero);
    const frags = [order, ...sats, gest];
    const hots = qa(".hs-hot", hero);
    const lines = q(".hs-lines", hero);
    const sigs = qa(".hs-sig", hero);
    const titleLines = qa(".ln > span", hero);
    const media = (f) => q(".hs-media", f);
    const scene = wide(1100);
    const side = [q(".lead", hero), q(".actions", hero), scene ? q(".hx-legend", hero) : q(".hs-legend", hero)];

    // Desktop: o pedido PV-001013 como objeto (.hx).
    const hx = q(".hx", hero);
    const hxOrder = q(".hx-order", hero);
    const hxCam = q(".hx-cam", hero);
    const hxParts = qa(".hx-order > .hx-part", hero);
    const hxPart = (id) => q(`.hx-part[data-part="${id}"]`, hero);
    const hxDest = (id) => q(`.hx-dest[data-dest="${id}"]`, hero);
    const hxDests = qa(".hx-dest", hero);
    const hxLinks = qa(".hx-link", hero);
    const hxDraw = () => EDUCA.hxDraw?.();
    const cssNum = (el, v) => parseFloat(getComputedStyle(el).getPropertyValue(v)) || 0;

    const tl = gsap.timeline({ delay: 0.1, onComplete: live });
    // Desktop: a imagem do pedido é o LCP e entra em ~0,3 s; a sequência pode
    // respirar. Tablet e celular: o título vem primeiro, em ritmo mais curto.
    tl.timeScale(scene ? 1.15 : 1.3);

    // Vazio: só a grade das colunas, subindo devagar.
    tl.fromTo(".hero-bg .gl", { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 1.4, ease: "power2.out", stagger: { each: 0.03, from: "center" } }, 0);

    if (scene && hx) {
      const U = hx.clientWidth / 1440;
      const RY = cssNum(hxOrder, "--ry");
      const RX = cssNum(hxOrder, "--rx");
      const pop = hxPart("estoque");
      const finPart = hxPart("financeiro");
      // Posição final de cada parte e tela (definida no CSS, em unidades).
      const end = new Map([...hxParts, ...hxDests].map((el) => [el, { x: cssNum(el, "--dx") * U, y: cssNum(el, "--dy") * U, z: cssNum(el, "--z") * U }]));
      const head = q(".hero-head", hero);
      gsap.set(head, { opacity: 0 });
      gsap.set(q(".hx-legend", hero), { opacity: 0 });
      gsap.set(hxOrder, { rotationY: 0, rotationX: 0, transformOrigin: "0% 50%" });
      gsap.set(hxParts, { x: 0, y: 0, z: 0, opacity: 0 });
      gsap.set(pop, { y: 60 * U, scale: 0.35, transformOrigin: "50% 100%" });
      gsap.set(hxDests, { z: -260 * U, opacity: 0 });
      gsap.set(qa(".hx-socket", hero), { opacity: 0 });
      gsap.set(q(".hx-face", hero), { opacity: 0, y: 10 * U });
      hxLinks.forEach((g) => (g._t = 0));
      hxDraw();
      // Câmera documental: abre perto do título do pedido (PV-001013, cliente,
      // Aprovado), faz uma panorâmica até as ações (Reservar estoque, Gerar
      // conta a receber) e só então recua até o quadro final.
      const oL = hxOrder.offsetLeft;
      const oT = hxOrder.offsetTop;
      const oW = hxOrder.offsetWidth;
      const oH = hxOrder.offsetHeight;
      // Origem fixa em (0, 0): a translação leva o ponto de interesse ao centro.
      const shot = (fx, fy, S) => ({ scale: S, x: hx.clientWidth * 0.5 - S * (oL + oW * fx), y: hx.clientHeight * 0.46 - S * (oT + oH * fy) });
      gsap.set(hxCam, { transformOrigin: "0px 0px", ...shot(0.26, 0.09, 2.5) });
      tl.eventCallback("onUpdate", hxDraw);
      const reveal = (id, at, duration = 0.45) => {
        const g = q(`.hx-link[data-link="${id}"]`, hero);
        const o = { t: 0 };
        tl.to(o, { t: 1, duration, ease: "power1.inOut", onUpdate: () => (g._t = o.t) }, at);
      };

      // Luz: o pedido acende e uma faixa de luz atravessa a tela.
      tl.to(q(".hx-face", hero), { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.2);
      tl.fromTo(q(".hx-sheen", hero), { opacity: 0, xPercent: -70 }, { opacity: 1, xPercent: 70, duration: 1.1, ease: "power2.inOut" }, 0.5);
      tl.to(q(".hx-sheen", hero), { opacity: 0, duration: 0.3, ease: "power1.in" }, 1.4);
      // Panorâmica até as ações do pedido.
      const pan = shot(0.72, 0.1, 2.2);
      tl.to(hxCam, { x: pan.x, y: pan.y, scale: pan.scale, duration: 0.95, ease: "power2.inOut" }, 0.95);
      // Silêncio curto; depois o recuo: a câmera se afasta e o pedido ganha
      // perspectiva, como um objeto sobre a mesa.
      tl.to(hxCam, { scale: 1, x: 0, y: 0, duration: 1.6, ease: "power3.inOut" }, 2.05);
      tl.to(hxOrder, { rotationY: RY, rotationX: RX, duration: 1.6, ease: "power3.inOut" }, 2.05);
      // As partes que geram trabalho em outra área se destacam do pedido.
      tl.to(qa(".hx-socket", hero), { opacity: 1, duration: 0.4 }, 2.75);
      hxParts
        .filter((p) => p !== pop)
        .forEach((p, i) => {
          tl.set(p, { opacity: 1 }, 2.75 + i * 0.07);
          tl.to(p, { z: p === finPart ? end.get(p).z * 0.45 : end.get(p).z, duration: 0.9, ease: "power3.out" }, 2.75 + i * 0.07);
        });
      // Consequências, uma a uma, cada uma saindo do lugar exato que a causa.
      let t = 3.45;
      reveal("estoque", t, 0.4); // Reservar estoque → a janela real de reserva
      tl.to(pop, { opacity: 1, y: 0, z: end.get(pop).z, scale: 1, duration: 0.75, ease: "expo.out" }, t + 0.25);
      t += 0.42;
      tl.to(finPart, { x: end.get(finPart).x, y: end.get(finPart).y, z: end.get(finPart).z, duration: 0.85, ease: "power3.inOut" }, t); // o título CR-0002 sai do pedido
      reveal("financeiro", t + 0.1, 0.55);
      t += 0.46;
      reveal("fiscal", t, 0.5); // pela API: tracejado
      tl.to(hxDest("fiscal"), { opacity: 1, z: end.get(hxDest("fiscal")).z, duration: 0.75, ease: "expo.out" }, t + 0.35);
      t += 0.42;
      reveal("logistica", t, 0.5);
      tl.to(hxDest("logistica"), { opacity: 1, z: end.get(hxDest("logistica")).z, duration: 0.75, ease: "expo.out" }, t + 0.35);
      // Convergência: tudo chega à Gestão.
      const cv = t + 0.62;
      ["g-estoque", "g-financeiro", "g-fiscal", "g-logistica"].forEach((id, k) => reveal(id, cv + k * 0.06, 0.55));
      tl.to(hxDest("gestao"), { opacity: 1, z: end.get(hxDest("gestao")).z, duration: 0.8, ease: "expo.out" }, cv + 0.5);
      // Só então a declaração.
      const hd = cv + 0.6;
      tl.set(head, { opacity: 1 }, hd);
      tl.fromTo(q(".eyebrow", hero), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, hd);
      tl.fromTo(titleLines, { yPercent: 112, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 1.0, ease: "expo.out", stagger: 0.1 }, hd + 0.05);
      tl.fromTo(q(".fire-bar", hero), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.inOut" }, hd + 0.7);
      tl.fromTo(side, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.08 }, hd + 0.3);
    } else if (wide(700)) {
      // Tablet: pedido e áreas em grade, revelados em ordem de causa.
      tl.fromTo(q(".eyebrow", hero), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, 0.2);
      tl.fromTo(titleLines, { yPercent: 112, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 1, ease: "expo.out", stagger: 0.1 }, 0.3);
      tl.fromTo(q(".fire-bar", hero), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.inOut" }, 1.0);
      tl.fromTo(side, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.08 }, 0.8);
      tl.fromTo(frags, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.12 }, 1.0);
      tl.fromTo(hots, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)", stagger: 0.08 }, 1.5);
    } else {
      // Celular: declaração primeiro; depois a espinha desce com a rolagem e
      // cada área acende quando a linha chega até ela.
      tl.fromTo(q(".eyebrow", hero), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, 0.15);
      tl.fromTo(titleLines, { yPercent: 112, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 1, ease: "expo.out", stagger: 0.1 }, 0.25);
      tl.fromTo(q(".fire-bar", hero), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.inOut" }, 0.95);
      tl.fromTo(side, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.08 }, 0.7);
      tl.fromTo(order, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, 0.9);
      tl.fromTo(hots, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)", stagger: 0.1 }, 1.4);
      [...sats, gest].forEach((f) => {
        gsap.set(f, { "--grow": 0 });
        const t = gsap.timeline({ scrollTrigger: { trigger: f, start: "top 88%", end: "top 55%", scrub: 0.5 } });
        t.to(f, { "--grow": 1, duration: 0.5, ease: "none" }, 0);
        t.fromTo(media(f), { clipPath: "inset(0% 100% 0% 0% round 8px)", opacity: 0.4 }, { clipPath: "inset(0% 0% 0% 0% round 8px)", opacity: 1, duration: 0.5, ease: "power2.out" }, 0.4);
      });
    }

    // A sequência completa roda uma vez por sessão; nas visitas seguintes a
    // página abre no estado final (com os sinais vivos).
    let seen = false;
    try {
      seen = sessionStorage.getItem("educa-intro") === "1";
      sessionStorage.setItem("educa-intro", "1");
    } catch {
      /* armazenamento bloqueado: a sequência roda normalmente */
    }
    if (seen) tl.progress(1);

    done();

    // Quem já está rolando ou usando o teclado não espera a sequência inteira.
    const hurry = () => tl.progress() < 1 && tl.timeScale(5);
    ["wheel", "touchmove", "keydown"].forEach((ev) => window.addEventListener(ev, hurry, { once: true, passive: true }));

    function live() {
      hero.classList.add("is-live");
      if (scene && hx) {
        tl.eventCallback("onUpdate", null);
        hxLinks.forEach((g) => (g._t = 1));
        const U = hx.clientWidth / 1440;
        // Sistema vivo: as partes e as telas flutuam de leve, cada uma no seu
        // tempo; as linhas acompanham (redesenho só com a abertura visível).
        [...hxParts.filter((p) => p.classList.contains("hx-feeds")), ...hxDests].forEach((el, i) =>
          gsap.to(el, { y: `+=${(i % 2 ? -5 : 5) * U}`, duration: 2.8 + (i % 4) * 0.45, ease: "sine.inOut", yoyo: true, repeat: -1 }),
        );
        let visible = true;
        new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);
        gsap.ticker.add(() => visible && hxDraw());
        hxDraw();
        EDUCA.startSignals?.(q(".hx-lines", hero));
        // Profundidade: a câmera inclina de leve com o ponteiro e recua ao rolar.
        if (finePointer) {
          gsap.set(hxCam, { transformOrigin: "50% 50%" });
          const ry = gsap.quickTo(hxCam, "rotationY", { duration: 1.1, ease: "power3.out" });
          const rx = gsap.quickTo(hxCam, "rotationX", { duration: 1.1, ease: "power3.out" });
          hero.addEventListener("pointermove", (e) => {
            const r = hero.getBoundingClientRect();
            ry(((e.clientX - r.left) / r.width - 0.5) * 4);
            rx(-((e.clientY - r.top) / r.height - 0.5) * 3);
          });
          hero.addEventListener("pointerleave", () => {
            rx(0);
            ry(0);
          });
        }
        gsap.to(hxCam, { y: -50 * U, scale: 0.97, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
        gsap.to(q(".hero-head", hero), { y: -60, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "60% top", scrub: true } });
        return;
      }
      gsap.set(frags.map(media), { clearProps: "clipPath" });
      gsap.set(frags, { clearProps: "opacity" });
      gsap.set(sigs, { opacity: 0 });
      sigs.forEach((c) => {
        c.setAttribute("cx", "0");
        c.setAttribute("cy", "0");
      });
      gsap.set(sigs, { clearProps: "opacity" });
      EDUCA.startSignals?.(lines);
    }

    // Foco: passar sobre uma parte do pedido ou uma tela acende a ligação
    // dela até a Gestão; o resto recua.
    if (scene && hx && finePointer) {
      const groups = {
        estoque: ["estoque", "g-estoque"],
        financeiro: ["financeiro", "g-financeiro"],
        fiscal: ["fiscal", "g-fiscal"],
        logistica: ["logistica", "g-logistica"],
        gestao: ["g-estoque", "g-financeiro", "g-fiscal", "g-logistica"],
      };
      const owners = {
        estoque: [hxPart("estoque")],
        financeiro: [hxPart("financeiro")],
        fiscal: [hxPart("docfiscal"), hxDest("fiscal")],
        logistica: [hxPart("andamento"), hxDest("logistica")],
        gestao: [hxDest("gestao")],
      };
      const setFocus = (k) => {
        if (k) hx.dataset.focus = k;
        else delete hx.dataset.focus;
        hxLinks.forEach((g) => g.classList.toggle("is-hot", Boolean(k) && groups[k].includes(g.dataset.link)));
        Object.entries(owners).forEach(([key, list]) => list.forEach((el) => el?.classList.toggle("is-hot", key === k || k === "gestao")));
      };
      Object.entries(owners).forEach(([k, list]) =>
        list.forEach((el) => {
          el?.addEventListener("pointerenter", () => setFocus(k));
          el?.addEventListener("pointerleave", () => setFocus(null));
        }),
      );
    }
  } else done();

  /* ================================================================== cenário: silos → um fio */
  const ledger = q(".ledger");
  if (ledger) {
    const rows = qa("li", ledger);
    const k = wide(760) ? 1 : 0.45;
    gsap.fromTo(
      rows,
      {
        x: (i) => (((i * 37) % 5) - 2) * 26 * k,
        y: (i) => (((i * 53) % 7) - 3) * 9 * k,
        rotation: (i) => (((i * 29) % 5) - 2) * 1.3,
        opacity: 0.4,
      },
      { x: 0, y: 0, rotation: 0, opacity: 1, ease: "none", stagger: 0.015, scrollTrigger: { trigger: ledger, start: "top 92%", end: "center 60%", scrub: 0.8 } },
    );
    gsap.fromTo(ledger, { "--silo": 1 }, { "--silo": 0, ease: "none", scrollTrigger: { trigger: ledger, start: "top 80%", end: "center 60%", scrub: 0.8 } });
    gsap.fromTo(q(".ledger-thread", ledger), { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: ledger, start: "center 70%", end: "bottom 55%", scrub: 0.6 } });
  }

  /* ================================================================== plataforma: a escala revelada */
  qa(".numbers .nb").forEach((nb, i) => {
    const units = qa(".units i", nb);
    gsap.fromTo(
      units,
      { opacity: 0.12, scale: 0.6 },
      { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out", stagger: { amount: units.length > 100 ? 1.3 : 0.7, from: "start" }, delay: i * 0.12, scrollTrigger: { trigger: nb, start: "top 85%", toggleActions: "play none none none" } },
    );
  });
  const envs = qa(".env-shot");
  if (envs.length && wide(1100)) {
    gsap.fromTo(
      envs,
      { xPercent: (i) => [70, 0, -70][i], yPercent: (i) => [8, 0, 8][i], rotationY: (i) => [-14, 0, 14][i], scale: (i) => (i === 1 ? 1 : 0.9), transformPerspective: 1400 },
      { xPercent: 0, yPercent: 0, rotationY: 0, scale: 1, ease: "none", scrollTrigger: { trigger: q(".envs"), start: "top 88%", end: "top 38%", scrub: 0.7 } },
    );
  }

  /* ================================================================== siga um pedido */
  const journey = q(".journey");
  const camVals = (cam) => ({ S: Number(cam.dataset.s), tx: Number(cam.dataset.tx), ty: Number(cam.dataset.ty) });
  if (journey && wide(1100) && window.innerHeight >= 620) {
    // Cena fixa, câmera documental: um tempo de abertura (o pedido na origem
    // da raia) e seis etapas; em cada uma, a tela entra, a câmera aproxima a
    // região explicada, a legenda "em foco" confirma o que se vê e, nas
    // etapas na tela, o cursor clica no botão real.
    journey.classList.add("is-cinema");
    const pin = q(".jc", journey);
    const steps = qa(".step", journey);
    const layers = qa(".jc-layer", journey);
    const overs = qa(".jc-over", journey);
    const calls = qa(".jc-callout", journey);
    const routes = qa(".jc-frame .shot-route", journey);
    const PRE = 0.35;
    const tl = gsap.timeline({ defaults: { ease: "none" } });
    gsap.set(steps, { opacity: 0 });
    gsap.set(steps[0], { opacity: 1 });
    gsap.set(layers, { opacity: 0 });
    gsap.set(layers[0], { opacity: 1 });
    tl.to({}, { duration: PRE }, 0);
    layers.forEach((layer, i) => {
      const t = PRE + i;
      const cam = q(".cam", layer);
      const { S, tx, ty } = camVals(cam);
      const focus = q(".cam-focus", layer);
      const cursor = q(".cam-cursor", layer);
      if (i > 0) {
        // O ambiente anterior perde prioridade e sai para o lado; o próximo entra.
        tl.to(layers[i - 1], { opacity: 0, xPercent: -4, scale: 1.03, duration: 0.18, ease: "power2.in" }, t - 0.05);
        tl.fromTo(layer, { opacity: 0, xPercent: 4, scale: 0.97 }, { opacity: 1, xPercent: 0, scale: 1, duration: 0.22, ease: "power2.out" }, t);
        tl.to(steps[i - 1], { opacity: 0, y: -26, duration: 0.14, ease: "power2.in" }, t - 0.06);
        tl.fromTo(steps[i], { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.22, ease: "power3.out" }, t + 0.02);
        tl.to([overs[i - 1], calls[i - 1]], { opacity: 0, y: 8, duration: 0.1, ease: "power2.in" }, t - 0.06);
      }
      tl.fromTo(cam, { scale: 1, xPercent: 0, yPercent: 0 }, { scale: S, xPercent: tx, yPercent: ty, duration: 0.4, ease: "power2.inOut" }, t + 0.14);
      // Câmera na mão: uma deriva lenta enquanto o visitante lê.
      tl.to(cam, { scale: S * 1.02, duration: 0.4, ease: "sine.inOut" }, t + 0.56);
      if (focus) tl.fromTo(focus, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.14, ease: "power2.out" }, t + 0.42);
      tl.fromTo(calls[i], { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.14, ease: "power3.out" }, t + 0.46);
      if (cursor) {
        const arrow = q("svg", cursor);
        const ripple = q(".cam-ripple", cursor);
        tl.fromTo(cursor, { opacity: 0, x: 140, y: 110, scale: 1 / S }, { opacity: 1, x: 0, y: 0, scale: 1 / S, duration: 0.22, ease: "power2.out" }, t + 0.5);
        tl.to(arrow, { scale: 0.8, duration: 0.03 }, t + 0.74).to(arrow, { scale: 1, duration: 0.05 }, t + 0.77);
        tl.fromTo(ripple, { scale: 0.3, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 0.16 }, t + 0.75);
      }
      tl.fromTo(overs[i], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.14, ease: "power3.out" }, t + 0.56);
    });
    tl.to({}, { duration: 0.35 }, PRE + 5.65);
    let lastIdx = -2;
    EDUCA.journeyActivate?.(-1);
    ST.create({
      trigger: pin,
      pin: true,
      start: "top top",
      end: () => `+=${Math.round(window.innerHeight * 5.8)}`,
      scrub: 0.7,
      animation: tl,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate(self) {
        const time = self.progress * tl.duration();
        const idx = time < PRE * 0.8 ? -1 : Math.min(layers.length - 1, Math.floor(time - PRE + 0.03));
        if (idx !== lastIdx) {
          lastIdx = idx;
          EDUCA.journeyActivate?.(idx);
          routes.forEach((r, k) => r.classList.toggle("is-on", k === Math.max(0, idx)));
        }
      },
    });
    routes[0]?.classList.add("is-on");
  } else if (journey) {
    // Lista (tablet, celular e telas baixas): cada tela aproxima a sua região
    // ao passar; a legenda "em foco" acompanha.
    qa(".step", journey).forEach((step) => {
      const shot = q(".step-shot", step);
      const cam = q(".cam", shot);
      const { S, tx, ty } = camVals(cam);
      const focus = q(".cam-focus", shot);
      const cursor = q(".cam-cursor", shot);
      const tl = gsap.timeline({ scrollTrigger: { trigger: shot, start: "top 78%", end: "center 42%", scrub: 0.6 } });
      tl.fromTo(cam, { scale: 1, xPercent: 0, yPercent: 0 }, { scale: S, xPercent: tx, yPercent: ty, duration: 1, ease: "power1.inOut" }, 0);
      if (focus) tl.fromTo(focus, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.6);
      if (cursor) tl.fromTo(cursor, { opacity: 0, x: 70, y: 60, scale: 1 / S }, { opacity: 1, x: 0, y: 0, scale: 1 / S, duration: 0.4, ease: "power2.out" }, 0.6);
      tl.fromTo(q(".callout", shot), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, 0.7);
    });
  }

  /* ================================================================== módulos: telas como protagonistas */
  if (wide(700)) {
    qa(".m-screens .viewer-panels, .module-screens .viewer-panels").forEach((p) => {
      gsap.fromTo(
        p,
        { rotationX: 9, y: 50, scale: 0.95, transformPerspective: 1600, transformOrigin: "50% 0%" },
        { rotationX: 0, y: 0, scale: 1, ease: "none", scrollTrigger: { trigger: p, start: "top 96%", end: "top 45%", scrub: 0.6 } },
      );
    });
    qa(".m-ghost").forEach((g) => gsap.fromTo(g, { yPercent: 18 }, { yPercent: -18, ease: "none", scrollTrigger: { trigger: g.parentElement, start: "top bottom", end: "bottom top", scrub: true } }));
  }
  EDUCA.onTab = (panel) => {
    const frame = q(".shot-frame", panel);
    if (!frame) return;
    gsap.fromTo(frame, { clipPath: "inset(0% 0% 0% 100% round 0px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", duration: 0.7, ease: "expo.out", clearProps: "clipPath" });
    gsap.fromTo(q("img", frame), { scale: 1.05 }, { scale: 1, duration: 0.9, ease: "power3.out" });
  };
  if (finePointer) {
    // Inclinação discreta da tela sob o ponteiro.
    qa(".viewer-panels .shot-frame, .env-shot .shot-frame").forEach((frame) => {
      gsap.set(frame, { transformPerspective: 1400 });
      const rx = gsap.quickTo(frame, "rotationX", { duration: 0.6, ease: "power3.out" });
      const ry = gsap.quickTo(frame, "rotationY", { duration: 0.6, ease: "power3.out" });
      frame.addEventListener("pointermove", (e) => {
        const r = frame.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 3);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 2.4);
      });
      frame.addEventListener("pointerleave", () => {
        rx(0);
        ry(0);
      });
    });
  }

  /* ================================================================== conexões: origem → processamento → destino */
  // Para cada ligação ativa, um sinal sai da origem, percorre a linha e, ao
  // chegar, o destino responde. Só as ligações do capítulo (ou da área tocada)
  // rodam; fora da tela, tudo para.
  const net = q(".network");
  if (net) {
    const svgs = qa(".net-svg", net);
    const dots = qa(".edge-sig", net);
    const nodesAll = qa(".node", net);
    let loops = [];
    let visible = false;
    let lastSet = [...new Set(qa(".edge", net).map((g) => Number(g.dataset.edge)))];
    const pulse = (node) => {
      if (!node) return;
      node.classList.remove("is-arrive");
      void node.getBBox();
      node.classList.add("is-arrive");
    };
    const run = (edgeIdx) => {
      loops.forEach((l) => l.kill());
      loops = [];
      gsap.set(dots, { opacity: 0 });
      nodesAll.forEach((n) => n.classList.remove("is-src"));
      if (!visible) return;
      svgs.forEach((svg) => {
        if (!svg.getClientRects().length || getComputedStyle(svg).display === "none") return;
        edgeIdx.forEach((ei, k) => {
          const g = q(`.edge[data-edge="${ei}"]`, svg);
          if (!g) return;
          const path = q(".edge-line", g);
          const dot = q(".edge-sig", g);
          const dst = q(`.node[data-node="${g.dataset.b}"]`, svg);
          const src = q(`.node[data-node="${g.dataset.a}"]`, svg);
          const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.6 + (k % 3) * 0.25, delay: k * 0.18 });
          src?.classList.add("is-src");
          loop.add(travel(dot, path, { duration: g.classList.contains("edge-api") ? 1.4 : 1.0, ease: "power1.inOut" }));
          loop.call(() => pulse(dst));
          loop.set(dot, { opacity: 0 });
          loops.push(loop);
        });
      });
    };
    EDUCA.netSignals = (edgeIdx) => {
      lastSet = edgeIdx;
      run(edgeIdx);
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      run(visible ? lastSet : []);
    }).observe(net);
  }

  /* ================================================================== chamada: muitas áreas, um sistema */
  const conv = q(".converge");
  if (conv) {
    qa(".cv", conv).forEach((svg) => {
      const silosEls = qa(".cv-silo", svg);
      const pathsEls = qa(".cv-path", svg);
      const markEl = q(".cv-mark", svg);
      const word = q(".cv-word", svg);
      const lensC = pathsEls.map(dashLen);
      const vertical = svg.classList.contains("cv-m");
      // Toca inteira uma vez (sem scrub): quem para no meio da rolagem vê a cena completa.
      const tl = gsap.timeline({ scrollTrigger: { trigger: conv, start: "top 78%", toggleActions: "play none none none" } }).timeScale(0.8);
      tl.fromTo(
        silosEls,
        { x: (i) => (vertical ? (i % 2 ? 14 : -14) : -40 - (i % 3) * 18), y: (i) => (vertical ? -10 - (i % 3) * 6 : (i - 2.5) * 10), opacity: 0.45 },
        { x: 0, y: 0, opacity: 1, duration: 0.5, ease: "power2.out", stagger: 0.04 },
        0,
      );
      pathsEls.forEach((p, i) => {
        gsap.set(p, { strokeDasharray: lensC[i] });
        tl.fromTo(p, { strokeDashoffset: lensC[i] }, { strokeDashoffset: 0, duration: 0.5, ease: "power1.inOut" }, 0.3 + i * 0.03);
      });
      tl.fromTo(markEl, { scale: 0.7, opacity: 0.3, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" }, 0.75);
      tl.fromTo(word, { opacity: 0, x: vertical ? 0 : -12 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }, 0.9);
    });
    ST.create({
      trigger: conv,
      start: "center 60%",
      once: true,
      onEnter: () => {
        conv.classList.add("is-live");
        qa(".cv", conv).forEach((svg) => EDUCA.startSignals?.(svg));
      },
    });
    gsap.fromTo(q(".closing-a"), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: conv, start: "center 62%", toggleActions: "play none none none" } });
  }

  window.addEventListener("load", () => ST.refresh());
})();
