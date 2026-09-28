// Dados FICTÍCIOS de homologação, criados pelas APIs oficiais do app (sem SQL),
// na empresa ASTRA do seed (clientes, fornecedores e produtos já fictícios).
// Cadeia coerente: estoque → orçamento → pedido → reserva → contas a receber →
// recebimento → separação → expedição → entrega; compras; contas a pagar;
// CRM; NF-e em HOMOLOGAÇÃO; qualidade; projetos; ativos. Idempotente: se a
// conta "CX-HML" já existe, não repete.
//
//   APP=https://<preview> HOMOLOG_OWNER_PASSWORD=… [VERCEL_BYPASS_TOKEN=…] \
//   node scripts/homolog/seed.mjs
//
// Saída: uma linha por passo (OK/FALHOU + código HTTP). Nenhum segredo.
import { ACCOUNTS, app, appLogin, need } from "./lib.mjs";

const cookie = await appLogin(ACCOUNTS.owner.email, need("HOMOLOG_OWNER_PASSWORD"));
if (!cookie) throw new Error("Owner não entrou (rode o bootstrap antes).");

const results = [];
const step = (name, r, ok = r.status < 300) => {
  results.push({ name, ok });
  console.log(`${ok ? "OK     " : "FALHOU "} ${name} (${r.status}${ok ? "" : ` ${JSON.stringify(r.json?.error ?? r.json)?.slice(0, 200)}`})`);
  return ok;
};
const get = (p) => app(p, { cookie });
const post = (p, body = {}) => app(p, { body, cookie });
const list = async (p) => (await get(p)).json?.data ?? [];
const idOf = (r) => r.json?.data?.id ?? (typeof r.json?.data === "string" ? r.json.data : r.json?.data?.[0]?.id);
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const accounts = await list("/api/financial-accounts");
if (accounts.some((a) => a.code === "CX-HML")) {
  console.log("seed: dados de homologação já existem (conta CX-HML); nada a fazer.");
  process.exit(0);
}

const customers = await list("/api/customers");
const suppliers = await list("/api/suppliers");
const products = await list("/api/products");
const locations = await list("/api/warehouse-locations");
if (customers.length < 3 || suppliers.length < 2 || products.length < 6 || !locations.length) {
  throw new Error(`cadastros do seed insuficientes (clientes ${customers.length}, fornecedores ${suppliers.length}, produtos ${products.length}, locais ${locations.length})`);
}
const loc = locations.find((l) => /estoque/i.test(l.finalidade ?? "Estoque")) ?? locations[0];
const P = products.slice(0, 8);
const nameOf = (p) => p.descricao ?? p.nome ?? p.codigo ?? "Item";

// ------------------------------------------------------------ Financeiro (base)
const catRev = await post("/api/financial-categories", { code: "REC-HML", name: "Receita de vendas (homologação)", type: "INCOME" });
step("Financeiro: categoria de receita", catRev);
const catExp = await post("/api/financial-categories", { code: "DESP-HML", name: "Compras de fornecedores (homologação)", type: "EXPENSE" });
step("Financeiro: categoria de despesa", catExp);
step("Financeiro: conta Caixa (CX-HML, saldo inicial R$ 50.000)", await post("/api/financial-accounts", { code: "CX-HML", name: "Caixa Homologação", type: "CASH", openingBalance: 50000 }));
step("Financeiro: conta Banco (BCO-HML, saldo inicial R$ 120.000)", await post("/api/financial-accounts", { code: "BCO-HML", name: "Banco Homologação", type: "BANK", openingBalance: 120000 }));
const cx = (await list("/api/financial-accounts")).find((a) => a.code === "CX-HML");

// ------------------------------------------------------------ Estoque
for (const [i, p] of P.entries()) {
  step(`Estoque: entrada de ${120 - i * 10} un. de ${nameOf(p)}`, await post("/api/stock-movements/receive", { productId: p.id, locationId: loc.id, quantity: 120 - i * 10, unitCost: 8 + i * 3.5, idempotencyKey: `hml-rec-${p.id}` }));
}

