// Rodada 2 — reprodução dos problemas abertos da rodada 1, ANTES e DEPOIS da
// correção, com sessões reais por papel e conferência no banco. 24 verificações
// por empresa (Vértice e Sertão): E4/G1/G3/C repetidos N vezes (concorrência
// real com Promise.all) + G3b, R11, R11b, H1, H1c, H2, M17 e B18 uma vez.
import fs from "node:fs";
import { check, close, evidenceCard } from "../r48/lib.mjs";
import { company, db, q, st, post, idOf, errMsg } from "./ctx.mjs";

const PHASE = process.env.PHASE ?? "antes";
const N = Number(process.env.N ?? 4);
const rows = [["Empresa", "Cenário", "Execução", "Resultado", "Detalhe"]];
let pass = 0, fail = 0;
const UUIDRE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function run(coKey) {
  const C = await company(coKey, `R2${PHASE[0]}${Date.now().toString(36).slice(-3)}`);
  const { co, D } = C;
  const rep = (id, name, ok, i, detail) => {
    ok ? pass++ : fail++;
    rows.push([co.name, `${id} — ${name}`, i, ok ? "PASS" : "FAIL", detail]);
    check("reproducao", `${id} — ${name}${i ? ` (${i})` : ""}`, ok, { company: co.name, target: id, expected: "ver roteiro", actual: detail });
  };
  const second = co.users.some((u) => u.role === "financeiro") ? "financeiro" : "admin";
  await C.as("logistica"); await C.as("logistica2"); await C.as("gerente"); await C.as(second); await C.as("admin");

  for (let i = 1; i <= N; i++) {
    // E4 — gerar a conta a receber do mesmo pedido ao mesmo tempo
    {
      const pid = await C.newProduct(`E4${i}`, 20);
      const oid = await C.approvedOrder(pid, 2, `E4 ${i}`);
      const r = await Promise.all([post(C.P(second), `/api/sales-orders/${oid}/generate-receivable`, {}), post(C.P("gerente"), `/api/sales-orders/${oid}/generate-receivable`, {})]);
      const [{ n }] = await q(`select count(*)::int n from accounts_receivable where origin_type='sales_order' and origin_id=$1 and status<>'CANCELLED'`, [oid]);
      rep("E4", "Gerar a conta a receber do mesmo pedido 2× ao mesmo tempo", n === 1, i, `${r.map(st).join(" / ")} · ${r.map((x) => x.body?.message ?? "").filter(Boolean).join(" | ")} · títulos ativos ${n}`);
    }
    // G1 — duas separações do mesmo pedido ao mesmo tempo
    {
      const pid = await C.newProduct(`G1${i}`, 10);
      const oid = await C.approvedOrder(pid, 3, `G1 ${i}`);
      await C.reserve("logistica", oid);
      const body = { warehouseId: D.warehouseId, notes: "G1" };
      const r = await Promise.all([post(C.P("logistica"), `/api/sales-orders/${oid}/pick-lists`, body), post(C.P("logistica2"), `/api/sales-orders/${oid}/pick-lists`, body)]);
      const [{ n }] = await q(`select count(*)::int n from pick_lists where sales_order_id=$1 and status in ('pending','in_progress')`, [oid]);
      rep("G1", "Criar a separação do mesmo pedido 2× ao mesmo tempo", n === 1, i, `${r.map(st).join(" / ")} · separações abertas ${n}`);
    }
    // G3 — duas expedições do mesmo pedido ao mesmo tempo
    {
      const pid = await C.newProduct(`G3${i}`, 10);
      const oid = await C.approvedOrder(pid, 4, `G3 ${i}`);
      await C.reserve("logistica", oid);
      const plId = await C.pick(oid);
      const items = (await C.orderItems(oid)).map((x) => ({ salesOrderItemId: x.id, locationId: D.locations.pick, quantity: 4 }));
      const r = await Promise.all([post(C.P("logistica"), `/api/sales-orders/${oid}/shipments`, C.shipmentBody(items, plId)), post(C.P("logistica2"), `/api/sales-orders/${oid}/shipments`, C.shipmentBody(items, plId))]);
      const [{ qty }] = await q(`select coalesce(sum(si.quantity),0)::float qty from shipment_items si join shipments s on s.id=si.shipment_id where s.sales_order_id=$1 and s.status not in ('cancelled')`, [oid]);
      rep("G3", "Criar a expedição do mesmo pedido 2× ao mesmo tempo (4 reservadas)", qty <= 4, i, `${r.map(st).join(" / ")} · quantidade em expedições ${qty} para 4 reservadas`);
    }
    // C — corrida de reserva: 8 + 7 com saldo 10
    {
      const pid = await C.newProduct(`C${i}`, 10);
      const a = await C.approvedOrder(pid, 8, `C ${i} A`);
      const b = await C.approvedOrder(pid, 7, `C ${i} B`);
      const r = await Promise.all([C.reserve("gerente", a), C.reserve("logistica", b)]);
      const bl = await C.bal(pid);
      const ok = r.every((x) => x.status < 300) && bl.reserved <= 10 && bl.reserved === 10;
      rep("C", "Reservar 8 e 7 ao mesmo tempo com saldo 10 (o perdedor fica com o que sobrou)", ok, i, `${r.map(st).join(" / ")} · reservado ${bl.reserved} de 10`);
    }
  }

  // G3b — 2ª expedição EM SEQUÊNCIA com a mesma quantidade
  {
    const pid = await C.newProduct("G3b", 10);
    const oid = await C.approvedOrder(pid, 4, "G3b");
    await C.reserve("logistica", oid);
    const plId = await C.pick(oid);
    const items = (await C.orderItems(oid)).map((x) => ({ salesOrderItemId: x.id, locationId: D.locations.pick, quantity: 4 }));
    const r1 = await post(C.P("logistica"), `/api/sales-orders/${oid}/shipments`, C.shipmentBody(items, plId));
    const r2 = await post(C.P("logistica"), `/api/sales-orders/${oid}/shipments`, C.shipmentBody(items, plId));
    rep("G3b", "2ª expedição em sequência com a mesma quantidade (sem concorrência)", r1.status < 300 && r2.status >= 400, "", `${st(r1)} / ${st(r2)}`);
  }
  // R11 / R11b — reserva depois da expedição e liberação de pedido expedido
  let shippedOrder = null;
  {
    const pid = await C.newProduct("R11", 10);
    const oid = await C.approvedOrder(pid, 4, "R11");
    await C.reserve("logistica", oid);
    const plId = await C.pick(oid);
    const items = (await C.orderItems(oid)).map((x) => ({ salesOrderItemId: x.id, locationId: D.locations.pick, quantity: 4 }));
    const sh = await post(C.P("logistica"), `/api/sales-orders/${oid}/shipments`, C.shipmentBody(items, plId));
    const shipped = await C.readyAndShip(idOf(sh));
    const act = await C.activeRes(oid);
    const bl = await C.bal(pid);
    shippedOrder = oid;
    rep("R11", "Reserva do pedido expedido deixa de ficar ativa", shipped.status < 300 && act === 0 && bl.reserved === 0, "", `expedir ${st(shipped)} · reservas ativas ${act} · reservado no saldo ${bl.reserved}`);
    const rel = await post(C.P("gerente"), `/api/sales-orders/${oid}/release-reservation`);
    rep("R11b", "Liberar reserva de pedido já expedido: recusa clara, sem código técnico", rel.status >= 400 && rel.status < 500 && !/status atual: [a-z_]+/.test(errMsg(rel)), "", st(rel));
  }
  // H1 — cancelar pedido em separação (separação aberta)
  {
    const pid = await C.newProduct("H1", 10);
    const oid = await C.approvedOrder(pid, 3, "H1");
    await C.reserve("logistica", oid);
    await post(C.P("logistica"), `/api/sales-orders/${oid}/pick-lists`, { warehouseId: D.warehouseId });
    const r = await post(C.P("gerente"), `/api/sales-orders/${oid}/cancel`, { reason: "teste H1" });
    const act = await C.activeRes(oid);
    const ok = (r.status < 300 && act === 0) || (r.status >= 400 && r.status < 500 && /separação/i.test(errMsg(r)) && !/não é permitido/i.test(errMsg(r)));
    rep("H1", "Cancelar pedido com separação aberta: cancela e libera OU recusa nomeando a separação", ok, "", `${st(r)} · reservas ativas ${act}`);
  }
  // H1c — cancelar pedido separado (pronto para expedir) sem expedição criada
  {
    const pid = await C.newProduct("H1c", 10);
    const oid = await C.approvedOrder(pid, 3, "H1c");
    await C.reserve("logistica", oid);
    await C.pick(oid);
    const r = await post(C.P("gerente"), `/api/sales-orders/${oid}/cancel`, { reason: "teste H1c" });
    const act = await C.activeRes(oid);
    const bl = await C.bal(pid);
    rep("H1c", "Cancelar pedido separado (pronto para expedir) sem expedição criada", r.status < 300 && act === 0 && bl.reserved === 0, "", `${st(r)} · reservas ativas ${act} · reservado no saldo ${bl.reserved}`);
  }
  // H2 — expedir o pedido A de um local onde a reserva é do pedido X
  {
    const pid = await C.newProduct("H2", 4, D.locations.pick);
    await post(C.P("operador"), "/api/stock-movements/receive", { productId: pid, locationId: D.locations.alm, quantity: 4, unitCost: 10, notes: "H2 almoxarifado", idempotencyKey: `r2-${C.tag}-H2-alm` });
    const x = await C.approvedOrder(pid, 4, "H2 X");
    await C.reserve("logistica", x, D.locations.pick);
    const a = await C.approvedOrder(pid, 4, "H2 A");
    await C.reserve("logistica", a, D.locations.alm);
    const plId = await C.pick(a);
    const items = (await C.orderItems(a)).map((it) => ({ salesOrderItemId: it.id, locationId: D.locations.pick, quantity: 4 }));
    const r = await post(C.P("logistica"), `/api/sales-orders/${a}/shipments`, C.shipmentBody(items, plId));
    rep("H2", "Expedir o pedido A a partir de um local onde a reserva é do pedido X", r.status >= 400 && r.status < 500, "", st(r));
  }
  // M17 — mensagem sem UUID e sem "4.0000"
  {
    const pid = await C.newProduct("M17", 10);
    const oid = await C.approvedOrder(pid, 4, "M17");
    await C.reserve("logistica", oid);
    const plId = await C.pick(oid);
    const items = (await C.orderItems(oid)).map((x) => ({ salesOrderItemId: x.id, locationId: D.locations.pick, quantity: 5 }));
    const r = await post(C.P("logistica"), `/api/sales-orders/${oid}/shipments`, C.shipmentBody(items, plId));
    const m = errMsg(r);
    rep("M17", "Expedir mais que o reservado: mensagem sem UUID e sem números com 4 casas", r.status >= 400 && !UUIDRE.test(m) && !/\d\.\d{4}\b/.test(m), "", `${r.status} ${m.slice(0, 200)}`);
  }
  // B18 — item do pedido herda a unidade do produto
  {
    const pid = await C.newProduct("B18", 5, undefined, { unit: "CX" });
    const oid = await C.approvedOrder(pid, 1, "B18", { unit: null });
    const [it] = await q(`select unit from sales_order_items where order_id=$1`, [oid]);
    rep("B18", "Item do pedido sem unidade herda a unidade do produto (CX)", it?.unit === "CX", "", `unidade gravada: ${it?.unit ?? "nula"}`);
  }
  for (const s of Object.values({})) await s;
}

for (const k of (process.env.ONLY ?? "vertice,sertao").split(",")) await run(k);
await evidenceCard(null, "01-reproducao", `00-reproducao-${PHASE}`, `Reprodução dos problemas da rodada 1 — ${PHASE} (${pass} PASS / ${fail} FAIL)`, rows);
fs.writeFileSync(new URL(`./p1-reproducao-${PHASE}.out.json`, import.meta.url), JSON.stringify({ phase: PHASE, pass, fail, rows }, null, 2));
console.log(`reprodução (${PHASE}): ${pass} PASS, ${fail} FAIL`);
await db.end();
await close();
process.exit(0);
