import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { validationError } from "@/lib/database/errors";

// Local de estoque guarda o código do depósito (texto) e o vínculo
// obrigatório warehouse_id. O formulário manda o código; aqui ele vira o
// depósito da própria empresa — código de outra empresa não é encontrado.
export async function withWarehouse<T extends Record<string, unknown>>(companyId: string, data: T): Promise<T> {
  const code = typeof data.armazem === "string" ? data.armazem.trim() : "";
  if (!code) return data;
  const { data: warehouse } = await createAdminClient()
    .from("warehouses")
    .select("id, code")
    .eq("company_id", companyId)
    .ilike("code", code)
    .limit(1)
    .maybeSingle();
  if (!warehouse?.id) throw validationError(`Depósito "${code}" não encontrado. Cadastre o depósito antes do local.`);
  return { ...data, armazem: warehouse.code as string, depositoId: warehouse.id as string };
}
