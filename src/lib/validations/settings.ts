import { z } from "zod";

// Validação server-side de Configuração e Parametrização do ERP
// (supabase/migrations/0052-0053).

const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

// ------------------------------------------------------------- system_settings
const valueTypeSchema = z.enum(["STRING", "INTEGER", "DECIMAL", "BOOLEAN", "DATE", "JSON"]);

export const resolveSettingQuerySchema = z.object({
  establishmentId: optionalUuid,
  module: z.string().trim().min(1, "Informe o módulo."),
  key: z.string().trim().min(1, "Informe a chave."),
});

// upsertSettingSchema exige exatamente o campo de valor correspondente
// a valueType — validado com superRefine (o CHECK estrutural no banco
// é a garantia real; isto é só a primeira barreira de forma/tipo).
export const upsertSettingSchema = z
  .object({
    companyId: optionalUuid,
    establishmentId: optionalUuid,
    module: z.string().trim().min(1, "Informe o módulo."),
    key: z.string().trim().min(1, "Informe a chave."),
    valueType: valueTypeSchema,
    valueString: z.string().optional(),
    valueInteger: z.coerce.number().int().optional(),
    valueDecimal: z.coerce.number().optional(),
    valueBoolean: z.coerce.boolean().optional(),
    valueDate: z.string().trim().optional(),
    valueJson: z.record(z.string(), z.unknown()).optional(),
    description: z.string().trim().optional(),
    validFrom: z.string().trim().optional(),
    validUntil: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const byType: Record<string, unknown> = {
      STRING: data.valueString,
      INTEGER: data.valueInteger,
      DECIMAL: data.valueDecimal,
      BOOLEAN: data.valueBoolean,
      DATE: data.valueDate,
      JSON: data.valueJson,
    };
    if (byType[data.valueType] === undefined) {
      ctx.addIssue({ code: "custom", message: `Informe o valor correspondente ao tipo ${data.valueType}.`, path: [`value${data.valueType.charAt(0)}${data.valueType.slice(1).toLowerCase()}`] });
    }
  });

// ---------------------------------------------------------- document_sequences
export const createDocumentSequenceSchema = z.object({
  documentType: z.enum(["SALES_ORDER", "PURCHASE_ORDER", "FISCAL_DOCUMENT", "TRANSFER", "SHIPMENT", "OTHER"]),
  seriesCode: z.string().trim().optional().default("1"),
  prefix: z.string().trim().optional(),
  padding: z.coerce.number().int().min(1).max(12).optional().default(6),
  establishmentId: optionalUuid,
  description: z.string().trim().optional(),
});

export const updateDocumentSequenceSchema = z.object({
  prefix: z.string().trim().optional(),
  padding: z.coerce.number().int().min(1).max(12).optional(),
  description: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const nextDocumentNumberSchema = z.object({
  documentType: z.enum(["SALES_ORDER", "PURCHASE_ORDER", "FISCAL_DOCUMENT", "TRANSFER", "SHIPMENT", "OTHER"]),
  seriesCode: z.string().trim().optional().default("1"),
  establishmentId: optionalUuid,
});

export const assignFiscalDocumentNumberSchema = z.object({
  seriesCode: z.string().trim().optional().default("1"),
});
