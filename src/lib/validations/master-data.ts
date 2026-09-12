import { z } from "zod";

// Validação server-side das estruturas novas de Cadastros Mestres
// Avançados (supabase/migrations/0049-0051): atributos de produto e
// endereços/contatos polimórficos de parceiros. units/product_categories/
// product_brands/unit_conversions/products já têm seus próprios
// schemas em src/lib/validations/cadastros.ts (entidades pré-existentes
// desde a Fase 2b, só evoluídas nesta fase) — não duplicados aqui.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));

export const convertUnitQuantitySchema = z.object({
  fromUnitId: uuidField("Selecione a unidade de origem."),
  toUnitId: uuidField("Selecione a unidade de destino."),
  quantity: z.coerce.number(),
  productId: optionalUuid,
  referenceDate: z.string().trim().optional(),
});

// ------------------------------------------------------- Atributos de produto
export const productAttributeSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do atributo."),
  name: z.string().trim().min(1, "Informe o nome do atributo."),
  inputType: z.enum(["TEXT", "NUMBER", "BOOLEAN", "SELECT"]),
  status: z.enum(["active", "inactive"]).optional(),
});

export const productAttributeValueSchema = z.object({
  attributeId: uuidField("Selecione o atributo."),
  value: z.string().trim().min(1, "Informe o valor."),
  status: z.enum(["active", "inactive"]).optional(),
});

export const assignProductAttributeSchema = z.object({
  productId: uuidField("Selecione o produto."),
  attributeId: uuidField("Selecione o atributo."),
  valueId: optionalUuid,
  valueText: z.string().trim().optional(),
  valueNumber: z.coerce.number().optional(),
  valueBoolean: z.coerce.boolean().optional(),
});

// ---------------------------------------------------- Endereços de parceiro
const partyTypeSchema = z.enum(["customer", "supplier", "carrier"]);

export const partyAddressSchema = z.object({
  partyType: partyTypeSchema,
  partyId: uuidField("Selecione o parceiro (cliente/fornecedor/transportadora)."),
  addressType: z.enum(["billing", "delivery", "invoicing", "commercial", "correspondence", "main"]),
  zipCode: z.string().trim().optional(),
  state: z.string().trim().optional(),
  city: z.string().trim().optional(),
  neighborhood: z.string().trim().optional(),
  address: z.string().trim().optional(),
  addressNumber: z.string().trim().optional(),
  addressComplement: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// ----------------------------------------------------- Contatos de parceiro
export const partyContactSchema = z.object({
  partyType: partyTypeSchema,
  partyId: uuidField("Selecione o parceiro (cliente/fornecedor/transportadora)."),
  name: z.string().trim().min(1, "Informe o nome do contato."),
  role: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.union([z.literal(""), z.string().trim().email("Informe um e-mail válido.")]).optional(),
  contactType: z.enum(["commercial", "financial", "technical", "other"]).optional().default("commercial"),
  notes: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});
