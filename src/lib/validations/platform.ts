import { z } from "zod";

// Validação server-side da camada de PLATAFORMA (supabase/migrations/
// 0064-0065): membros da plataforma, ciclo de vida da empresa como
// entidade SaaS e contratação/habilitação de módulos.
//
// IMPORTANTE: nada aqui autoriza coisa alguma. A autorização real mora
// em has_platform_permission/has_permission no banco — estes schemas são
// apenas a primeira barreira de forma/tipo antes da chamada RPC.

const uuid = z.string().trim().uuid("Identificador inválido.");
const moduleCode = z.string().trim().min(1, "Informe o módulo.").max(64);

// ------------------------------------------------------------- platform_members
export const platformRoleSchema = z.enum(["OWNER", "ADMIN"]);
export const platformMemberStatusSchema = z.enum(["active", "inactive"]);

export const upsertPlatformMemberSchema = z.object({
  authUserId: uuid,
  name: z.string().trim().min(1, "Informe o nome."),
  email: z.string().trim().email("E-mail inválido."),
  platformRole: platformRoleSchema,
  status: platformMemberStatusSchema.optional(),
});

// ------------------------------------------------------------- ciclo de vida
export const companyLifecycleStatusSchema = z.enum([
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
]);

export const setCompanyLifecycleSchema = z.object({
  companyId: uuid,
  lifecycleStatus: companyLifecycleStatusSchema,
  notes: z.string().trim().optional(),
});

// ------------------------------------------------------------- módulos
// Contratação é decisão da PLATAFORMA...
export const setCompanyModuleContractedSchema = z.object({
  companyId: uuid,
  moduleCode,
  contracted: z.boolean(),
  notes: z.string().trim().optional(),
});

// ...habilitação interna é decisão do COMPANY ADMIN (e só vale dentro do
// que já está contratado — quem recusa é fn_company_set_module_enabled).
export const setCompanyModuleEnabledSchema = z.object({
  moduleCode,
  enabled: z.boolean(),
});

export type PlatformRole = z.infer<typeof platformRoleSchema>;
export type CompanyLifecycleStatus = z.infer<typeof companyLifecycleStatusSchema>;
