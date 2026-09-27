// EDUCA.ERP — landing. Melhoria progressiva: sem este script a página já está
// completa (primeira etapa ativa, primeira tela de cada módulo, mapa inteiro).
(() => {
  const root = document.documentElement;
  root.classList.add("js");

  // "Siga um pedido": a etapa no centro da tela define a tela do palco e a raia.
  const journey = document.querySelector(".journey");
  if (journey) {
    const steps = [...journey.querySelectorAll("[data-step]")];
    const items = [...journey.querySelectorAll("[data-stage-item]")];
    const lanes = [...journey.querySelectorAll("[data-lane]")];
    const fire = journey.querySelector(".lane-fire");
    let current = 0;
    const activate = (i) => {
      if (i === current) return;
      current = i;
      steps.forEach((el, k) => el.classList.toggle("is-active", k === i));
      items.forEach((el, k) => el.classList.toggle("is-active", k === i));
      lanes.forEach((el, k) => {
        el.classList.toggle("is-active", k === i);
        el.classList.toggle("is-done", k < i);
      });
      if (fire) fire.style.setProperty("--p", i);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) activate(Number(e.target.dataset.step));
          });
        },
        { rootMargin: "-45% 0px -50% 0px" },
      );
      steps.forEach((s) => io.observe(s));
    }
  }

  // Visualizador de telas: abas acessíveis (setas, Home, End).
  document.querySelectorAll("[data-viewer]").forEach((viewer) => {
    const tabs = [...viewer.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
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
      if (focus) tabs[i].focus();
      tabs[i].scrollIntoView({ block: "nearest", inline: "nearest" });
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
  });

  // Mapa de conexões: tocar/focar uma área destaca só as ligações dela.
  const net = document.querySelector(".network");
  if (net) {
    const nodes = [...net.querySelectorAll("[data-node]")];
    const edges = [...net.querySelectorAll(".edge")];
    const rows = [...net.querySelectorAll(".net-list li")];
    let pinned = null;
    const show = (id) => {
      net.classList.toggle("has-focus", Boolean(id));
      const peers = new Set();
      [...edges, ...rows].forEach((el) => {
        const on = Boolean(id) && (el.dataset.a === id || el.dataset.b === id);
        el.classList.toggle("is-on", on);
        if (on) peers.add(el.dataset.a === id ? el.dataset.b : el.dataset.a);
      });
      nodes.forEach((n) => {
        n.classList.toggle("is-on", n.dataset.node === id);
        n.classList.toggle("is-peer", peers.has(n.dataset.node));
        n.setAttribute("aria-pressed", String(n.dataset.node === pinned));
      });
    };
    nodes.forEach((n) => {
      const id = n.dataset.node;
      n.addEventListener("mouseenter", () => show(id));
      n.addEventListener("mouseleave", () => show(pinned));
      n.addEventListener("focus", () => show(id));
      n.addEventListener("blur", () => show(pinned));
      const toggle = () => {
        pinned = pinned === id ? null : id;
        show(pinned);
      };
      n.addEventListener("click", toggle);
      n.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        } else if (e.key === "Escape") {
          pinned = null;
          show(null);
        }
      });
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
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (counters.length && !reduce && "IntersectionObserver" in window) {
    const fmt = new Intl.NumberFormat("pt-BR");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const el = e.target;
          const end = Number(el.dataset.count);
          const t0 = performance.now();
          const dur = 1100;
          const tick = (t) => {
            const k = Math.min(1, (t - t0) / dur);
            el.textContent = fmt.format(Math.round(end * (1 - Math.pow(1 - k, 3))));
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
