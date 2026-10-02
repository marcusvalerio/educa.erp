// Rodada 48 — isolamento entre empresas: matriz COMPLETA (7 × 6 = 42 pares).
// Para cada par A → B: ~40 tentativas por API (GET/PATCH/DELETE/ações por ID
// conhecido de B, associações cruzadas, filtros e busca com IDs/nomes de B,
// exportação), URL direta de telas, listas de A e banco de B antes × depois.
// Sessão do ADMINISTRADOR de A (perfil mais forte) e, em um subconjunto, de
// um usuário comum de A. Esperado: negação consistente, nenhum dado de B.
import { check, shot, session, goto, api, post, state, close, bodyText, evidenceCard } from "./lib.mjs";
import { COMPANIES } from "./companies.mjs";
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:55440/educa_poc", max: 2 });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const DENIED = (s) => [401, 403, 404, 405, 409, 422].includes(s);
const rows = [["Par", "Perfil de A", "Entidade", "Tentativa", "HTTP", "Vazou dado de B?", "Resultado"]];
const byStatus = {};
let pass = 0, fail = 0;
const fails = [];

// Tabelas que contêm company_id para conferir listas devolvidas com 200.
const TABLE_OF = {
  "/api/customers": "customers", "/api/products": "products", "/api/suppliers": "suppliers", "/api/sales-orders": "sales_orders",
  "/api/stock-balances": "stock_balances", "/api/stock-movements": "stock_movements", "/api/accounts-receivable": "accounts_receivable",
  "/api/accounts-payable": "accounts_payable", "/api/fiscal-documents": "fiscal_documents", "/api/shipments": "shipments",
  "/api/audit-logs": "audit_logs", "/api/admin/audit": "audit_logs", "/api/stock-reservations": "stock_reservations",
  "/api/pick-lists": "pick_lists", "/api/purchase-orders": "purchase_orders", "/api/admin/users": "users", "/api/users": "users",
};

// Marcas de cada empresa (o que não pode aparecer na resposta de outra).
const MARKS = {};
const IDS = {};
for (const co of COMPANIES) {
  const st = state.companies[co.key];
  const D = st.data;
  const cid = st.companyId;
  const order = D.orders.find((o) => o.target === "entregue") ?? D.orders[0];
  const [c] = await q(`select name, document from customers where id = $1`, [D.customers[0]]);
  const [o] = await q(`select code from sales_orders where id = $1`, [order.id]);
  const [s] = await q(`select legal_name as name, document from suppliers where id = $1`, [D.suppliers[0]]);
  const [u] = await q(`select u.id, u.email, (select role_id from user_roles ur where ur.user_id = u.id limit 1) role_id from users u where u.company_id = $1 and u.email = $2`, [cid, co.users[0].email]);
  const [po] = await q(`select id, code from purchase_orders where company_id = $1 order by created_at limit 1`, [cid]);
  const [br] = await q(`select id from branches where company_id = $1 limit 1`, [cid]);
  const [fd] = await q(`select id from fiscal_documents where company_id = $1 limit 1`, [cid]);
  const [ar] = await q(`select id from accounts_receivable where company_id = $1 limit 1`, [cid]);
  const [ari] = await q(`select id from accounts_receivable_installments where company_id = $1 and status <> 'paid' limit 1`, [cid]).catch(() => [null]);
  const [ap] = await q(`select id from accounts_payable where company_id = $1 limit 1`, [cid]);
  MARKS[co.key] = [c.name, c.document, o.code, co.products?.[0]?.description ?? D.products[0].description, u.email, s.name, s.document, po?.code].filter((x) => x && String(x).length > 4);
  IDS[co.key] = {
    cid, cust: D.customers[0], custName: c.name, prod: D.products[0].id, prodSku: D.products[0].sku ?? D.products[0].codigo, sup: D.suppliers[0],
    order: order.id, orderCode: o.code, ship: order.shipmentId, loc: D.locations.pick, wh: D.warehouseId,
    ar: ar?.id, ari: ari?.id, ap: ap?.id, doc: fd?.id, po: po?.id, user: u.id, userRole: u.role_id, branch: br.id,
    role: st.roles?.financeiro, payTerm: D.paymentTermId,
  };
}

