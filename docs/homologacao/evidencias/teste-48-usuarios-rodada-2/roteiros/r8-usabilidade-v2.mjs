// Rodada 48 — usabilidade em desktop (1440×900), tablet (820×1180) e celular
// (390×844), por papel, na Cobalto Distribuidora (todos os papéis) e numa
// amostra das outras empresas. Sinais automáticos por tela; as capturas são a
// base da leitura crítica (textos técnicos, inglês, rótulos confusos, vazios).
import fs from "node:fs";
import { APP, shot, newUser, login, logout, state, close, bodyText, evidenceCard, check } from "./lib.mjs";
import { COMPANIES, ROLE_LABEL } from "./companies.mjs";

// Rodada 2: os 5 tamanhos pedidos — 390, 393, 430, 768 e 1440 px.
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  tablet: { viewport: { width: 768, height: 1024 }, hasTouch: true },
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  "celular-393": { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true },
  "celular-430": { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true },
};
const NF_DOC = process.env.NF_DOC ?? null;
const order = (D, t) => D.orders.find((o) => o.target === t)?.id;
const SCREENS = (D) => ({
  admin: [["inicio", "/app"], ["usuarios", "/app/admin/users"], ["papeis", "/app/admin/roles"], ["auditoria", "/app/admin/audit"], ["empresa", "/app/configuracoes/empresa"]],
  gerente: [["inicio", "/app"], ["pedidos", "/app/comercial/pedidos-venda"], ["pedido", `/app/comercial/pedidos-venda/${order(D, "entregue")}`], ["pedido-pendente", `/app/comercial/pedidos-venda/${order(D, "pendente")}`], ["dashboard", "/app/gestao/dashboard"], ["auditoria", "/app/gestao/auditoria"]],
  vendedor: [["inicio", "/app"], ["clientes", "/app/cadastros/clientes"], ["pedidos", "/app/comercial/pedidos-venda"], ["orcamentos", "/app/comercial/orcamentos"], ["pedido-rascunho", `/app/comercial/pedidos-venda/${order(D, "rascunho")}`]],
  operador: [["inicio", "/app"], ["produtos", "/app/cadastros/produtos"], ["estoque", "/app/logistica/estoque"], ["movimentacoes", "/app/logistica/movimentacoes"], ["transferencias", "/app/logistica/transferencias"]],
  financeiro: [["inicio", "/app"], ["contas-receber", "/app/financeiro/contas-receber"], ["contas-pagar", "/app/financeiro/contas-pagar"], ["fluxo-caixa", "/app/financeiro/fluxo-caixa"]],
  fiscal: [["inicio", "/app"], ["notas", "/app/fiscal/notas-fiscais"], ["ncm", "/app/fiscal/ncm"], ["cfop", "/app/fiscal/cfop"], ["impostos", "/app/fiscal/impostos"],
    ...(NF_DOC && D.__key === "vertice" ? [["nf-detalhe", `/app/fiscal/notas-fiscais/${NF_DOC}`], ["nf-simulada", `/app/fiscal/notas-fiscais/${NF_DOC}/documento-simulado`]] : [])],
  logistica: [["inicio", "/app"], ["recebimento", "/app/logistica/recebimento"], ["picking", "/app/logistica/picking"], ["expedicao", "/app/logistica/expedicao"], ["estoque", "/app/logistica/estoque"]],
  compras: [["inicio", "/app"], ["solicitacoes", "/app/suprimentos/solicitacao-compra"], ["cotacoes", "/app/suprimentos/cotacoes"], ["pedidos-compra", "/app/suprimentos/pedidos-compra"], ["fornecedores", "/app/cadastros/fornecedores"]],
  leitura: [["inicio", "/app"], ["pedidos", "/app/comercial/pedidos-venda"], ["clientes", "/app/cadastros/clientes"], ["pedido", `/app/comercial/pedidos-venda/${order(D, "entregue")}`]],
});

// Palavras de interface em inglês (sensível a maiúsculas; ignora marcas e siglas usuais).
const EN = /\b(Loading|Save|Cancel|Submit|Search|Settings|No results|No data|Rows per page|Next|Previous|Untitled|Failed|Unknown|Close|Edit|Delete|Actions|Draft|Pending|Approved|Shipped|Delivered|Overdue|Paid|Received|Open|Back|Select|Filter|Clear|Export|Import|Upload|Download|Required|Optional|Home|Profile|Logout|Sign in|Sign out|Error|Warning|Success|Items)\b/g; // "Total" e "Item" são português (rodada 2: falso positivo da rodada 1)
const RAW = /\b(?:[a-z]+_[a-z_]+|PENDING_APPROVAL|READY_TO_SHIP|RESERVATION_PENDING|PARTIALLY_\w+|OPEN|OVERDUE|PAID|RECEIVED|CANCELLED|CASH|BANK|INCOME|EXPENSE|SAIDA|ENTRADA|INTERNAL|SIMPLES_NACIONAL|BANK_TRANSFER|WHOLESALE|RETAIL|INDUSTRY|OTHER|RECEIPT|ISSUE|TRANSFER_IN|TRANSFER_OUT|draft|approved|reserved|shipped|delivered|cancelled|completed|picking|packed)\b/g;
const JUNK = /\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|\[object Object\]/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/;
const ERR_TEXT = /não foi possível carregar|erro inesperado|something went wrong|this page could not be found|Unhandled|Application error/i;

