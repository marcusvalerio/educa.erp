// Rodada 48 — erros provocados de forma controlada. Para cada um:
// Entrada → Resposta (HTTP) → Mensagem → Comportamento esperado → Comportamento real.
// Classificação da mensagem: técnica | compreensível | com instrução.
import fs from "node:fs";
import { check, shot, session, logout, goto, api, post, idOf, state, close, bodyText, evidenceCard, inDays, newUser, login, APP } from "./lib.mjs";
import { COMPANIES } from "./companies.mjs";
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:55440/educa_poc", max: 2 });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const TECH = /violat|constraint|null value|uuid|syntax|column|relation|invalid input|expected [a-z]|received [a-z]|undefined|stack|exception|\bsql\b|row-level|NaN|Unexpected token|JSON|ZodError|PGRST|duplicate key|function |permission denied for/i;
const INSTR = /informe|selecione|cadastre|para corrigir|inative|verifique|revise|preencha|escolha|use |tente|ajuste|reduza|aguarde|solicite|corrija|confira|entre novamente|faça login|peça/i;
const classify = (status, msg) => {
  if (status >= 500) return "técnica (500)";
  if (!msg) return "sem mensagem";
  if (TECH.test(msg)) return "técnica";
  return INSTR.test(msg) ? "com instrução" : "compreensível";
};
const rows = [["#", "Empresa", "Entrada (o que foi tentado)", "Usuário", "Resposta", "Mensagem", "Esperado", "Real", "Resultado"]];
let n = 0;

