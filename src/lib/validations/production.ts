import { z } from "zod";

// Validação server-side do domínio Produção/PCP
// (supabase/migrations/0026-0030). Mesmo espírito de
// src/lib/validations/{inventory,purchasing,commercial,logistics}.ts:
// valida forma e tipos antes de chamar a função RPC correspondente — a
// regra de negócio real (snapshot da BOM, reserva parcial sem
// overbooking, consumo dentro do reservado, idempotência) vive no banco.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const positiveQuantity = z.coerce.number().positive("A quantidade deve ser maior que zero.");
const nonNegativeQuantity = z.coerce.number().min(0, "A quantidade não pode ser negativa.");
const optionalDateString = z.string().trim().optional();

// --------------------------------------------------------- Centro de trabalho
export const workCenterSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do centro de trabalho."),
  name: z.string().trim().min(1, "Informe o nome do centro de trabalho."),
  type: z.enum(["machine", "line", "cell", "sector"]).default("sector"),
  description: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// ------------------------------------------------------------------- Roteiro
export const productionRoutingSchema = z.object({
  productId: optionalUuid,
  name: z.string().trim().min(1, "Informe o nome do roteiro."),
  description: z.string().trim().optional(),
  status: z.enum(["draft", "active", "obsolete"]).optional(),
  notes: z.string().trim().optional(),
});

export const productionRoutingOperationSchema = z.object({
  routingId: uuidField("Selecione o roteiro."),
  sequence: z.coerce.number().int().positive("Informe a sequência da operação."),
  name: z.string().trim().min(1, "Informe o nome da operação."),
  description: z.string().trim().optional(),
  workCenterId: optionalUuid,
  plannedTimeMinutes: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

// ---------------------------------------------------------------------- BOM
export const createBomSchema = z.object({
  productId: uuidField("Selecione o produto acabado."),
  referenceQuantity: positiveQuantity.default(1),
  unitId: uuidField("Selecione a unidade."),
  validFrom: optionalDateString,
  validUntil: optionalDateString,
  notes: z.string().trim().optional(),
});

export const addBomItemSchema = z.object({
  componentProductId: uuidField("Selecione o componente."),
  quantity: positiveQuantity,
  unitId: uuidField("Selecione a unidade do componente."),
  scrapPercentage: z.coerce.number().min(0).max(99.99).optional().default(0),
  sequence: z.coerce.number().int().positive().optional().default(10),
  isOptional: z.boolean().optional().default(false),
  notes: z.string().trim().optional(),
});

// ------------------------------------------------------- Ordem de produção
export const createProductionOrderSchema = z.object({
  productId: uuidField("Selecione o produto a ser fabricado."),
  bomId: optionalUuid,
  plannedQuantity: positiveQuantity,
  unitId: uuidField("Selecione a unidade."),
  sourceWarehouseId: uuidField("Selecione o depósito de origem."),
  consumptionLocationId: uuidField("Selecione a localização de consumo."),
  targetWarehouseId: uuidField("Selecione o depósito de destino."),
  outputLocationId: uuidField("Selecione a localização de entrada do produto acabado."),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  plannedDate: optionalDateString,
  responsibleUserId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const planProductionOrderSchema = z.object({
  plannedDate: optionalDateString,
});

export const registerProductionOutputSchema = z.object({
  producedQuantity: nonNegativeQuantity.optional().default(0),
  rejectedQuantity: nonNegativeQuantity.optional().default(0),
  lotNumber: z.string().trim().optional(),
  serialNumbers: z.array(z.string().trim().min(1)).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

// ----------------------------------------------------------------- Materiais
export const consumeProductionMaterialSchema = z.object({
  quantity: positiveQuantity,
  lotId: optionalUuid,
  serialNumbers: z.array(z.string().trim().min(1)).optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export const returnProductionMaterialSchema = z.object({
  quantity: positiveQuantity,
  idempotencyKey: z.string().trim().min(1).optional(),
});

// --------------------------------------------------------------- Perdas/refugo
export const registerProductionScrapSchema = z.object({
  productionOrderId: uuidField("Selecione a ordem de produção."),
  productId: uuidField("Selecione o produto perdido/rejeitado."),
  quantity: positiveQuantity,
  unitId: uuidField("Selecione a unidade."),
  reason: z.string().trim().min(1, "Informe o motivo da perda/refugo."),
  materialId: optionalUuid,
  lotId: optionalUuid,
  idempotencyKey: z.string().trim().min(1).optional(),
});

// ------------------------------------------------------------- Apontamento
export const logProductionOperationSchema = z.object({
  productionOrderId: uuidField("Selecione a ordem de produção."),
  routingOperationId: optionalUuid,
  workCenterId: optionalUuid,
  operatorUserId: optionalUuid,
  startedAt: z.string().trim().optional(),
  finishedAt: z.string().trim().optional(),
  producedQuantity: nonNegativeQuantity.optional().default(0),
  rejectedQuantity: nonNegativeQuantity.optional().default(0),
  notes: z.string().trim().optional(),
});
