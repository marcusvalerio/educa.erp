import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "./response";
import { dbError, parseJson, requireCompanyUser, type IdRouteContext } from "./governance";
import { auditChanges } from "@/lib/audit/changes";

// Modo Estudo (0096): a turma e seus grupos. Toda decisão é do banco
// (fn_study_*), chamado com o cliente do PROFESSOR — empresa do tipo Estudo,
// Administrador dela, grupo da própria turma. O professor recebe só
// contagens dos grupos, nunca os dados deles.

const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "no-store" } });

// GET /api/admin/study — contexto da turma e grupos com contagens.
export async function getStudyOverview() {
  try {
    const { supabase } = await requireCompanyUser();
    const ctx = await supabase.rpc("fn_study_context");
    if (ctx.error) throw dbError(ctx.error);
    const context = ctx.data as { is_study: boolean; can_manage: boolean; parent_name: string | null };
    if (!context.can_manage) return ok({ context, groups: [] });
    const groups = await supabase.rpc("fn_study_groups");
    if (groups.error) throw dbError(groups.error);
    return ok({ context, groups: groups.data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

const groupSchema = z.object({ name: z.string().trim().min(1, "Informe o nome do grupo.").max(160) }).strict();

// POST /api/admin/study/groups { name }
export async function createStudyGroup(request: NextRequest) {
  try {
    const { supabase } = await requireCompanyUser();
    const body = await parseJson(request, groupSchema);
    const { data, error } = await supabase.rpc("fn_study_create_group", { p_name: body.name });
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

// GET /api/admin/study/groups/:id — papéis e alunos do grupo.
export async function getStudyGroup(_request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const [roles, members] = await Promise.all([
      supabase.rpc("fn_study_group_roles", { p_group_id: id }),
      supabase.rpc("fn_study_group_members", { p_group_id: id }),
    ]);
    if (roles.error) throw dbError(roles.error);
    if (members.error) throw dbError(members.error);
    return ok({ roles: roles.data ?? [], members: members.data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

const memberSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do aluno.").max(160),
    email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
    roleId: z.string().uuid("Escolha o papel."),
  })
  .strict();

// POST /api/admin/study/groups/:id/members { name, email, roleId }
export async function addStudyGroupMember(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, memberSchema);
    const { data, error } = await supabase.rpc("fn_study_add_member", { p_group_id: id, p_name: body.name, p_email: body.email, p_role_id: body.roleId });
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ setores (0102)
const sectorSchema = z.object({ sector: z.string().trim().min(2).max(40) }).strict();

// GET /api/admin/sectors — catálogo de setores (código e nome).
export async function listSectors() {
  try {
    const { supabase } = await requireCompanyUser();
    const { data, error } = await supabase.rpc("fn_sectors");
    if (error) throw dbError(error);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/admin/study/members/:id/sector { sector } — professor.
export async function setStudyMemberSector(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, sectorSchema);
    const { data, error } = await supabase.rpc("fn_study_set_member_sector", { p_user_id: id, p_code: body.sector });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/admin/users/:id/sector { sector } — Administrador da empresa.
export async function setUserSector(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, sectorSchema);
    const { data, error } = await supabase.rpc("fn_set_user_sector", { p_user_id: id, p_code: body.sector });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

const roleSchema = z.object({ roleId: z.string().uuid("Papel inválido.") }).strict();

// POST /api/admin/study/members/:id/role { roleId } — professor troca o papel do aluno.
export async function setStudyMemberRole(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, roleSchema);
    const { data, error } = await supabase.rpc("fn_study_set_member_role", { p_user_id: id, p_role_id: body.roleId });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ perfis com telas (0105)

// GET /api/admin/screens — telas que um perfil pode ter.
export async function listScreens() {
  try {
    const { supabase } = await requireCompanyUser();
    const { data, error } = await supabase.rpc("fn_screens");
    if (error) throw dbError(error);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

const profileSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Informe o nome do perfil.").max(80),
    screens: z.array(z.string().max(120)).min(1, "Marque ao menos uma tela.").max(100),
  })
  .strict();

// POST /api/admin/study/groups/:id/profiles { roleId?, name, screens } — cria ou altera.
export async function saveStudyProfile(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, profileSchema);
    const { data, error } = await supabase.rpc("fn_study_save_profile", { p_group_id: id, p_role_id: body.roleId ?? null, p_name: body.name, p_screens: body.screens });
    if (error) throw dbError(error);
    return ok(data, body.roleId ? 200 : 201);
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/admin/study/members/:id/department { sector } — só o setor do organograma (0106).
export async function setStudyMemberDepartment(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, sectorSchema);
    const { data, error } = await supabase.rpc("fn_study_set_member_department", { p_user_id: id, p_code: body.sector });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// DELETE /api/admin/study/members/:id/profile — tira o setor (perfil com telas) (0107).
export async function clearStudyMemberProfile(_request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const { data, error } = await supabase.rpc("fn_study_clear_member_profile", { p_user_id: id });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// GET /api/study/workspaces — turma e grupos onde o professor pode entrar
// (lista vazia para quem não é Administrador de uma turma).
export async function listStudyWorkspaces() {
  try {
    const { supabase } = await requireCompanyUser();
    const { data, error } = await supabase.rpc("fn_study_workspaces");
    // Antes da 0109 a função não existe: ninguém troca de ERP.
    if (error) return ok([]);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

const workspaceSchema = z.object({ companyId: z.string().uuid("Escolha o grupo.") }).strict();

// POST /api/study/workspaces { companyId } — entra no ERP do grupo (ou volta à turma).
export async function enterStudyWorkspace(request: NextRequest) {
  try {
    const { supabase } = await requireCompanyUser();
    const body = await parseJson(request, workspaceSchema);
    const { data, error } = await supabase.rpc("fn_study_enter_workspace", { p_company_id: body.companyId });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

const moveSchema = z.object({ groupId: z.string().uuid("Escolha o grupo.") }).strict();

// POST /api/admin/study/members/:id/move { groupId } — aluno muda de grupo na turma (0124).
export async function moveStudyMember(request: NextRequest, context: IdRouteContext) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id } = await context.params;
    const body = await parseJson(request, moveSchema);
    const { data, error } = await supabase.rpc("fn_study_move_member", { p_user_id: id, p_group_id: body.groupId });
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

const classSchema = z.object({ name: z.string().trim().min(1, "Informe o nome da turma.").max(160) }).strict();

// POST /api/admin/study/classes { name } — o professor cria outra turma e entra nela (0124).
export async function createStudyClass(request: NextRequest) {
  try {
    const { supabase } = await requireCompanyUser();
    const body = await parseJson(request, classSchema);
    const { data, error } = await supabase.rpc("fn_study_create_class", { p_name: body.name });
    if (error) throw dbError(error);
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

const ENTITY_LABELS: Record<string, string> = {
  sales_orders: "Pedido de venda",
  purchase_orders: "Pedido de compra",
  purchase_requests: "Solicitação de compra",
  purchase_receipts: "Recebimento",
  accounts_payable: "Conta a pagar",
  accounts_receivable: "Conta a receber",
  fiscal_documents: "Nota fiscal",
  fiscal_authorization_attempts: "Envio da NF-e",
  stock_counts: "Inventário",
  stock_reservations: "Reserva de estoque",
  users: "Usuário",
  user_roles: "Papel do usuário",
  user_invitations: "Convite",
  roles: "Papel",
  shipments: "Expedição",
  pick_lists: "Separação",
};

const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Entrada",
  ISSUE: "Saída",
  ADJUSTMENT_IN: "Ajuste (entrada)",
  ADJUSTMENT_OUT: "Ajuste (saída)",
  TRANSFER_IN: "Transferência (entrada)",
  TRANSFER_OUT: "Transferência (saída)",
  RETURN_IN: "Devolução de cliente",
  RETURN_OUT: "Devolução a fornecedor",
  RESERVE: "Reserva",
  RELEASE: "Liberação de reserva",
};

const groupIdSchema = z.string().uuid();

// GET /api/admin/study/activity?groupId= — movimentos dos grupos da turma,
// com o que mudou em cada registro.
export async function listStudyActivity(request: NextRequest) {
  try {
    const { supabase } = await requireCompanyUser();
    const raw = new URL(request.url).searchParams.get("groupId");
    const groupId = raw && groupIdSchema.safeParse(raw).success ? raw : null;
    const { data, error } = await supabase.rpc("fn_study_activity", { p_group_id: groupId, p_limit: 300 });
    if (error) throw dbError(error);
    type Row = { at: string; group_id: string; group_name: string; actor: string | null; entity: string; entity_id: string | null; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };
    const rows = ((data ?? []) as Row[]).map((r, i) => {
      const stock = r.entity === "Movimento de estoque";
      return {
        id: `${r.entity_id ?? "x"}-${i}`,
        at: r.at,
        groupId: r.group_id,
        groupName: r.group_name,
        actor: r.actor,
        entity: ENTITY_LABELS[r.entity] ?? r.entity,
        action: stock ? (MOVEMENT_LABELS[r.action] ?? r.action) : r.action,
        stock,
        changes: auditChanges(r.old_data, r.new_data, 12),
      };
    });
    return ok(rows);
  } catch (error) {
    return jsonError(error);
  }
}
