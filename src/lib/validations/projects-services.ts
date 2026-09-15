import { z } from "zod";

// Validação server-side de Projetos e Serviços (supabase/migrations/
// 0059, Fase 18). time_entries é apontamento OPERACIONAL — nenhum campo
// de RH (cargo/salário/benefício) existe aqui ou na tabela.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const optionalDate = z.string().trim().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do projeto."),
  customerId: optionalUuid,
  description: z.string().trim().optional(),
  responsibleUserId: optionalUuid,
  startDate: optionalDate,
  forecastEndDate: optionalDate,
  budget: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

export const updateProjectSchema = projectSchema.partial().extend({
  status: z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  endDate: optionalDate,
});

export const projectTaskSchema = z.object({
  projectId: uuidField("Selecione o projeto."),
  parentTaskId: optionalUuid,
  name: z.string().trim().min(1, "Informe o nome da tarefa."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  dueDate: optionalDate,
  estimatedHours: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
});

export const updateProjectTaskSchema = projectTaskSchema.partial().extend({
  status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]).optional(),
});

export const projectTaskDependencySchema = z.object({
  taskId: uuidField("Informe a tarefa."),
  dependsOnTaskId: uuidField("Informe a tarefa predecessora."),
});

export const timeEntrySchema = z
  .object({
    projectId: optionalUuid,
    taskId: optionalUuid,
    serviceOrderId: optionalUuid,
    entryDate: z.string().trim().min(1, "Informe a data do apontamento."),
    durationMinutes: z.coerce.number().int().positive("Informe a duração em minutos."),
    description: z.string().trim().optional(),
    userId: optionalUuid,
  })
  .refine((data) => Boolean(data.projectId) || Boolean(data.serviceOrderId), {
    message: "Informe o projeto ou a ordem de serviço do apontamento.",
    path: ["projectId"],
  });

export const serviceOrderSchema = z.object({
  customerId: uuidField("Selecione o cliente."),
  projectId: optionalUuid,
  title: z.string().trim().min(1, "Informe o título da ordem de serviço."),
  description: z.string().trim().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  scheduledDate: optionalDate,
  responsibleUserId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const updateServiceOrderSchema = serviceOrderSchema.partial().omit({ customerId: true });

export const transitionServiceOrderSchema = z.object({
  newStatus: z.enum(["SCHEDULED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"]),
});

export const consumeProjectServiceMaterialSchema = z.object({
  sourceType: z.enum(["project", "service_order"]),
  sourceId: uuidField("Informe o projeto/ordem de serviço."),
  productId: uuidField("Selecione o produto."),
  locationId: uuidField("Selecione o local de estoque."),
  quantity: z.coerce.number().positive("Quantidade deve ser positiva."),
  lotId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const addProjectServiceCostSchema = z.object({
  sourceType: z.enum(["project", "service_order"]),
  sourceId: uuidField("Informe o projeto/ordem de serviço."),
  costType: z.enum(["SERVICE", "EXPENSE"]),
  description: z.string().trim().min(1, "Informe a descrição do custo."),
  amount: z.coerce.number().min(0, "Informe um valor válido."),
});

export const createSalesQuoteFromSourceSchema = z.object({
  items: z
    .array(
      z.object({
        productId: optionalUuid,
        description: z.string().trim().optional(),
        unit: z.string().trim().optional(),
        quantity: z.coerce.number().positive("Quantidade deve ser positiva."),
        unitPrice: z.coerce.number().min(0),
        discount: z.coerce.number().min(0).optional(),
        notes: z.string().trim().optional(),
      })
    )
    .min(1, "Informe ao menos um item."),
  validUntil: optionalDate,
  notes: z.string().trim().optional(),
});

export const createQualityInspectionFromServiceOrderSchema = z.object({
  checklistId: optionalUuid,
});
