import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { unauthorizedError, forbiddenError } from "@/lib/database/errors";
import { jsonError } from "@/lib/api/response";
import type { AuditAcao, AuditEntry } from "@/lib/cadastros/types";
import { auditChanges } from "@/lib/audit/changes";
import type { AuditLogRow } from "@/lib/database/schema";

// Ações gravadas pelas funções do banco (aprovar, receber, expedir...) em português.
const ACTION_LABELS: Record<string, string> = {
  CREATE: "Criado",
  UPDATE: "Alterado",
  DELETE: "Excluído",
  ACTIVATE: "Ativado",
  INACTIVATE: "Inativado",
  APPROVE: "Aprovado",
  REJECT: "Recusado",
  SUBMIT: "Enviado para aprovação",
  CANCEL: "Cancelado",
  RESERVE: "Estoque reservado",
  RELEASE: "Reserva liberada",
  PICK: "Separado",
  PACK: "Embalado",
  SHIP: "Expedido",
  DELIVER: "Entregue",
  CLOSE: "Encerrado",
  RECEIVE: "Recebido",
  PAY: "Pago",
  SEND: "Enviado",
  CONFIRM: "Confirmado",
  ISSUE: "Emitido",
  AUTHORIZE: "Autorizado",
};

// Títulos gerados a partir de um pedido são gravados como APPROVE sem
// estado anterior: na tela isso é a criação do título, não uma aprovação.
const TITLE_ENTITIES = new Set(["accounts_receivable", "accounts_payable"]);
function actionOf(row: AuditLogRow): string {
  const action = String(row.action);
  if (action === "APPROVE" && !row.old_data && TITLE_ENTITIES.has(row.entity)) return "CREATE";
  return action;
}

function toAuditEntry(row: AuditLogRow, names: Map<string, string>): AuditEntry {
  const userId = (row as { user_id?: string | null }).user_id ?? null;
  // As funções do banco gravam "system" em actor_label, mas guardam o user_id certo.
  const usuario = (userId && names.get(userId)) || row.actor_label;
  return {
    id: row.id,
    data: row.created_at,
    usuario,
    entidade: row.entity,
    registro: row.entity_id,
    acao: (ACTION_LABELS[actionOf(row)] ?? String(row.action)) as AuditAcao,
    mudancas: auditChanges(row.old_data as Record<string, unknown> | null, row.new_data as Record<string, unknown> | null, 30, row.entity),
  };
}

// GET /api/audit-logs?entity=Produto&entityId=<uuid>
// Histórico persistente (Fase 4 usava localStorage). Sem `entityId`,
// retorna as últimas movimentações da entidade informada (ou de toda a
// empresa, se nenhum filtro for passado). Exige audit_logs.read e usa a
// empresa resolvida do usuário autenticado — nunca uma constante fixa.
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const allowed = await hasPermission(ctx.companyId, "audit_logs.read");
    if (!allowed) throw forbiddenError("audit_logs.read");

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity") ?? searchParams.get("entidade");
    const entityId = searchParams.get("entityId");
    // Paginação: antes cortava em 50 sem aviso. Padrão 200 por página, até 1000.
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? searchParams.get("pageSize")) || 200, 1), 1000);
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);

    const admin = createAdminClient();
    let query = admin
      .from("audit_logs")
      .select("*")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (entity) query = query.eq("entity", entity);
    // entityIds: registro + relacionados (ex.: título e seus pagamentos/recebimentos).
    const entityIds = (searchParams.get("entityIds") ?? "").split(",").map((v) => v.trim()).filter((v) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, 100);
    if (entityId && entityIds.length) query = query.in("entity_id", [entityId, ...entityIds]);
    else if (entityId) query = query.eq("entity_id", entityId);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as AuditLogRow[];
    const ids = [...new Set(rows.map((r) => (r as { user_id?: string | null }).user_id).filter((v): v is string => !!v))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: users } = await admin.from("users").select("id, name").eq("company_id", ctx.companyId).in("id", ids);
      for (const u of (users ?? []) as { id: string; name: string | null }[]) if (u.name) names.set(u.id, u.name);
    }

    return NextResponse.json({ success: true, data: rows.map((r) => toAuditEntry(r, names)), page, limit, hasMore: rows.length === limit });
  } catch (error) {
    return jsonError(error);
  }
}