// Instantâneo do banco de cada empresa antes da bateria.
const snap = async (cid) => (await q(`select
  (select count(*) from customers where company_id=$1)::int clientes,
  (select count(*) from products where company_id=$1)::int produtos,
  (select count(*) from sales_orders where company_id=$1)::int pedidos,
  (select count(*) from stock_movements where company_id=$1)::int movimentos,
  (select coalesce(sum(on_hand),0)::text from stock_balances where company_id=$1) saldo,
  (select coalesce(sum(reserved),0)::text from stock_balances where company_id=$1) reservado,
  (select count(*) from accounts_receivable where company_id=$1)::int receber,
  (select count(*) from accounts_payable where company_id=$1)::int pagar,
  (select count(*) from fiscal_documents where company_id=$1)::int notas,
  (select string_agg(status, ',' order by id) from sales_orders where company_id=$1) status_pedidos,
  (select string_agg(status, ',' order by id) from shipments where company_id=$1) status_expedicoes,
  (select max(updated_at)::text from customers where company_id=$1) cli_upd,
  (select max(updated_at)::text from products where company_id=$1) prod_upd,
  (select count(*) from user_roles ur join users u on u.id = ur.user_id where u.company_id=$1)::int papeis_usuarios,
  (select count(*) from audit_logs where company_id=$1 and user_id in (select id from users where company_id <> $1))::int auditoria_de_fora`, [cid]))[0];
const before = {};
for (const co of COMPANIES) before[co.key] = await snap(IDS[co.key].cid);

