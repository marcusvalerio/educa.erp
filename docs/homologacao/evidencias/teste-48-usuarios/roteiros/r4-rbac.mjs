// Rodada 48 — RBAC: TODOS os 48 usuários (admin incluído), cada um contra
// ~24 operações de API e ~12 rotas de tela. Esperado: permitido ⇔ o papel tem
// a permissão no banco; negado = 403 (API) e "acesso restrito" (tela).
// Também confere uma expectativa de NEGÓCIO por papel (ex.: Compras não aprova
// pedido de compra; Somente leitura não grava nada).
import fs from "node:fs";
import { check, shot, session, logout, goto, api, post, state, close, bodyText, evidenceCard, inDays } from "./lib.mjs";
import { COMPANIES, ROLE_LABEL, CUSTOM_ROLES } from "./companies.mjs";
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:55440/educa_poc", max: 2 });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

// Rota de tela → permissão(ões), lida do próprio menu (src/lib/nav.ts).
const navSrc = fs.readFileSync("/home/user/educa-app/src/lib/nav.ts", "utf8");
const ROUTE_PERM = {};
for (const m of navSrc.matchAll(/href: "([^"]+)", permission: (\[[^\]]+\]|"[^"]+")/g)) ROUTE_PERM[m[1]] = JSON.parse(m[2]);
const UI_ROUTES = ["/app/comercial/pedidos-venda", "/app/suprimentos/pedidos-compra", "/app/suprimentos/solicitacao-compra", "/app/logistica/estoque", "/app/logistica/recebimento",
  "/app/financeiro/contas-receber", "/app/financeiro/contas-pagar", "/app/fiscal/notas-fiscais", "/app/logistica/expedicao", "/app/admin/users", "/app/admin/roles", "/app/gestao/dashboard/financeiro", "/app/gestao/auditoria"]
  .filter((r) => ROUTE_PERM[r] || console.log("rota sem permissão no menu (ignorada):", r));

// Ordem: papéis que devem ser negados primeiro; quem pode executar vem depois.
const ORDER = ["leitura", "vendedor", "operador", "compras", "financeiro", "fiscal", "logistica", "gerente", "admin"];
const BUSINESS = {
  "aprovar pedido de venda": { gerente: true, admin: true, vendedor: false, operador: false, financeiro: false, fiscal: false, logistica: false, leitura: false, compras: false },
  "aprovar pedido de compra": { gerente: true, admin: true, compras: false, vendedor: false, operador: false, financeiro: false, fiscal: false, logistica: false, leitura: false },
  "convidar usuário": { admin: true, gerente: false, vendedor: false, operador: false, financeiro: false, fiscal: false, logistica: false, leitura: false, compras: false },
  "alterar permissões de papel": { admin: true, gerente: false, vendedor: false, operador: false, financeiro: false, fiscal: false, logistica: false, leitura: false, compras: false },
  "criar conta a pagar": { gerente: true, financeiro: true, admin: true, vendedor: false, operador: false, fiscal: false, logistica: false, leitura: false, compras: false },
  "criar NCM": { gerente: true, fiscal: true, admin: true, vendedor: false, operador: false, financeiro: false, logistica: false, leitura: false, compras: false },
  "entrada de estoque": { gerente: true, operador: true, logistica: true, admin: true, vendedor: false, financeiro: false, fiscal: false, leitura: false },
  "criar cliente": { gerente: true, vendedor: true, admin: true, leitura: false, fiscal: false, logistica: false, compras: false },
  "criar pedido de venda": { gerente: true, vendedor: true, admin: true, leitura: false, financeiro: false, fiscal: false, logistica: false, compras: false },
  "criar solicitação de compra": { compras: true, gerente: true, admin: true, leitura: false, vendedor: false, financeiro: false, fiscal: false },
  "baixar parcela a receber": { financeiro: true, gerente: true, admin: true, leitura: false, vendedor: false, operador: false, fiscal: false, logistica: false, compras: false },
};

