// Rodada 48 — dia de trabalho simultâneo: os 48 usuários logados ao mesmo
// tempo, cada um executando a rotina do seu papel em paralelo (API real com a
// sessão do navegador), enquanto 14 deles também navegam pelas telas.
// Conflitos surgem naturalmente: o Gerente aprova o pedido que o Vendedor
// acabou de enviar, a Logística reserva o que o Gerente aprovou, o Financeiro
// gera o título do mesmo pedido. Mede HTTP, latência, 5xx e erros de tela.
import fs from "node:fs";
import { newUser, login, api, post, idOf, state, close, goto, bodyText, evidenceCard, inDays, shot } from "./lib.mjs";
import { COMPANIES, ROLE_LABEL } from "./companies.mjs";

const ROUNDS = Number(process.env.ROUNDS ?? 4);
const calls = [];
const uiErrors = [];
const t0 = Date.now();
const dv = (n, w) => { const r = n.reduce((a, d, i) => a + d * w[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
const cnpj = () => { const b = [...Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)), 0, 0, 0, 1]; const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]); return [...b, d1, dv([...b, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])].join(""); };
const PERIOD = "periodStart=2026-10-01&periodEnd=2026-10-31";

async function timed(user, label, fn) {
  const s = Date.now();
  let r;
  try { r = await fn(); } catch (e) { r = { status: 0, body: String(e).slice(0, 120) }; }
  calls.push({ co: user.co.key, who: user.p.key, role: user.p.role, label, status: r.status, ms: Date.now() - s, err: r.status >= 400 ? (r.body?.error?.message ?? JSON.stringify(r.body ?? "")).slice(0, 140) : undefined });
  return r;
}
const pick = (arr, i) => arr[i % arr.length];

