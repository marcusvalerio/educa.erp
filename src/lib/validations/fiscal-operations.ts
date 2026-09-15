import { z } from "zod";

// Validação server-side da evolução Fiscal Operacional Avançado (Fase
// 22, supabase/migrations/0063). Arquivo separado de
// src/lib/validations/fiscal.ts (Fase 8/9, já extenso) — só o
// necessário para as novas superfícies (AUTHORIZING, provedor,
// certificado, arquivo/XML), nunca uma cópia dos schemas já existentes.

export const configureFiscalProviderSchema = z.object({
  providerCode: z.string().trim().min(1).optional().default("NONE"),
  environment: z.enum(["PRODUCTION", "HOMOLOGATION"]).optional().default("HOMOLOGATION"),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

export const registerFiscalCertificateSchema = z.object({
  alias: z.string().trim().min(1, "Informe um apelido para o certificado."),
  certificateType: z.enum(["A1", "A3"]),
  subjectName: z.string().trim().optional(),
  issuerName: z.string().trim().optional(),
  validFrom: z.string().trim().optional(),
  validUntil: z.string().trim().optional(),
  // Nunca um campo de senha/chave privada aqui — só um PONTEIRO para um
  // secret manager externo (seção 22.5); o valor do segredo em si
  // jamais trafega por esta API.
  externalSecretReference: z.string().trim().optional(),
});

export const beginFiscalAuthorizationSchema = z.object({
  providerCode: z.string().trim().min(1).optional().default("NONE"),
  requestReference: z.string().trim().optional(),
});

export const processFiscalAuthorizationResponseSchema = z.object({
  result: z.enum(["AUTHORIZED", "REJECTED", "ERROR"]),
  accessKey: z.string().trim().optional(),
  protocol: z.string().trim().optional(),
  receiptNumber: z.string().trim().optional(),
  errorCode: z.string().trim().optional(),
  errorMessage: z.string().trim().optional(),
  responseReference: z.string().trim().optional(),
}).refine((v) => v.result !== "AUTHORIZED" || !!v.accessKey, {
  message: "Informe accessKey quando result for AUTHORIZED.",
  path: ["accessKey"],
});

export const registerFiscalDocumentFileSchema = z.object({
  fileType: z.enum(["XML_SENT", "XML_AUTHORIZED", "XML_CANCELLATION", "XML_CORRECTION_LETTER", "XML_EVENT", "OTHER"]),
  storageReference: z.string().trim().min(1, "Informe a referência de armazenamento do arquivo."),
  contentHash: z.string().trim().optional(),
});

export const registerFiscalDocumentEventIdempotentSchema = z.object({
  eventType: z.enum(["CONTINGENCY", "CORRECTION_LETTER", "OTHER", "DENIED", "INUTILIZATION", "MANIFESTATION"]),
  idempotencyKey: z.string().trim().min(1, "Informe a chave de idempotência."),
  protocol: z.string().trim().optional(),
  statusCode: z.string().trim().optional(),
  message: z.string().trim().optional(),
  payloadReference: z.string().trim().optional(),
});
