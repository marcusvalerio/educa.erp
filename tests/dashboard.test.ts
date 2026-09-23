// Lógica pura dos painéis (src/lib/dashboard/*): períodos comparáveis,
// detectores de problema, fluxos do ERP (Sankey) e variações entre
// períodos. Nada aqui inventa número: tudo deriva das linhas recebidas.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { inRange, lastMonths, periodRange, previousRange } from "@/lib/dashboard/periods";
import { PROBLEMS, rankProblems, type ProblemResult } from "@/lib/dashboard/problems";
import { buildOrderToDeliveryFlow, buildProcureToReceiveFlow, buildProductionFlow, type Flow } from "@/lib/dashboard/flows";
import { REPORTS, biggestChanges, formatMetric } from "@/lib/dashboard/metrics";
import { lookupPath, pickName } from "@/lib/useIdNameLookup";

const today = new Date(2026, 8, 23); // 23/09/2026

describe("períodos", () => {
  test("mês corrente e anterior", () => {
    assert.deepEqual(periodRange("mes", today), { start: "2026-09-01", end: "2026-09-23" });
    assert.deepEqual(periodRange("mes-anterior", today), { start: "2026-08-01", end: "2026-08-31" });
    assert.deepEqual(periodRange("30d", today), { start: "2026-08-25", end: "2026-09-23" });
  });
  test("comparação usa intervalo anterior de mesma duração", () => {
    assert.deepEqual(previousRange({ start: "2026-09-01", end: "2026-09-23" }), { start: "2026-08-09", end: "2026-08-31" });
    assert.deepEqual(previousRange({ start: "2026-03-01", end: "2026-03-31" }), { start: "2026-01-29", end: "2026-02-28" });
  });
  test("inRange inclui as bordas e aceita timestamp", () => {
    const r = { start: "2026-09-01", end: "2026-09-30" };
    assert.equal(inRange("2026-09-30T23:59:00Z", r), true);
    assert.equal(inRange("2026-10-01", r), false);
    assert.equal(inRange(null, r), false);
  });
  test("últimos meses terminam hoje", () => {
    const months = lastMonths(6, today);
    assert.equal(months.length, 6);
    assert.equal(months[0].start, "2026-04-01");
    assert.equal(months[5].end, "2026-09-23");
    assert.equal(months[4].end, "2026-08-31");
  });
});

describe("problemas", () => {
  const late = PROBLEMS.find((p) => p.id === "sales-late")!;
  test("atraso conta só abertos com data vencida e soma valor", () => {
    const rows = [
      { status: "approved", expected_delivery_at: "2026-09-20", total_amount: 100 },
      { status: "completed", expected_delivery_at: "2026-09-01", total_amount: 999 },
      { status: "picking", expected_delivery_at: "2026-09-30", total_amount: 50 },
      { status: "reserved", expected_delivery_at: null, total_amount: 70 },
    ];
    assert.deepEqual(late.compute(rows, today), { count: 1, amount: 100 });
  });
  test("todo detector declara permissão, fonte e destino", () => {
    const ids = new Set<string>();
    for (const p of PROBLEMS) {
      assert.ok(p.permission && p.source.startsWith("/api/") && p.href.startsWith("/"), p.id);
      assert.ok(!ids.has(p.id), `id repetido ${p.id}`);
      ids.add(p.id);
      assert.deepEqual(p.compute([], today).count, 0, p.id);
    }
  });
  test("ordem: gravidade, depois foco, depois volume; zeros saem", () => {
    const base = PROBLEMS[0];
    const mk = (id: string, severity: ProblemResult["severity"], module: string, count: number): ProblemResult => ({ ...base, id, severity, module, count });
    const ranked = rankProblems(
      [mk("a", "warning", "financeiro", 50), mk("b", "danger", "comercial", 1), mk("c", "danger", "financeiro", 2), mk("d", "critical", "x", 0)],
      ["financeiro"]
    );
    assert.deepEqual(ranked.map((r) => r.id), ["c", "b", "a"]);
  });
});

function assertConserves(flow: Flow) {
  const inflow = new Map<number, number>();
  const outflow = new Map<number, number>();
  for (const l of flow.links) {
    assert.ok(l.value > 0);
    outflow.set(l.source, (outflow.get(l.source) ?? 0) + l.value);
    inflow.set(l.target, (inflow.get(l.target) ?? 0) + l.value);
  }
  for (const [node, value] of outflow) if (node !== 0) assert.equal(inflow.get(node), value, `nó ${flow.nodes[node].name}`);
  assert.equal(outflow.get(0) ?? 0, flow.total);
}