// ------------------------------------------------------------ Comercial
const q = await post("/api/sales-quotes", {
  customerId: customers[0].id, validUntil: inDays(20), notes: "Orçamento de homologação",
  items: [
    { productId: P[0].id, description: nameOf(P[0]), quantity: 10, unitPrice: 39.9 },
    { productId: P[1].id, description: nameOf(P[1]), quantity: 4, unitPrice: 129.5 },
  ],
});
step("Comercial: orçamento com 2 itens", q, q.status === 201);
const qId = idOf(q);
step("Comercial: enviar orçamento ao cliente", await post(`/api/sales-quotes/${qId}/send`));
step("Comercial: aprovar orçamento", await post(`/api/sales-quotes/${qId}/approve`));
const so = await post("/api/sales-orders", { customerId: customers[0].id, salesQuoteId: qId, notes: "Pedido gerado do orçamento (homologação)" });
step("Comercial: converter orçamento em pedido", so, so.status === 201);
const soId = idOf(so);
step("Comercial: enviar pedido para aprovação", await post(`/api/sales-orders/${soId}/submit`));
step("Comercial: aprovar pedido", await post(`/api/sales-orders/${soId}/approve`));
step("Estoque: reservar o pedido", await post(`/api/sales-orders/${soId}/reserve`, { locationId: loc.id }));
const ar = await post(`/api/sales-orders/${soId}/generate-receivable`, { categoryId: idOf(catRev), description: "Recebível do pedido de homologação" });
step("Financeiro: gerar contas a receber do pedido", ar);
const receivables = await list("/api/accounts-receivable");
const arId = idOf(ar) ?? receivables[0]?.id;
const arFull = arId ? (await get(`/api/accounts-receivable/${arId}`)).json?.data : null;
const inst = arFull?.installments?.[0];
if (inst && cx) {
  step("Financeiro: receber 1ª parcela no Caixa (PIX)", await post(`/api/accounts-receivable-installments/${inst.id}/receive`, { financialAccountId: cx.id, amount: Number(inst.amount ?? inst.open_amount ?? inst.openAmount), method: "PIX", idempotencyKey: `hml-ar-${inst.id}` }));
} else step("Financeiro: receber 1ª parcela no Caixa (PIX)", { status: 0, json: { error: "sem parcela/conta" } }, false);

// ------------------------------------------------------------ Logística
// Pedido reservado → separação (pick list) → expedição → envio → entrega.
const warehouses = await list("/api/warehouses");
const wh = warehouses.find((w) => (w.codigo ?? w.code) === loc.armazem) ?? null;
const order = (await get(`/api/sales-orders/${soId}`)).json?.data;
const pl = wh ? await post(`/api/sales-orders/${soId}/pick-lists`, { warehouseId: wh.id, notes: "Separação de homologação" }) : { status: 0, json: { error: "depósito do local não encontrado" } };
step("Logística: separação (pick list) do pedido reservado", pl, pl.status === 201);
const plId = idOf(pl);
if (plId) {
  step("Logística: iniciar separação", await post(`/api/pick-lists/${plId}/start`));
  const plFull = (await get(`/api/pick-lists/${plId}`)).json?.data;
  for (const it of plFull?.items ?? []) {
    const qty = Number(it.requested_quantity ?? it.quantity ?? it.requestedQuantity ?? 0);
    step(`Logística: separar ${qty} un.`, await post(`/api/pick-lists/${plId}/items/${it.id}/pick`, { pickedQuantity: qty }));
  }
  step("Logística: concluir separação", await post(`/api/pick-lists/${plId}/complete`));
}
const shipItems = (order?.items ?? []).map((i) => ({ salesOrderItemId: i.id, locationId: loc.id, quantity: Number(i.ordered_quantity) }));
const sh = wh && plId ? await post(`/api/sales-orders/${soId}/shipments`, { warehouseId: wh.id, pickListId: plId, expectedShipDate: inDays(1), notes: "Expedição de homologação", items: shipItems }) : { status: 0, json: { error: "sem separação" } };
step("Logística: expedição do pedido", sh, sh.status === 201);
const shId = idOf(sh);
if (shId) {
  const carrier = (await list("/api/carriers"))[0];
  if (carrier) step("Logística: transportadora da expedição", await post(`/api/shipments/${shId}/transport`, { carrierId: carrier.id }));
  step("Logística: volume da expedição", await post(`/api/shipments/${shId}/packages`, { packageNumber: 1, weight: 12.5, trackingCode: "HML-000001" }));
  // Estados: draft → ready → packed → ready_to_ship (aprovada) → shipped → delivered.
  step("Logística: liberar para embalagem", await post(`/api/shipments/${shId}/ready`));
  step("Logística: embalar", await post(`/api/shipments/${shId}/pack`));
  step("Logística: aprovar (pronta para envio)", await post(`/api/shipments/${shId}/approve`));
  step("Logística: expedir", await post(`/api/shipments/${shId}/ship`, { idempotencyKey: `hml-ship-${shId}` }));
  step("Logística: confirmar entrega", await post(`/api/shipments/${shId}/deliver`, { recipientName: "Recebedor Fictício", podType: "signature", notes: "Entrega de homologação" }));
}

