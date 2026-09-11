import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { unauthorizedError, forbiddenError } from "@/lib/database/errors";
import { jsonError } from "@/lib/api/response";
import type { AuditAcao, AuditEntry } from "@/lib/cadastros/types";
import type { AuditLogRow } from "@/lib/database/schema";

const ACTION_LABELS: Record<AuditLogRow["action"], AuditAcao> = {
  CREATE: "Criado",
  UPDATE: "Alterado",
  DELETE: "Excluído",
  ACTIVATE: "Ativado",
  INACTIVATE: "Inativado",
};

function toAuditEntry(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    data: row.created_at,
    usuario: row.actor_label,
    entidade: row.entity,
    registro: row.entity_id,
    acao: ACTION_LABELS[row.action],
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
    const entity = searchParams.get("entity");
    const entityId = searchParams.get("entityId");

    let query = createAdminClient()
      .from("audit_logs")
      .select("*")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (entity) query = query.eq("entity", entity);
    if (entityId) query = query.eq("entity_id", entityId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: (data ?? []).map(toAuditEntry) });
  } catch (error) {
    return jsonError(error);
  }
}
