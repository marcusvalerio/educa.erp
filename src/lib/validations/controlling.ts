import { z } from "zod";

// Validação server-side do domínio de Controladoria Gerencial
// (supabase/migrations/0045-0047). Controladoria gerencial, não
// contabilidade societária/fiscal — ver docs/CONTROLLING.md.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const dateField = (message: string) => z.string().trim().min(1, message);
const positiveAmount = z.coerce.number().positive("O valor deve ser maior que zero.");
const nonNegativeAmount = z.coerce.number().min(0, "O valor não pode ser negativo.");

export const periodRangeQuerySchema = z.object({
  periodStart: dateField("Informe a data inicial do período."),
  periodEnd: dateField("Informe a data final do período."),
});

// ------------------------------------------------------- Período de competência
export const openCompetencePeriodSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do período (ex.: 2026-01)."),
  periodStart: dateField("Informe a data inicial do período."),
  periodEnd: dateField("Informe a data final do período."),
  notes: z.string().trim().optional(),
});

export const reopenCompetencePeriodSchema = z.object({
  reason: z.string().trim().min(1, "Informe a justificativa para reabrir o período."),
});

// -------------------------------------------------------------------- Rateio
const costAllocationItemSchema = z.object({
  costCenterId: uuidField("Selecione o centro de custo."),
  percentage: z.coerce.number().min(0).max(100).optional(),
  amount: nonNegativeAmount.optional(),
  notes: z.string().trim().optional(),
});

export const createCostAllocationSchema = z.object({
  totalAmount: positiveAmount,
  criterion: z.enum(["PERCENTAGE", "FIXED_VALUE", "QUANTITY", "REVENUE", "COST", "HEADCOUNT", "AREA"]),
  items: z.array(costAllocationItemSchema).min(1, "O rateio precisa de ao menos um item."),
  sourceType: z.enum(["manual", "accounts_payable", "financial_transaction"]).optional().default("manual"),
  sourceId: optionalUuid,
  competencePeriodId: optionalUuid,
  description: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const cancelCostAllocationSchema = z.object({
  reason: z.string().trim().optional(),
});

// ------------------------------------------------------------------- Orçamento
const budgetItemSchema = z.object({
  costCenterId: optionalUuid,
  financialCategoryId: optionalUuid,
  plannedAmount: nonNegativeAmount,
  notes: z.string().trim().optional(),
});

export const createBudgetSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do orçamento."),
  periodStart: dateField("Informe a data inicial do orçamento."),
  periodEnd: dateField("Informe a data final do orçamento."),
  items: z.array(budgetItemSchema).min(1, "O orçamento precisa de ao menos um item."),
  notes: z.string().trim().optional(),
});