function triesFor(A, B, a, b) {
  return [
    ["Clientes", "GET por ID", "GET", `/api/customers/${b.cust}`],
    ["Clientes", "PATCH por ID", "PATCH", `/api/customers/${b.cust}`, { nome: "Alterado por outra empresa" }],
    ["Clientes", "DELETE por ID", "DELETE", `/api/customers/${b.cust}`],
    ["Clientes", "busca pelo nome do cliente de B", "GET", `/api/customers?search=${encodeURIComponent(b.custName)}`],
    ["Produtos", "GET por ID", "GET", `/api/products/${b.prod}`],
    ["Produtos", "PATCH por ID", "PATCH", `/api/products/${b.prod}`, { precoVenda: 0.01 }],
    ["Produtos", "DELETE por ID", "DELETE", `/api/products/${b.prod}`],
    ["Fornecedores", "GET por ID", "GET", `/api/suppliers/${b.sup}`],
    ["Fornecedores", "PATCH por ID", "PATCH", `/api/suppliers/${b.sup}`, { nome: "Alterado por outra empresa" }],
    ["Pedidos", "GET por ID", "GET", `/api/sales-orders/${b.order}`],
    ["Pedidos", "PATCH por ID", "PATCH", `/api/sales-orders/${b.order}`, { notes: "x" }],
    ["Pedidos", "cancelar pedido de B", "POST", `/api/sales-orders/${b.order}/cancel`, { reason: "x" }],
    ["Pedidos", "aprovar pedido de B", "POST", `/api/sales-orders/${b.order}/approve`, {}],
    ["Pedidos", "filtro customerId de B", "GET", `/api/sales-orders?customerId=${b.cust}`],
    ["Pedidos", "busca pelo código do pedido de B", "GET", `/api/sales-orders?search=${encodeURIComponent(b.orderCode)}`],
    ["Pedidos", "associação: pedido de A com cliente de B", "POST", "/api/sales-orders", { customerId: b.cust, items: [{ productId: a.prod, description: "x", quantity: 1, unitPrice: 1 }] }],
    ["Pedidos", "associação: pedido de A com produto de B", "POST", "/api/sales-orders", { customerId: a.cust, items: [{ productId: b.prod, description: "x", quantity: 1, unitPrice: 1 }] }],
    ["Pedidos", "associação: pedido de A com condição de pagamento de B", "POST", "/api/sales-orders", { customerId: a.cust, paymentTermsId: b.payTerm, items: [{ productId: a.prod, description: "x", quantity: 1, unitPrice: 1 }] }],
    ["Estoque", "saldos filtrados pelo produto de B", "GET", `/api/stock-balances?productId=${b.prod}`],
    ["Estoque", "movimentos filtrados pelo local de B", "GET", `/api/stock-movements?locationId=${b.loc}`],
    ["Estoque", "entrada no local de B", "POST", "/api/stock-movements/receive", { productId: a.prod, locationId: b.loc, quantity: 1, unitCost: 1, idempotencyKey: `r48iso-${A.key}-${B.key}-1` }],
    ["Estoque", "entrada do produto de B", "POST", "/api/stock-movements/receive", { productId: b.prod, locationId: a.loc, quantity: 1, unitCost: 1, idempotencyKey: `r48iso-${A.key}-${B.key}-2` }],
    ["Estoque", "reservar pedido de B", "POST", `/api/sales-orders/${b.order}/reserve`, { locationId: a.loc }],
    ["Estoque", "liberar reserva do pedido de B", "POST", `/api/sales-orders/${b.order}/release-reservation`, {}],
    ["Compras", "GET pedido de compra de B", "GET", `/api/purchase-orders/${b.po}`],
    ["Compras", "pedido de compra de A com fornecedor de B", "POST", "/api/purchase-orders", { supplierId: b.sup, items: [{ productId: a.prod, quantity: 1, unitPrice: 1 }] }],
    ["Financeiro", "GET conta a receber de B", "GET", `/api/accounts-receivable/${b.ar}`],
    ["Financeiro", "GET conta a pagar de B", "GET", `/api/accounts-payable/${b.ap}`],
    ["Financeiro", "baixar parcela de B", "POST", `/api/accounts-receivable-installments/${b.ari}/receive`, { amount: 1, paymentDate: "2026-10-02" }],
    ["Financeiro", "gerar conta a receber do pedido de B", "POST", `/api/sales-orders/${b.order}/generate-receivable`, {}],
    ["Financeiro", "cancelar conta a pagar de B", "POST", `/api/accounts-payable/${b.ap}/cancel`, { reason: "x" }],
    ["Financeiro", "contas a receber filtradas pelo cliente de B", "GET", `/api/accounts-receivable?customerId=${b.cust}`],
    ["Fiscal", "GET NF-e de B", "GET", `/api/fiscal-documents/${b.doc}`],
    ["Fiscal", "cancelar NF-e de B", "POST", `/api/fiscal-documents/${b.doc}/cancel`, { reason: "x" }],
    ["Fiscal", "gerar NF-e do pedido de B", "POST", `/api/sales-orders/${b.order}/generate-fiscal-document`, {}],
    ["Logística", "GET expedição de B", "GET", `/api/shipments/${b.ship}`],
    ["Logística", "entregar expedição de B", "POST", `/api/shipments/${b.ship}/deliver`, { recipientName: "x" }],
    ["Usuários", "GET usuário de B", "GET", `/api/admin/users/${b.user}`],
    ["Usuários", "atribuir papel de A a usuário de B", "POST", `/api/admin/users/${b.user}/roles`, { roleId: a.role }],
    ["Usuários", "atribuir papel de B a usuário de A (papel estrangeiro)", "POST", `/api/admin/users/${a.user}/roles`, { roleId: b.role }],
    ["Usuários", "vincular unidade de A ao usuário de B", "POST", `/api/admin/users/${b.user}/branches`, { branchId: a.branch }],
    ["Usuários", "remover papel do usuário de B", "DELETE", `/api/admin/users/${b.user}/roles?roleId=${b.userRole}`],
    ["Usuários", "desativar usuário de B", "PATCH", `/api/users/${b.user}`, { status: "Inativo" }],
    ["Papéis", "alterar permissões do papel de B", "PUT", `/api/admin/roles/${b.role}/permissions`, { permissionCodes: ["customers.view"] }],
    ["Auditoria", "histórico do cliente de B", "GET", `/api/audit-logs?entityId=${b.cust}`],
    ["Auditoria", "trilha administrativa filtrada pelo pedido de B", "GET", `/api/admin/audit?entityId=${b.order}`],
    ["Exportação", "CSV de clientes buscando o nome de B", "GET", `/api/exports?entityType=customers&format=csv&search=${encodeURIComponent(b.custName)}`],
    ["Central", "listar empresas da plataforma", "GET", "/api/platform/companies"],
    ["Central", "ciclo de vida da empresa B", "POST", `/api/platform/companies/${b.cid}/lifecycle`, { action: "suspend", reason: "x" }],
  ];
}