const so2 = await post("/api/sales-orders", { customerId: customers[1].id, notes: "Pedido aguardando aprovação (homologação)", items: [{ productId: P[2].id, description: nameOf(P[2]), quantity: 6, unitPrice: 58 }] });
step("Comercial: pedido direto (aguardando aprovação)", so2, so2.status === 201);
if (idOf(so2)) step("Comercial: enviar 2º pedido para aprovação", await post(`/api/sales-orders/${idOf(so2)}/submit`));
step("Comercial: pedido em rascunho", await post("/api/sales-orders", { customerId: customers[2].id, notes: "Rascunho (homologação)", items: [{ productId: P[3].id, description: nameOf(P[3]), quantity: 2, unitPrice: 210 }] }));

// ------------------------------------------------------------ Compras
const pr = await post("/api/purchase-requests", { priority: "high", justification: "Reposição de estoque (homologação)", items: [{ productId: P[4].id, description: nameOf(P[4]), quantity: 80 }, { productId: P[5].id, description: nameOf(P[5]), quantity: 40 }] });
step("Compras: solicitação com 2 itens", pr, pr.status === 201);
if (idOf(pr)) {
  step("Compras: enviar solicitação para aprovação", await post(`/api/purchase-requests/${idOf(pr)}/submit`));
  step("Compras: aprovar solicitação", await post(`/api/purchase-requests/${idOf(pr)}/approve`));
}

// ------------------------------------------------------------ Contas a pagar
const ap = await post("/api/accounts-payable", { supplierId: suppliers[0].id, description: "Compra de insumos (homologação)", originalAmount: 4800, categoryId: idOf(catExp), installments: [{ dueDate: inDays(-5), amount: 1600 }, { dueDate: inDays(25), amount: 1600 }, { dueDate: inDays(55), amount: 1600 }] });
step("Financeiro: contas a pagar em 3 parcelas (1 vencida)", ap, ap.status === 201);
step("Financeiro: contas a pagar de serviço", await post("/api/accounts-payable", { supplierId: suppliers[1].id, description: "Frete contratado (homologação)", originalAmount: 950, categoryId: idOf(catExp), installments: [{ dueDate: inDays(12), amount: 950 }] }));
const apId = idOf(ap) ?? (await list("/api/accounts-payable")).find((x) => /insumos/.test(x.description))?.id;
const apInst = apId ? (await get(`/api/accounts-payable/${apId}`)).json?.data?.installments?.[0] : null;
if (apInst && cx) step("Financeiro: pagar 1ª parcela pelo Caixa", await post(`/api/accounts-payable-installments/${apInst.id}/pay`, { financialAccountId: cx.id, amount: 1600, method: "PIX", idempotencyKey: `hml-ap-${apInst.id}` }));

