import { z } from "zod";

// Validação server-side do domínio Fiscal/Núcleo Tributário
// (supabase/migrations/0036-0040). Mesmo espírito de
// src/lib/validations/{inventory,purchasing,commercial,logistics,
// production,finance}.ts: valida forma e tipos antes de chamar a
// função RPC correspondente — a regra de negócio real (snapshot
// imutável, resolução de regra por prioridade, idempotência por
// origem) vive no banco.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const nonNegativeAmount = z.coerce.number().min(0, "O valor não pode ser negativo.");
const optionalDateString = z.string().trim().optional();
const goodsOriginCode = z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);

// ----------------------------------------------------- Estabelecimento fiscal
export const fiscalEstablishmentSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do estabelecimento."),
  name: z.string().trim().min(1, "Informe o nome do estabelecimento."),
  cnpj: z.string().trim().min(1, "Informe o CNPJ."),
  stateRegistration: z.string().trim().optional(),
  municipalRegistration: z.string().trim().optional(),
  taxRegime: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "MEI"]),
  address: z.string().trim().optional(),
  addressNumber: z.string().trim().optional(),
  neighborhood: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// -------------------------------------------------------------------- NCM
export const fiscalNcmSchema = z.object({
  code: z.string().trim().min(1, "Informe o código NCM."),
  description: z.string().trim().min(1, "Informe a descrição do NCM."),
  validFrom: optionalDateString,
  validUntil: optionalDateString,
  status: z.enum(["active", "inactive"]).optional(),
});

// ------------------------------------------------------------------- CFOP
export const fiscalCfopSchema = z.object({
  code: z.string().trim().min(1, "Informe o código CFOP."),
  description: z.string().trim().min(1, "Informe a descrição do CFOP."),
  direction: z.enum(["ENTRADA", "SAIDA"]),
  scope: z.enum(["INTERNAL", "INTERSTATE", "FOREIGN"]),
  validFrom: optionalDateString,
  validUntil: optionalDateString,
  status: z.enum(["active", "inactive"]).optional(),
});

// --------------------------------------------------- Natureza da operação
export const fiscalOperationNatureSchema = z.object({
  code: z.string().trim().min(1, "Informe o código da natureza de operação."),
  name: z.string().trim().min(1, "Informe o nome da natureza de operação."),
  description: z.string().trim().optional(),
  direction: z.enum(["ENTRADA", "SAIDA"]),
  defaultCfopId: optionalUuid,
  status: z.enum(["active", "inactive"]).optional(),
});

// --------------------------------------------------------------- CST/CSOSN
export const fiscalCstCodeSchema = z.object({
  taxType: z.enum(["ICMS", "IPI", "PIS", "COFINS"]),
  code: z.string().trim().min(1, "Informe o código CST."),
  description: z.string().trim().min(1, "Informe a descrição do CST."),
  status: z.enum(["active", "inactive"]).optional(),
});

export const fiscalCsosnCodeSchema = z.object({
  code: z.string().trim().min(1, "Informe o código CSOSN."),
  description: z.string().trim().min(1, "Informe a descrição do CSOSN."),
  status: z.enum(["active", "inactive"]).optional(),
});

// ------------------------------------------------- Perfil fiscal do produto
export const setProductFiscalProfileSchema = z.object({
  productId: uuidField("Selecione o produto."),
  ncmId: optionalUuid,
  originCode: goodsOriginCode.optional().default("0"),
  icmsCst: z.string().trim().optional(),
  icmsCsosn: z.string().trim().optional(),
  pisCst: z.string().trim().optional(),
  cofinsCst: z.string().trim().optional(),
  ipiCst: z.string().trim().optional(),
  taxFramework: z.string().trim().optional(),
  validFrom: optionalDateString,
  notes: z.string().trim().optional(),
});

export const updateProductFiscalProfileNotesSchema = z.object({
  notes: z.string().trim().optional().default(""),
});

