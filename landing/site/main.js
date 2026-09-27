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

  // Trilho do processo de cada módulo: o pulso só corre quando está visível.
  if (hasIO) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle("in-view", e.isIntersecting)), {
      rootMargin: "0px 0px -15% 0px",
    });
    document.querySelectorAll(".m-rail").forEach((r) => io.observe(r));
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