// Rotina de cada papel (uma "volta"); i = número da volta.
const ROUTINE = {
  async vendedor(u, i) {
    const { page, D, co } = u;
    await timed(u, "listar clientes", () => api(page, "/api/customers?pageSize=50"));
    const c = await timed(u, "criar cliente", () => post(page, "/api/customers", { tipo: "Pessoa Jurídica", nome: `Cliente do dia ${u.p.key}-${i} (${co.prefix})`, documento: cnpj(), segmento: "OTHER", condicaoPagamento: "30 dias" }));
    const prod = pick(D.products.filter((p) => p.stockProfile === "normal"), i + u.idx);
    const o = await timed(u, "criar pedido", () => post(page, "/api/sales-orders", { customerId: idOf(c) ?? pick(D.customers, i), paymentTermsId: D.paymentTermId, expectedDeliveryAt: inDays(4), notes: `Pedido do dia (${u.p.key}, volta ${i})`, items: [{ productId: prod.id, description: prod.description, unit: "UN", quantity: 2 + (i % 3), unitPrice: prod.price, discount: 0 }] }));
    if (idOf(o)) await timed(u, "enviar pedido", () => post(page, `/api/sales-orders/${idOf(o)}/submit`));
    await timed(u, "ver pedidos", () => api(page, "/api/sales-orders?pageSize=50"));
  },
  async gerente(u) {
    const { page } = u;
    const pend = (await timed(u, "pedidos aguardando aprovação", () => api(page, "/api/sales-orders?status=pending_approval&pageSize=50"))).body?.data ?? [];
    for (const o of pend.slice(0, 3)) await timed(u, "aprovar pedido", () => post(page, `/api/sales-orders/${o.id}/approve`));
    await timed(u, "painel executivo", () => api(page, `/api/reports/executive?${PERIOD}`));
    await timed(u, "relatório comercial", () => api(page, `/api/reports/commercial?${PERIOD}`));
    const sh = (await timed(u, "expedições embaladas", () => api(page, "/api/shipments?status=packed"))).body?.data ?? [];
    for (const s of sh.slice(0, 1)) await timed(u, "aprovar expedição", () => post(page, `/api/shipments/${s.id}/approve`));
  },
  async operador(u, i) {
    const { page, D } = u;
    const prod = pick(D.products, i + u.idx);
    await timed(u, "entrada de estoque", () => post(page, "/api/stock-movements/receive", { productId: prod.id, locationId: D.locations.rec, quantity: 5, unitCost: prod.cost, notes: `Reposição do dia (${u.p.key})`, idempotencyKey: `r48dia-${u.co.prefix}-${u.p.key}-${i}-${t0}` }));
    await timed(u, "consultar saldos", () => api(page, `/api/stock-balances?productId=${prod.id}`));
    const tr = await timed(u, "criar transferência para o picking", () => post(page, "/api/stock-transfers", { fromLocationId: D.locations.rec, toLocationId: D.locations.pick, notes: "Abastecimento do picking", items: [{ productId: prod.id, quantity: 2 }] }));
    if (idOf(tr)) {
      await timed(u, "despachar transferência", () => post(page, `/api/stock-transfers/${idOf(tr)}/ship`, { idempotencyKey: `r48dia-trs-${u.co.prefix}-${u.p.key}-${i}-${t0}` }));
      await timed(u, "receber transferência", () => post(page, `/api/stock-transfers/${idOf(tr)}/receive`, { idempotencyKey: `r48dia-trr-${u.co.prefix}-${u.p.key}-${i}-${t0}` }));
    }
    await timed(u, "movimentações", () => api(page, "/api/stock-movements?pageSize=50"));
  },
  async logistica(u) {
    const { page, D } = u;
    const appr = (await timed(u, "pedidos aprovados", () => api(page, "/api/sales-orders?status=approved&pageSize=50"))).body?.data ?? [];
    for (const o of appr.slice(0, 2)) await timed(u, "reservar estoque", () => post(page, `/api/sales-orders/${o.id}/reserve`, { locationId: D.locations.pick }));
    const res = (await timed(u, "pedidos reservados", () => api(page, "/api/sales-orders?status=reserved&pageSize=50"))).body?.data ?? [];
    for (const o of res.slice(0, 1)) {
      const pl = await timed(u, "criar separação", () => post(page, `/api/sales-orders/${o.id}/pick-lists`, { warehouseId: D.warehouseId, notes: "Separação do dia" }));
      const id = idOf(pl);
      if (!id) continue;
      await timed(u, "iniciar separação", () => post(page, `/api/pick-lists/${id}/start`));
      const items = (await timed(u, "itens da separação", () => api(page, `/api/pick-lists/${id}`))).body?.data?.items ?? [];
      for (const it of items) await timed(u, "separar item", () => post(page, `/api/pick-lists/${id}/items/${it.id}/pick`, { pickedQuantity: Number(it.requested_quantity) }));
      await timed(u, "concluir separação", () => post(page, `/api/pick-lists/${id}/complete`));
    }
    await timed(u, "expedições", () => api(page, "/api/shipments"));
  },
  async financeiro(u) {
    const { page, D } = u;
    const appr = (await timed(u, "pedidos aprovados", () => api(page, "/api/sales-orders?status=approved&pageSize=50"))).body?.data ?? [];
    for (const o of appr.slice(0, 2)) await timed(u, "gerar conta a receber", () => post(page, `/api/sales-orders/${o.id}/generate-receivable`, { categoryId: D.incomeCat }));
    const ar = (await timed(u, "contas a receber", () => api(page, "/api/accounts-receivable?status=OPEN"))).body?.data ?? [];
    const first = ar[0] && (await timed(u, "detalhe do título", () => api(page, `/api/accounts-receivable/${ar[0].id}`))).body?.data;
    const inst = first?.installments?.find((x) => x.status === "OPEN" || x.status === "OVERDUE" || x.status === "PARTIALLY_RECEIVED");
    if (inst) await timed(u, "receber parcela", () => post(page, `/api/accounts-receivable-installments/${inst.id}/receive`, { financialAccountId: D.bankId, amount: Number(inst.amount) - Number(inst.received_amount ?? 0), method: "PIX", idempotencyKey: `r48dia-${inst.id}` }));
    await timed(u, "fluxo de caixa", () => api(page, "/api/cash-flow-summary"));
    await timed(u, "contas a pagar", () => api(page, "/api/accounts-payable"));
  },
  async fiscal(u) {
    const { page } = u;
    await timed(u, "documentos fiscais", () => api(page, "/api/fiscal-documents"));
    await timed(u, "NCMs", () => api(page, "/api/fiscal-ncms"));
    await timed(u, "relatório fiscal", () => api(page, `/api/reports/fiscal?${PERIOD}`));
    await timed(u, "perfis fiscais", () => api(page, "/api/product-fiscal-profiles"));
  },
  async compras(u, i) {
    const { page, D } = u;
    const prod = pick(D.products, i);
    const sc = await timed(u, "criar solicitação de compra", () => post(page, "/api/purchase-requests", { department: "Suprimentos", priority: "medium", justification: `Reposição do dia (${u.p.key})`, neededBy: inDays(7), items: [{ productId: prod.id, description: prod.description, unit: "UN", quantity: 20 }] }));
    if (idOf(sc)) await timed(u, "enviar solicitação", () => post(page, `/api/purchase-requests/${idOf(sc)}/submit`));
    await timed(u, "pedidos de compra", () => api(page, "/api/purchase-orders"));
    await timed(u, "relatório de compras", () => api(page, `/api/reports/purchases?${PERIOD}`));
  },
  async leitura(u) {
    const { page, D } = u;
    for (const url of ["/api/customers", "/api/products", "/api/sales-orders", "/api/stock-balances", "/api/accounts-receivable", `/api/reports/executive?${PERIOD}`]) await timed(u, `consulta ${url}`, () => api(page, url));
    await timed(u, "tentar criar cliente (deve ser negado)", () => post(page, "/api/customers", { tipo: "Pessoa Jurídica", nome: "Não deveria gravar", documento: "", segmento: "OTHER" }));
    await timed(u, "tentar cancelar pedido (deve ser negado)", () => post(page, `/api/sales-orders/${D.orders.find((o) => o.target === "aprovado")?.id}/cancel`, { reason: "x" }));
  },
  async admin(u) {
    const { page } = u;
    await timed(u, "usuários", () => api(page, "/api/admin/users"));
    await timed(u, "auditoria", () => api(page, "/api/admin/audit"));
    await timed(u, "papéis", () => api(page, "/api/admin/roles"));
    await timed(u, "contexto da sessão", () => api(page, "/api/session/context"));
  },
};

