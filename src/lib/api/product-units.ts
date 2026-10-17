import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Produto com unidade de medida (texto, ex.: "UN") e sem a unidade do
// catálogo (units.id): liga pelo código. A produção (BOM/ordem) exige o
// vínculo — sem ele o banco não converte quantidades entre componentes.
export async function withCatalogUnit<T extends Record<string, unknown>>(companyId: string, data: T): Promise<T> {
  const code = typeof data.unidade === "string" ? data.unidade.trim() : "";
  const linked = typeof data.unidadeId === "string" && data.unidadeId.trim() !== "";
  if (!code || linked) return data;
  const { data: unit } = await createAdminClient().from("units").select("id").eq("company_id", companyId).ilike("code", code).limit(1).maybeSingle();
  return unit?.id ? { ...data, unidadeId: unit.id as string } : data;
}
