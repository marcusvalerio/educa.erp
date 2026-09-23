// Registro tipado de status (src/lib/status.ts): o badge vem do código
// do banco, nunca de texto livre.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { STATUS_REGISTRY, dbStatusCode, statusMeta, statusOptions, type StatusEntity } from "@/lib/status";

describe("statusMeta", () => {
  test("resolve por entidade, sem depender de caixa", () => {
    assert.equal(statusMeta("sales_orders", "pending_approval").label, "Aguardando aprovação");
    assert.equal(statusMeta("sales_orders", "PENDING_APPROVAL").tone, "warning");
    assert.equal(statusMeta("company_lifecycle", "SUSPENDED").tone, "warning");
  });
  test("cai no genérico e depois num rótulo neutro legível", () => {
    assert.equal(statusMeta(undefined, "active").label, "Ativo");
    const unknown = statusMeta("sales_orders", "algo_novo");
    assert.equal(unknown.tone, "neutral");
    assert.equal(unknown.label, "Algo novo");
    assert.equal(statusMeta(undefined, null).label, "—");
  });
  test("mesma palavra não vira tom por acaso", () => {
    // "cancelled" é neutro em pedidos, mas a ação de auditoria DELETE é perigo.
    assert.equal(statusMeta("sales_orders", "cancelled").tone, "neutral");
    assert.equal(statusMeta("audit_action", "DELETE").tone, "danger");
  });
});

describe("códigos para a API", () => {
  test("tabelas com CHECK minúsculo recebem código minúsculo", () => {
    assert.equal(dbStatusCode("sales_orders", "PENDING_APPROVAL"), "pending_approval");
    assert.equal(dbStatusCode("accounts_receivable", "open"), "OPEN");
  });
  test("todas as entidades têm opções com rótulo", () => {
    for (const entity of Object.keys(STATUS_REGISTRY) as StatusEntity[]) {
      const options = statusOptions(entity);
      assert.ok(options.length > 0, entity);
      for (const o of options) assert.ok(o.label && o.value, `${entity}:${o.value}`);
    }
  });
});
