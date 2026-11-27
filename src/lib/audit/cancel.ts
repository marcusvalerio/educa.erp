import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/auth/context";

/**
 * Registra o cancelamento no histórico do registro (audit_logs, ação CANCEL)
 * com quem cancelou e o motivo. Algumas funções do banco já gravam um CANCEL
 * (sem motivo e com actor_label "system"); nesse caso a linha recém-gravada é
 * completada em vez de duplicada. Falha aqui não desfaz o cancelamento.
 */
export async function recordCancelAudit(ctx: Pick<AuthContext, "companyId" | "appUserId" | "actorLabel">, entity: string, entityId: string, reason: string | null) {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("audit_logs")
      .select("id, new_data")
      .eq("company_id", ctx.companyId)
      .eq("entity", entity)
      .eq("entity_id", entityId)
      .eq("action", "CANCEL")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const prev = (existing.new_data as Record<string, unknown> | null) ?? {};
      const { error } = await admin
        .from("audit_logs")
        .update({ user_id: ctx.appUserId, actor_label: ctx.actorLabel, new_data: { ...prev, ...(reason ? { reason } : {}) } })
        .eq("id", existing.id as string);
      if (error) console.error("[audit_logs] falha ao completar cancelamento:", error.message);
      return;
    }
    const { error } = await admin.from("audit_logs").insert({
      company_id: ctx.companyId,
      user_id: ctx.appUserId,
      actor_label: ctx.actorLabel,
      entity,
      entity_id: entityId,
      action: "CANCEL",
      old_data: null,
      new_data: { status: "cancelled", ...(reason ? { reason } : {}) },
    });
    if (error) console.error("[audit_logs] falha ao gravar cancelamento:", error.message);
  } catch (e) {
    console.error("[audit_logs] falha ao gravar cancelamento:", e instanceof Error ? e.message : e);
  }
}