// ------------------------------------------------------------ CRM
const pipe = await post("/api/pipelines", { code: "FUNIL-HML", name: "Funil comercial (homologação)" });
step("CRM: funil", pipe);
const stages = [];
for (const [i, n] of ["Prospecção", "Proposta", "Negociação"].entries()) {
  const s = await post("/api/pipeline-stages", { pipelineId: idOf(pipe), code: `E${i + 1}`, name: n, sequence: i + 1, probabilityDefault: [10, 50, 80][i] });
  step(`CRM: estágio ${n}`, s);
  stages.push(idOf(s));
}
const leads = [
  { name: "Juliana Prado", companyName: "Distribuidora Vale Verde", email: "juliana@valeverde.example.com", qualification: "HOT" },
  { name: "Otávio Lins", companyName: "Metalúrgica Ponte Alta", email: "otavio@pontealta.example.com", qualification: "WARM" },
  { name: "Renata Siqueira", companyName: "Comercial Bela Vista", email: "renata@belavista.example.com", qualification: "COLD" },
];
const leadIds = [];
for (const l of leads) {
  const r = await post("/api/leads", l);
  step(`CRM: lead ${l.companyName}`, r);
  leadIds.push(idOf(r));
}
const opp = await post("/api/opportunities", { title: "Contrato anual de reposição — Vale Verde", leadId: leadIds[0], pipelineId: idOf(pipe), stageId: stages[0], estimatedValue: 48000, probability: 10 });
step("CRM: oportunidade (Vale Verde)", opp);
if (idOf(opp)) step("CRM: mover oportunidade para Proposta", await post(`/api/opportunities/${idOf(opp)}/move-stage`, { stageId: stages[1] }));
step("CRM: oportunidade (Ponte Alta)", await post("/api/opportunities", { title: "Linha de fixadores — Ponte Alta", leadId: leadIds[1], pipelineId: idOf(pipe), stageId: stages[0], estimatedValue: 15500, probability: 10 }));

// ------------------------------------------------------------ Fiscal (ambiente de HOMOLOGAÇÃO)
const est = await post("/api/fiscal-establishments", { code: "EST-HML", name: "ASTRA Matriz (homologação)", cnpj: "12.345.678/0001-90", taxRegime: "SIMPLES_NACIONAL", state: "SP", city: "São Paulo" });
step("Fiscal: estabelecimento", est);
const nat = await post("/api/fiscal-operation-natures", { code: "VENDA-HML", name: "Venda de mercadoria (homologação)", direction: "SAIDA" });
step("Fiscal: natureza de operação", nat);
const doc = await post("/api/fiscal-documents", { fiscalEstablishmentId: idOf(est), type: "NFE", direction: "SAIDA", operationNatureId: idOf(nat), customerId: customers[0].id });
step("Fiscal: NF-e em rascunho (ambiente de homologação)", doc);
const docId = idOf(doc) ?? (await list("/api/fiscal-documents"))[0]?.id;
if (docId) {
  step("Fiscal: item da NF-e", await post(`/api/fiscal-documents/${docId}/items`, { productId: P[0].id, quantity: 10, unitPrice: 39.9, ncmCode: "73181500", cfopCode: "5102", unit: "UN" }));
  step("Fiscal: calcular NF-e", await post(`/api/fiscal-documents/${docId}/calculate`, {}));
}

// ------------------------------------------------------------ Qualidade
const ins = await post("/api/quality-inspections", { inspectionType: "RECEIVING", productId: P[4].id, notes: "Inspeção de recebimento (homologação)" });
step("Qualidade: inspeção de recebimento", ins);
if (idOf(ins)) {
  step("Qualidade: não conformidade da inspeção", await post(`/api/quality-inspections/${idOf(ins)}/nonconformity`, { severity: "MEDIUM", description: "Embalagem avariada em 3 caixas (homologação)" }));
}

// ------------------------------------------------------------ Projetos e serviços
const pj = await post("/api/projects", { name: "Implantação de endereçamento no CD (homologação)", customerId: customers[1].id, budget: 18000 });
step("Projetos: projeto", pj);
if (idOf(pj)) {
  step("Projetos: tarefa", await post("/api/project-tasks", { projectId: idOf(pj), name: "Levantamento das posições", priority: "HIGH", estimatedHours: 12 }));
  step("Serviços: ordem de serviço", await post("/api/service-orders", { customerId: customers[1].id, projectId: idOf(pj), title: "Instalação de etiquetas de endereço", priority: "MEDIUM" }));
}

// ------------------------------------------------------------ Ativos
const asset = await post("/api/assets", { description: "Empilhadeira elétrica 2,5 t (homologação)", manufacturer: "Fabricante Exemplo", model: "EX-25", acquisitionCost: 98000 });
step("Ativos: ativo", asset);
if (idOf(asset)) step("Ativos: ordem de manutenção preventiva", await post("/api/maintenance-orders", { assetId: idOf(asset), orderType: "PREVENTIVE", priority: "MEDIUM", description: "Revisão de 500 horas", scheduledDate: inDays(10) }));

await post("/api/auth/logout", {});
const ok = results.filter((r) => r.ok).length;
console.log(`seed: ${ok}/${results.length} passos OK`);
if (ok !== results.length) process.exitCode = 1;
