// Testes de validação (Zod) da camada de Plataforma/Organização/RBAC
// (src/lib/validations/platform.ts e organization.ts,
// supabase/migrations/0064-0070).
//
// IMPORTANTE — o que NÃO está coberto aqui: toda a regra REAL desta fase
// é comportamento de banco (RLS, has_permission, gate de módulo,
// isolamento multi-tenant, auditoria) e não é verificável por um teste
// de schema. Essa prova existe e é executável:
//   supabase/tests/0064_0070_platform_rbac_proofs.sql
// Esse script cria duas empresas, plataforma, unidades e usuários numa
// transação, roda as 29 asserções e faz ROLLBACK (não persiste nada).
// Resultado da execução contra o Supabase real nesta fase: 29/29 OK.
//
// Especificamente NÃO coberto por este arquivo:
//   - Platform Owner/Admin não recebem acesso a dados de tenant
//   - Company Admin A não administra Empresa B
//   - módulo desabilitado bloqueia mesmo com permission grant
//   - usuário restrito a uma unidade não enxerga as demais
//   - alterações administrativas geram audit_logs
//   - fn_dashboard_context não concede nada além do que has_permission já daria
//   - último admin / último Platform Owner protegidos (triggers da 0070)
//   - funções internas (bootstrap, ledgers) fora do alcance de authenticated
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  upsertPlatformMemberSchema,
  setCompanyLifecycleSchema,
  setCompanyModuleContractedSchema,
  setCompanyModuleEnabledSchema,
} from "@/lib/validations/platform";
import {
  departmentSchema,
  updateDepartmentSchema,
  positionSchema,
  setUserOrgContextSchema,
  grantUserBranchAccessSchema,
  createCompanyRoleSchema,
  setRolePermissionsSchema,
  assignUserRoleSchema,
  setCompanyFocusRuleSchema,
} from "@/lib/validations/organization";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("upsertPlatformMemberSchema", () => {
  test("aceita membro de plataforma válido", () => {
    const result = upsertPlatformMemberSchema.safeParse({
      authUserId: uuid1,
      name: "Marcus",
      email: "owner@educa.com.br",
      platformRole: "OWNER",
    });
    assert.equal(result.success, true);
  });

  test("só aceita OWNER e ADMIN como papel de plataforma", () => {
    for (const platformRole of ["SUPERADMIN", "admin", "TENANT_ADMIN", ""]) {
      const result = upsertPlatformMemberSchema.safeParse({
        authUserId: uuid1,
        name: "X",
        email: "x@educa.com.br",
        platformRole,
      });
      assert.equal(result.success, false, `papel inesperadamente aceito: ${platformRole}`);
    }
  });

  test("exige e-mail válido e authUserId uuid", () => {
    assert.equal(
      upsertPlatformMemberSchema.safeParse({
        authUserId: "nao-uuid",
        name: "X",
        email: "x@educa.com.br",
        platformRole: "ADMIN",
      }).success,
      false,
    );
    assert.equal(
      upsertPlatformMemberSchema.safeParse({
        authUserId: uuid1,
        name: "X",
        email: "sem-arroba",
        platformRole: "ADMIN",
      }).success,
      false,
    );
  });
});

describe("setCompanyLifecycleSchema", () => {
  test("aceita o vocabulário de ciclo de vida do SaaS", () => {
    for (const lifecycleStatus of ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"]) {
      const result = setCompanyLifecycleSchema.safeParse({ companyId: uuid1, lifecycleStatus });
      assert.equal(result.success, true, `status rejeitado: ${lifecycleStatus}`);
    }
  });

  test("rejeita status fora do vocabulário", () => {
    assert.equal(
      setCompanyLifecycleSchema.safeParse({ companyId: uuid1, lifecycleStatus: "PAUSED" }).success,
      false,
    );
  });
});

describe("módulos por empresa", () => {
  test("contratação (plataforma) exige empresa, módulo e booleano", () => {
    assert.equal(
      setCompanyModuleContractedSchema.safeParse({ companyId: uuid1, moduleCode: "comercial", contracted: false })
        .success,
      true,
    );
    assert.equal(
      setCompanyModuleContractedSchema.safeParse({ companyId: uuid1, moduleCode: "comercial" }).success,
      false,
    );
  });

  test("habilitação interna (company admin) não recebe companyId do cliente", () => {
    const result = setCompanyModuleEnabledSchema.safeParse({ moduleCode: "producao", enabled: true });
    assert.equal(result.success, true);
    assert.equal("companyId" in (result.success ? result.data : {}), false);
  });
});

