// Testes de validação (Zod) do domínio de Logística/Expedição
// (src/lib/validations/logistics.ts). Cobrem a camada de forma/tipo —
// a primeira barreira antes de qualquer chamada RPC.
//
// IMPORTANTE — o que NÃO está coberto aqui (28 cenários pedidos na
// etapa, a maioria regra de negócio real vivendo em
// supabase/migrations/0022-0025, só verificável contra um Postgres
// real — nenhum Supabase real foi tocado, por instrução explícita):
//   - fn_create_pick_list montar itens corretamente a partir das
//     stock_reservations ativas do pedido (herdando location_id/lot_id)
//   - fn_pick_item bloquear picked_quantity > requested_quantity
//   - fn_pick_item exigir contagem exata de números de série para
//     produto serial_controlled
//   - fn_complete_pick_list fechar itens pending em picked/short e
//     avançar o pedido para ready_to_ship
//   - fn_cancel_pick_list devolver o pedido para reserved
//   - fn_create_shipment validar quantidade <= reserved - shipped
//   - fn_create_shipment herdar o endereço de entrega do sales_order
//     quando nenhum endereço explícito é informado
//   - fn_assign_shipment_transport rejeitar motorista/veículo que não
//     pertence à transportadora informada, ou veículo vinculado a
//     outro motorista
//   - fn_ship_shipment: lock de shipment + sales_order + sales_order_items,
//     geração de ISSUE+RELEASE parciais, atualização de shipped_quantity,
//     recalculo de sales_orders.status (shipped vs partially_shipped)
//   - fn_ship_shipment: idempotência via p_idempotency_key contra duplo
//     clique em "expedir"
//   - fn_ship_shipment marcar product_serial_numbers como shipped
//   - fn_cancel_shipment bloqueado a partir de 'shipped'
//   - expedição parcial multi-remessa (Pedido 100 / Expedição 1: 60 /
//     Expedição 2: 40) fechando sales_order_items.shipped_quantity
//     corretamente em cada etapa
//   - fn_create_delivery_event/fn_confirm_delivery/fn_fail_delivery:
//     guardas de status, fn_fail_delivery validar p_status contra o
//     enum permitido, 'returned' cancelando a expedição
//   - fn_complete_shipment exigir status 'delivered'
//   - RBAC via has_permission em cada fn_* (pick_lists.*/shipments.*/
//     deliveries.*)
//   - RLS (isolamento por company_id) em todas as tabelas novas
//   - vocabulário ampliado de audit_logs.action (PICK/PACK/SHIP/
//     DELIVER/FAIL/RETURN) e sales_orders.status (partially_shipped)
// Ver docs/LOGISTICS.md (aviso no topo, §12) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  createPickListSchema,
  pickItemSchema,
  createShipmentSchema,
  assignShipmentTransportSchema,
  addShipmentPackageSchema,
  shipActionSchema,
  createDeliveryEventSchema,
  confirmDeliverySchema,
  failDeliverySchema,
} from "@/lib/validations/logistics";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";
const uuid3 = "33333333-3333-4333-8333-333333333333";

describe("createPickListSchema", () => {
  test("exige warehouseId válido", () => {
    const result = createPickListSchema.safeParse({ warehouseId: "not-a-uuid" });
    assert.equal(result.success, false);
  });

  test("aceita payload mínimo válido", () => {
    const result = createPickListSchema.safeParse({ warehouseId: uuid1 });
    assert.equal(result.success, true);
  });

  test("notes é opcional", () => {
    const result = createPickListSchema.safeParse({ warehouseId: uuid1, notes: "separar com cuidado" });
    assert.equal(result.success, true);
  });
});

describe("pickItemSchema", () => {
  test("rejeita pickedQuantity negativa", () => {
    const result = pickItemSchema.safeParse({ pickedQuantity: -1 });
    assert.equal(result.success, false);
  });

  test("aceita pickedQuantity zero (short total)", () => {
    const result = pickItemSchema.safeParse({ pickedQuantity: 0 });
    assert.equal(result.success, true);
  });

  test("markShort default é false", () => {
    const result = pickItemSchema.safeParse({ pickedQuantity: 5 });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.markShort, false);
  });

  test("aceita lotId vazio como ausente (optionalUuid)", () => {
    const result = pickItemSchema.safeParse({ pickedQuantity: 5, lotId: "" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.lotId, undefined);
  });

  test("rejeita divergenceType fora do enum", () => {
    const result = pickItemSchema.safeParse({ pickedQuantity: 5, divergenceType: "errado" });
    assert.equal(result.success, false);
  });

  test("aceita lista de serialNumbers", () => {
    const result = pickItemSchema.safeParse({ pickedQuantity: 2, serialNumbers: ["SN-001", "SN-002"] });
    assert.equal(result.success, true);
  });

  test("rejeita serial number vazio na lista", () => {
    const result = pickItemSchema.safeParse({ pickedQuantity: 1, serialNumbers: [""] });
    assert.equal(result.success, false);
  });
});

