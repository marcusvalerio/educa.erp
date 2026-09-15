import { z } from "zod";

// Validação server-side de Ativos e Manutenção (supabase/migrations/
// 0056-0057, Fase 16). "ATIVO NÃO É ESTOQUE" — consumo de peça usa
// productId/locationId/quantity (mesmo vocabulário de stock_movements),
// nunca um novo conceito de saldo.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const optionalDate = z.string().trim().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

export const assetCategorySchema = z.object({
  code: z.string().trim().min(1, "Informe o código da categoria."),
  name: z.string().trim().min(1, "Informe o nome da categoria."),
  description: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const assetLocationSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do local."),
  name: z.string().trim().min(1, "Informe o nome do local."),
  parentId: optionalUuid,
  description: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const assetSchema = z.object({
  description: z.string().trim().min(1, "Informe a descrição do ativo."),
  categoryId: optionalUuid,
  manufacturer: z.string().trim().optional(),
  model: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  locationId: optionalUuid,
  parentAssetId: optionalUuid,
  acquisitionDate: optionalDate,
  acquisitionCost: z.coerce.number().min(0).optional(),
  supplierId: optionalUuid,
  warrantyExpiration: optionalDate,
  costCenterId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const updateAssetSchema = assetSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE", "UNDER_MAINTENANCE", "DECOMMISSIONED"]).optional(),
});

export const maintenancePlanSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do plano."),
  assetId: optionalUuid,
  assetCategoryId: optionalUuid,
  planType: z.enum(["PREVENTIVE", "CORRECTIVE", "PREDICTIVE"]),
  periodicityType: z.enum(["TIME", "HOURS", "CYCLES", "MILEAGE", "OTHER"]),
  periodicityValue: z.coerce.number().min(0).optional(),
  periodicityUnit: z.string().trim().optional(),
  description: z.string().trim().min(1, "Informe a descrição do plano."),
  notes: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const maintenanceOrderSchema = z.object({
  assetId: uuidField("Selecione o ativo."),
  planId: optionalUuid,
  orderType: z.enum(["PREVENTIVE", "CORRECTIVE", "PREDICTIVE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  description: z.string().trim().min(1, "Informe a descrição da ordem."),
  scheduledDate: optionalDate,
  requestedBy: optionalUuid,
  assignedTo: optionalUuid,
  notes: z.string().trim().optional(),
});

export const updateMaintenanceOrderSchema = z.object({
  cause: z.string().trim().optional(),
  solution: z.string().trim().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  scheduledDate: optionalDate,
  assignedTo: optionalUuid,
  notes: z.string().trim().optional(),
});

export const transitionMaintenanceOrderSchema = z.object({
  newStatus: z.enum(["PLANNED", "IN_PROGRESS", "WAITING_PARTS", "COMPLETED", "CANCELLED"]),
});

export const consumeMaintenanceOrderPartSchema = z.object({
  productId: uuidField("Selecione o produto."),
  locationId: uuidField("Selecione o local de estoque."),
  quantity: z.coerce.number().positive("Quantidade deve ser positiva."),
  lotId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const addMaintenanceOrderCostSchema = z.object({
  costType: z.enum(["SERVICE", "EXPENSE"]),
  description: z.string().trim().min(1, "Informe a descrição do custo."),
  amount: z.coerce.number().min(0, "Informe um valor válido."),
});
