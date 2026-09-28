// EDUCA.ERP — landing: interações. Melhoria progressiva: sem este script a
// página já está completa (primeira etapa ativa, primeira tela de cada módulo,
// mapa inteiro aceso). As cenas com GSAP ficam em motion.js.
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasIO = "IntersectionObserver" in window;
  const EDUCA = (window.EDUCA = window.EDUCA || {});

  // Inicia as animações SMIL (sinais nas linhas) de um <svg>; fora da tela, pausam.
  const pauseWhenHidden = (svg) => {
    if (!hasIO || typeof svg.pauseAnimations !== "function") return;
    new IntersectionObserver(([e]) => (e.isIntersecting ? svg.unpauseAnimations() : svg.pauseAnimations())).observe(svg);
  };
  const startSignals = (svg) => {
    if (reduce || !svg || svg.dataset.live) return;
    svg.dataset.live = "1";
    svg.querySelectorAll("animateMotion").forEach((a) => {
      try {
        a.beginElement();
      } catch {
        /* navegador sem SMIL: as linhas continuam paradas */
      }
    });
    pauseWhenHidden(svg);
  };
  EDUCA.startSignals = startSignals;

  // Abertura V4 (desktop): as ligações saem das âncoras reais do pedido e das
  // telas; quando a câmera ou as partes se movem, a linha acompanha. Cada
  // ligação tem um progresso (0–1) para ser "desenhada": a curva é cortada
  // no ponto certo (de Casteljau), e o tracejado da API continua intacto.
  const hx = document.querySelector(".hx");
  if (hx) {
    const links = [...hx.querySelectorAll(".hx-link")];
    const anchors = Object.fromEntries([...hx.querySelectorAll("[data-a]")].map((a) => [a.dataset.a, a]));
    const f = (v) => v.toFixed(1);
    const cut = (p0, p1, p2, p3, t) => {
      const l = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const a = l(p0, p1);
      const b = l(p1, p2);
      const c = l(p2, p3);
      const d = l(a, b);
      const e = l(b, c);
      return [p0, a, d, l(d, e)];
    };
    const draw = () => {
      const r = hx.getBoundingClientRect();
      if (!r.width || !hx.offsetParent) return;
      const k = 1440 / r.width;
      const pt = (el) => {
        const b = el.getBoundingClientRect();
        return [(b.left - r.left) * k, (b.top - r.top) * k];
      };
      links.forEach((g) => {
        const a = anchors[`${g.dataset.link}-a`];
        const b = anchors[`${g.dataset.link}-b`];
        if (!a || !b) return;
        const p0 = pt(a);
        const p3 = pt(b);
        const v = g.dataset.mode === "v";
        const p1 = v ? [p0[0], p0[1] + (p3[1] - p0[1]) * 0.55] : [p0[0] + (p3[0] - p0[0]) * 0.55, p0[1]];
        const p2 = v ? [p3[0], p3[1] - (p3[1] - p0[1]) * 0.55] : [p3[0] - (p3[0] - p0[0]) * 0.55, p3[1]];
        const t = g._t ?? 1;
        const [q0, q1, q2, q3] = t < 1 ? cut(p0, p1, p2, p3, Math.max(0.001, t)) : [p0, p1, p2, p3];
        g.querySelector(".hx-path").setAttribute("d", `M${f(q0[0])} ${f(q0[1])} C${f(q1[0])} ${f(q1[1])}, ${f(q2[0])} ${f(q2[1])}, ${f(q3[0])} ${f(q3[1])}`);
        const [e0, e1] = g.querySelectorAll(".hx-end");
        e0.setAttribute("cx", f(p0[0]));
        e0.setAttribute("cy", f(p0[1]));
        e1.setAttribute("cx", f(p3[0]));
        e1.setAttribute("cy", f(p3[1]));
        e0.style.opacity = t > 0 ? "" : "0";
        e1.style.opacity = t >= 1 ? "" : "0";
      });
    };
    EDUCA.hxDraw = draw;
    draw();
    window.addEventListener("resize", draw, { passive: true });
    document.fonts?.ready.then(draw);
  }

  // "Siga um pedido" em lista: a etapa no centro da tela acende a raia.
  const journey = document.querySelector(".journey");
  if (journey) {
    const steps = [...journey.querySelectorAll("[data-step]")];
    const lanes = [...journey.querySelectorAll("[data-lane]")];
    const lane = journey.querySelector(".lane");
    let current = -1;
    EDUCA.journeyActivate = (i) => {
      if (i === current) return;
      current = i;
      steps.forEach((el, k) => el.classList.toggle("is-active", k === i));
      lanes.forEach((el, k) => {
        el.classList.toggle("is-active", k === i);
        el.classList.toggle("is-done", k < i);
      });
      // -1: o pedido ainda está na origem da raia, antes da primeira etapa.
      lane?.style.setProperty("--p", i < 0 ? -0.85 : i);
    };
    EDUCA.journeyActivate(0);
    if (hasIO) {
      const io = new IntersectionObserver(
        (entries) => {
          if (journey.classList.contains("is-cinema")) return;
          entries.forEach((e) => {
            if (e.isIntersecting) EDUCA.journeyActivate(Number(e.target.dataset.step));
          });
        },
        { rootMargin: "-45% 0px -50% 0px" },
      );
      steps.forEach((s) => io.observe(s));
    }
  }

  // Visualizador de telas: abas acessíveis (setas, Home, End) e sublinhado que desliza.
  document.querySelectorAll("[data-viewer]").forEach((viewer) => {
    const list = viewer.querySelector('[role="tablist"]');
    const ink = viewer.querySelector(".tab-ink");
    const tabs = [...viewer.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
    const place = (i) => {
      if (!ink) return;
      const t = tabs[i];
      ink.style.setProperty("--x", `${t.offsetLeft + 12}px`);
      ink.style.setProperty("--w", `${t.offsetWidth - 24}px`);
    };
    const select = (i, focus) => {
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        panels[k].classList.toggle("is-on", on);
        panels[k].toggleAttribute("inert", !on);
        if (on) panels[k].removeAttribute("aria-hidden");
        else panels[k].setAttribute("aria-hidden", "true");
      });
      place(i);
      if (focus) tabs[i].focus();
      if (list.scrollWidth > list.clientWidth) tabs[i].scrollIntoView({ block: "nearest", inline: "nearest" });
      EDUCA.onTab?.(panels[i]);
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i, false));
      t.addEventListener("keydown", (e) => {
        const last = tabs.length - 1;
        const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
        if (next !== undefined) {
          e.preventDefault();
          select(next, true);
        }
      });
    });
    const init = () => place(Math.max(0, tabs.findIndex((t) => t.getAttribute("aria-selected") === "true")));
    init();
    document.fonts?.ready.then(init);
    window.addEventListener("resize", init, { passive: true });
  });

  // Mapa de conexões: capítulos acendem cadeias; tocar uma área mostra as dela.
  const net = document.querySelector(".network");
  if (net) {
    const nodes = [...net.querySelectorAll("[data-node]")];
    const edges = [...net.querySelectorAll(".edge")];
    const chapters = [...net.querySelectorAll("[data-chapter]")];
    let chapterEdges = null;
    let pinned = null;
    const paint = () => {
      const peers = new Set();
      const on = new Set();
      if (pinned) {
        edges.forEach((el) => {
          if (el.dataset.a === pinned || el.dataset.b === pinned) {
            on.add(el.dataset.edge);
            peers.add(el.dataset.a === pinned ? el.dataset.b : el.dataset.a);
          }
        });
      } else if (chapterEdges) {
        chapterEdges.forEach((i) => on.add(String(i)));
        edges.forEach((el) => {
          if (on.has(el.dataset.edge)) peers.add(el.dataset.a).add(el.dataset.b);
        });
      }
      const active = Boolean(pinned || chapterEdges);
      net.classList.toggle("has-chapter", active);
      edges.forEach((el) => el.classList.toggle("is-on", !active || on.has(el.dataset.edge)));
      // Sinais (motion.js): só correm nas ligações acesas.
      const lit = active ? [...on].map(Number) : [...new Set(edges.map((el) => Number(el.dataset.edge)))];
      EDUCA.netSignals?.(lit);
      nodes.forEach((n) => {
        n.classList.toggle("is-on", n.dataset.node === pinned);
        n.classList.toggle("is-peer", peers.has(n.dataset.node));
        n.setAttribute("aria-pressed", String(n.dataset.node === pinned));
      });
    };
    edges.forEach((el) => el.classList.add("is-on"));
    const setChapter = (i) => {
      chapters.forEach((c, k) => c.classList.toggle("is-active", k === i));
      chapterEdges = i < 0 ? null : chapters[i].dataset.edges.split(",").map(Number);
      paint();
    };
    if (hasIO && chapters.length) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) setChapter(Number(e.target.dataset.chapter));
          });
        },
        { rootMargin: "-40% 0px -45% 0px" },
      );
      chapters.forEach((c) => io.observe(c));
      new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) net.classList.add("is-live");
        },
        { threshold: 0.15 },
      ).observe(net);
    }
    nodes.forEach((n) => {
      const id = n.dataset.node;
      const toggle = () => {
        pinned = pinned === id ? null : id;
        paint();
      };
      n.addEventListener("click", toggle);
      n.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        } else if (e.key === "Escape") {
          pinned = null;
          paint();
        }
      });
    });
  }

  // Ato 04: protagonistas. A etapa em leitura escolhe a tela, a rota e o
  // enquadramento da câmera (a transição é CSS).
  document.querySelectorAll(".pro").forEach((pro) => {
    const beats = [...pro.querySelectorAll(".pro-beat")];
    const lists = [beats, pro.querySelectorAll(".pro-layer"), pro.querySelectorAll(".pro-stage .shot-route"), pro.querySelectorAll(".pro-dots li")].map((l) => [...l]);
    const dots = lists[3];
    const set = (k) => {
      lists.forEach((l) => l.forEach((el, j) => el.classList.toggle("is-on", j === k)));
      dots.forEach((el, j) => el.classList.toggle("is-done", j < k));
    };
    if (!hasIO) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && set(Number(e.target.dataset.beat))),
      { rootMargin: "-42% 0px -42% 0px" },
    );
    beats.forEach((b) => io.observe(b));
  });

  // Ato 05: o plano do nível em leitura sobe na pilha (Base, Acesso, Central).
  const lvs = [...document.querySelectorAll(".lv[data-lv]")];
  const planes = [...document.querySelectorAll(".lv-plane")];
  if (lvs.length && planes.length && hasIO) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const k = e.target.dataset.lv;
          planes.forEach((p) => p.classList.toggle("is-on", p.dataset.lv === k));
        });
      },
      { rootMargin: "-40% 0px -50% 0px" },
    );
    lvs.forEach((l) => io.observe(l));
  }

  // Trilho do processo de cada módulo: o pulso só corre quando está visível.
  if (hasIO) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("in-view", e.isIntersecting)), {
      rootMargin: "0px 0px -15% 0px",
    });
    document.querySelectorAll(".m-rail").forEach((r) => io.observe(r));
  }

  // O fio: a mesma operação atravessa a página, do Ato 01 à convergência.
  // Uma linha na margem passa pelos nós de cada ato e entra na convergência
  // final; ela se desenha com a rolagem, com um ponto na frente, e cada nó
  // acende quando o fio passa. Com movimento reduzido, aparece inteira.
  const mainEl = document.querySelector("main");
  const threadEnd = document.querySelector(".thread-end");
  if (mainEl && threadEnd && "ResizeObserver" in window) {
    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, cls) => {
      const n = document.createElementNS(NS, tag);
      n.setAttribute("class", cls);
      return n;
    };
    const svg = el("svg", "thread");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const base = el("path", "thread-base");
    const lit = el("path", "thread-lit");
    const knots = el("g", "thread-knots");
    const head = el("circle", "thread-head");
    head.setAttribute("r", "4");
    svg.append(base, lit, knots, head);
    mainEl.prepend(svg);
    let L = 0;
    let samples = [];
    let knotY = [];
    const layout = () => {
      const mr = mainEl.getBoundingClientRect();
      const pts = [...document.querySelectorAll(".act-node")]
        .filter((n) => n.offsetParent)
        .map((n) => {
          const r = n.getBoundingClientRect();
          return [r.left + r.width / 2 - mr.left, r.top + r.height / 2 - mr.top];
        })
        .sort((a, b) => a[1] - b[1]);
      const er = threadEnd.getBoundingClientRect();
      if (pts.length < 2 || !er.height) {
        svg.style.display = "none";
        return;
      }
      svg.style.display = "";
      const x = pts[0][0];
      const [ex, ey] = [er.left - mr.left, er.top + er.height / 2 - mr.top];
      const d = `M${x} ${pts[0][1]} L${x} ${ey - 80} C${x} ${ey - 20}, ${x + 20} ${ey}, ${ex} ${ey}`;
      svg.setAttribute("width", mr.width);
      svg.setAttribute("height", mainEl.scrollHeight);
      base.setAttribute("d", d);
      lit.setAttribute("d", d);
      L = lit.getTotalLength();
      lit.style.strokeDasharray = `${L}`;
      samples = [];
      for (let l = 0; l <= L; l += 24) samples.push([l, lit.getPointAtLength(l).y]);
      knots.replaceChildren(
        ...pts.map(([px, py]) => {
          const c = el("circle", "thread-knot");
          c.setAttribute("cx", px);
          c.setAttribute("cy", py);
          c.setAttribute("r", "5");
          return c;
        }),
      );
      knotY = pts.map((p) => p[1]);
      draw();
    };
    const draw = () => {
      if (!L) return;
      const mr = mainEl.getBoundingClientRect();
      const line = reduce ? Infinity : innerHeight * 0.62 - mr.top;
      let len = L;
      if (line !== Infinity) {
        let lo = 0;
        let hi = samples.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (samples[mid][1] <= line) lo = mid;
          else hi = mid - 1;
        }
        len = samples[lo]?.[1] <= line ? samples[lo][0] : 0;
      }
      lit.style.strokeDashoffset = `${L - len}`;
      const pt = lit.getPointAtLength(len);
      head.setAttribute("cx", pt.x);
      head.setAttribute("cy", pt.y);
      head.style.opacity = reduce || len <= 0 || len >= L ? "0" : "1";
      [...knots.children].forEach((k, i) => k.classList.toggle("is-lit", knotY[i] <= pt.y + 1));
    };
    let raf = 0;
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), draw()));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    new ResizeObserver(() => layout()).observe(mainEl);
    window.addEventListener("load", layout);
    document.fonts?.ready.then(layout);
    layout();
  }

  // Topo: a seção visível fica marcada no menu, com um traço que desliza.
  const nav = document.querySelector(".topnav");
  if (nav && hasIO) {
    const links = [...nav.querySelectorAll("[data-spy]")];
    const ink = nav.querySelector(".topnav-ink");
    const byId = Object.fromEntries(links.map((a) => [a.dataset.spy, a]));
    let current = null;
    const mark = (id) => {
      current = id;
      links.forEach((a) => a.setAttribute("aria-current", String(a.dataset.spy === id)));
      const a = byId[id];
      if (!ink) return;
      ink.style.setProperty("--o", a ? 1 : 0);
      if (a) {
        ink.style.setProperty("--x", `${a.offsetLeft + 12}px`);
        ink.style.setProperty("--w", `${a.offsetWidth - 24}px`);
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) mark(e.target.id);
          else if (current === e.target.id) mark(null);
        });
      },
      { rootMargin: "-50% 0px -49% 0px" },
    );
    links.forEach((a) => {
      const sec = document.getElementById(a.dataset.spy);
      if (sec) io.observe(sec);
    });
  }

  // Telas ampliadas: o link abre a imagem inteira em um diálogo.
  const lb = document.querySelector(".lightbox");
  if (lb && typeof lb.showModal === "function") {
    const img = lb.querySelector("img");
    const cap = lb.querySelector(".lb-caption");
    let opener = null;
    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-zoom]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      opener = a;
      img.src = a.getAttribute("href");
      img.width = Number(a.dataset.w);
      img.height = Number(a.dataset.h);
      img.alt = a.dataset.caption || "";
      cap.textContent = a.dataset.caption || "";
      lb.showModal();
    });
    const close = () => lb.close();
    lb.querySelector("[data-close]").addEventListener("click", close);
    lb.addEventListener("click", (e) => {
      if (e.target === lb) close();
    });
    lb.addEventListener("close", () => {
      if (opener && opener.tabIndex !== -1) opener.focus();
    });
  }

  // Números: contam até o valor final (que já está no HTML) quando aparecem.
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length && !reduce && hasIO) {
    const fmt = new Intl.NumberFormat("pt-BR");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const el = e.target;
          const end = Number(el.dataset.count);
          const t0 = performance.now();
          const dur = 1400;
          const tick = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            el.textContent = fmt.format(Math.round(end * (1 - Math.pow(1 - k, 4))));
            if (k < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.6 },
    );
    counters.forEach((c) => io.observe(c));
  }
})();
