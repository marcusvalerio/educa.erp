import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, splitInstallments } from "@/lib/finance/installments";

test("parcelas somam exatamente o total; a última absorve o arredondamento", () => {
  const p = splitInstallments(100, 3, "2026-10-17", 30);
  assert.deepEqual(p.map((x) => x.amount), [33.33, 33.33, 33.34]);
  assert.equal(Math.round(p.reduce((a, x) => a + x.amount, 0) * 100), 10000);
  assert.deepEqual(p.map((x) => x.dueDate), ["2026-10-17", "2026-11-16", "2026-12-16"]);
});

test("parcela única, contagem inválida e limite de 60", () => {
  assert.deepEqual(splitInstallments(50.5, 1, "2026-01-31", 30), [{ dueDate: "2026-01-31", amount: 50.5 }]);
  assert.equal(splitInstallments(10, 0, "2026-01-01", 30).length, 1);
  assert.equal(splitInstallments(1000, 999, "2026-01-01", 7).length, 60);
  assert.equal(addDays("2026-02-27", 2), "2026-03-01");
});