describe("createShipmentSchema", () => {
  const baseItem = { salesOrderItemId: uuid1, locationId: uuid2, quantity: 10 };

  test("exige ao menos um item", () => {
    const result = createShipmentSchema.safeParse({ warehouseId: uuid1, items: [] });
    assert.equal(result.success, false);
  });

  test("aceita expedição válida com um item", () => {
    const result = createShipmentSchema.safeParse({ warehouseId: uuid1, items: [baseItem] });
    assert.equal(result.success, true);
  });

  test("rejeita item com quantity zero ou negativa", () => {
    const result = createShipmentSchema.safeParse({
      warehouseId: uuid1,
      items: [{ ...baseItem, quantity: 0 }],
    });
    assert.equal(result.success, false);
  });

  test("rejeita item sem locationId", () => {
    const result = createShipmentSchema.safeParse({
      warehouseId: uuid1,
      items: [{ salesOrderItemId: uuid1, quantity: 10 }],
    });
    assert.equal(result.success, false);
  });

  test("aceita endereço de entrega explícito (sobrepõe o snapshot do pedido)", () => {
    const result = createShipmentSchema.safeParse({
      warehouseId: uuid1,
      items: [baseItem],
      deliveryZipCode: "01310-100",
      deliveryCity: "São Paulo",
      deliveryState: "SP",
    });
    assert.equal(result.success, true);
  });

  test("pickListId vazio é tratado como ausente", () => {
    const result = createShipmentSchema.safeParse({ warehouseId: uuid1, items: [baseItem], pickListId: "" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.pickListId, undefined);
  });

  test("aceita múltiplos itens (expedição com vários produtos)", () => {
    const result = createShipmentSchema.safeParse({
      warehouseId: uuid1,
      items: [baseItem, { salesOrderItemId: uuid3, locationId: uuid2, quantity: 5 }],
    });
    assert.equal(result.success, true);
  });
});

describe("assignShipmentTransportSchema", () => {
  test("aceita todos os campos ausentes (desvincula transporte)", () => {
    const result = assignShipmentTransportSchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("aceita carrier/driver/vehicle válidos", () => {
    const result = assignShipmentTransportSchema.safeParse({ carrierId: uuid1, driverId: uuid2, vehicleId: uuid3 });
    assert.equal(result.success, true);
  });

  test("rejeita driverId malformado", () => {
    const result = assignShipmentTransportSchema.safeParse({ driverId: "abc" });
    assert.equal(result.success, false);
  });
});

describe("addShipmentPackageSchema", () => {
  test("exige packageNumber positivo", () => {
    const result = addShipmentPackageSchema.safeParse({ packageNumber: 0 });
    assert.equal(result.success, false);
  });

  test("aceita volume mínimo válido", () => {
    const result = addShipmentPackageSchema.safeParse({ packageNumber: 1 });
    assert.equal(result.success, true);
  });

  test("aceita dimensões e peso (sem cálculo de cubagem)", () => {
    const result = addShipmentPackageSchema.safeParse({
      packageNumber: 2,
      weight: 12.5,
      height: 30,
      width: 20,
      length: 40,
      trackingCode: "BR123456789",
    });
    assert.equal(result.success, true);
  });

  test("rejeita peso negativo", () => {
    const result = addShipmentPackageSchema.safeParse({ packageNumber: 1, weight: -1 });
    assert.equal(result.success, false);
  });
});

describe("shipActionSchema", () => {
  test("aceita corpo vazio (sem idempotencyKey)", () => {
    const result = shipActionSchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("aceita idempotencyKey informada", () => {
    const result = shipActionSchema.safeParse({ idempotencyKey: "expedir-pedido-123-tentativa-1" });
    assert.equal(result.success, true);
  });

  test("rejeita idempotencyKey vazia", () => {
    const result = shipActionSchema.safeParse({ idempotencyKey: "" });
    assert.equal(result.success, false);
  });
});

describe("createDeliveryEventSchema", () => {
  test("aceita corpo vazio", () => {
    const result = createDeliveryEventSchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("aceita notes", () => {
    const result = createDeliveryEventSchema.safeParse({ notes: "saiu para entrega às 8h" });
    assert.equal(result.success, true);
  });
});

describe("confirmDeliverySchema", () => {
  test("aceita confirmação mínima (sem nenhum campo)", () => {
    const result = confirmDeliverySchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("aceita POD completo", () => {
    const result = confirmDeliverySchema.safeParse({
      recipientName: "João da Silva",
      recipientDocument: "123.456.789-00",
      latitude: -23.55052,
      longitude: -46.633308,
      podType: "signature",
      podReference: "pod-assinatura-001.png",
    });
    assert.equal(result.success, true);
  });

  test("rejeita latitude fora do intervalo [-90, 90]", () => {
    const result = confirmDeliverySchema.safeParse({ latitude: 120 });
    assert.equal(result.success, false);
  });

  test("rejeita longitude fora do intervalo [-180, 180]", () => {
    const result = confirmDeliverySchema.safeParse({ longitude: -200 });
    assert.equal(result.success, false);
  });

  test("rejeita podType fora do enum", () => {
    const result = confirmDeliverySchema.safeParse({ podType: "video" });
    assert.equal(result.success, false);
  });
});

describe("failDeliverySchema", () => {
  test("exige status dentro do enum de ocorrências", () => {
    const result = failDeliverySchema.safeParse({ status: "entregue" });
    assert.equal(result.success, false);
  });

  test("aceita cada um dos quatro status de ocorrência sem sucesso", () => {
    for (const status of ["failed", "refused", "absent", "returned"] as const) {
      const result = failDeliverySchema.safeParse({ status });
      assert.equal(result.success, true, `status ${status} deveria ser aceito`);
    }
  });

  test("aceita coordenadas junto da ocorrência", () => {
    const result = failDeliverySchema.safeParse({ status: "absent", latitude: -23.5, longitude: -46.6 });
    assert.equal(result.success, true);
  });

  test("rejeita corpo sem status", () => {
    const result = failDeliverySchema.safeParse({ notes: "cliente ausente" });
    assert.equal(result.success, false);
  });
});
