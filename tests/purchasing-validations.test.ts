// Testes de validação (Zod) do domínio de Compras/Suprimentos
// (src/lib/validations/purchasing.ts). Cobrem a camada de forma/tipo —
// a primeira barreira antes de qualquer chamada RPC.
//
// IMPORTANTE — o que NÃO está coberto aqui: as regras de negócio reais
// do workflow (aprovar solicitação parcialmente, recebimento parcial
// somando corretamente, "recebido > pedido" bloqueado, status do
// pedido avançando partially_received -> received, idempotência de
// fn_confirm_purchase_receipt, RBAC via has_permission, isolamento por
// company_id) vivem nas funções SQL (supabase/migrations/0014-0018) e
// só são verificáveis contra um Postgres real — impossível nesta etapa
// (nenhum Supabase real foi tocado, por instrução explícita). Ver
// docs/PURCHASING.md (aviso no topo) para o que fica pendente de
// verificação empírica na próxima etapa autorizada a tocar um banco.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createPurchaseRequestSchema,
  approvePurchaseRequestSchema,
  createPurchaseQuoteSchema,
  addQuoteSupplierResponseSchema,
  createPurchaseOrderSchema,
  createPurchaseReceiptSchema,
  updatePurchaseReceiptItemSchema,
} from "@/lib/validations/purchasing";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";
const uuid3 = "33333333-3333-4333-8333-333333333333";