for (const co of COMPANIES.filter((c) => ["mares", "prisma", "lince"].includes(c.key))) {
  const st = state.companies[co.key];
  const D = st.data, cid = st.companyId;
  const other = state.companies[co.key === "mares" ? "ferrix" : "mares"].data;
  const S = {};
  const person = (role) => co.users.find((u) => u.role === role) ?? co.users.find((u) => u.role === "gerente");
  const as = async (role) => (S[role] ??= await session(person(role).email));
  const probe = async (role, entrada, method, url, body, esperado, okFn, { raw = null, instr = true, exactRole = false } = {}) => {
    // Rodada 2 (correção do harness): quando o cenário depende do papel
    // (ex.: "Somente leitura tenta criar"), não trocar pelo Gerente.
    if (exactRole && !co.users.some((x) => x.role === role)) {
      n++;
      rows.push([n, co.name, entrada, "—", "—", "", esperado, `não se aplica: a empresa não tem o papel ${role}`, "N/A"]);
      return null;
    }
    const u = await as(role);
    const r = raw ? await raw(u.page) : method === "GET" || method === "DELETE" ? await api(u.page, url, { method }) : await post(u.page, url, body, method);
    const msg = r.body?.error?.message ?? (typeof r.body?.error === "string" ? r.body.error : typeof r.body === "string" ? r.body : "") ?? "";
    const cls = classify(r.status, msg);
    const real = await okFn(r);
    const ok = real.ok && !cls.startsWith("técnica") && (!instr || cls !== "sem mensagem");
    n++;
    rows.push([n, co.name, entrada, person(role).key, r.status, msg.slice(0, 200), esperado, `${real.text} · mensagem ${cls}`, ok ? "PASS" : "FAIL"]);
    check("erros", `${entrada} → ${r.status} (${cls})`, ok, { company: co.name, user: person(role).email, target: `${method} ${String(url).replace(/[0-9a-f-]{36}/g, ":id")}`, expected: esperado, actual: `${r.status} "${msg.slice(0, 160)}" · ${real.text}` });
    return r;
  };
  const is4xx = (codes = null) => async (r) => ({ ok: codes ? codes.includes(r.status) : r.status >= 400 && r.status < 500, text: r.status < 300 ? "ACEITOU" : "recusou" });
  const v = await as("vendedor");

  // ----- cadastros
  await probe("vendedor", "Cliente com CNPJ inválido (11.111.111/1111-11)", "POST", "/api/customers", { tipo: "Pessoa Jurídica", nome: "Cliente de teste de erro", documento: "11.111.111/1111-11" }, "422 com CNPJ inválido explicado", is4xx([400, 422]));
  await probe("vendedor", "Cliente sem razão social", "POST", "/api/customers", { tipo: "Pessoa Jurídica", documento: "" }, "422 pedindo a razão social", is4xx([400, 422]));
  await probe("vendedor", "Cliente com nome de 5.000 caracteres", "POST", "/api/customers", { tipo: "Pessoa Jurídica", nome: "X".repeat(5000), documento: "" }, "422 limite de tamanho", is4xx([400, 422]));
  const xss = await probe("vendedor", "Cliente com nome contendo <script> (injeção de HTML)", "POST", "/api/customers", { tipo: "Pessoa Jurídica", nome: `<img src=x onerror="window.__xss=1">Cliente XSS ${co.prefix}`, documento: "" }, "recusado OU gravado e exibido como texto (sem executar)", async (r) => ({ ok: true, text: r.status < 300 ? "gravou (conferido na tela abaixo)" : "recusou" }));
  await probe("vendedor", "Busca com aspas e SQL (' or 1=1 --)", "GET", `/api/customers?search=${encodeURIComponent("' or 1=1 --")}`, null, "200 com lista vazia, sem erro de banco", async (r) => ({ ok: r.status === 200 && Array.isArray(r.body?.data) && r.body.data.length === 0, text: `${r.body?.data?.length ?? "?"} resultados` }), { instr: false });
  await probe("operador", "Produto sem código, descrição, categoria e unidade", "POST", "/api/products", { precoVenda: 10 }, "422 listando os campos", is4xx([400, 422]));
  await probe("operador", `Produto com código duplicado (${D.products[0].code})`, "POST", "/api/products", { codigo: D.products[0].code, descricao: "Duplicado", categoria: "Produto acabado", unidade: "UN" }, "409 código já existe", is4xx([409, 422]));
  await probe("operador", "Produto com preço de venda em texto (\"dez reais\")", "POST", "/api/products", { codigo: `${co.prefix}-ERR-TXT`, descricao: "Preço em texto", categoria: "Produto acabado", unidade: "UN", precoVenda: "dez reais" }, "422 preço inválido", is4xx([400, 422]));
  await probe("operador", "Produto com preço de venda negativo", "POST", "/api/products", { codigo: `${co.prefix}-ERR-NEG`, descricao: "Preço negativo", categoria: "Produto acabado", unidade: "UN", precoVenda: -5 }, "422 preço negativo", is4xx([400, 422]));
  // ----- pedidos
  await probe("vendedor", "Pedido sem itens", "POST", "/api/sales-orders", { customerId: D.customers[1], items: [] }, "422 pedir ao menos um item", is4xx([400, 422]));
  await probe("vendedor", "Pedido com quantidade zero", "POST", "/api/sales-orders", { customerId: D.customers[1], items: [{ productId: D.products[0].id, description: "x", quantity: 0, unitPrice: 10 }] }, "422 quantidade > 0", is4xx([400, 422]));
  await probe("vendedor", "Pedido com quantidade 1 trilhão", "POST", "/api/sales-orders", { customerId: D.customers[1], items: [{ productId: D.products[0].id, description: "x", quantity: 1e12, unitPrice: 10 }] }, "422 quantidade fora do limite", is4xx([400, 422]));
  await probe("vendedor", "Pedido com preço unitário negativo", "POST", "/api/sales-orders", { customerId: D.customers[1], items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: -50 }] }, "422 preço negativo", is4xx([400, 422]));
  await probe("vendedor", "Pedido com desconto maior que o valor do item", "POST", "/api/sales-orders", { customerId: D.customers[1], items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: 10, discount: 500 }] }, "422 desconto acima do valor", is4xx([400, 422]));
  await probe("vendedor", "Pedido sem cliente", "POST", "/api/sales-orders", { items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: 10 }] }, "422 selecione o cliente", is4xx([400, 422]));
  await probe("vendedor", "Pedido com data de entrega inválida (2026-02-30)", "POST", "/api/sales-orders", { customerId: D.customers[1], expectedDeliveryAt: "2026-02-30", items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: 10 }] }, "422 data inválida", is4xx([400, 422]));
  await probe("vendedor", "Corpo da requisição malformado (JSON quebrado)", "POST", "/api/sales-orders", null, "400 com mensagem compreensível", is4xx([400, 422]), { raw: (p) => p.evaluate(async () => { const r = await fetch("/api/sales-orders", { method: "POST", headers: { "content-type": "application/json" }, body: "{itens: [" }); const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 200); } return { status: r.status, body: b }; }) });
  await probe("vendedor", "ID malformado na URL (/api/customers/abc)", "GET", "/api/customers/abc", null, "400/404 sem expor erro de banco", is4xx([400, 404, 422]), { instr: false });
  // ----- transições inválidas
  const cancelled = D.orders.find((o) => o.target === "cancelado")?.id;
  const delivered = D.orders.find((o) => o.target === "entregue");
  await probe("gerente", "Aprovar pedido cancelado", "POST", `/api/sales-orders/${cancelled}/approve`, {}, "409/422 pedido cancelado não pode ser aprovado", is4xx([409, 422]));
  await probe("logistica", "Reservar pedido cancelado", "POST", `/api/sales-orders/${cancelled}/reserve`, { locationId: D.locations.pick }, "409/422", is4xx([409, 422]));
  await probe("gerente", "Cancelar pedido já entregue", "POST", `/api/sales-orders/${delivered?.id}/cancel`, { reason: "teste" }, "409/422 pedido entregue não pode ser cancelado", is4xx([409, 422]));
  await probe("logistica", "Entregar expedição já entregue", "POST", `/api/shipments/${delivered?.shipmentId}/deliver`, { recipientName: "x" }, "409/422 já entregue", is4xx([409, 422]));
  const draft = D.orders.find((o) => o.target === "rascunho")?.id;
  await probe("logistica", "Reservar pedido em rascunho (não aprovado)", "POST", `/api/sales-orders/${draft}/reserve`, { locationId: D.locations.pick }, "409/422 pedido precisa estar aprovado", is4xx([409, 422]));
  await probe("logistica", "Criar expedição de pedido em rascunho", "POST", `/api/sales-orders/${draft}/shipments`, { warehouseId: D.warehouseId, items: [] }, "409/422", is4xx([400, 409, 422]));
  // ----- estoque
  const zero = D.products[D.products.length - 1];
  const ord = await post(v.page, "/api/sales-orders", { customerId: D.customers[2], paymentTermsId: D.paymentTermId, notes: "Pedido para teste de erro (estoque zerado, sem NCM)", items: [{ productId: zero.id, description: zero.description, unit: "UN", quantity: 5, unitPrice: zero.price }] });
  const oid = idOf(ord);
  await post(v.page, `/api/sales-orders/${oid}/submit`);
  await post((await as("gerente")).page, `/api/sales-orders/${oid}/approve`);
  // Rodada 2 (correção do harness): o produto "zerado" recebeu estoque no dia
  // simulado da rodada 1; a pré-condição passa a ser conferida (disponível no
  // local = 0) e o critério olha a reserva DESTE pedido e a situação devolvida
  // (a tela traduz "reservation_pending" em "Nenhuma unidade reservada").
  const [pre] = await q(`select coalesce(sum(available),0)::float a from stock_balances where product_id=$1 and location_id=$2`, [zero.id, D.locations.pick]);
  await probe("logistica", `Reservar pedido sem estoque (${zero.code}, disponível no local: ${pre.a})`, "POST", `/api/sales-orders/${oid}/reserve`, { locationId: D.locations.pick }, "nada reservado e situação 'Reserva pendente' (ou recusa clara)", async (r) => {
    const [b] = await q(`select coalesce(sum(sri.quantity),0)::float r from stock_reservations sr join stock_reservation_items sri on sri.reservation_id=sr.id where sr.reference_id=$1 and sr.status='active'`, [oid]);
    if (pre.a > 0) return { ok: b.r <= pre.a, text: `pré-condição não atendida (disponível ${pre.a}); reservou ${b.r} sem passar do disponível` };
    return { ok: b.r === 0 && (r.status >= 400 || r.body?.data?.status === "reservation_pending"), text: `reservado ${b.r}; situação ${r.body?.data?.status ?? r.status}` };
  }, { instr: false });
  await probe("fiscal", `Gerar NF-e com produto sem NCM (${zero.code})`, "POST", `/api/sales-orders/${oid}/generate-fiscal-document`, { fiscalEstablishmentId: D.establishmentId, operationNatureId: D.natureId }, "422 dizendo qual produto está sem NCM", is4xx([409, 422]));
  await probe("gerente", "Saída avulsa maior que o saldo (99.999 un.)", "POST", "/api/stock-movements/issue", { productId: D.products[4].id, locationId: D.locations.pick, quantity: 99999, notes: "teste de erro" }, "409/422 saldo insuficiente", is4xx([409, 422]));
  if (co.users.some((x) => x.role === "operador")) await probe("operador", "Operador sem 'Estoque — Ajustar' tenta saída avulsa", "POST", "/api/stock-movements/issue", { productId: D.products[4].id, locationId: D.locations.pick, quantity: 1, notes: "teste de permissão" }, "403 com a permissão por extenso", is4xx([403]));
  await probe("operador", "Entrada com quantidade negativa", "POST", "/api/stock-movements/receive", { productId: D.products[4].id, locationId: D.locations.pick, quantity: -5 }, "422 quantidade > 0", is4xx([400, 422]));
  await probe("operador", "Entrada com quantidade \"10,5\" (vírgula decimal, texto)", "POST", "/api/stock-movements/receive", { productId: D.products[4].id, locationId: D.locations.pick, quantity: "10,5", idempotencyKey: `r48err-${co.prefix}-virg` }, "422 OU aceitar 10,5 corretamente", async (r) => {
    const [m] = await q(`select quantity::float q from stock_movements where idempotency_key=$1`, [`r48err-${co.prefix}-virg`]);
    return { ok: r.status >= 400 || m?.q === 10.5, text: r.status < 300 ? `gravou ${m?.q}` : "recusou" };
  });
  await probe("operador", "Transferência para o mesmo local de origem", "POST", "/api/stock-transfers", { fromLocationId: D.locations.pick, toLocationId: D.locations.pick, items: [{ productId: D.products[4].id, quantity: 1 }] }, "422 origem e destino iguais", is4xx([400, 409, 422]));
  // ----- exclusão de registro usado
  await probe("gerente", "Excluir cliente com pedidos", "DELETE", `/api/customers/${D.customers[0]}`, null, "409 + orientar inativar", is4xx([409]));
  await probe("gerente", "Excluir produto com movimentos e pedidos", "DELETE", `/api/products/${D.products[0].id}`, null, "409 + orientar inativar", is4xx([409]));
  // ----- financeiro
  await probe("financeiro", "Conta a pagar com valor negativo", "POST", "/api/accounts-payable", { supplierId: D.suppliers[0], description: "x", originalAmount: -10, installments: [{ dueDate: inDays(5), amount: -10 }] }, "422 valor > 0", is4xx([400, 422]));
  await probe("financeiro", "Conta a pagar com parcelas que não somam o total (100 ≠ 60+30)", "POST", "/api/accounts-payable", { supplierId: D.suppliers[0], description: "Parcelas erradas", originalAmount: 100, installments: [{ dueDate: inDays(5), amount: 60 }, { dueDate: inDays(35), amount: 30 }] }, "422 soma das parcelas", is4xx([400, 422]));
  const [openInst] = await q(`select i.id, i.amount::float a from accounts_receivable_installments i where i.company_id=$1 and i.status in ('OPEN','OVERDUE') order by i.due_date limit 1`, [cid]);
  if (openInst) await probe("financeiro", `Recebimento maior que o saldo da parcela (R$ 999.999 em parcela de R$ ${openInst.a})`, "POST", `/api/accounts-receivable-installments/${openInst.id}/receive`, { financialAccountId: D.bankId, amount: 999999, method: "PIX" }, "422 valor acima do saldo; nada gravado", async (r) => {
    const [i] = await q(`select received_amount::float r, status from accounts_receivable_installments where id=$1`, [openInst.id]);
    return { ok: r.status >= 400 && i.r <= openInst.a, text: `parcela ${JSON.stringify(i)}` };
  });
  const [paid] = await q(`select i.id from accounts_payable_installments i where i.company_id=$1 and i.status='PAID' limit 1`, [cid]);
  if (paid) await probe("financeiro", "Pagar novamente parcela já paga", "POST", `/api/accounts-payable-installments/${paid.id}/pay`, { financialAccountId: D.bankId, amount: 10, method: "PIX" }, "409/422 parcela já paga", is4xx([409, 422]));
  await probe("financeiro", "Recebimento em conta financeira de outra empresa", "POST", `/api/accounts-receivable-installments/${openInst?.id}/receive`, { financialAccountId: other.bankId, amount: 1, method: "PIX" }, "404/422 conta não encontrada; nada gravado", is4xx([404, 409, 422]));
  // ----- permissão e sessão
  await probe("leitura", "Somente leitura tenta criar cliente", "POST", "/api/customers", { tipo: "Pessoa Jurídica", nome: "x", documento: "" }, "403 com mensagem de permissão", is4xx([403]), { exactRole: true });
  await probe("vendedor", "Vendedor tenta aprovar pedido", "POST", `/api/sales-orders/${D.orders.find((o) => o.target === "pendente").id}/approve`, null, "403", is4xx([403]), { exactRole: true });
  await probe("gerente", "Abrir cliente de outra empresa pelo ID", "GET", `/api/customers/${other.customers[0]}`, null, "404 sem dados", is4xx([403, 404]), { instr: false });
  // Sessão encerrada: chamada da API depois do logout.
  {
    const u = await session(person("vendedor").email);
    await logout(u.page);
    await probe("vendedor", "Chamar a API depois de sair (sessão encerrada)", "GET", "/api/customers", null, "401 pedindo login", is4xx([401]), { raw: (p) => api(u.page, "/api/customers") });
    await goto(u.page, "/app/comercial/pedidos-venda");
    const path = new URL(u.page.url()).pathname;
    n++;
    rows.push([n, co.name, "Abrir tela interna depois de sair", "vendedor", "—", path, "volta para /login", path.startsWith("/login") ? "redirecionou para o login" : `ficou em ${path}`, path.startsWith("/login") ? "PASS" : "FAIL"]);
    await u.c.close();
  }
  // Login com senha errada e com e-mail inexistente (mensagem não pode revelar qual dos dois está errado).
  {
    const u = await newUser();
    const msgs = [];
    for (const [email, pass] of [[person("vendedor").email, "SenhaErrada!123"], [`naoexiste@${co.domain}`, "SenhaErrada!123"]]) {
      await u.page.goto(`${APP}/login`, { waitUntil: "networkidle" });
      await u.page.getByLabel(/^E-mail/).fill(email);
      await u.page.getByLabel(/^Senha/).fill(pass);
      await u.page.getByRole("button", { name: "Entrar" }).click();
      await u.page.waitForTimeout(1500);
      msgs.push((await bodyText(u.page)).match(/[^\n]*(inválid|incorret|não encontrad|senha|tente)[^\n]*/i)?.[0] ?? "(sem mensagem)");
    }
    await shot(u.page, "erros", `${co.n}-${co.key}-login-senha-errada`);
    const same = msgs[0] === msgs[1];
    n++;
    rows.push([n, co.name, "Login com senha errada × e-mail inexistente", "—", "—", msgs.join(" | "), "mesma mensagem nos dois casos (não revelar contas)", same ? "mensagens iguais" : "mensagens diferentes", same && !/sem mensagem/.test(msgs[0]) ? "PASS" : "FAIL"]);
    check("erros", "Login: senha errada e e-mail inexistente com a mesma mensagem", same, { company: co.name, target: "/login", expected: "mensagem única", actual: msgs.join(" | ") });
    await u.c.close();
  }

  // Interface: o nome com HTML injetado aparece como texto (não executa).
  if (idOf(xss)) {
    const g = await as("vendedor");
    await goto(g.page, `/app/cadastros/clientes?q=${encodeURIComponent("Cliente XSS")}`);
    await g.page.waitForTimeout(800);
    const fired = await g.page.evaluate(() => window.__xss === 1);
    n++;
    rows.push([n, co.name, "Lista de clientes com nome contendo HTML", "vendedor", "—", "—", "texto exibido literalmente; script não executa", fired ? "SCRIPT EXECUTOU" : "exibido como texto", fired ? "FAIL" : "PASS"]);
    check("erros", "HTML injetado no nome do cliente não executa na lista", !fired, { company: co.name, target: "/app/cadastros/clientes", expected: "não executa", actual: fired ? "executou" : "não executou" });
    if (co.key === "mares") await shot(g.page, "erros", `${co.n}-${co.key}-cliente-com-html-no-nome`);
  }
  // Interface: erro de CNPJ na tela e reserva sem estoque na tela.
  if (co.key === "mares") {
    const vs = await as("vendedor");
    await goto(vs.page, "/app/cadastros/clientes");
    await vs.page.getByRole("button", { name: "Novo cliente" }).first().click();
    const d = vs.page.locator("[role=dialog]").last();
    await d.getByLabel(/^Razão social|^Nome/).first().fill("Cliente de teste de erro");
    await d.getByLabel(/^CPF\/CNPJ/).fill("11.111.111/1111-11");
    await d.getByRole("button", { name: "Salvar" }).click();
    await vs.page.waitForTimeout(900);
    await shot(vs.page, "erros", "03-mares-cliente-cnpj-invalido-tela");
    await vs.page.keyboard.press("Escape");
    const ls = await as("logistica");
    await goto(ls.page, `/app/comercial/pedidos-venda/${oid}`);
    const rb = ls.page.getByRole("button", { name: /Reservar/ }).first();
    if (await rb.isVisible().catch(() => false)) {
      await rb.click();
      const dd = ls.page.getByRole("dialog").last();
      await dd.getByRole("combobox").first().click();
      await ls.page.getByRole("option").first().click();
      await dd.getByRole("button", { name: "Reservar" }).click();
      await ls.page.waitForTimeout(1500);
      await shot(ls.page, "erros", "04-mares-reserva-sem-estoque-tela");
    }
  }
  for (const u of Object.values(S)) { await logout(u.page).catch(() => {}); await u.c.close(); }
}
await evidenceCard(null, "erros", "00-erros-provocados", "Erros provocados — Entrada → Resposta → Mensagem → Esperado → Real", rows);
fs.writeFileSync(new URL("./r7-erros.out.json", import.meta.url), JSON.stringify(rows, null, 2));
console.log(rows.slice(1).map((r) => `${r[8]} ${r[1]} | ${r[2]} | ${r[4]} | ${r[7]} | ${String(r[5]).slice(0, 100)}`).join("\n"));
await db.end();
await close();