const UI_TOUR = ["/app", "/app/comercial/pedidos-venda", "/app/logistica/estoque", "/app/financeiro/contas-receber", "/app/fiscal/notas-fiscais", "/app/logistica/expedicao", "/app/gestao/dashboard"];

// 1) Todos entram (48 sessões abertas ao mesmo tempo).
const users = [];
let idx = 0;
for (const co of COMPANIES) {
  const D = state.companies[co.key].data;
  for (const p of [{ ...co.admin, role: "admin", key: "admin" }, ...co.users]) {
    const u = await newUser();
    const s = Date.now();
    await login(u.page, p.email);
    calls.push({ co: co.key, who: p.key, role: p.role, label: "login", status: 200, ms: Date.now() - s });
    users.push({ ...u, co, p, D, idx: idx++ });
  }
}
console.log(`${users.length} sessões abertas em ${Math.round((Date.now() - t0) / 1000)} s`);

// 2) Dia simultâneo: todos rodam ROUNDS voltas ao mesmo tempo; 2 por empresa também navegam.
const uiUsers = new Set(COMPANIES.flatMap((co) => users.filter((u) => u.co.key === co.key).slice(1, 3)));
const tDay = Date.now();
await Promise.all(users.map(async (u) => {
  const fn = ROUTINE[u.p.role] ?? ROUTINE.leitura;
  u.page.on("pageerror", (e) => uiErrors.push({ co: u.co.key, who: u.p.key, url: u.page.url(), err: String(e).slice(0, 160) }));
  u.page.on("response", (r) => { if (r.status() >= 500) uiErrors.push({ co: u.co.key, who: u.p.key, url: r.url(), err: `HTTP ${r.status()}` }); });
  for (let i = 0; i < ROUNDS; i++) {
    await fn(u, i);
    if (uiUsers.has(u)) {
      const route = UI_TOUR[(i + u.idx) % UI_TOUR.length];
      const s = Date.now();
      await goto(u.page, route).catch((e) => uiErrors.push({ co: u.co.key, who: u.p.key, url: route, err: String(e).slice(0, 120) }));
      const t = await bodyText(u.page);
      calls.push({ co: u.co.key, who: u.p.key, role: u.p.role, label: `tela ${route}`, status: /algo deu errado|erro inesperado|application error|internal server/i.test(t) ? 500 : 200, ms: Date.now() - s });
    }
  }
}));
const dayMs = Date.now() - tDay;
await shot(users[1].page, "dia", "01-tela-durante-o-dia-simultaneo");