describe("createPurchaseRequestSchema", () => {
  test("exige ao menos um item", () => {
    const result = createPurchaseRequestSchema.safeParse({ items: [] });
    assert.equal(result.success, false);
  });

  test("aceita solicitação válida com prioridade default 'medium'", () => {
    const result = createPurchaseRequestSchema.safeParse({
      items: [{ description: "Madeira de pinus", unit: "kg", quantity: 500 }],
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.priority, "medium");
  });

  test("rejeita item com quantidade zero ou negativa", () => {
    const result = createPurchaseRequestSchema.safeParse({
      items: [{ description: "Parafusos", quantity: 0 }],
    });
    assert.equal(result.success, false);
  });

  test("rejeita prioridade fora do enum", () => {
    const result = createPurchaseRequestSchema.safeParse({
      priority: "critica",
      items: [{ description: "Verniz", quantity: 10 }],
    });
    assert.equal(result.success, false);
  });
});

describe("approvePurchaseRequestSchema", () => {
  test("aceita corpo vazio (aprova tudo na quantidade solicitada)", () => {
    assert.equal(approvePurchaseRequestSchema.safeParse({}).success, true);
  });

  test("aceita aprovação parcial por item", () => {
    const result = approvePurchaseRequestSchema.safeParse({
      approvedItems: [{ itemId: uuid1, quantityApproved: 30 }],
    });
    assert.equal(result.success, true);
  });
});

describe("createPurchaseQuoteSchema", () => {
  test("exige ao menos um fornecedor convidado", () => {
    assert.equal(createPurchaseQuoteSchema.safeParse({ supplierIds: [] }).success, false);
  });

  test("aceita cotação com múltiplos fornecedores para comparação", () => {
    const result = createPurchaseQuoteSchema.safeParse({ supplierIds: [uuid1, uuid2, uuid3] });
    assert.equal(result.success, true);
  });
});

describe("addQuoteSupplierResponseSchema", () => {
  test("aceita proposta com preço, desconto, frete, prazo e validade", () => {
    const result = addQuoteSupplierResponseSchema.safeParse({
      paymentTerms: "30/60/90",
      freightCost: 150.5,
      deliveryDays: 10,
      validUntil: "2026-12-31",
      items: [{ description: "Madeira de pinus", quantity: 500, unitPrice: 12.9, discount: 50 }],
    });
    assert.equal(result.success, true);
  });

  test("rejeita preço unitário negativo", () => {
    const result = addQuoteSupplierResponseSchema.safeParse({
      items: [{ description: "Madeira", quantity: 500, unitPrice: -1 }],
    });
    assert.equal(result.success, false);
  });
});

describe("createPurchaseOrderSchema", () => {
  test("exige fornecedor e ao menos um item", () => {
    assert.equal(createPurchaseOrderSchema.safeParse({ items: [] }).success, false);
  });

  test("aceita pedido válido com referência à solicitação e à cotação", () => {
    const result = createPurchaseOrderSchema.safeParse({
      supplierId: uuid1,
      purchaseRequestId: uuid2,
      purchaseQuoteId: uuid3,
      freightCost: 100,
      discount: 20,
      items: [{ description: "Madeira de pinus", quantity: 500, unitPrice: 12.9 }],
    });
    assert.equal(result.success, true);
  });
});

describe("createPurchaseReceiptSchema — recebimento e conferência", () => {
  test("exige purchaseOrderItemId e local de destino por item", () => {
    const result = createPurchaseReceiptSchema.safeParse({
      purchaseOrderId: uuid1,
      items: [{ quantityReceived: 40 }],
    });
    assert.equal(result.success, false);
  });

  test("aceita recebimento parcial simples (destino Estoque ou Almoxarifado — mesmo campo, local diferente)", () => {
    const result = createPurchaseReceiptSchema.safeParse({
      purchaseOrderId: uuid1,
      items: [{ purchaseOrderItemId: uuid2, quantityReceived: 40, destinationLocationId: uuid3 }],
    });
    assert.equal(result.success, true);
  });

  test("aceita item com lote e validade (batch_controlled)", () => {
    const result = createPurchaseReceiptSchema.safeParse({
      purchaseOrderId: uuid1,
      items: [{
        purchaseOrderItemId: uuid2,
        quantityReceived: 40,
        destinationLocationId: uuid3,
        lotNumber: "L2026-001",
        expiresAt: "2027-01-01",
      }],
    });
    assert.equal(result.success, true);
  });

  test("aceita item com números de série (serial_controlled)", () => {
    const result = createPurchaseReceiptSchema.safeParse({
      purchaseOrderId: uuid1,
      items: [{
        purchaseOrderItemId: uuid2,
        quantityReceived: 3,
        destinationLocationId: uuid3,
        serialNumbers: ["SN-0001", "SN-0002", "SN-0003"],
      }],
    });
    assert.equal(result.success, true);
  });

  test("aceita divergência explícita (produto/quantidade/lote/validade)", () => {
    for (const divergenceType of ["quantity", "product", "lot", "expiration", "quality", "other", "none"]) {
      const result = createPurchaseReceiptSchema.safeParse({
        purchaseOrderId: uuid1,
        items: [{
          purchaseOrderItemId: uuid2,
          quantityReceived: 40,
          destinationLocationId: uuid3,
          divergenceType,
          divergenceNotes: "Registrado na conferência.",
        }],
      });
      assert.equal(result.success, true, `divergenceType ${divergenceType} deveria ser aceito`);
    }
  });

  test("rejeita divergenceType fora do vocabulário", () => {
    const result = createPurchaseReceiptSchema.safeParse({
      purchaseOrderId: uuid1,
      items: [{
        purchaseOrderItemId: uuid2,
        quantityReceived: 40,
        destinationLocationId: uuid3,
        divergenceType: "outro-tipo-invalido",
      }],
    });
    assert.equal(result.success, false);
  });
});

describe("updatePurchaseReceiptItemSchema", () => {
  test("exige accepted/rejected quantity não negativos", () => {
    assert.equal(updatePurchaseReceiptItemSchema.safeParse({ acceptedQuantity: -1, rejectedQuantity: 0 }).success, false);
    assert.equal(updatePurchaseReceiptItemSchema.safeParse({ acceptedQuantity: 5, rejectedQuantity: 0 }).success, true);
  });
});