const UI_ROUTES = (b) => [
  ["Pedidos", `/app/comercial/pedidos-venda/${b.order}`],
  // As demais telas não têm rota de detalhe: busca da lista com o nome/código de B.
  ["Clientes", `/app/cadastros/clientes?q=${encodeURIComponent(b.custName)}`],
  ["Pedidos", `/app/comercial/pedidos-venda?q=${encodeURIComponent(b.orderCode)}`],
  ["Financeiro", `/app/financeiro/contas-receber?q=${encodeURIComponent(b.custName)}`],
];

async function attempt(sess, A, B, profile, [ent, what, method, url, body]) {
  const a = IDS[A.key];
  const r = method === "GET" ? await api(sess.page, url) : method === "DELETE" ? await api(sess.page, url, { method }) : await post(sess.page, url, body, method);
  const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? "");
  const leaked = MARKS[B.key].filter((s) => text.includes(s));
  let okList = false;
  if (r.status === 200) {
    const data = Array.isArray(r.body?.data) ? r.body.data : null;
    if (data) {
      const base = url.split("?")[0];
      const t = TABLE_OF[base];
      const ids = data.map((x) => x.id).filter(Boolean);
      const foreign = t && ids.length ? (await q(`select count(*)::int n from ${t} where id = any($1::uuid[]) and company_id <> $2`, [ids, a.cid]))[0].n : 0;
      okList = foreign === 0 && (t || ids.length === 0);
    } else if (url.startsWith("/api/exports")) okList = true; // CSV da própria empresa; vazamento é conferido pelas marcas
  }
  byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const ok = (DENIED(r.status) || okList) && leaked.length === 0;
  ok ? pass++ : fail++;
  const pair = `${A.name} → ${B.name}`;
  rows.push([pair, profile, ent, `${what} (${method})`, r.status, leaked.length ? `SIM: ${leaked.join(", ")}` : "não", ok ? "PASS" : "FAIL"]);
  if (!ok) {
    fails.push({ pair, profile, ent, what, method, url: url.replace(/[0-9a-f-]{36}/g, ":idB"), status: r.status, body: text.slice(0, 300) });
    check("isolamento", `${pair} [${profile}]: ${ent} — ${what}`, false, { company: A.name, target: `${method} ${url.replace(/[0-9a-f-]{36}/g, ":id")}`, expected: "negação (401/403/404/409/422) ou lista vazia, sem dado de B", actual: `${r.status} ${text.slice(0, 200)}` });
  }
}

for (const A of COMPANIES) {
  const admin = await session(A.admin.email);
  const common = A.users.find((u) => u.role === "vendedor") ?? A.users.find((u) => u.role === "operador") ?? A.users.find((u) => u.role === "gerente");
  const user = await session(common.email);
  let shotDone = false;
  for (const B of COMPANIES) {
    if (B.key === A.key) continue;
    const tries = triesFor(A, B, IDS[A.key], IDS[B.key]);
    for (const t of tries) await attempt(admin, A, B, "Administrador", t);
    // Usuário comum: leituras por ID e ações mais sensíveis.
    for (const t of tries.filter(([, w, m]) => m === "GET" || /cancelar|entregar|baixar|reservar/.test(w))) await attempt(user, A, B, common.roleLabel ?? common.role, t);
    // Telas por URL direta.
    for (const [ent, route] of UI_ROUTES(IDS[B.key])) {
      await goto(admin.page, route);
      await admin.page.waitForTimeout(500);
      const t = await bodyText(admin.page);
      const leak = MARKS[B.key].filter((s) => t.includes(s));
      const ok = leak.length === 0;
      ok ? pass++ : fail++;
      rows.push([`${A.name} → ${B.name}`, "Administrador", ent, `URL direta ${route.replace(/[0-9a-f-]{36}/g, ":idB")} (tela)`, "—", leak.length ? `SIM: ${leak.join(", ")}` : "não", ok ? "PASS" : "FAIL"]);
      if (!ok) fails.push({ pair: `${A.name} → ${B.name}`, profile: "Administrador", ent, what: "URL direta", url: route, status: "tela", body: leak.join(", ") });
      if (!shotDone && ent === "Pedidos") {
        await shot(admin.page, "isolamento", `01-url-direta-pedido-de-${B.key}-vista-por-${A.key}`);
        shotDone = true;
      }
    }
  }
  // Listas completas de A não contêm marcas de nenhuma outra empresa.
  for (const url of ["/api/customers?pageSize=200", "/api/products?pageSize=200", "/api/suppliers?pageSize=200", "/api/sales-orders?pageSize=200", "/api/admin/users", "/api/audit-logs?pageSize=200", "/api/fiscal-documents", "/api/accounts-receivable", "/api/shipments", "/api/purchase-orders"]) {
    const r = await api(admin.page, url);
    const text = JSON.stringify(r.body ?? "");
    const leak = COMPANIES.filter((c) => c.key !== A.key).flatMap((c) => MARKS[c.key].filter((s) => text.includes(s)).map((s) => `${c.key}:${s}`));
    const ok = r.status === 200 && leak.length === 0;
    ok ? pass++ : fail++;
    rows.push([`${A.name} → todas`, "Administrador", "Listas", `${url} sem marcas de outras empresas`, r.status, leak.length ? `SIM: ${leak.slice(0, 3).join(", ")}` : "não", ok ? "PASS" : "FAIL"]);
    if (!ok) fails.push({ pair: `${A.name} → todas`, profile: "Administrador", ent: "Listas", what: url, status: r.status, body: leak.join(", ") || text.slice(0, 200) });
  }
  await admin.c.close();
  await user.c.close();
  console.log(`${A.name}: parcial ${pass} PASS / ${fail} FAIL`);
}

