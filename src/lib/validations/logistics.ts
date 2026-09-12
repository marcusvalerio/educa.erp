import { z } from "zod";

// Validação server-side do domínio Logística/Expedição
// (supabase/migrations/0023-0025). Mesmo espírito de
// src/lib/validations/{inventory,purchasing,commercial}.ts: valida
// forma e tipos antes de chamar a função RPC correspondente — a regra
// de negócio real (saldo reservado disponível, coerência transportadora/
// motorista/veículo, transições de status) vive no banco.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const positiveQuantity = z.coerce.number().positive("A quantidade deve ser maior que zero.");
const optionalDateString = z.string().trim().optional();

// ------------------------------------------------------------ Separação
export const createPickListSchema = z.object({
  warehouseId: uuidField("Selecione o depósito."),
  notes: z.string().trim().optional(),
});

export const pickItemSchema = z.object({
  pickedQuantity: z.coerce.number().min(0, "A quantidade separada não pode ser negativa."),
  lotId: optionalUuid,
  serialNumbers: z.array(z.string().trim().min(1)).optional(),
  divergenceType: z.enum(["none", "quantity", "product", "lot", "serial"]).optional(),
  divergenceNotes: z.string().trim().optional(),
  markShort: z.boolean().optional().default(false),
});

// ------------------------------------------------------------- Expedição
const shipmentItemSchema = z.object({
  salesOrderItemId: uuidField("Selecione o item do pedido."),
  locationId: uuidField("Selecione o local de onde a mercadoria sairá."),
  quantity: positiveQuantity,
  unit: z.string().trim().optional(),
  lotId: optionalUuid,
  serialNumbers: z.array(z.string().trim().min(1)).optional(),
  weight: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

export const createShipmentSchema = z.object({
  warehouseId: uuidField("Selecione o depósito."),
  pickListId: optionalUuid,
  expectedShipDate: optionalDateString,
  deliveryZipCode: z.string().trim().optional(),
  deliveryState: z.string().trim().optional(),
  deliveryCity: z.string().trim().optional(),
  deliveryNeighborhood: z.string().trim().optional(),
  deliveryAddress: z.string().trim().optional(),
  deliveryAddressNumber: z.string().trim().optional(),
  deliveryAddressComplement: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.array(shipmentItemSchema).min(1, "A expedição precisa de ao menos um item."),
});

export const assignShipmentTransportSchema = z.object({
  carrierId: optionalUuid,
  driverId: optionalUuid,
  vehicleId: optionalUuid,
});

export const addShipmentPackageSchema = z.object({
  packageNumber: z.coerce.number().int().positive("Informe o número do volume."),
  weight: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  length: z.coerce.number().min(0).optional(),
  trackingCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const shipActionSchema = z.object({
  idempotencyKey: z.string().trim().min(1).optional(),
});

// --------------------------------------------------------------- Entrega
export const createDeliveryEventSchema = z.object({
  notes: z.string().trim().optional(),
});

export const confirmDeliverySchema = z.object({
  recipientName: z.string().trim().optional(),
  recipientDocument: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  podType: z.enum(["signature", "photo", "document"]).optional(),
  podReference: z.string().trim().optional(),
});

export const failDeliverySchema = z.object({
  status: z.enum(["failed", "refused", "absent", "returned"]),
  notes: z.string().trim().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});
