import { z } from "zod";

// Validação server-side da estrutura organizacional e do RBAC evoluído
// (supabase/migrations/0066-0068): setores, cargos, contexto do usuário,
// acesso multi-unidade, papéis personalizados e prioridades de dashboard.
//
// Como em todo o resto do projeto, a regra real vive no banco: estes
// schemas validam FORMA (tipos, obrigatoriedade, vocabulário), nunca
// autorização — quem decide acesso é has_permission + RLS.

const uuid = z.string().trim().uuid("Identificador inválido.");
const optionalUuid = z
  .string()
  .trim()
  .uuid("Identificador inválido.")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const code = z
  .string()
  .trim()
  .min(1, "Informe o código.")
  .max(64, "Código muito longo.")
  .regex(/^[A-Za-z0-9_.-]+$/, "Use apenas letras, números, ponto, hífen ou underscore.");

export const statusSchema = z.enum(["active", "inactive"]);

// ------------------------------------------------------------- setores
export const departmentSchema = z.object({
  code,
  name: z.string().trim().min(1, "Informe o nome do setor."),
  description: z.string().trim().optional(),
  parentId: optionalUuid,
});

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do setor.").optional(),
  description: z.string().trim().optional(),
  parentId: optionalUuid,
  status: statusSchema.optional(),
});

// ------------------------------------------------------------- cargos
export const positionSchema = z.object({
  code,
  name: z.string().trim().min(1, "Informe o nome do cargo."),
  description: z.string().trim().optional(),
  departmentId: optionalUuid,
  seniorityLevel: z.coerce.number().int().min(0).max(999).optional(),
});

export const updatePositionSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cargo.").optional(),
  description: z.string().trim().optional(),
  departmentId: optionalUuid,
  seniorityLevel: z.coerce.number().int().min(0).max(999).optional(),
  status: statusSchema.optional(),
});

// ------------------------------------------------------------- contexto do usuário
// Todos opcionais: limpar o contexto (enviar vazio) é uma operação
// legítima — fn_set_user_org_context aceita nulos.
export const setUserOrgContextSchema = z.object({
  userId: uuid,
  branchId: optionalUuid,
  departmentId: optionalUuid,
  positionId: optionalUuid,
});

export const grantUserBranchAccessSchema = z.object({
  userId: uuid,
  branchId: uuid,
  isPrimary: z.boolean().optional(),
});

export const revokeUserBranchAccessSchema = z.object({
  userId: uuid,
  branchId: uuid,
});

// ------------------------------------------------------------- papéis
export const createCompanyRoleSchema = z.object({
  code,
  name: z.string().trim().min(1, "Informe o nome do papel."),
  description: z.string().trim().optional(),
  departmentId: optionalUuid,
});

export const updateCompanyRoleSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do papel.").optional(),
  description: z.string().trim().optional(),
  departmentId: optionalUuid,
  status: statusSchema.optional(),
});

// Conjunto EXATO de permissões do papel (substitui). Array vazio é
// válido: significa "papel sem nenhuma permissão".
export const setRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().trim().min(1)).max(1000),
});

export const assignUserRoleSchema = z.object({
  userId: uuid,
  roleId: uuid,
});

// ------------------------------------------------------------- dashboard context
export const focusScopeTypeSchema = z.enum(["DEPARTMENT", "POSITION", "ROLE"]);

export const setCompanyFocusRuleSchema = z.object({
  scopeType: focusScopeTypeSchema,
  scopeValue: z.string().trim().min(1, "Informe o escopo (código do setor, cargo ou papel)."),
  focusCode: z.string().trim().min(1, "Informe o foco."),
  priority: z.coerce.number().int().min(1).max(9999).optional(),
  isSuppressed: z.boolean().optional(),
});

export type FocusScopeType = z.infer<typeof focusScopeTypeSchema>;