const matrix = [["Empresa", "Usuário", "Papel", "Operação", "Permissão", "Configurado", "HTTP", "Resultado", "Negócio"]];
const ui = [["Empresa", "Papel", "Rota", "Permissão", "Esperado", "Tela", "Resultado"]];
const diverge = [];
let pass = 0, fail = 0;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const RUN_COS = COMPANIES.filter((c) => !ONLY || ONLY.includes(c.key));
for (const co of RUN_COS) {
  const st = state.companies[co.key];
  const D = st.data;
  const cid = st.companyId;
  const pending = D.orders.filter((o) => o.target === "pendente").map((o) => o.id);
  const approved = D.orders.find((o) => o.target === "aprovado")?.id;
  const [finRole] = await q(`select id from roles where company_id = $1 and code = 'FINANCEIRO'`, [cid]);
  const [inst] = await q(`select i.id from accounts_receivable_installments i where i.company_id = $1 and i.status in ('open','pending','partial') order by i.due_date limit 1`, [cid]).catch(() => []);
  const people = [{ ...co.admin, role: "admin", key: "admin" }, ...co.users].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));
  // PC rascunho para a sonda "aprovar pedido de compra" (um por empresa, criado pelo Gerente via banco de leitura).
  const [poDraft] = await q(`select id from purchase_orders where company_id = $1 and status in ('pending_approval','submitted','draft') order by created_at desc limit 1`, [cid]);
  let n = 0;
  for (const u of people) {
    n++;
    const perms = new Set((await q(`select p.code from users us join user_roles ur on ur.user_id = us.id join role_permissions rp on rp.role_id = ur.role_id join permissions p on p.id = rp.permission_id where us.company_id = $1 and us.email = $2`, [cid, u.email])).map((r) => r.code));
    const s = await session(u.email);
    const tag = `${co.prefix}-${u.key}`;
    const ops = [
      ["listar clientes", "customers.read", "GET", "/api/customers"],
      ["listar produtos", "products.read", "GET", "/api/products"],
      ["listar fornecedores", "suppliers.read", "GET", "/api/suppliers"],
      ["listar pedidos de venda", "sales_orders.view", "GET", "/api/sales-orders"],
      ["listar pedidos de compra", "purchase_orders.view", "GET", "/api/purchase-orders"],
      ["consultar saldos de estoque", "stock.view", "GET", "/api/stock-balances"],
      ["listar contas a receber", "accounts_receivable.view", "GET", "/api/accounts-receivable"],
      ["listar contas a pagar", "accounts_payable.view", "GET", "/api/accounts-payable"],
      ["listar documentos fiscais", "fiscal_documents.view", "GET", "/api/fiscal-documents"],
      ["listar expedições", "shipments.view", "GET", "/api/shipments"],
      ["ler auditoria da empresa", "audit_logs.read", "GET", "/api/admin/audit"],
      ["listar usuários", "users.read", "GET", "/api/admin/users"],
      ["criar cliente", "customers.create", "POST", "/api/customers", { tipo: "Pessoa Jurídica", nome: `Cliente do teste de permissão (${tag})`, documento: "", segmento: "OTHER" }],
      ["alterar produto", "products.update", "PATCH", `/api/products/${D.products[1].id}`, { descricaoCurta: `Revisado (${u.key})` }],
      ["criar pedido de venda", "sales_orders.create", "POST", "/api/sales-orders", { customerId: D.customers[3], notes: `Rascunho do teste de permissão (${tag})`, items: [{ productId: D.products[2].id, description: D.products[2].description, quantity: 1, unitPrice: D.products[2].price }] }],
      ["aprovar pedido de venda", "sales_orders.approve", "POST", `/api/sales-orders/${["gerente", "admin"].includes(u.role) ? pending[0] : pending[1]}/approve`],
      ["reservar pedido aprovado", "sales_orders.reserve", "POST", `/api/sales-orders/${approved}/reserve`, { locationId: D.locations.pick }],
      ["criar solicitação de compra", "purchase_requests.create", "POST", "/api/purchase-requests", { notes: `Teste de permissão (${tag})`, items: [{ productId: D.products[4].id, quantity: 1 }] }],
      ["aprovar pedido de compra", "purchase_orders.approve", "POST", `/api/purchase-orders/${poDraft?.id ?? "00000000-0000-4000-8000-000000000000"}/approve`],
      ["entrada de estoque", "stock.create", "POST", "/api/stock-movements/receive", { productId: D.products[3].id, locationId: D.locations.rec, quantity: 1, unitCost: D.products[3].cost, notes: `Teste de permissão (${u.key})`, idempotencyKey: `r48rbac-${tag}` }],
      ["criar conta a pagar", "accounts_payable.create", "POST", "/api/accounts-payable", { supplierId: D.suppliers[0], description: `Título do teste de permissão (${tag})`, originalAmount: 10, installments: [{ dueDate: inDays(20), amount: 10 }] }],
      ["baixar parcela a receber", "receipts.create", "POST", `/api/accounts-receivable-installments/${inst?.id ?? "00000000-0000-4000-8000-000000000000"}/receive`, { amount: 0.01, paymentDate: inDays(0), financialAccountId: "00000000-0000-4000-8000-000000000000" }],
      ["criar NCM", "fiscal_ncms.create", "POST", "/api/fiscal-ncms", { code: `9998${String(n).padStart(4, "0")}`, description: `NCM do teste de permissão (${tag})` }],
      ["convidar usuário", "users.create", "POST", "/api/admin/users/invite", { name: "Convite de teste", email: `teste.${u.key}@${co.domain}`, roleId: "00000000-0000-4000-8000-000000000000" }],
      ["alterar permissões de papel", "roles.manage", "PUT", `/api/admin/roles/${finRole.id}/permissions`, { permissionCodes: CUSTOM_ROLES.financeiro.permissions }],
    ];
    const roleLabel = u.role === "admin" ? "Administrador" : ROLE_LABEL[u.role];
    for (const [label, perm, method, url, body] of ops) {
      const r = method === "GET" ? await api(s.page, url) : await post(s.page, url, body, method);
      const configured = perms.has(perm);
      const silent = method === "GET" && r.status === 200 && Array.isArray(r.body?.data) && r.body.data.length === 0 && !configured;
      const denied = r.status === 403 || r.status === 401 || silent;
      const ok = configured ? !denied && r.status < 500 : denied;
      const biz = BUSINESS[label]?.[u.role];
      const bizOk = biz === undefined || biz === !denied;
      ok ? pass++ : fail++;
      matrix.push([co.name, u.key, roleLabel, label, perm, configured ? "sim" : "não", silent ? "200 (vazia)" : r.status, ok ? "PASS" : "FAIL", biz === undefined ? "—" : bizOk ? "coerente" : "DIVERGE"]);
      if (!ok || r.status >= 500) check("rbac", `${roleLabel} — ${label}`, false, { company: co.name, user: u.email, target: `${method} ${url.replace(/[0-9a-f-]{36}/g, ":id")}`, expected: configured ? `permitido (${perm})` : `403 (${perm} ausente)`, actual: `${r.status} ${JSON.stringify(r.body?.error ?? "").slice(0, 160)}` });
      if (!bizOk) diverge.push(`${co.name} · ${roleLabel} · ${label}: ${denied ? "negado" : "permitido"} (esperado ${biz ? "permitido" : "negado"})`);
    }
    // Telas: cada rota por URL direta.
    for (const route of UI_ROUTES) {
      const need = [].concat(ROUTE_PERM[route]);
      const allowed = need.some((p) => perms.has(p));
      await goto(s.page, route);
      await s.page.waitForTimeout(500);
      const t = await bodyText(s.page);
      const restricted = /acesso restrito|sem acesso a este|não tem permiss|sem permiss|não autorizado/i.test(t);
      const ok = allowed ? !restricted : restricted;
      ok ? pass++ : fail++;
      ui.push([co.name, roleLabel, route, need.join(" | "), allowed ? "abre" : "restrito", restricted ? "restrito" : "abre", ok ? "PASS" : "FAIL"]);
      if (!ok) {
        const ev = await shot(s.page, "rbac", `ui-${co.n}-${u.key}-${route.replace(/\W+/g, "-")}`);
        check("rbac", `${roleLabel}: tela ${route}`, false, { company: co.name, user: u.email, target: route, expected: allowed ? "abre" : "acesso restrito", actual: t.slice(0, 160).replace(/\s+/g, " "), evidence: ev });
      }
    }
    if (co.key === "cobalto") {
      await goto(s.page, "/app");
      await s.page.waitForTimeout(700);
      await shot(s.page, "rbac", `${co.n}-${co.key}-${u.key}-menu-do-papel`);
    }
    await logout(s.page);
    await s.c.close();
    console.log(`${co.name} · ${u.key}: ok`);
  }
}
for (const co of RUN_COS) await evidenceCard(null, "rbac", `${co.n}-${co.key}-rbac-api`, `RBAC — ${co.name}: usuários × operações de API`, [matrix[0].slice(1), ...matrix.filter((r) => r[0] === co.name).map((r) => r.slice(1))]);
for (const co of RUN_COS) await evidenceCard(null, "rbac", `${co.n}-${co.key}-rbac-telas`, `RBAC — ${co.name}: rotas de tela por URL direta`, [ui[0].slice(1), ...ui.filter((r) => r[0] === co.name).map((r) => r.slice(1))]);
for (const d of diverge) check("rbac", `Regra de negócio: ${d}`, false, { target: "expectativa de negócio × papel", expected: "ver regra", actual: d });
if (!ONLY) await evidenceCard(null, "rbac", "00-rbac-resumo", "RBAC — 48 usuários × (25 operações de API + 12 telas)", [["Verificações", "PASS", "FAIL", "Divergências de negócio"], [pass + fail, pass, fail, diverge.length]]);
fs.writeFileSync(new URL(`./r4-rbac${ONLY ? "-" + ONLY.join("_") : ""}.out.json`, import.meta.url), JSON.stringify({ pass, fail, diverge, matrix, ui, matrixFails: matrix.filter((r) => r[7] === "FAIL"), uiFails: ui.filter((r) => r[6] === "FAIL") }, null, 2));
console.log(`rbac: ${pass} PASS, ${fail} FAIL; divergências de negócio: ${diverge.length}`);
for (const d of diverge) console.log("  DIVERGE", d);
await db.end();
await close();