// 3) Resumo.
const sorted = (a) => [...a].sort((x, y) => x - y);
const pct = (a, p) => (a.length ? sorted(a)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);
const byStatus = {};
for (const c of calls) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
const s5 = calls.filter((c) => c.status >= 500 || c.status === 0);
const byLabel = {};
for (const c of calls) (byLabel[c.label] ??= []).push(c);
const labelRows = Object.entries(byLabel).map(([l, a]) => [l, a.length, a.filter((x) => x.status < 300).length, a.filter((x) => x.status >= 400 && x.status < 500).length, a.filter((x) => x.status >= 500 || x.status === 0).length, pct(a.map((x) => x.ms), 50), pct(a.map((x) => x.ms), 95)]).sort((a, b) => b[6] - a[6]);
const errs = {};
for (const c of calls.filter((c) => c.status >= 400)) errs[`${c.label} → ${c.status} ${c.err ?? ""}`] = (errs[`${c.label} → ${c.status} ${c.err ?? ""}`] ?? 0) + 1;
const summary = { users: users.length, rounds: ROUNDS, calls: calls.length, dayMs, byStatus, s5: s5.length, p50: pct(calls.map((c) => c.ms), 50), p95: pct(calls.map((c) => c.ms), 95), max: Math.max(...calls.map((c) => c.ms)), uiErrors: uiErrors.length };
await evidenceCard(null, "dia", "00-dia-simultaneo-resumo", `Dia simultâneo — ${users.length} usuários, ${ROUNDS} voltas cada`, [["Usuários", "Chamadas", "Duração (s)", "HTTP", "5xx/rede", "p50 (ms)", "p95 (ms)", "máx (ms)", "Erros de tela"], [summary.users, summary.calls, Math.round(dayMs / 1000), JSON.stringify(byStatus), summary.s5, summary.p50, summary.p95, summary.max, summary.uiErrors]]);
await evidenceCard(null, "dia", "01-dia-por-operacao", "Dia simultâneo — por operação (ordenado pelo p95)", [["Operação", "Chamadas", "2xx", "4xx", "5xx", "p50 ms", "p95 ms"], ...labelRows]);
await evidenceCard(null, "dia", "02-dia-recusas", "Dia simultâneo — respostas 4xx/5xx agrupadas (mensagem exibida)", [["Operação → HTTP mensagem", "Ocorrências"], ...Object.entries(errs).sort((a, b) => b[1] - a[1])]);
fs.writeFileSync(new URL("./r6-dia.out.json", import.meta.url), JSON.stringify({ summary, labelRows, errs, s5, uiErrors }, null, 2));
console.log(JSON.stringify(summary));
for (const u of users) await u.c.close();
await close();