// Banco de cada empresa intacto (antes × depois de toda a bateria).
const dbRows = [["Empresa", "Campo", "Antes", "Depois", "Resultado"]];
for (const co of COMPANIES) {
  const after = await snap(IDS[co.key].cid);
  const diff = Object.keys(after).filter((k) => String(after[k]) !== String(before[co.key][k]));
  const ok = diff.length === 0 && after.auditoria_de_fora === 0;
  ok ? pass++ : fail++;
  if (ok) dbRows.push([co.name, "todas (15 medidas)", "—", "—", "PASS"]);
  for (const k of diff) dbRows.push([co.name, k, String(before[co.key][k]).slice(0, 60), String(after[k]).slice(0, 60), "FAIL"]);
  check("isolamento", `${co.name}: banco intacto após 6 empresas tentarem acessá-la`, ok, { company: co.name, target: "contagens, saldos, status, updated_at, papéis, auditoria", expected: "sem alteração", actual: diff.join(", ") || "sem diferença" });
}

// RLS no banco: quais tabelas de negócio têm RLS ligada (defesa em profundidade).
const rls = await q(`select c.relname, c.relrowsecurity rls, (select count(*) from pg_policies p where p.tablename = c.relname)::int policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and exists (select 1 from information_schema.columns k where k.table_name = c.relname and k.column_name = 'company_id')
  order by 1`);
const noRls = rls.filter((r) => !r.rls || r.policies === 0).map((r) => r.relname);

for (const A of COMPANIES) {
  await evidenceCard(null, "isolamento", `${A.n}-${A.key}-isolamento`, `Isolamento — ${A.name} tentando acessar as outras 6 empresas`, rows.filter((r, k) => k === 0 || r[0].startsWith(A.name + " →")));
}
await evidenceCard(null, "isolamento", "90-banco-antes-depois", "Banco de cada empresa antes × depois da bateria de isolamento", dbRows);
await evidenceCard(null, "isolamento", "00-isolamento-resumo", "Isolamento 7 × 6 — resumo", [["Tentativas", "PASS", "FAIL", "HTTP devolvidos", "Tabelas com company_id", "Sem RLS/política"], [pass + fail, pass, fail, JSON.stringify(byStatus), rls.length, noRls.length ? noRls.join(", ") : "nenhuma"]]);
const fs = await import("node:fs");
fs.writeFileSync(new URL("./r3-isolamento.out.json", import.meta.url), JSON.stringify({ pass, fail, byStatus, fails, rlsTables: rls.length, noRls }, null, 2));
console.log(`isolamento: ${pass} PASS, ${fail} FAIL · HTTP ${JSON.stringify(byStatus)} · sem RLS: ${noRls.length}`);
await db.end();
await close();