// ------------------------------------------------------------- Regra tributária
export const createTaxRuleSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da regra."),
  productId: optionalUuid,
  ncmId: optionalUuid,
  originCode: goodsOriginCode.optional(),
  cfopId: optionalUuid,
  operationNatureId: optionalUuid,
  originUf: z.string().trim().length(2).optional(),
  destinationUf: z.string().trim().length(2).optional(),
  taxRegime: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "MEI"]).optional(),
  customerId: optionalUuid,
  supplierId: optionalUuid,
  priority: z.coerce.number().int().optional().default(0),
  validFrom: optionalDateString,
  validUntil: optionalDateString,
  notes: z.string().trim().optional(),
});

export const addTaxRuleItemSchema = z.object({
  taxType: z.enum(["ICMS", "ICMS_ST", "IPI", "PIS", "COFINS", "ISS", "FCP", "DIFAL", "OTHER"]),
  rate: z.coerce.number().min(0, "A alíquota não pode ser negativa."),
  cst: z.string().trim().optional(),
  csosn: z.string().trim().optional(),
  reductionPercentage: z.coerce.number().min(0).max(100).optional().default(0),
  notes: z.string().trim().optional(),
});

// -------------------------------------------------------------- Documento fiscal
export const createFiscalDocumentSchema = z.object({
  fiscalEstablishmentId: uuidField("Selecione o estabelecimento fiscal."),
  type: z.enum(["NFE", "NFCE", "NFSE", "CTE", "MDFE", "OTHER"]),
  direction: z.enum(["ENTRADA", "SAIDA"]),
  operationNatureId: uuidField("Selecione a natureza da operação."),
  customerId: optionalUuid,
  supplierId: optionalUuid,
  issueDate: optionalDateString,
  operationDate: optionalDateString,
  series: z.string().trim().optional(),
  model: z.string().trim().optional(),
  number: z.coerce.number().int().positive().optional(),
  carrierId: optionalUuid,
  vehicleId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const addFiscalDocumentItemSchema = z.object({
  productId: uuidField("Selecione o produto."),
  quantity: z.coerce.number().positive("A quantidade deve ser maior que zero."),
  unitPrice: nonNegativeAmount,
  ncmCode: z.string().trim().optional(),
  ncmDescription: z.string().trim().optional(),
  cfopCode: z.string().trim().optional(),
  originCode: goodsOriginCode.optional(),
  unit: z.string().trim().optional(),
  discount: nonNegativeAmount.optional().default(0),
  freightAmount: nonNegativeAmount.optional().default(0),
  insuranceAmount: nonNegativeAmount.optional().default(0),
  otherExpenses: nonNegativeAmount.optional().default(0),
  notes: z.string().trim().optional(),
});

export const authorizeFiscalDocumentSchema = z.object({
  accessKey: z.string().trim().min(1, "Informe a chave de acesso."),
  protocol: z.string().trim().optional(),
  receiptNumber: z.string().trim().optional(),
});

export const rejectFiscalDocumentSchema = z.object({
  returnCode: z.string().trim().optional(),
  rejectionReason: z.string().trim().optional(),
});

export const cancelFiscalDocumentSchema = z.object({
  reason: z.string().trim().optional(),
});

// ------------------------------------------------------------ Eventos fiscais
export const registerFiscalDocumentEventSchema = z.object({
  fiscalDocumentId: uuidField("Selecione o documento fiscal."),
  eventType: z.enum(["CONTINGENCY", "CORRECTION_LETTER", "OTHER", "DENIED"]),
  protocol: z.string().trim().optional(),
  statusCode: z.string().trim().optional(),
  message: z.string().trim().optional(),
  payloadReference: z.string().trim().optional(),
});

// --------------------------------------------------------------- Integrações
export const createFiscalDocumentFromReceiptSchema = z.object({
  fiscalEstablishmentId: uuidField("Selecione o estabelecimento fiscal."),
  operationNatureId: uuidField("Selecione a natureza da operação."),
  notes: z.string().trim().optional(),
});

export const createFiscalDocumentFromSalesOrderSchema = z.object({
  fiscalEstablishmentId: uuidField("Selecione o estabelecimento fiscal."),
  operationNatureId: uuidField("Selecione a natureza da operação."),
  notes: z.string().trim().optional(),
});
