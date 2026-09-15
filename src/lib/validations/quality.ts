import { z } from "zod";

// Validação server-side de Qualidade (supabase/migrations/0058, Fase 17).

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

const inspectionTypeEnum = z.enum(["RECEIVING", "PRODUCTION", "SHIPPING", "RETURN", "PROCESS", "OTHER"]);

export const qualityChecklistSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do checklist."),
  name: z.string().trim().min(1, "Informe o nome do checklist."),
  inspectionType: inspectionTypeEnum,
  description: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const qualityChecklistItemSchema = z.object({
  checklistId: uuidField("Selecione o checklist."),
  sequence: z.coerce.number().int().optional(),
  description: z.string().trim().min(1, "Informe a descrição do critério."),
  criteriaType: z.enum(["PASS_FAIL", "NUMERIC", "TEXT", "YES_NO", "RANGE"]),
  expectedValue: z.string().trim().optional(),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  unit: z.string().trim().optional(),
  isMandatory: z.coerce.boolean().optional(),
});

const sourceTypeEnum = z.enum(["purchase_receipt", "production_order", "production_operation", "shipment", "delivery_event", "asset", "maintenance_order", "service_order", "other"]);

export const qualityInspectionSchema = z.object({
  inspectionType: inspectionTypeEnum,
  checklistId: optionalUuid,
  sourceType: sourceTypeEnum.optional(),
  sourceId: optionalUuid,
  productId: optionalUuid,
  lotId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const recordInspectionResultSchema = z.object({
  checklistItemId: uuidField("Selecione o item do checklist."),
  valueFound: z.string().trim().optional(),
  numericValue: z.coerce.number().optional(),
  notes: z.string().trim().optional(),
});

export const finalizeInspectionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PARTIALLY_APPROVED"]),
  notes: z.string().trim().optional(),
});

export const sendToQuarantineSchema = z.object({
  productId: uuidField("Selecione o produto."),
  fromLocationId: uuidField("Selecione o local de origem."),
  quarantineLocationId: uuidField("Selecione o local de quarentena."),
  quantity: z.coerce.number().positive("Quantidade deve ser positiva."),
  lotId: optionalUuid,
});

export const nonconformitySchema = z.object({
  inspectionId: optionalUuid,
  originType: z.string().trim().optional(),
  originId: optionalUuid,
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  cause: z.string().trim().optional(),
  description: z.string().trim().min(1, "Informe a descrição da não conformidade."),
  responsibleUserId: optionalUuid,
  evidenceNotes: z.string().trim().optional(),
});

export const createNonconformityFromInspectionSchema = z.object({
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  description: z.string().trim().min(1, "Informe a descrição da não conformidade."),
  cause: z.string().trim().optional(),
  responsibleUserId: optionalUuid,
});

export const transitionNonconformitySchema = z.object({
  newStatus: z.enum(["IN_ANALYSIS", "IN_TREATMENT", "CLOSED"]),
});

export const qualityActionSchema = z.object({
  nonconformityId: optionalUuid,
  actionType: z.enum(["CORRECTIVE", "PREVENTIVE"]),
  description: z.string().trim().min(1, "Informe a descrição da ação."),
  responsibleUserId: optionalUuid,
  dueDate: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const transitionQualityActionSchema = z.object({
  newStatus: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
});

export const qualityTraceabilityQuerySchema = z.object({
  lotId: uuidField("Informe o lote."),
});