describe("departmentSchema / positionSchema", () => {
  test("exige código e nome", () => {
    assert.equal(departmentSchema.safeParse({}).success, false);
    assert.equal(departmentSchema.safeParse({ code: "LOGISTICA", name: "Logística" }).success, true);
  });

  test("rejeita código com espaço ou caractere inválido", () => {
    for (const code of ["COM ESPACO", "acentuação", "barra/x", ""]) {
      assert.equal(departmentSchema.safeParse({ code, name: "X" }).success, false, `código aceito: ${code}`);
    }
  });

  test("setor aceita hierarquia opcional (parentId)", () => {
    assert.equal(departmentSchema.safeParse({ code: "EXPEDICAO", name: "Expedição", parentId: uuid1 }).success, true);
    assert.equal(departmentSchema.safeParse({ code: "EXPEDICAO", name: "Expedição", parentId: "" }).success, true);
  });

  test("desativar setor é uma atualização de status válida", () => {
    assert.equal(updateDepartmentSchema.safeParse({ status: "inactive" }).success, true);
    assert.equal(updateDepartmentSchema.safeParse({ status: "archived" }).success, false);
  });

  test("cargo aceita setor e nível de senioridade opcionais", () => {
    assert.equal(
      positionSchema.safeParse({ code: "SUPERVISOR", name: "Supervisor", departmentId: uuid1, seniorityLevel: 40 })
        .success,
      true,
    );
    assert.equal(positionSchema.safeParse({ code: "SUPERVISOR", name: "Supervisor" }).success, true);
  });
});

describe("contexto organizacional do usuário", () => {
  test("exige usuário, mas aceita contexto vazio (limpar vínculos)", () => {
    assert.equal(setUserOrgContextSchema.safeParse({ userId: uuid1 }).success, true);
    assert.equal(setUserOrgContextSchema.safeParse({}).success, false);
  });

  test("aceita empresa/unidade/setor/cargo completos", () => {
    const result = setUserOrgContextSchema.safeParse({
      userId: uuid1,
      branchId: uuid2,
      departmentId: uuid1,
      positionId: uuid2,
    });
    assert.equal(result.success, true);
  });

  test("acesso a unidade exige usuário e unidade", () => {
    assert.equal(grantUserBranchAccessSchema.safeParse({ userId: uuid1, branchId: uuid2 }).success, true);
    assert.equal(grantUserBranchAccessSchema.safeParse({ userId: uuid1 }).success, false);
  });
});

describe("papéis personalizados", () => {
  test("papel personalizado exige código e nome", () => {
    assert.equal(createCompanyRoleSchema.safeParse({ code: "LOG_SUP", name: "Supervisor de Logística" }).success, true);
    assert.equal(createCompanyRoleSchema.safeParse({ name: "Sem código" }).success, false);
  });

  test("conjunto de permissões aceita lista vazia (papel sem permissão)", () => {
    assert.equal(setRolePermissionsSchema.safeParse({ permissionCodes: [] }).success, true);
    assert.equal(
      setRolePermissionsSchema.safeParse({ permissionCodes: ["shipments.view", "deliveries.view"] }).success,
      true,
    );
  });

  test("atribuição de papel exige usuário e papel", () => {
    assert.equal(assignUserRoleSchema.safeParse({ userId: uuid1, roleId: uuid2 }).success, true);
    assert.equal(assignUserRoleSchema.safeParse({ userId: uuid1, roleId: "x" }).success, false);
  });
});

describe("regras de dashboard (contexto, não segurança)", () => {
  test("aceita os três escopos de composição", () => {
    for (const scopeType of ["DEPARTMENT", "POSITION", "ROLE"]) {
      const result = setCompanyFocusRuleSchema.safeParse({
        scopeType,
        scopeValue: "LOGISTICA",
        focusCode: "logistics.deliveries_today",
        priority: 10,
      });
      assert.equal(result.success, true, `escopo rejeitado: ${scopeType}`);
    }
  });

  test("rejeita escopo desconhecido", () => {
    assert.equal(
      setCompanyFocusRuleSchema.safeParse({
        scopeType: "USER",
        scopeValue: "x",
        focusCode: "logistics.deliveries_today",
      }).success,
      false,
    );
  });

  test("permite suprimir um foco herdado da plataforma", () => {
    const result = setCompanyFocusRuleSchema.safeParse({
      scopeType: "DEPARTMENT",
      scopeValue: "ESTOQUE",
      focusCode: "inventory.turnover",
      isSuppressed: true,
    });
    assert.equal(result.success, true);
  });
});
