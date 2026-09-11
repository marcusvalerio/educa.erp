import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { warehouseSchema, productLotSchema } from "@/lib/validations/cadastros";
import {
  productSerialNumberSchema,
  receiveStockSchema,
  issueStockSchema,
  createTransferSchema,
  createReservationSchema,
  createAdjustmentSchema,
  startCountSchema,
  submitCountItemSchema,
} from "@/lib/validations/inventory";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("warehouseSchema", () => {
  test("rejeita depósito sem código ou nome", () => {
    assert.equal(warehouseSchema.safeParse({}).success, false);
    assert.equal(warehouseSchema.safeParse({ codigo: "PRINCIPAL" }).success, false);
  });

  test("aceita depósito válido com defaults", () => {
    const result = warehouseSchema.safeParse({ codigo: "PRINCIPAL", nome: "Depósito Principal" });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.tipo, "Padrão");
      assert.equal(result.data.status, "Ativo");
    }
  });
});

describe("productLotSchema", () => {
  test("exige produto e número do lote", () => {
    assert.equal(productLotSchema.safeParse({}).success, false);
    assert.equal(productLotSchema.safeParse({ produtoId: uuid1 }).success, false);
  });

  test("aceita lote válido", () => {
    const result = productLotSchema.safeParse({ produtoId: uuid1, numeroLote: "L2026-001" });
    assert.equal(result.success, true);
  });
});

describe("productSerialNumberSchema", () => {
  test("exige produto e número de série", () => {
    assert.equal(productSerialNumberSchema.safeParse({}).success, false);
  });

  test("aceita status default in_stock e rejeita status inválido", () => {
    const result = productSerialNumberSchema.safeParse({ produtoId: uuid1, numeroSerie: "SN-0001" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.status, "in_stock");

    const invalid = productSerialNumberSchema.safeParse({ produtoId: uuid1, numeroSerie: "SN-0001", status: "quebrado" });
    assert.equal(invalid.success, false);
  });
});

describe("receiveStockSchema / issueStockSchema", () => {
  test("rejeita quantidade zero ou negativa", () => {
    const base = { productId: uuid1, locationId: uuid2, quantity: 0 };
    assert.equal(receiveStockSchema.safeParse(base).success, false);
    assert.equal(issueStockSchema.safeParse(base).success, false);
    assert.equal(receiveStockSchema.safeParse({ ...base, quantity: -5 }).success, false);
  });

  test("aceita movimento direto válido", () => {
    const result = receiveStockSchema.safeParse({ productId: uuid1, locationId: uuid2, quantity: 10, unitCost: 5.5 });
    assert.equal(result.success, true);
  });

  test("rejeita productId/locationId que não são uuid", () => {
    const result = receiveStockSchema.safeParse({ productId: "not-a-uuid", locationId: uuid2, quantity: 10 });
    assert.equal(result.success, false);
  });
});

describe("createTransferSchema", () => {
  test("exige ao menos um item", () => {
    const result = createTransferSchema.safeParse({ fromLocationId: uuid1, toLocationId: uuid2, items: [] });
    assert.equal(result.success, false);
  });

  test("aceita transferência válida com um item", () => {
    const result = createTransferSchema.safeParse({
      fromLocationId: uuid1,
      toLocationId: uuid2,
      items: [{ productId: uuid1, quantity: 3 }],
    });
    assert.equal(result.success, true);
  });
});

describe("createReservationSchema", () => {
  test("exige local e itens", () => {
    assert.equal(createReservationSchema.safeParse({ items: [] }).success, false);
  });

  test("aceita reserva válida", () => {
    const result = createReservationSchema.safeParse({
      locationId: uuid1,
      items: [{ productId: uuid2, quantity: 2 }],
    });
    assert.equal(result.success, true);
  });
});

describe("createAdjustmentSchema", () => {
  test("rejeita item com quantityDelta zero", () => {
    const result = createAdjustmentSchema.safeParse({
      locationId: uuid1,
      reasonCode: "contagem",
      items: [{ productId: uuid2, quantityDelta: 0 }],
    });
    assert.equal(result.success, false);
  });

  test("aceita ajuste positivo e negativo", () => {
    const positive = createAdjustmentSchema.safeParse({
      locationId: uuid1,
      reasonCode: "avaria",
      items: [{ productId: uuid2, quantityDelta: 5 }],
    });
    const negative = createAdjustmentSchema.safeParse({
      locationId: uuid1,
      reasonCode: "avaria",
      items: [{ productId: uuid2, quantityDelta: -5 }],
    });
    assert.equal(positive.success, true);
    assert.equal(negative.success, true);
  });
});

describe("startCountSchema / submitCountItemSchema", () => {
  test("exige warehouseId", () => {
    assert.equal(startCountSchema.safeParse({}).success, false);
    assert.equal(startCountSchema.safeParse({ warehouseId: uuid1 }).success, true);
  });

  test("rejeita quantidade contada negativa", () => {
    assert.equal(submitCountItemSchema.safeParse({ countedQuantity: -1 }).success, false);
    assert.equal(submitCountItemSchema.safeParse({ countedQuantity: 0 }).success, true);
  });
});
