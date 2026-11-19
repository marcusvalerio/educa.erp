// Home institucional do ATLAS.ERP: marca, navegação, revelação por rolagem.
(() => {
  document.documentElement.classList.add("js");

  // Navegação: fica sólida ao sair do palco escuro do topo.
  const nav = document.getElementById("nav");
  const hero = document.querySelector(".hero");
  const onScroll = () => nav.classList.toggle("solid", window.scrollY > hero.offsetHeight * 0.55);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });

  const burger = document.querySelector("[data-burger]");
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }));

  // Revelação escalonada por grupo.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => {
    const sibs = [...el.parentElement.children].filter((n) => n.classList.contains("reveal"));
    el.style.setProperty("--d", `${Math.min(sibs.indexOf(el), 6) * 0.08}s`);
    io.observe(el);
  });

  // Linha do fluxo "Do pedido ao caixa" se completa quando a seção entra.
  const flow = document.querySelector(".flow");
  if (flow) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { flow.style.setProperty("--p", "100%"); o.disconnect(); } }, { threshold: 0.4 }).observe(flow);

  const y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();
})();
