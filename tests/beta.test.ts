import { test } from "node:test";
import assert from "node:assert/strict";
import { isBetaAllowed, parseBetaEmails } from "../src/lib/beta/access";
import { dueWithin, monthlySeries, stalled, summarySentence, variation } from "../src/lib/beta/today";

test("beta: lista de e-mails da variável, sem diferença de maiúsculas", () => {
  assert.deepEqual(parseBetaEmails(" A@x.com, b@y.com;c@z.com  lixo "), ["a@x.com", "b@y.com", "c@z.com"]);
  assert.equal(isBetaAllowed("B@Y.com", "a@x.com,b@y.com"), true);
  assert.equal(isBetaAllowed("d@x.com", "a@x.com"), false);
  assert.equal(isBetaAllowed("a@x.com", ""), false);
  assert.equal(isBetaAllowed(null, "a@x.com"), false);
});

test("beta: vence hoje / na semana, parados e série mensal", () => {
  const today = new Date(2026, 9, 26, 10);
  const rows = [
    { status: "OPEN", due_date: "2026-10-26", updated_amount: 100 },
    { status: "OPEN", due_date: "2026-10-30", updated_amount: 50 },
    { status: "RECEIVED", due_date: "2026-10-26", updated_amount: 999 },
    { status: "OPEN", due_date: "2026-10-20", updated_amount: 7 },
  ];
  assert.deepEqual(dueWithin(rows, "due_date", ["OPEN"], today, 0, "updated_amount"), { count: 1, amount: 100 });
  assert.deepEqual(dueWithin(rows, "due_date", ["OPEN"], today, 7, "updated_amount"), { count: 2, amount: 150 });
  assert.equal(stalled([{ status: "approved", updated_at: "2026-10-20T00:00:00Z" }, { status: "approved", updated_at: "2026-10-26T00:00:00Z" }], ["approved"], today).count, 1);
  const s = monthlySeries([{ order_date: "2026-10-02", total_amount: 30, status: "approved" }, { order_date: "2026-09-10", total_amount: 20 }, { order_date: "2026-10-03", total_amount: 99, status: "cancelled" }], "order_date", "total_amount", today, 3, ["cancelled"]);
  assert.deepEqual(s.map((x) => x.value), [0, 20, 30]);
  assert.equal(variation(s), 50);
  assert.equal(summarySentence([{ count: 3, one: "título vence hoje", many: "títulos vencem hoje" }, { count: 0, one: "x", many: "y" }, { count: 1, one: "pedido parado", many: "pedidos parados" }]), "3 títulos vencem hoje · 1 pedido parado");
});

test("beta: idade da pendência mais antiga e pulso diário", async () => {
  const { oldestAgeDays, dailySeries } = await import("../src/lib/beta/today");
  const today = new Date(2026, 9, 26, 10);
  const rows = [
    { status: "OPEN", due_date: "2026-10-14" },
    { status: "OPEN", due_date: "2026-10-20" },
    { status: "PAID", due_date: "2026-10-01" },
    { status: "OPEN", due_date: "2026-10-30" },
  ];
  assert.equal(oldestAgeDays(rows, "due_date", ["OPEN"], today), 12);
  assert.equal(oldestAgeDays([], "due_date", ["OPEN"], today), null);
  const s = dailySeries([{ order_date: "2026-10-26", total_amount: 10 }, { order_date: "2026-10-26", total_amount: 5 }, { order_date: "2026-09-01", total_amount: 9 }], "order_date", "total_amount", today, 30);
  assert.equal(s.length, 30);
  assert.deepEqual(s[29], { key: "2026-10-26", value: 15, count: 2 });
});