const rows = [["Empresa", "Papel", "Tela", "Dispositivo", "Carga ms", "Rolagem horiz.", "Inglês", "Código cru", "undefined/NaN", "UUID visível", "Botões sem nome", "Alvos < 32px", "API com erro", "Erro visível"]];
const findings = [];
const plan = [["cobalto", null], ["mares", ["vendedor", "leitura"]], ["sertao", ["logistica"]], ["prisma", ["financeiro", "leitura"]], ["lince", ["compras", "fiscal"]], ["vertice", ["fiscal", "gerente"]]];
for (const [key, onlyRoles] of plan) {
  const co = COMPANIES.find((c) => c.key === key);
  const D = { ...state.companies[key].data, __key: key };
  const screens = SCREENS(D);
  const people = [{ ...co.admin, role: "admin", key: "admin" }, ...co.users].filter((p, i, a) => (!onlyRoles || onlyRoles.includes(p.role)) && a.findIndex((x) => x.role === p.role) === i);
  for (const p of people) {
    for (const [dev, opts] of Object.entries(VIEWPORTS)) {
      const { c, page } = await newUser(opts);
      const bad = [];
      page.on("response", (r) => { const u = new URL(r.url()).pathname; if (u.startsWith("/api/") && r.status() >= 400) bad.push(`${r.status()} ${u.replace(/[0-9a-f-]{36}/g, ":id")}`); });
      await login(page, p.email);
      for (const [name, route] of screens[p.role] ?? []) {
        bad.length = 0;
        const t0 = Date.now();
        await page.goto(`${APP}${route}`, { waitUntil: "networkidle" }).catch(() => {});
        const ms = Date.now() - t0;
        await page.waitForTimeout(600);
        const txt = await bodyText(page);
        const sig = await page.evaluate((mobile) => {
          const overflow = document.documentElement.scrollWidth - window.innerWidth;
          const btns = [...document.querySelectorAll("button, [role=button], a[href]")].filter((b) => b.offsetParent !== null);
          const noName = btns.filter((b) => !(b.innerText || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("title") && !b.getAttribute("aria-labelledby")).length;
          const small = mobile ? btns.filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 32 || r.width < 32); }).length : 0;
          return { overflow, noName, small };
        }, dev !== "desktop");
        const en = [...new Set(txt.match(EN) ?? [])];
        const raw = [...new Set(txt.match(RAW) ?? [])];
        const junk = [...new Set(txt.match(JUNK) ?? [])];
        const uuid = UUID.test(txt);
        const errV = (txt.match(ERR_TEXT) ?? [""])[0];
        const apiBad = [...new Set(bad)];
        const row = [co.name, p.role === "admin" ? "Administrador" : ROLE_LABEL[p.role], route.replace(/[0-9a-f-]{36}/g, ":id"), dev, ms, sig.overflow > 2 ? `+${sig.overflow}px` : "não", en.join(", ") || "—", raw.join(", ") || "—", junk.join(", ") || "—", uuid ? "SIM" : "não", sig.noName, sig.small, apiBad.join(" | ") || "—", errV || "—"];
        rows.push(row);
        const problem = sig.overflow > 2 || en.length || raw.length || junk.length || uuid || apiBad.length || errV;
        const sample = key === "cobalto" && (dev !== "tablet" || name === "inicio" || name === "pedidos");
        if (problem || sample) await shot(page, "usabilidade", `${co.n}-${key}-${p.key}-${dev}-${name}`, { full: dev !== "desktop" });
        if (problem) findings.push({ company: co.name, role: p.role, route: row[2], dev, overflow: sig.overflow, en, raw, junk, uuid, apiBad, errV });
      }
      await logout(page).catch(() => {});
      await c.close();
    }
    console.log(`${co.name} · ${p.key}: ok`);
  }
}
for (const key of ["cobalto", "mares", "sertao", "prisma", "lince", "vertice"]) {
  const co = COMPANIES.find((c) => c.key === key);
  await evidenceCard(null, "usabilidade", `${co.n}-${key}-sinais`, `${co.name} — sinais de usabilidade por papel, tela e dispositivo`, [rows[0].slice(1), ...rows.filter((r) => r[0] === co.name).map((r) => r.slice(1))]);
}
fs.writeFileSync(new URL(`./r8-usabilidade${process.env.TAG ? "-" + process.env.TAG : ""}.out.json`, import.meta.url), JSON.stringify({ rows, findings }, null, 2));
const agg = (k) => rows.slice(1).filter((r) => r[k] !== "—" && r[k] !== "não" && r[k] !== 0).length;
check("usabilidade", `Rolagem horizontal: ${agg(5)} combinações tela×dispositivo`, agg(5) === 0, { expected: "0", actual: findings.filter((f) => f.overflow > 2).map((f) => `${f.role} ${f.route} ${f.dev} +${f.overflow}`).join("; ").slice(0, 600) });
check("usabilidade", `Inglês visível: ${agg(6)} telas`, agg(6) === 0, { expected: "0", actual: [...new Set(findings.flatMap((f) => f.en))].join(", ") });
check("usabilidade", `Código cru visível: ${agg(7)} telas`, agg(7) === 0, { expected: "0", actual: [...new Set(findings.flatMap((f) => f.raw))].join(", ") });
check("usabilidade", `undefined/NaN visível: ${agg(8)} telas`, agg(8) === 0, { expected: "0", actual: findings.filter((f) => f.junk.length).map((f) => `${f.route} ${f.junk}`).join("; ") });
check("usabilidade", `Chamadas de API com erro feitas pela própria tela: ${agg(12)} telas`, agg(12) === 0, { expected: "0", actual: findings.filter((f) => f.apiBad.length).map((f) => `${f.role} ${f.route}: ${f.apiBad.join(",")}`).join("; ").slice(0, 600) });
console.log(`telas avaliadas: ${rows.length - 1}; achados: ${findings.length}`);
await close();
