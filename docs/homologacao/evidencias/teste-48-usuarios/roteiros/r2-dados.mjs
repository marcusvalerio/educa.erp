// Fase 4 (massa de dados) e Fase 7 (fluxo completo) — cada operação é feita
// pela API real com a sessão do usuário do papel correspondente (a auditoria
// registra o autor). Pedido → estoque → financeiro → fiscal → logística.
import { check, issue, shot, session, logout, goto, api, post, idOf, errMsg, list, state, save, close, inDays, evidenceCard } from "./lib.mjs";
import { COMPANIES, rnd } from "./companies.mjs";
// Rodada 48: papel ausente usa substituto; ciclo de compras com o papel Compras.

const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const todo = COMPANIES.filter((c) => !only || only.includes(c.key));

for (const co of todo) {
  const st = state.companies[co.key];
  if (!st?.companyId) continue;
  const D = (st.data ??= {});
  const log = (D.log ??= []);
  const S = {};
  // Papel ausente na empresa → quem faria isso numa empresa pequena (registrado no log).
  const FALLBACK = { vendedor: ["gerente"], operador: ["gerente"], logistica: ["operador", "gerente"], financeiro: ["gerente"], fiscal: ["gerente"], compras: ["operador", "gerente"], leitura: ["gerente"] };
  const person = (role) => {
    if (role === "admin") return co.admin;
    const direct = co.users.find((u) => u.role === role);
    if (direct) return direct;
    for (const r of FALLBACK[role] ?? []) { const u = co.users.find((x) => x.role === r); if (u) return u; }
    return co.users.find((u) => u.role === "gerente");
  };
  const as = async (role) => { const p = person(role); return (S[p.key] ??= await session(p.email)); };
  const email = (role) => person(role).email;
  // Executa e registra (quem, o quê, HTTP). Falha inesperada vira FAIL.
  const run = async (role, area, what, path, body, method = "POST", { expect = (s) => s < 300 } = {}) => {
    const u = await as(role);
    const r = method === "GET" ? await api(u.page, path) : await post(u.page, path, body ?? {}, method);
    log.push([person(role).key, what, r.status]);
    if (!expect(r.status)) check(area, `${what}`, false, { company: co.name, user: email(role), target: `${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")}`, expected: "2xx", actual: `${r.status} ${errMsg(r)}` });
    return r;
  };
  const tally = (D.tally ??= {});
  const count = (k, n = 1) => (tally[k] = (tally[k] ?? 0) + n);

  // ---------------------------------------------------------- cadastros base (Gerente)
  if (!D.base) {
    // Categorias relacionais (tela Cadastros → Categorias).
    D.categoryIds = {};
    for (const name of co.categories) {
      const r = await run("gerente", "comercial", `Categoria ${name}`, "/api/product-categories", { nome: name }, "POST", { expect: () => true });
      if (r.status < 300) { D.categoryIds[name] = idOf(r); count("categorias"); }
      else D.categoryError = `${r.status} ${errMsg(r)}`;
    }
    // Locais de estoque (≥ 2) nos depósitos criados com a empresa.
    const whs = await list((await as("gerente")).page, "/api/warehouses");
    const principal = whs.find((w) => (w.codigo ?? w.code) === "PRINCIPAL") ?? whs[0];
    const almox = whs.find((w) => (w.codigo ?? w.code) === "ALMOX") ?? whs[1] ?? principal;
    D.warehouseId = principal?.id;
    D.locations = {};
    for (const [key, codigoLocal, descricao, dep, tipo] of [["rec", "REC-01", "Doca de recebimento", principal, "Recebimento"], ["pick", "PCK-A01", "Picking — rua A, módulo 01", principal, "Picking"], ["exp", "EXP-01", "Área de expedição", principal, "Expedição"], ["alm", "ALM-01", "Almoxarifado — prateleira 01", almox, "Armazenagem"]]) {
      const r = await run("gerente", "estoque", `Local ${codigoLocal}`, "/api/warehouse-locations", { codigoLocal, descricao, depositoId: dep.id, tipo, finalidade: key === "alm" ? "Almoxarifado Operacional" : "Estoque" });
      if (r.status < 300) { D.locations[key] = idOf(r); count("locais"); }
    }
    // Contas e categorias financeiras.
    const cx = await run("financeiro", "financeiro", "Conta Caixa", "/api/financial-accounts", { code: `CX-${co.prefix}`, name: `Caixa ${co.name}`, type: "CASH", openingBalance: 5000 });
    const bk = await run("financeiro", "financeiro", "Conta Banco", "/api/financial-accounts", { code: `BCO-${co.prefix}`, name: `Banco conta movimento ${co.prefix}`, type: "BANK", openingBalance: 80000 });
    const rc = await run("financeiro", "financeiro", "Categoria Receita", "/api/financial-categories", { code: `REC-${co.prefix}`, name: "Receita de vendas", type: "INCOME" });
    const dc = await run("financeiro", "financeiro", "Categoria Despesa", "/api/financial-categories", { code: `DSP-${co.prefix}`, name: "Compras de mercadorias", type: "EXPENSE" });
    Object.assign(D, { cashId: idOf(cx), bankId: idOf(bk), incomeCat: idOf(rc), expenseCat: idOf(dc) });
    count("contas_financeiras", 2); count("categorias_financeiras", 2);
    D.base = true;
    save();
  }

  // ---------------------------------------------------------- fornecedores (Gerente), clientes (Vendedor), produtos (Operador)
  if (!D.suppliers) {
    D.suppliers = [];
    for (const s of co.suppliers) {
      const r = await run("gerente", "comercial", `Fornecedor ${s.nomeFantasia}`, "/api/suppliers", { ...s, telefone: "(00) 0000-0000", categoriaFornecimento: "Outros" });
      if (r.status < 300) { D.suppliers.push(idOf(r)); count("fornecedores"); }
    }
    save();
  }
  if (!D.customers) {
    D.customers = [];
    for (const c of co.customers) {
      const r = await run("vendedor", "comercial", `Cliente ${c.nome}`, "/api/customers", { ...c, telefone: "(00) 0000-0000", condicaoPagamento: "30 dias", segmento: { distribuidora: "WHOLESALE", industria: "INDUSTRY", varejo: "RETAIL", atacado: "WHOLESALE", especializado: "WHOLESALE" }[co.segment] ?? "OTHER" });
      if (r.status < 300) { D.customers.push(idOf(r)); count("clientes"); }
    }
    save();
  }
  if (!D.products) {
    D.products = [];
    for (const [i, p] of co.products.entries()) {
      const r = await run("operador", "estoque", `Produto ${p.code}`, "/api/products", {
        codigo: p.code, descricao: p.description, categoria: "Produto acabado", subcategoria: "Geral", unidade: "UN", 
        ncm: co.ncm, estoqueMinimo: p.minStock, estoqueMaximo: 5000, pontoReposicao: p.minStock * 2, precoCusto: p.cost, precoVenda: p.price,
        categoriaId: D.categoryIds?.[p.category] ?? "", fornecedorId: D.suppliers[i % D.suppliers.length] ?? "",
      });
      if (r.status < 300) { D.products.push({ id: idOf(r), ...p }); count("produtos"); }
    }
    save();
  }

  // ---------------------------------------------------------- saldo inicial (Logística): normal, baixo e zerado
  if (!D.stock) {
    const n = D.products.length;
    for (const [i, p] of D.products.entries()) {
      if (i >= n - 2) { p.stockProfile = "zerado"; continue; }
      const low = i >= n - 4;
      const qty = low ? 4 : p.price < 2 ? 2000 + Math.floor(rnd() * 3000) : p.price > 1000 ? 12 + Math.floor(rnd() * 20) : 80 + Math.floor(rnd() * 300);
      p.stockProfile = low ? "baixo" : "normal";
      const r = await run("logistica", "estoque", `Entrada ${p.code} (${qty})`, "/api/stock-movements/receive", { productId: p.id, locationId: D.locations.pick, quantity: qty, unitCost: p.cost, notes: "Saldo inicial (implantação)", idempotencyKey: `r48-ini-${p.id}` });
      if (r.status < 300) { p.onHand = qty; count("movimentos_estoque"); }
    }
    // Entrada no recebimento e saída avulsa para consumo interno (Operador).
    const p0 = D.products[0];
    await run("operador", "estoque", `Entrada no recebimento ${p0.code}`, "/api/stock-movements/receive", { productId: p0.id, locationId: D.locations.rec, quantity: 20, unitCost: p0.cost, notes: "Recebimento de reposição", idempotencyKey: `r48-rec-${p0.id}` }) && count("movimentos_estoque");
    await run("gerente", "estoque", `Saída avulsa ${p0.code}`, "/api/stock-movements/issue", { productId: p0.id, locationId: D.locations.rec, quantity: 2, notes: "Consumo interno (amostra)", idempotencyKey: `r48-iss-${p0.id}` }) && count("movimentos_estoque");
    D.stock = true;
    save();
  }

  // ---------------------------------------------------------- compras (Compras solicita e compra; Gerente aprova; Operador recebe; Logística confere; Financeiro gera CP)
  if (!D.purchase) {
    const pt = await run("gerente", "compras", "Condição de pagamento 28 dias", "/api/payment-terms", { name: "28 dias", installments: [{ daysAfter: 28, percentage: 100 }] });
    D.paymentTermId = idOf(pt);
    const low = D.products.find((x) => x.stockProfile === "baixo") ?? D.products[0];
    const sc = await run("compras", "compras", `Solicitação de compra ${low.code}`, "/api/purchase-requests", { department: "Suprimentos", priority: "high", justification: "Abaixo do estoque mínimo (teste)", neededBy: inDays(5), items: [{ productId: low.id, description: low.description, unit: "UN", quantity: 50 }] });
    const scId = idOf(sc);
    if (scId) {
      count("solicitacoes");
      await run("compras", "compras", "Enviar solicitação para aprovação", `/api/purchase-requests/${scId}/submit`);
      await run("gerente", "compras", "Aprovar solicitação", `/api/purchase-requests/${scId}/approve`, {});
      const pc = await run("compras", "compras", "Pedido de compra", "/api/purchase-orders", { supplierId: D.suppliers[0], purchaseRequestId: scId, paymentTerms: "28 dias", expectedDeliveryAt: inDays(3), items: [{ productId: low.id, description: low.description, unit: "UN", quantity: 50, unitPrice: low.cost }] });
      const pcId = idOf(pc);
      if (pcId) {
        count("pedidos_compra");
        await run("compras", "compras", "Enviar PC para aprovação", `/api/purchase-orders/${pcId}/submit`);
        await run("gerente", "compras", "Aprovar PC", `/api/purchase-orders/${pcId}/approve`);
        await run("compras", "compras", "Enviar PC ao fornecedor", `/api/purchase-orders/${pcId}/send`);
        const po = (await api((await as("compras")).page, `/api/purchase-orders/${pcId}`)).body?.data;
        const poItem = po?.items?.[0];
        const rec = await run("operador", "compras", "Lançar recebimento", "/api/purchase-receipts", { purchaseOrderId: pcId, documentType: "NF-e", documentNumber: `${co.prefix}-NF-1`, documentSeries: "1", documentValue: Math.round(50 * low.cost * 100) / 100, items: [{ purchaseOrderItemId: poItem?.id, productId: low.id, quantityReceived: 50, unit: "UN", destinationLocationId: D.locations.rec }] });
        const recId = idOf(rec);
        if (recId) {
          count("recebimentos");
          await run("logistica", "compras", "Confirmar recebimento", `/api/purchase-receipts/${recId}/confirm`);
          const cp = await run("financeiro", "compras", "Gerar conta a pagar do recebimento", `/api/purchase-receipts/${recId}/generate-payable`, { paymentTermsId: D.paymentTermId });
          if (idOf(cp)) count("contas_pagar_de_compra");
          Object.assign(D, { scId, pcId, recId, purchaseProduct: low.id });
        }
      }
    }
    D.purchase = true;
    save();
  }

  // ---------------------------------------------------------- pedidos (Vendedor cria; Gerente aprova ou cancela)
  // Perfil dos 12 pedidos: 0-2 entregues, 3 expedido, 4 separado, 5 reservado
  // (aguardando separação), 6 aprovado, 7-8 pendentes de aprovação,
  // 9 rascunho, 10-11 cancelados.
  const PLAN = ["entregue", "entregue", "entregue", "expedido", "separado", "reservado", "aprovado", "pendente", "pendente", "rascunho", "cancelado", "cancelado"];
  const sellable = D.products.filter((p) => p.stockProfile === "normal");
  if (!D.orders) {
    D.orders = [];
    for (const [i, target] of PLAN.entries()) {
      const nItems = 1 + (i % 3);
      const items = [];
      for (let k = 0; k < nItems; k++) {
        const p = sellable[(i * 3 + k) % sellable.length];
        if (items.some((x) => x.productId === p.id)) continue;
        const qty = p.price < 2 ? 100 * (1 + Math.floor(rnd() * 5)) : p.price > 1000 ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 12);
        items.push({ productId: p.id, description: p.description, unit: "UN", quantity: qty, unitPrice: p.price, discount: 0 });
      }
      const r = await run("vendedor", "comercial", `Pedido ${i + 1} (${target})`, "/api/sales-orders", { customerId: D.customers[i % D.customers.length], expectedDeliveryAt: inDays(3 + i), notes: `Pedido de teste (${target})`, items });
      const id = idOf(r);
      if (!id) continue;
      count("pedidos");
      const o = { id, target, items: items.length };
      D.orders.push(o);
      if (target === "rascunho") continue;
      await run("vendedor", "comercial", `Enviar pedido ${i + 1} para aprovação`, `/api/sales-orders/${id}/submit`);
      if (target === "pendente") continue;
      if (target === "cancelado") { await run("gerente", "comercial", `Cancelar pedido ${i + 1}`, `/api/sales-orders/${id}/cancel`, { reason: "Cliente desistiu da compra (teste)" }); continue; }
      await run("gerente", "comercial", `Aprovar pedido ${i + 1}`, `/api/sales-orders/${id}/approve`);
    }
    save();
  }

  // ---------------------------------------------------------- financeiro do pedido (Financeiro): contas a receber
  if (!D.receivables) {
    D.receivables = [];
    for (const [i, o] of D.orders.entries()) {
      if (!["entregue", "expedido", "separado", "reservado", "aprovado"].includes(o.target)) continue;
      // O pedido 4 (separado) vence no passado → vencido.
      const overdue = o.target === "separado";
      const r = await run("financeiro", "financeiro", `Gerar conta a receber do pedido ${i + 1}`, `/api/sales-orders/${o.id}/generate-receivable`, { categoryId: D.incomeCat, issueDate: overdue ? inDays(-45) : inDays(0), dueDateBase: overdue ? inDays(-15) : inDays(30) });
      if (r.status < 300) { o.receivableId = idOf(r); D.receivables.push(o.receivableId); count("contas_receber"); }
    }
    save();
  }

  // ---------------------------------------------------------- estoque e logística (Logística; Gerente aprova a expedição)
  for (const [i, o] of D.orders.entries()) {
    if (!["entregue", "expedido", "separado", "reservado"].includes(o.target) || o.logDone) continue;
    await run("logistica", "logistica", `Reservar estoque do pedido ${i + 1}`, `/api/sales-orders/${o.id}/reserve`, { locationId: D.locations.pick });
    if (o.target !== "reservado") {
      const pl = await run("logistica", "logistica", `Criar separação do pedido ${i + 1}`, `/api/sales-orders/${o.id}/pick-lists`, { warehouseId: D.warehouseId, notes: "Separação de teste" });
      const plId = idOf(pl);
      if (plId) {
        count("separacoes");
        await run("logistica", "logistica", `Iniciar separação ${i + 1}`, `/api/pick-lists/${plId}/start`);
        const full = (await api((await as("logistica")).page, `/api/pick-lists/${plId}`)).body?.data;
        for (const it of full?.items ?? []) await run("logistica", "logistica", `Separar item (pedido ${i + 1})`, `/api/pick-lists/${plId}/items/${it.id}/pick`, { pickedQuantity: Number(it.requested_quantity ?? it.quantity ?? 0) });
        await run("logistica", "logistica", `Concluir separação ${i + 1}`, `/api/pick-lists/${plId}/complete`);
        o.pickListId = plId;
      }
    }
    if (["entregue", "expedido"].includes(o.target) && o.pickListId) {
      const order = (await api((await as("logistica")).page, `/api/sales-orders/${o.id}`)).body?.data;
      const items = (order?.items ?? []).map((x) => ({ salesOrderItemId: x.id, locationId: D.locations.pick, quantity: Number(x.ordered_quantity) }));
      const sh = await run("logistica", "logistica", `Criar expedição do pedido ${i + 1}`, `/api/sales-orders/${o.id}/shipments`, { warehouseId: D.warehouseId, pickListId: o.pickListId, expectedShipDate: inDays(1), notes: "Expedição de teste", items });
      const shId = idOf(sh);
      if (shId) {
        count("expedicoes");
        o.shipmentId = shId;
        await run("logistica", "logistica", `Volume da expedição ${i + 1}`, `/api/shipments/${shId}/packages`, { packageNumber: 1, weight: 3 + i, trackingCode: `${co.prefix}-TRK-${String(i + 1).padStart(4, "0")}` });
        await run("logistica", "logistica", `Liberar expedição ${i + 1}`, `/api/shipments/${shId}/ready`);
        await run("logistica", "logistica", `Embalar expedição ${i + 1}`, `/api/shipments/${shId}/pack`);
        await run("gerente", "logistica", `Aprovar expedição ${i + 1}`, `/api/shipments/${shId}/approve`);
        await run("logistica", "logistica", `Expedir ${i + 1}`, `/api/shipments/${shId}/ship`, { idempotencyKey: `r48-ship-${shId}` });
        if (o.target === "entregue") { await run("logistica", "logistica", `Confirmar entrega ${i + 1}`, `/api/shipments/${shId}/deliver`, { recipientName: "Recebedor fictício", podType: "signature" }); count("entregas"); }
      }
    }
    o.logDone = true;
    save();
  }

  // ---------------------------------------------------------- recebimentos (Financeiro): entregues pagos; 1 parcial
  if (!D.received) {
    for (const [i, o] of D.orders.entries()) {
      if (!o.receivableId || !["entregue"].includes(o.target)) continue;
      const ar = (await api((await as("financeiro")).page, `/api/accounts-receivable/${o.receivableId}`)).body?.data;
      for (const inst of ar?.installments ?? []) {
        const amount = Number(inst.open_amount ?? inst.amount);
        const partial = i === 2;
        const r = await run("financeiro", "financeiro", `Recebimento do pedido ${i + 1}${partial ? " (parcial)" : ""}`, `/api/accounts-receivable-installments/${inst.id}/receive`, { financialAccountId: D.bankId, amount: partial ? Math.round(amount * 50) / 100 : amount, method: i % 2 ? "BOLETO" : "PIX", idempotencyKey: `r48-rec-${inst.id}` });
        if (r.status < 300) count("recebimentos");
      }
    }
    await run("financeiro", "financeiro", "Atualizar vencidos (receber)", "/api/accounts-receivable/refresh-overdue");
    D.received = true;
    save();
  }

  // ---------------------------------------------------------- contas a pagar (Financeiro): pagas, pendentes e vencida
  if (!D.payables) {
    D.payables = [];
    const plan = [["pago", -20, 1850.4], ["pago", -5, 920.0], ["pendente", 15, 3400.0], ["pendente", 40, 1275.9], ["vencido", -10, 640.0]];
    for (const [k, [kind, due, amount]] of plan.entries()) {
      const r = await run("financeiro", "financeiro", `Conta a pagar ${k + 1} (${kind})`, "/api/accounts-payable", { supplierId: D.suppliers[k % D.suppliers.length], description: `NF de compra ${co.prefix}-${1000 + k} (fictícia)`, originalAmount: amount, installments: [{ dueDate: inDays(due), amount }], categoryId: D.expenseCat, issueDate: inDays(due - 30), documentReference: `${co.prefix}-${1000 + k}` });
      const id = idOf(r);
      if (!id) continue;
      count("contas_pagar");
      D.payables.push({ id, kind });
      if (kind === "pago") {
        const ap = (await api((await as("financeiro")).page, `/api/accounts-payable/${id}`)).body?.data;
        for (const inst of ap?.installments ?? []) {
          const p = await run("financeiro", "financeiro", `Pagamento da conta ${k + 1}`, `/api/accounts-payable-installments/${inst.id}/pay`, { financialAccountId: D.bankId, amount: Number(inst.open_amount ?? inst.amount), method: "BANK_TRANSFER", idempotencyKey: `r48-pay-${inst.id}` });
          if (p.status < 300) count("pagamentos");
        }
      }
    }
    await run("financeiro", "financeiro", "Atualizar vencidos (pagar)", "/api/accounts-payable/refresh-overdue");
    save();
  }

  // ---------------------------------------------------------- fiscal (Fiscal): configuração e NF-e dos pedidos entregues
  if (!D.fiscalSetup) {
    const est = await run("fiscal", "fiscal", "Estabelecimento emitente", "/api/fiscal-establishments", { code: `EST-${co.prefix}`, name: `${co.name} — Matriz`, cnpj: co.document, taxRegime: "SIMPLES_NACIONAL", stateRegistration: "ISENTO", city: co.city, state: co.state, address: co.address, zipCode: co.zipCode });
    const cf = await run("fiscal", "fiscal", "CFOP 5102", "/api/fiscal-cfops", { code: "5102", description: "Venda de mercadoria adquirida ou recebida de terceiros", direction: "SAIDA", scope: "INTERNAL" });
    const nat = await run("fiscal", "fiscal", "Natureza de operação", "/api/fiscal-operation-natures", { code: `VENDA-${co.prefix}`, name: "Venda de mercadoria", direction: "SAIDA" });
    if (idOf(nat) && idOf(cf)) await run("fiscal", "fiscal", "CFOP padrão da natureza", `/api/fiscal-operation-natures/${idOf(nat)}`, { defaultCfopId: idOf(cf) }, "PATCH");
    const ncm = await run("fiscal", "fiscal", `NCM ${co.ncm}`, "/api/fiscal-ncms", { code: co.ncm, description: `NCM dos produtos de ${co.profile.toLowerCase()}` });
    Object.assign(D, { establishmentId: idOf(est), natureId: idOf(nat), cfopId: idOf(cf), ncmId: idOf(ncm) });
    // Perfil fiscal (NCM) de todos os produtos, menos o último (usado no teste de NCM ausente).
    for (const p of D.products.slice(0, -1)) {
      const r = await run("fiscal", "fiscal", `Perfil fiscal ${p.code}`, "/api/product-fiscal-profiles", { productId: p.id, ncmId: D.ncmId, originCode: "0" });
      if (r.status < 300) count("perfis_fiscais");
    }
    D.fiscalSetup = true;
    save();
  }
  if (!D.fiscalDocs) {
    D.fiscalDocs = [];
    for (const [i, o] of D.orders.entries()) {
      if (o.target !== "entregue") continue;
      const r = await run("fiscal", "fiscal", `Gerar NF-e do pedido ${i + 1}`, `/api/sales-orders/${o.id}/generate-fiscal-document`, { fiscalEstablishmentId: D.establishmentId, operationNatureId: D.natureId, notes: "NF-e de teste (homologação)" });
      const id = idOf(r);
      if (!id) continue;
      count("documentos_fiscais");
      o.fiscalDocumentId = id;
      const c = await run("fiscal", "fiscal", `Calcular NF-e ${i + 1}`, `/api/fiscal-documents/${id}/calculate`);
      const rd = await run("fiscal", "fiscal", `Marcar NF-e ${i + 1} como pronta`, `/api/fiscal-documents/${id}/ready`);
      const doc = (await api((await as("fiscal")).page, `/api/fiscal-documents/${id}`)).body?.data;
      D.fiscalDocs.push({ id, order: i + 1, status: doc?.status, calc: c.status, ready: rd.status });
    }
    save();
  }

  // ---------------------------------------------------------- conferência no banco (via API) e evidência
  {
    const g = (await as("gerente")).page;
    const orders = await list(g, "/api/sales-orders");
    const byStatus = orders.reduce((a, o) => ((a[o.status] = (a[o.status] ?? 0) + 1), a), {});
    const ars = await list(g, "/api/accounts-receivable");
    const aps = await list((await as("financeiro")).page, "/api/accounts-payable");
    const arBy = ars.reduce((a, o) => ((a[o.status] = (a[o.status] ?? 0) + 1), a), {});
    const apBy = aps.reduce((a, o) => ((a[o.status] = (a[o.status] ?? 0) + 1), a), {});
    const bal = await list(g, "/api/stock-balances");
    const docs = await list((await as("fiscal")).page, "/api/fiscal-documents");
    const docBy = docs.reduce((a, o) => ((a[o.status] = (a[o.status] ?? 0) + 1), a), {});
    const shipments = await list((await as("logistica")).page, "/api/shipments");
    const shBy = shipments.reduce((a, o) => ((a[o.status] = (a[o.status] ?? 0) + 1), a), {});
    D.summary = { pedidos: byStatus, contas_receber: arBy, contas_pagar: apBy, saldos: bal.length, documentos_fiscais: docBy, expedicoes: shBy };
    save();
    const failures = log.filter((x) => x[2] >= 300);
    await evidenceCard(g, "comercial", `${co.n}-${co.key}-massa-resumo`, `${co.name} — massa de dados criada (autor de cada operação)`, [
      ["Item", "Quantidade / situação"],
      ...Object.entries(tally).map(([k, v]) => [k.replace(/_/g, " "), v]),
      ["pedidos por status", JSON.stringify(byStatus)],
      ["contas a receber por status", JSON.stringify(arBy)],
      ["contas a pagar por status", JSON.stringify(apBy)],
      ["documentos fiscais por status", JSON.stringify(docBy)],
      ["expedições por status", JSON.stringify(shBy)],
      ["operações com falha", failures.length ? failures.map((f) => `${f[0]}: ${f[1]} → ${f[2]}`).join(" | ") : "nenhuma"],
    ]);
    check("comercial", `${co.name}: pedidos em estados variados (${JSON.stringify(byStatus)})`, Object.keys(byStatus).length >= 5, { company: co.name, user: "gerente", target: "GET /api/sales-orders", expected: "≥ 5 estados", actual: JSON.stringify(byStatus), evidence: `05-comercial/${co.n}-${co.key}-massa-resumo.png` });
    check("financeiro", `${co.name}: contas a receber e a pagar pagas, pendentes e vencidas (AR ${JSON.stringify(arBy)}; AP ${JSON.stringify(apBy)})`, Object.keys(arBy).length >= 2 && Object.keys(apBy).length >= 3, { company: co.name, user: "financeiro", target: "GET AR/AP", expected: "pagos, pendentes e vencidos", actual: JSON.stringify({ arBy, apBy }) });
    check("fiscal", `${co.name}: NF-e dos pedidos entregues (${JSON.stringify(docBy)})`, (docs.length >= 3), { company: co.name, user: "fiscal", target: "GET /api/fiscal-documents", expected: "3 NF-e", actual: JSON.stringify(docBy) });
    check("logistica", `${co.name}: expedições em estados diferentes (${JSON.stringify(shBy)})`, Object.keys(shBy).length >= 2, { company: co.name, user: "logistica", target: "GET /api/shipments", expected: "entregue e expedida", actual: JSON.stringify(shBy) });
    check("comercial", `${co.name}: todas as operações da massa responderam 2xx (${log.length - failures.length}/${log.length})`, failures.length === 0, { company: co.name, actual: failures.map((f) => `${f[0]}: ${f[1]} → ${f[2]}`).join(" | ") });
  }
  for (const u of Object.values(S)) { await logout(u.page).catch(() => {}); await u.c.close(); }
}
await close();
