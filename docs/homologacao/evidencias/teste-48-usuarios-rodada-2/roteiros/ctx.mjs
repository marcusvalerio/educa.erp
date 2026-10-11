// Contexto comum da rodada 2: reaproveita o harness da rodada 1 (lib.mjs,
// companies.mjs, state.json) — sessões reais por papel, dados novos por cenário,
// conferência direta no banco local.
import { session, api, post, idOf, errMsg, state, inDays } from "../r48/lib.mjs";
import { COMPANIES } from "../r48/companies.mjs";
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
export const db = new pg.Pool({ host: "/tmp", port: 55440, user: "postgres", database: "educa_poc", max: 4 });
export const q = async (sql, params = []) => (await db.query(sql, params)).rows;
export const st = (r) => `${r.status}${r.status >= 300 ? " " + String(errMsg(r)).slice(0, 160) : ""}`;
export { api, post, idOf, errMsg, inDays };

export async function company(coKey, runTag) {
  const co = COMPANIES.find((c) => c.key === coKey);
  const S = state.companies[coKey];
  const D = S.data, cid = S.companyId;
  const who = (role, n = 0) => co.users.filter((u) => u.role === role)[n] ?? co.users.find((u) => u.role === "gerente");
  const sess = {};
  const email = (role) => (role === "admin" ? co.admin.email : (role.endsWith("2") ? who(role.slice(0, -1), 1) : who(role)).email);
  const as = async (role) => (sess[role] ??= await session(email(role)));
  const P = (role) => sess[role].page;
  const tag = `${co.prefix}-${runTag}`;
  let seq = 0;
  async function newProduct(label, qty, loc = D.locations.pick, { unit = "UN" } = {}) {
    await as("gerente"); await as("operador"); await as("fiscal");
    const r = await post(P("gerente"), "/api/products", { codigo: `${tag}-${label}-${++seq}`, descricao: `Produto rodada 2 ${label} (${tag})`, categoria: "Produto acabado", subcategoria: "Geral", unidade: unit, ncm: co.ncm, estoqueMinimo: 0, estoqueMaximo: 1000, pontoReposicao: 0, precoCusto: 10, precoVenda: 25 });
    const id = idOf(r);
    if (!id) throw new Error("produto não criado: " + st(r));
    if (qty) {
      const m = await post(P("operador"), "/api/stock-movements/receive", { productId: id, locationId: loc, quantity: qty, unitCost: 10, notes: `Saldo para ${label}`, idempotencyKey: `r2-${tag}-${label}-${seq}` });
      if (m.status >= 300) throw new Error("entrada falhou: " + st(m));
    }
    if (D.ncmId) await post(P("fiscal"), "/api/product-fiscal-profiles", { productId: id, ncmId: D.ncmId, originCode: "0" });
    return id;
  }
  async function approvedOrder(productId, qty, note, { price = 25, extraItems = [], unit = "UN" } = {}) {
    await as("vendedor"); await as("gerente");
    const item = { productId, description: "Item rodada 2", quantity: qty, unitPrice: price, discount: 0 };
    if (unit) item.unit = unit;
    const r = await post(P("vendedor"), "/api/sales-orders", { customerId: D.customers[1], paymentTermsId: D.paymentTermId, expectedDeliveryAt: inDays(5), notes: note, items: [item, ...extraItems] });
    const id = idOf(r);
    if (!id) throw new Error("pedido não criado: " + st(r));
    await post(P("vendedor"), `/api/sales-orders/${id}/submit`);
    const a = await post(P("gerente"), `/api/sales-orders/${id}/approve`);
    if (a.status >= 300) throw new Error("aprovação falhou: " + st(a));
    return id;
  }
  const reserve = async (role, orderId, loc = D.locations.pick) => post((await as(role)).page, `/api/sales-orders/${orderId}/reserve`, { locationId: loc });
  async function pick(orderId, role = "logistica") {
    const pl = await post((await as(role)).page, `/api/sales-orders/${orderId}/pick-lists`, { warehouseId: D.warehouseId, notes: "Separação rodada 2" });
    const plId = idOf(pl);
    if (!plId) throw new Error("separação: " + st(pl));
    await post(P(role), `/api/pick-lists/${plId}/start`);
    const full = (await api(P(role), `/api/pick-lists/${plId}`)).body?.data;
    for (const it of full?.items ?? []) await post(P(role), `/api/pick-lists/${plId}/items/${it.id}/pick`, { pickedQuantity: Number(it.requested_quantity ?? 0) });
    const c = await post(P(role), `/api/pick-lists/${plId}/complete`);
    if (c.status >= 300) throw new Error("concluir separação: " + st(c));
    return plId;
  }
  async function orderItems(orderId) {
    return (await api((await as("logistica")).page, `/api/sales-orders/${orderId}`)).body?.data?.items ?? [];
  }
  const shipmentBody = (items, pickListId = null) => ({ warehouseId: D.warehouseId, pickListId, expectedShipDate: inDays(1), notes: "Expedição rodada 2", items });
  async function readyAndShip(shId, role = "logistica") {
    await as(role); await as("gerente");
    await post(P(role), `/api/shipments/${shId}/packages`, { packageNumber: 1, weight: 2 });
    await post(P(role), `/api/shipments/${shId}/ready`);
    await post(P(role), `/api/shipments/${shId}/pack`);
    await post(P("gerente"), `/api/shipments/${shId}/approve`);
    return post(P(role), `/api/shipments/${shId}/ship`, { idempotencyKey: `r2-ship-${shId}` });
  }
  const bal = async (productId, loc = D.locations.pick) =>
    (await q(`select coalesce(sum(on_hand),0)::float on_hand, coalesce(sum(reserved),0)::float reserved, coalesce(sum(available),0)::float available from stock_balances where product_id=$1 and location_id=$2`, [productId, loc]))[0];
  const activeRes = async (orderId) =>
    (await q(`select count(*)::int n from stock_reservations where reference_type='sales_order' and reference_id=$1 and status='active'`, [orderId]))[0].n;
  return { co, D, cid, who, as, P, email, tag, newProduct, approvedOrder, reserve, pick, orderItems, shipmentBody, readyAndShip, bal, activeRes };
}
