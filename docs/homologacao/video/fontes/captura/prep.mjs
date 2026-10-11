// Referência: roda no workspace do teste de 7 empresas (harness ../e2e7/lib.mjs e
// ../e2e-7-empresas/state.json, não versionados) contra o stack local de homologação.
// Senhas só por variáveis de ambiente (E2E7_PASSWORD, HOMOLOG_PASSWORD).
// Preparação de dados para o product tour (empresa demo Órbita
// Distribuidora). Tudo pela API real, com o usuário de cada papel:
//  - orçamentos (Vendedor cria/envia; Gerente aprova)
//  - pedido da história, criado a partir de um orçamento aprovado (rascunho)
//  - ciclo de compras: solicitação → pedido de compra → recebimento →
//    entrada no estoque → conta a pagar
// Grava tour-state.json com os IDs usados pela captura.
import fs from "node:fs";
import { session, api, post, list, logout, close, inDays } from "../e2e7/lib.mjs";

const st = JSON.parse(fs.readFileSync("../e2e-7-empresas/state.json", "utf8")).companies.orbita.data;
const OUT = "tour-state.json";
const T = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(T, null, 2));
const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body?.error ?? r.body).slice(0, 200)}`); return r.body?.data; };
const S = {};
const as = async (who) => (S[who] ??= await session(`${who}@orbitadistribuidora.test`));
const prods = st.products.filter((p) => p.stockProfile === "normal");

// ------------------------------------------------------------ orçamentos
if (!T.quotes) {
  const v = (await as("comercial")).page, g = (await as("gerencia")).page;
  T.quotes = [];
  const plan = [[6, [7, 8], "aprovado"], [8, [9, 10, 11], "enviado"], [9, [12], "aprovado"], [10, [13, 14], "rascunho"]];
  for (const [ci, pis, target] of plan) {
    const items = pis.map((i, k) => ({ productId: prods[i].id, description: prods[i].description, unit: "UN", quantity: [10, 6, 24][k % 3], unitPrice: prods[i].price, discount: 0 }));
    const q = must(await post(v, "/api/sales-quotes", { customerId: st.customers[ci], validUntil: inDays(20), notes: "Proposta comercial — reposição", items }), "orçamento");
    if (target !== "rascunho") must(await post(v, `/api/sales-quotes/${q.id}/send`), "enviar orçamento");
    if (target === "aprovado") must(await post(g, `/api/sales-quotes/${q.id}/approve`), "aprovar orçamento");
    T.quotes.push({ id: q.id, code: q.code, target });
  }
  save();
}
// ------------------------------------------------------------ pedido da história (do orçamento aprovado)
if (!T.storyOrder) {
  const v = (await as("comercial")).page;
  const q = T.quotes.find((x) => x.target === "aprovado");
  const full = (await api(v, `/api/sales-quotes/${q.id}`)).body?.data;
  const o = must(await post(v, "/api/sales-orders", { customerId: full.customer_id, salesQuoteId: q.id, expectedDeliveryAt: inDays(5), notes: `Pedido gerado do orçamento ${q.code}` }), "pedido do orçamento");
  T.storyOrder = { id: o.id, code: o.code, quote: q.code };
  save();
}
// ------------------------------------------------------------ compras
if (!T.purchase) {
  // Solicitação SC-0001 e pedidos PC-0001..0003 já criados (primeira execução);
  // aqui só o recebimento do PC-0001 — pelo Operador, que tem
  // purchase_receipts.create/confirm (o papel Logística só confirma).
  const f = (await as("financeiro")).page, o = (await as("operacao")).page;
  const pos = await list(o, "/api/purchase-orders");
  const po1 = pos.find((p) => p.code === "PC-0001");
  const full = (await api(o, `/api/purchase-orders/${po1.id}`)).body?.data;
  const rec = must(await post(o, "/api/purchase-receipts", { purchaseOrderId: po1.id, notes: "Recebimento conferido na doca", documentType: "NF-e", documentNumber: "18452", documentSeries: "1", documentValue: Number(full.total_amount ?? 0), items: full.items.map((it) => ({ purchaseOrderItemId: it.id, productId: it.product_id, quantityReceived: Number(it.ordered_quantity), unit: "UN", destinationLocationId: st.locations.rec })) }), "recebimento");
  const conf = await post(o, `/api/purchase-receipts/${rec.id}/confirm`, {});
  const ap = await post(f, `/api/purchase-receipts/${rec.id}/generate-payable`, { categoryId: st.expenseCat });
  T.purchase = { request: "SC-0001", po: pos.map((p) => `${p.code}:${p.status}`), receipt: rec.code ?? rec.id, receiptId: rec.id, confirm: `${conf.status} ${JSON.stringify(conf.body?.error ?? "")}`, payable: `${ap.status} ${JSON.stringify(ap.body?.error ?? "")}` };
  save();
}
console.log(JSON.stringify(T, null, 1));
for (const u of Object.values(S)) { await logout(u.page).catch(() => {}); await u.c.close(); }
await close();
