import { z } from "zod";

// Validação server-side de CRM (supabase/migrations/0054-0055, Fase 15).

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const optionalDate = z.string().trim().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

// ------------------------------------------------------------- lead_origins
export const leadOriginSchema = z.object({
  code: z.string().trim().min(1, "Informe o código da origem."),
  name: z.string().trim().min(1, "Informe o nome da origem."),
  description: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// ------------------------------------------------------------------- leads
export const leadSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do lead."),
  companyName: z.string().trim().optional(),
  document: z.string().trim().optional(),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  originId: optionalUuid,
  responsibleUserId: optionalUuid,
  qualification: z.enum(["COLD", "WARM", "HOT"]).optional(),
  notes: z.string().trim().optional(),
});

export const updateLeadSchema = leadSchema.partial().extend({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "DISQUALIFIED"]).optional(),
  disqualifyReason: z.string().trim().optional(),
});

export const convertLeadToOpportunitySchema = z.object({
  pipelineId: uuidField("Selecione o pipeline."),
  stageId: uuidField("Selecione o estágio."),
  title: z.string().trim().optional(),
  estimatedValue: z.coerce.number().min(0).optional(),
});

// --------------------------------------------------------------- pipelines
export const pipelineSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do pipeline."),
  name: z.string().trim().min(1, "Informe o nome do pipeline."),
  status: z.enum(["active", "inactive"]).optional(),
});

export const pipelineStageSchema = z.object({
  pipelineId: uuidField("Selecione o pipeline."),
  code: z.string().trim().min(1, "Informe o código do estágio."),
  name: z.string().trim().min(1, "Informe o nome do estágio."),
  sequence: z.coerce.number().int().optional(),
  probabilityDefault: z.coerce.number().min(0).max(100).optional(),
  isWon: z.coerce.boolean().optional(),
  isLost: z.coerce.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// ----------------------------------------------------------- opportunities
const itemsSchema = z.array(
  z.object({
    productId: optionalUuid,
    description: z.string().trim().optional(),
    unit: z.string().trim().optional(),
    quantity: z.coerce.number().positive("Quantidade deve ser positiva."),
    unitPrice: z.coerce.number().min(0),
    discount: z.coerce.number().min(0).optional(),
    notes: z.string().trim().optional(),
  })
).min(1, "Informe ao menos um item.");

export const opportunitySchema = z.object({
  title: z.string().trim().min(1, "Informe o título da oportunidade."),
  customerId: optionalUuid,
  leadId: optionalUuid,
  pipelineId: uuidField("Selecione o pipeline."),
  stageId: uuidField("Selecione o estágio."),
  estimatedValue: z.coerce.number().min(0).optional(),
  probability: z.coerce.number().min(0).max(100).optional(),
  ownerUserId: optionalUuid,
  expectedCloseDate: optionalDate,
  originId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const updateOpportunitySchema = opportunitySchema.partial();

export const moveOpportunityStageSchema = z.object({
  stageId: uuidField("Selecione o estágio de destino."),
});

export const closeOpportunitySchema = z.object({
  outcome: z.enum(["WON", "LOST"]),
  lostReason: z.string().trim().optional(),
});

export const convertOpportunityToQuoteSchema = z.object({
  items: itemsSchema,
  validUntil: optionalDate,
  notes: z.string().trim().optional(),
});

export const convertOpportunityToOrderSchema = z.object({
  items: itemsSchema.optional(),
  salesQuoteId: optionalUuid,
  notes: z.string().trim().optional(),
});

// ---------------------------------------------------------------- activities
export const activitySchema = z.object({
  activityType: z.enum(["CALL", "MEETING", "TASK", "CONTACT", "FOLLOW_UP", "NOTE"]),
  subject: z.string().trim().min(1, "Informe o assunto."),
  description: z.string().trim().optional(),
  relatedType: z.enum(["lead", "opportunity", "customer"]),
  relatedId: uuidField("Informe o registro relacionado."),
  dueDate: optionalDate,
  ownerUserId: optionalUuid,
});

export const updateActivitySchema = z.object({
  subject: z.string().trim().optional(),
  description: z.string().trim().optional(),
  dueDate: optionalDate,
  status: z.enum(["PENDING", "DONE", "CANCELLED"]).optional(),
  ownerUserId: optionalUuid,
});

// ----------------------------------------------------------------- reports
export const crmReportQuerySchema = z.object({
  dateFrom: optionalDate,
  dateTo: optionalDate,
  pipelineId: optionalUuid,
});
