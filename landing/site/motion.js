// EDUCA.ERP — landing: cenas com GSAP + ScrollTrigger.
//
// Direção (HyperFrames aplicado à web): uma linha do tempo por cena; entradas
// com .out, saídas com .in; durações e direções variadas; cada linha liga dois
// elementos reais; câmera por escala + contratranslação calculada no build.
// Sem GSAP ou com prefers-reduced-motion, nada aqui roda e a página fica no
// estado final (completa).
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

  /* ------------------------------------------------------------------ abertura */
  const hero = q(".hero");
  if (hero) {
    const box = q(".hs-box", hero);
    const scene = wide(1100);
    const order = q(".hs-order", hero);
    const sats = qa(".hs-sat", hero);
    const gest = q(".hs-gestao", hero);
    const hots = qa(".hs-hot", hero);
    const lines = q(".hs-lines", hero);
    const draws = qa(".hs-draw", hero);
    const signals = qa(".hs-signal", hero);
    const side = [q(".lead", hero), q(".actions", hero), q(".hs-legend", hero)];
    const lens = draws.map((p) => p.getTotalLength());
    hots.forEach((h, i) => h.style.setProperty("--k", i));

    const tl = gsap.timeline({ delay: 0.15, onComplete: live });

    // 1. O quadro: a grade das colunas desce, quase no vazio.
    tl.fromTo(".hero-bg .gl", { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 1.2, ease: "power2.out", stagger: { each: 0.035, from: "center" } }, 0);
    tl.fromTo(q(".eyebrow", hero), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, 0.25);

    if (scene) {
      // 2. Sinais soltos: códigos reais da operação, cada um no seu canto.
      const bw = box.clientWidth;
      const bh = box.clientHeight;
      const dock = signals.map((s) => ({
        x: ((Number(s.dataset.tx) - Number(s.dataset.sx)) / 100) * bw,
        y: ((Number(s.dataset.ty) - Number(s.dataset.sy)) / 100) * bh,
      }));
      tl.fromTo(signals, { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.55, ease: "power3.out", stagger: 0.07 }, 0.4);
      tl.to(signals, { y: (i) => (i % 2 ? -7 : 7), duration: 1.4, ease: "sine.inOut" }, 0.9);
      tl.set(lines, { opacity: 1 }, 0);
      draws.forEach((p, i) => gsap.set(p, { strokeDasharray: lens[i], strokeDashoffset: lens[i] }));

      // 3. O pedido entra: a tela real assume o centro.
      tl.fromTo(order, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.2, ease: "expo.out" }, 1.0);
      tl.fromTo(q(".hs-media", order), { clipPath: "inset(10% 12% 10% 12% round 16px)", scale: 1.04 }, { clipPath: "inset(0% 0% 0% 0% round 8px)", scale: 1, duration: 1.3, ease: "expo.out" }, 1.0);
      [0, 1].forEach((k) => tl.to(signals[k], { x: dock[k].x, y: dock[k].y, opacity: 0, scale: 0.9, duration: 0.7, ease: "power3.inOut" }, 1.3 + k * 0.08));

      // 4. Marcadores sobre os botões e campos que geram trabalho em outra área.
      tl.fromTo(hots, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2.6)", stagger: 0.12 }, 1.8);

      // 5. Cada ligação se desenha e a tela da área chega pelo lado.
      sats.forEach((sat, i) => {
        const t = 2.2 + i * 0.3;
        tl.fromTo(draws[i], { strokeDashoffset: lens[i] }, { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, t);
        tl.to(signals[2 + i], { x: dock[2 + i].x, y: dock[2 + i].y, opacity: 0, duration: 0.6, ease: "power3.inOut" }, t + 0.05);
        tl.fromTo(sat, { opacity: 0, x: 36 }, { opacity: 1, x: 0, duration: 0.8, ease: "power3.out" }, t + 0.3);
        tl.fromTo(q(".hs-media", sat), { scale: 0.96 }, { scale: 1, duration: 0.9, ease: "expo.out" }, t + 0.3);
      });
      tl.to(signals[6], { x: dock[6].x, y: dock[6].y, opacity: 0, duration: 0.5, ease: "power3.inOut" }, 3.1);

      // 7. Tudo converge para a Gestão.
      tl.fromTo(draws.slice(4), { strokeDashoffset: (i) => lens[4 + i] }, { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut", stagger: 0.07 }, 3.35);
      tl.to(signals[7], { x: dock[7].x, y: dock[7].y, opacity: 0, duration: 0.6, ease: "power3.inOut" }, 3.35);
      tl.fromTo(gest, { opacity: 0, x: 24, scale: 0.94 }, { opacity: 1, x: 0, scale: 1, duration: 1.0, ease: "expo.out" }, 3.6);
    } else {
      // Tablet e celular: as telas entram em ordem, sem a coreografia de linhas.
      tl.fromTo([order, ...sats, gest], { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", stagger: 0.12 }, 0.9);
      tl.fromTo(hots, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)", stagger: 0.08 }, 1.3);
    }

    // 6. O título chega quando a operação já está conectada.
    const titleAt = scene ? 2.35 : 0.3;
    tl.fromTo(qa(".ln > span", hero), { yPercent: 112, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: "expo.out", stagger: 0.12 }, titleAt);
    tl.fromTo(q(".fire-bar", hero), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "power3.inOut" }, titleAt + 0.85);
    tl.fromTo(side, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.1 }, scene ? 3.2 : 0.8);

    done();

    // Quem já está rolando ou usando o teclado não espera a sequência inteira.
    const hurry = () => tl.progress() < 1 && tl.timeScale(4);
    ["wheel", "touchmove", "keydown"].forEach((ev) => window.addEventListener(ev, hurry, { once: true, passive: true }));

    function live() {
      hero.classList.add("is-live");
      EDUCA.startSignals?.(lines);
      if (!scene) return;
      // Profundidade: a cena inteira inclina de leve com o ponteiro (as linhas
      // continuam presas às telas) e recua ao rolar.
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
  } else done();

  /* ------------------------------------------------------------------ cenário: silos → um fio */
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

  /* ------------------------------------------------------------------ plataforma: ambientes em camadas */
  const envs = qa(".env-shot");
  if (envs.length && wide(1100)) {
    gsap.fromTo(
      envs,
      { xPercent: (i) => [70, 0, -70][i], yPercent: (i) => [8, 0, 8][i], rotationY: (i) => [-14, 0, 14][i], scale: (i) => (i === 1 ? 1 : 0.9), transformPerspective: 1400, opacity: (i) => (i === 1 ? 1 : 0.55) },
      { xPercent: 0, yPercent: 0, rotationY: 0, scale: 1, opacity: 1, ease: "none", scrollTrigger: { trigger: q(".envs"), start: "top 88%", end: "top 38%", scrub: 0.7 } },
    );
  }

  /* ------------------------------------------------------------------ siga um pedido */
  const journey = q(".journey");
  const camVals = (cam) => ({ S: Number(cam.dataset.s), tx: Number(cam.dataset.tx), ty: Number(cam.dataset.ty) });
  if (journey && wide(1100) && window.innerHeight >= 620) {
    // Cena fixa: seis tempos, a câmera aproxima a região de cada tela.
    journey.classList.add("is-cinema");
    const pin = q(".jc", journey);
    const steps = qa(".step", journey);
    const layers = qa(".jc-layer", journey);
    const overs = qa(".jc-over", journey);
    const routes = qa(".jc-frame .shot-route", journey);
    const tl = gsap.timeline({ defaults: { ease: "none" } });
    gsap.set(steps, { opacity: 0 });
    gsap.set(steps[0], { opacity: 1 });
    gsap.set(layers, { opacity: 0 });
    gsap.set(layers[0], { opacity: 1 });
    layers.forEach((layer, i) => {
      const t = i;
      const cam = q(".cam", layer);
      const { S, tx, ty } = camVals(cam);
      const focus = q(".cam-focus", layer);
      const cursor = q(".cam-cursor", layer);
      if (i > 0) {
        tl.to(layers[i - 1], { opacity: 0, scale: 1.035, duration: 0.16, ease: "power2.in" }, t - 0.04);
        tl.fromTo(layer, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.2, ease: "power2.out" }, t);
        tl.to(steps[i - 1], { opacity: 0, y: -26, duration: 0.14, ease: "power2.in" }, t - 0.06);
        tl.fromTo(steps[i], { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.22, ease: "power3.out" }, t + 0.02);
        tl.to(overs[i - 1], { opacity: 0, y: 10, duration: 0.1, ease: "power2.in" }, t - 0.06);
      }
      tl.fromTo(cam, { scale: 1, xPercent: 0, yPercent: 0 }, { scale: S, xPercent: tx, yPercent: ty, duration: 0.42, ease: "power2.inOut" }, t + 0.14);
      if (focus) tl.fromTo(focus, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.14, ease: "power2.out" }, t + 0.42);
      if (cursor) {
        const arrow = q("svg", cursor);
        const ripple = q(".cam-ripple", cursor);
        tl.fromTo(cursor, { opacity: 0, x: 140, y: 110, scale: 1 / S }, { opacity: 1, x: 0, y: 0, scale: 1 / S, duration: 0.22, ease: "power2.out" }, t + 0.5);
        tl.to(arrow, { scale: 0.8, duration: 0.03 }, t + 0.74).to(arrow, { scale: 1, duration: 0.05 }, t + 0.77);
        tl.fromTo(ripple, { scale: 0.3, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 0.16 }, t + 0.75);
      }
      tl.fromTo(overs[i], { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.14, ease: "power3.out" }, t + 0.56);
    });
    tl.to({}, { duration: 0.4 }, 5.6); // respiro no último tempo
    let lastIdx = -1;
    ST.create({
      trigger: pin,
      pin: true,
      start: "top top",
      end: () => `+=${Math.round(window.innerHeight * 5.4)}`,
      scrub: 0.7,
      animation: tl,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate(self) {
        const idx = Math.min(layers.length - 1, Math.floor(self.progress * (tl.duration() / 1) + 0.03));
        if (idx !== lastIdx) {
          lastIdx = idx;
          EDUCA.journeyActivate?.(idx);
          routes.forEach((r, k) => r.classList.toggle("is-on", k === idx));
        }
      },
    });
    routes[0]?.classList.add("is-on");
  } else if (journey) {
    // Lista (celular e telas baixas): cada tela aproxima a sua região ao passar.
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
    });
  }

  /* ------------------------------------------------------------------ módulos: telas como objetos */
  if (wide(700)) {
    qa(".m-screens .viewer-panels, .module-screens .viewer-panels").forEach((p) => {
      gsap.fromTo(
        p,
        { rotationX: 9, y: 50, scale: 0.95, transformPerspective: 1600, transformOrigin: "50% 0%" },
        { rotationX: 0, y: 0, scale: 1, ease: "none", scrollTrigger: { trigger: p, start: "top 96%", end: "top 45%", scrub: 0.6 } },
      );
    });
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

  /* ------------------------------------------------------------------ chamada: os silos se juntam */
  const silos = q(".silos");
  if (silos) {
    const k = wide(760) ? 1 : 0.4;
    const tl = gsap.timeline({ scrollTrigger: { trigger: silos, start: "top 95%", end: "top 58%", scrub: 0.7 } });
    tl.fromTo(
      qa(".silo", silos),
      { x: (i) => (i - 2.5) * 22 * k, y: (i) => (i % 2 ? 12 : -12) * k, rotation: (i) => (i % 2 ? 1.5 : -1.5), opacity: 0.5 },
      { x: 0, y: 0, rotation: 0, opacity: 1, ease: "power1.inOut", duration: 1 },
      0,
    );
    tl.fromTo(q(".silo-fire", silos), { scaleX: 0 }, { scaleX: 1, ease: "power2.inOut", duration: 0.6 }, 0.7);
    // A resposta entra uma vez, quando os silos já se juntaram.
    gsap.fromTo(q(".closing-a"), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: silos, start: "top 62%", toggleActions: "play none none none" } });
  }

  window.addEventListener("load", () => ST.refresh());
})();
