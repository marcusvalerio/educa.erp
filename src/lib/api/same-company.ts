import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { validationError } from "@/lib/database/errors";

// Rotas que gravam com o cliente administrativo (sem RLS) precisam conferir
// que cada id recebido do corpo é da empresa de quem chama — senão daria para
// apontar para o cliente, ativo ou usuário de outra empresa.
export async function assertSameCompany(companyId: string, refs: Array<[table: string, id: string | null | undefined, label: string]>) {
  const admin = createAdminClient();
  for (const [table, id, label] of refs) {
    if (!id) continue;
    const { data, error } = await admin.from(table).select("id").eq("id", id).eq("company_id", companyId).maybeSingle();
    if (error || !data) throw validationError(`${label} não encontrado nesta empresa.`);
  }
}
