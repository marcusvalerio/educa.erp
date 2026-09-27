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
    const hs = q(".hs", hero);
    const box = q(".hs-box", hero);
    const order = q(".hs-order", hero);
    const sats = qa(".hs-sat", hero);
    const gest = q(".hs-gestao", hero);
    const frags = [order, ...sats, gest];
    const hots = qa(".hs-hot", hero);
    const lines = q(".hs-lines", hero);
    const links = qa(".hs-link", hero);
    const paths = qa(".hs-path", hero);
    const draws = qa(".hs-draw", hero);
    const sigs = qa(".hs-sig", hero);
    const ports = qa(".hs-port", hero);
    const signals = qa(".hs-signal", hero);
    const titleLines = qa(".ln > span", hero);
    const side = [q(".lead", hero), q(".actions", hero), q(".hs-legend", hero)];
    const lens = draws.map(dashLen);
    const media = (f) => q(".hs-media", f);
    const ghost = (f) => q(".hs-ghost", f);
    const tagCode = (f) => q(".hs-tag code", f);
    const port = (link, end) => ports.find((p) => p.dataset.port === `${link}-${end}`);
    hots.forEach((h, i) => h.style.setProperty("--k", i));

    const tl = gsap.timeline({ delay: 0.2, onComplete: live });
    // A sequência completa leva ~5 s; um pouco mais rápida no tempo real.
    tl.timeScale(1.15);
    const scene = wide(1100);

    // Vazio: só a grade das colunas, subindo devagar.
    tl.fromTo(".hero-bg .gl", { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 1.4, ease: "power2.out", stagger: { each: 0.03, from: "center" } }, 0);

    if (scene) {
      // Câmera: a cena começa centrada e próxima; no fim recua para o lugar dela.
      const r = hs.getBoundingClientRect();
      const lift = Math.min(0, window.innerHeight / 2 - (r.top + r.height / 2));
      gsap.set(hs, { y: lift, scale: 1.03, transformOrigin: "50% 50%" });
      gsap.set(q(".hero-head", hero), { opacity: 0 });
      tl.set(lines, { opacity: 1 }, 0);
      draws.forEach((p, i) => gsap.set(p, { strokeDasharray: lens[i], strokeDashoffset: lens[i] }));
      gsap.set(frags, { opacity: 1 });
      gsap.set(frags.map(media), { opacity: 0 });
      gsap.set(qa(".hs-tag", hero), { opacity: 0 });
      gsap.set(qa(".hs-tag code, .hs-tag .hs-apichip", hero), { opacity: 0 });
      gsap.set(hots, { scale: 0, opacity: 0 });
      gsap.set(ports, { scale: 0, opacity: 0 });

      // Sinais: as portas de cada ligação acendem, como pontos de um mapa.
      tl.to(ports, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(3)", stagger: { each: 0.035, from: "start" } }, 0.35);

      // Estrutura: as molduras das áreas aparecem, ainda vazias, com o nome.
      tl.fromTo(frags.map(ghost), { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out", stagger: 0.06 }, 0.55);
      tl.fromTo(qa(".hs-tag", hero), { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out", stagger: 0.06 }, 0.7);

      // Dados: os códigos reais surgem soltos, perto de onde vão parar.
      const bw = box.clientWidth;
      const bh = box.clientHeight;
      const dock = signals.map((s) => ({
        x: ((Number(s.dataset.tx) - Number(s.dataset.sx)) / 100) * bw,
        y: ((Number(s.dataset.ty) - Number(s.dataset.sy)) / 100) * bh,
      }));
      tl.fromTo(signals, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.06 }, 0.95);
      tl.to(signals, { y: (i) => (i % 2 ? -5 : 5), duration: 1.2, ease: "sine.inOut" }, 1.35);
      const dockTo = (k, at, f) => {
        tl.to(signals[k], { x: dock[k].x, y: dock[k].y, opacity: 0, scale: 0.92, duration: 0.5, ease: "power3.inOut" }, at);
        tl.to(tagCode(f), { opacity: 1, duration: 0.3, ease: "power1.out" }, at + 0.35);
      };

      // Pedido: a tela real é "desenhada" de cima para baixo pela varredura.
      const scan = q(".hs-scan", order);
      const oh = media(order).offsetHeight;
      tl.set(media(order), { opacity: 1, clipPath: "inset(0% 0% 100% 0% round 8px)" }, 1.25);
      tl.to(media(order), { clipPath: "inset(0% 0% 0% 0% round 8px)", duration: 0.95, ease: "power2.inOut" }, 1.25);
      tl.fromTo(scan, { y: 0, opacity: 1 }, { y: oh, opacity: 1, duration: 0.95, ease: "power2.inOut" }, 1.25);
      tl.to(scan, { opacity: 0, duration: 0.25, ease: "power1.in" }, 2.2);
      tl.to(ghost(order), { opacity: 0, duration: 0.4 }, 1.9);
      dockTo(0, 1.55, order);
      tl.to(signals[1], { x: dock[1].x, y: dock[1].y, opacity: 0, duration: 0.5, ease: "power3.inOut" }, 1.65);

      // Marcadores: os botões e campos que geram trabalho em outra área.
      tl.to(hots, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)", stagger: 0.1 }, 2.05);

      // Ligações: o sinal sai do pedido, percorre a linha e só então a área acende.
      sats.forEach((sat, i) => {
        const t = 2.45 + i * 0.34;
        tl.fromTo(hots[i], { scale: 1.4 }, { scale: 1, duration: 0.4, ease: "power2.out" }, t - 0.1);
        tl.fromTo(port(i, 0), { scale: 2.2 }, { scale: 1, duration: 0.4, ease: "power2.out" }, t);
        tl.to(draws[i], { strokeDashoffset: 0, duration: 0.5, ease: "power1.inOut" }, t);
        tl.add(travel(sigs[i], paths[i], { duration: 0.5 }), t);
        tl.set(sigs[i], { opacity: 0 }, t + 0.52);
        tl.fromTo(port(i, 1), { scale: 2.2 }, { scale: 1, duration: 0.4, ease: "power2.out" }, t + 0.5);
        tl.set(media(sat), { opacity: 1 }, t + 0.5);
        tl.fromTo(media(sat), { clipPath: "inset(0% 100% 0% 0% round 8px)" }, { clipPath: "inset(0% 0% 0% 0% round 8px)", duration: 0.55, ease: "expo.out" }, t + 0.5);
        tl.to(ghost(sat), { opacity: 0, duration: 0.3 }, t + 0.7);
        dockTo(2 + i, t + 0.3, sat);
        const chip = q(".hs-apichip", sat);
        if (chip) tl.to(chip, { opacity: 1, duration: 0.3 }, t + 0.7);
      });
      tl.to(signals[6], { x: dock[6].x, y: dock[6].y, opacity: 0, duration: 0.45, ease: "power3.inOut" }, 3.7);

      // Convergência: as quatro áreas mandam sinal para a Gestão ao mesmo tempo.
      const cv = 3.95;
      draws.slice(4).forEach((d, k) => {
        tl.to(d, { strokeDashoffset: 0, duration: 0.55, ease: "power1.inOut" }, cv + k * 0.05);
        tl.add(travel(sigs[4 + k], paths[4 + k], { duration: 0.55 }), cv + k * 0.05);
        tl.set(sigs[4 + k], { opacity: 0 }, cv + 0.62 + k * 0.05);
      });
      tl.set(media(gest), { opacity: 1 }, cv + 0.55);
      tl.fromTo(media(gest), { clipPath: "inset(0% 0% 100% 0% round 8px)", scale: 0.96 }, { clipPath: "inset(0% 0% 0% 0% round 8px)", scale: 1, duration: 0.7, ease: "expo.out" }, cv + 0.55);
      tl.to(ghost(gest), { opacity: 0, duration: 0.3 }, cv + 0.8);
      dockTo(7, cv + 0.3, gest);

      // Sistema completo: a câmera recua e a declaração de marca entra.
      const cam = cv + 0.45;
      tl.to(hs, { y: 0, scale: 1, duration: 1.3, ease: "power3.inOut" }, cam);
      tl.set(q(".hero-head", hero), { opacity: 1 }, cam + 0.2);
      tl.fromTo(q(".eyebrow", hero), { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, cam + 0.3);
      tl.fromTo(titleLines, { yPercent: 112, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: "expo.out", stagger: 0.12 }, cam + 0.4);
      tl.fromTo(q(".fire-bar", hero), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "power3.inOut" }, cam + 1.15);
      tl.fromTo(side, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", stagger: 0.09 }, cam + 0.6);
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
      gsap.set(frags.map(media), { clearProps: "clipPath" });
      // A opacidade volta para o CSS, que faz o foco (as outras áreas recuam).
      gsap.set(frags, { clearProps: "opacity" });
      gsap.set(sigs, { opacity: 0 });
      sigs.forEach((c) => {
        c.setAttribute("cx", "0");
        c.setAttribute("cy", "0");
      });
      gsap.set(sigs, { clearProps: "opacity" });
      hero.classList.add("is-live");
      EDUCA.startSignals?.(lines);
      if (!scene) return;
      // Respiração: as áreas oscilam de leve, cada uma no seu tempo.
      sats.forEach((s, i) => gsap.to(s, { y: i % 2 ? -3 : 3, duration: 2.6 + i * 0.4, ease: "sine.inOut", yoyo: true, repeat: -1 }));
      // Profundidade: a cena inclina de leve com o ponteiro e recua ao rolar.
      gsap.set(box, { transformPerspective: 1600, transformOrigin: "50% 40%" });
      if (finePointer) {
        const rx = gsap.quickTo(box, "rotationX", { duration: 0.9, ease: "power3.out" });
        const ry = gsap.quickTo(box, "rotationY", { duration: 0.9, ease: "power3.out" });
        hero.addEventListener("pointermove", (e) => {
          const r = hero.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 3);
          rx(-((e.clientY - r.top) / r.height - 0.5) * 2);
        });
        hero.addEventListener("pointerleave", () => {
          rx(0);
          ry(0);
        });
      }
      gsap.to(box, { yPercent: -5, scale: 0.965, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
      gsap.to(q(".hero-head", hero), { y: -50, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "60% top", scrub: true } });
    }

    // Foco: passar sobre uma área acende a cadeia dela (marcador → ligação →
    // área → Gestão) e o resto recua.
    if (scene && finePointer) {
      const setFocus = (i) => {
        if (i == null) delete box.dataset.focus;
        else box.dataset.focus = String(i);
        links.forEach((l, k) => l.classList.toggle("is-hot", i != null && (i === "g" ? k >= 4 : k === i || k === 4 + i)));
        sats.forEach((s, k) => s.classList.toggle("is-hot", i != null && (i === "g" || k === i)));
        gest.classList.toggle("is-hot", i != null);
        hots.forEach((h, k) => h.classList.toggle("is-hot", i != null && (i === "g" || k === i)));
      };
      sats.forEach((s, i) => {
        s.addEventListener("pointerenter", () => setFocus(i));
        s.addEventListener("pointerleave", () => setFocus(null));
        s.addEventListener("focusin", () => setFocus(i));
        s.addEventListener("focusout", () => setFocus(null));
      });
      hots.forEach((h, i) => {
        h.addEventListener("pointerenter", () => setFocus(i));
        h.addEventListener("pointerleave", () => setFocus(null));
      });
      gest.addEventListener("pointerenter", () => setFocus("g"));
      gest.addEventListener("pointerleave", () => setFocus(null));
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
