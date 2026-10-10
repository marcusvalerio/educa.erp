import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toRpcSalesItems } from "@/lib/commercial/rpc-items";
import { convertOpportunityToQuoteSchema } from "@/lib/validations/crm";

describe("toRpcSalesItems", () => {
  test("converte o item da API (camelCase) nas chaves que as funções SQL leem", () => {
    const [item] = toRpcSalesItems([{ productId: "p1", description: "Item", unit: "UN", quantity: 2, unitPrice: 9.5, discount: 1, notes: "obs" }]);
    assert.deepEqual(item, { product_id: "p1", description: "Item", unit: "UN", quantity: 2, unit_price: 9.5, discount: 1, notes: "obs" });
  });

  test("opcionais ausentes viram null/0, nunca undefined no preço", () => {
    const [item] = toRpcSalesItems([{ quantity: 1, unitPrice: 0 }]);
    assert.deepEqual(item, { product_id: null, description: undefined, unit: null, quantity: 1, unit_price: 0, discount: 0, notes: null });
  });

  test("o corpo validado pelo schema do CRM chega com unit_price preenchido", () => {
    const body = convertOpportunityToQuoteSchema.parse({ items: [{ productId: "11111111-1111-4111-8111-111111111111", description: "X", quantity: "3", unitPrice: "12.5" }] });
    const [item] = toRpcSalesItems(body.items);
    assert.equal(item.unit_price, 12.5);
    assert.equal(item.quantity, 3);
    assert.equal(item.product_id, "11111111-1111-4111-8111-111111111111");
  });
});