describe("fluxos do ERP", () => {
  const range = { start: "2026-09-01", end: "2026-09-30" };
  test("pedido à entrega conserva volume e ignora fora do período", () => {
    const orders = [
      { id: "1", status: "pending_approval", order_date: "2026-09-02" },
      { id: "2", status: "shipped", order_date: "2026-09-03" },
      { id: "3", status: "completed", order_date: "2026-09-04" },
      { id: "4", status: "cancelled", order_date: "2026-09-05" },
      { id: "5", status: "shipped", order_date: "2026-08-01" },
    ];
    const shipments = [{ sales_order_id: "3", status: "delivered" }];
    const flow = buildOrderToDeliveryFlow(orders, shipments, range);
    assert.equal(flow.total, 4);
    assertConserves(flow);
    assert.ok(!flow.nodes.some((n) => n.name === "Em preparação"), "nó sem volume é removido");
  });
  test("compra ao recebimento e produção conservam volume", () => {
    const po = [
      { id: "a", status: "received", issued_at: "2026-09-10" },
      { id: "b", status: "sent", issued_at: "2026-09-11" },
    ];
    assertConserves(buildProcureToReceiveFlow(po, [{ purchase_order_id: "a", status: "confirmed" }], range));
    const op = [
      { status: "completed", planned_date: "2026-09-10", rejected_quantity: 2 },
      { status: "completed", planned_date: "2026-09-11", rejected_quantity: 0 },
      { status: "in_progress", planned_date: "2026-09-12" },
    ];
    const flow = buildProductionFlow(op, range);
    assert.equal(flow.total, 3);
    assertConserves(flow);
  });
  test("sem registros, fluxo vazio (nunca inventado)", () => {
    const flow = buildOrderToDeliveryFlow([], [], range);
    assert.equal(flow.total, 0);
    assert.equal(flow.links.length, 0);
  });
});

describe("métricas", () => {
  test("formatos", () => {
    assert.equal(formatMetric(null, "money"), "—");
    assert.equal(formatMetric("abc", "int"), "—");
    assert.equal(formatMetric(1234.4, "int"), "1.234");
    assert.equal(formatMetric(2.5, "days"), "2,5 d");
  });
  test("maiores mudanças reais, com sentido de bom/ruim", () => {
    const metrics = REPORTS.finance.metrics;
    const changes = biggestChanges(metrics, { received_in_period: 200, overdue_receivable: 50, paid_in_period: 10 }, { received_in_period: 100, overdue_receivable: 100, paid_in_period: 10 });
    assert.deepEqual(changes.map((c) => c.metric.key), ["received_in_period", "overdue_receivable"]);
    assert.equal(changes[0].good, true);
    assert.equal(changes[1].good, true);
    assert.deepEqual(biggestChanges(metrics, null, {}), []);
  });
});

describe("drill-down aponta para telas existentes", () => {
  const root = path.join(process.cwd(), "src", "app");
  const exists = (href: string) => {
    const clean = href.split("?")[0];
    return [path.join(root, "(erp)", clean, "page.tsx"), path.join(root, clean, "page.tsx")].some((c) => existsSync(c));
  };
  test("problemas e métricas", () => {
    for (const p of PROBLEMS) assert.ok(exists(p.href), p.href);
    for (const report of Object.values(REPORTS)) for (const m of report.metrics) if (m.href) assert.ok(exists(m.href), m.href);
  });
  test("nós dos fluxos", () => {
    const range = { start: "2026-01-01", end: "2026-12-31" };
    const all = [
      ...buildOrderToDeliveryFlow([], [], range).nodes,
      ...buildProcureToReceiveFlow([], [], range).nodes,
      ...buildProductionFlow([], range).nodes,
    ];
    for (const n of all) if (n.href) assert.ok(exists(n.href), n.href);
  });
});

describe("lookup de nomes", () => {
  test("usa o campo pedido e depois os equivalentes", () => {
    assert.equal(pickName({ nome: "Cliente A" }, "name"), "Cliente A");
    assert.equal(pickName({ razaoSocial: "Fornecedor B", legal_name: "x" }, "legal_name"), "x");
    assert.equal(pickName({ id: "1" }, "name"), null);
  });
  test("pede o maior lote permitido sem duplicar parâmetros", () => {
    assert.equal(lookupPath("/api/customers"), "/api/customers?pageSize=500");
    assert.equal(lookupPath("/api/customers?status=Ativo"), "/api/customers?status=Ativo&pageSize=500");
    assert.equal(lookupPath("/api/x?pageSize=10"), "/api/x?pageSize=10");
  });
});
