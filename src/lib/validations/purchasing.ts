import { z } from "zod";

// Validação server-side do domínio de Compras/Suprimentos
// (supabase/migrations/0014-0018). Mesmo espírito de
// src/lib/validations/inventory.ts: valida forma e tipos antes de
// chamar a função RPC correspondente — a regra de negócio real
// (saldo pendente do pedido, transições de status, etc.) vive no
// banco.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const positiveQuantity = z.coerce.number().positive("A quantidade deve ser maior que zero.");
const nonNegativeNumber = z.coerce.number().min(0, "Não pode ser negativo.").optional();
const optionalDateString = z.string().trim().optional();

// -------------------------------------------------- Solicitação de compra
const purchaseRequestItemSchema = z.object({
  productId: optionalUuid,
  description: z.string().trim().min(1, "Descreva o item."),
  unit: z.string().trim().optional(),
  quantity: positiveQuantity,
  notes: z.string().trim().optional(),
});

export const createPurchaseRequestSchema = z.object({
  department: z.string().trim().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  justification: z.string().trim().optional(),
  neededBy: optionalDateString,
  notes: z.string().trim().optional(),
  items: z.array(purchaseRequestItemSchema).min(1, "A solicitação precisa de ao menos um item."),
});

export const approvePurchaseRequestSchema = z.object({
  approvedItems: z
    .array(z.object({ itemId: uuidField("Item inválido."), quantityApproved: z.coerce.number().min(0) }))
    .optional(),
});

export const rejectPurchaseRequestSchema = z.object({
  reason: z.string().trim().optional(),
});

// --------------------------------------------------------------- Cotação
export const createPurchaseQuoteSchema = z.object({
  supplierIds: z.array(uuidField("Fornecedor inválido.")).min(1, "Convide ao menos um fornecedor."),
  purchaseRequestId: optionalUuid,
  notes: z.string().trim().optional(),
});

const purchaseQuoteResponseItemSchema = z.object({
  productId: optionalUuid,
  description: z.string().trim().min(1, "Descreva o item."),
  quantity: positiveQuantity,
  unitPrice: z.coerce.number().min(0, "O preço unitário não pode ser negativo."),
  discount: nonNegativeNumber,
  notes: z.string().trim().optional(),
});

export const addQuoteSupplierResponseSchema = z.object({
  paymentTerms: z.string().trim().optional(),
  freightCost: nonNegativeNumber,
  deliveryDays: z.coerce.number().int().min(0).optional(),
  validUntil: optionalDateString,
  items: z.array(purchaseQuoteResponseItemSchema).optional().default([]),
});

// ------------------------------------------------------- Pedido de compra
const purchaseOrderItemSchema = z.object({
  productId: optionalUuid,
  description: z.string().trim().min(1, "Descreva o item."),
  unit: z.string().trim().optional(),
  quantity: positiveQuantity,
  unitPrice: z.coerce.number().min(0, "O preço unitário não pode ser negativo."),
  discount: nonNegativeNumber,
  notes: z.string().trim().optional(),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: uuidField("Selecione o fornecedor."),
  purchaseRequestId: optionalUuid,
  purchaseQuoteId: optionalUuid,
  paymentTerms: z.string().trim().optional(),
  freightCost: nonNegativeNumber,
  discount: nonNegativeNumber,
  expectedDeliveryAt: optionalDateString,
  notes: z.string().trim().optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "O pedido precisa de ao menos um item."),
});

// --------------------------------------------------------- Recebimento
const purchaseReceiptItemSchema = z.object({
  purchaseOrderItemId: uuidField("Selecione o item do pedido."),
  productId: optionalUuid,
  quantityReceived: positiveQuantity,
  unit: z.string().trim().optional(),
  destinationLocationId: uuidField("Selecione o local de destino (Estoque ou Almoxarifado Operacional)."),
  lotId: optionalUuid,
  lotNumber: z.string().trim().optional(),
  expiresAt: optionalDateString,
  serialNumbers: z.array(z.string().trim().min(1)).optional(),
  acceptedQuantity: z.coerce.number().min(0).optional(),
  rejectedQuantity: z.coerce.number().min(0).optional(),
  divergenceType: z.enum(["none", "quantity", "product", "lot", "expiration", "quality", "other"]).optional(),
  divergenceNotes: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const createPurchaseReceiptSchema = z.object({
  purchaseOrderId: uuidField("Selecione o pedido de compra."),
  receivedAt: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  documentType: z.string().trim().optional(),
  documentNumber: z.string().trim().optional(),
  documentSeries: z.string().trim().optional(),
  accessKey: z.string().trim().optional(),
  documentIssuedAt: optionalDateString,
  documentValue: nonNegativeNumber,
  items: z.array(purchaseReceiptItemSchema).min(1, "O recebimento precisa de ao menos um item."),
});

export const updatePurchaseReceiptItemSchema = z.object({
  acceptedQuantity: z.coerce.number().min(0, "A quantidade aceita não pode ser negativa."),
  rejectedQuantity: z.coerce.number().min(0, "A quantidade rejeitada não pode ser negativa."),
  divergenceType: z.enum(["none", "quantity", "product", "lot", "expiration", "quality", "other"]).optional(),
  divergenceNotes: z.string().trim().optional(),
});

export const rejectPurchaseReceiptSchema = z.object({
  reason: z.string().trim().optional(),
});
