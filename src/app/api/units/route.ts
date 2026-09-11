import "server-only";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api/response";
import { translatePostgresError } from "@/lib/database/errors";

// `units` é catálogo global (sem company_id, sem id/status — ver
// supabase/migrations/0009_catalog_foundation.sql) e gerenciado só por
// migration nesta rodada (RLS não libera INSERT/UPDATE/DELETE para
// `authenticated`). Por isso não usa createCollectionHandlers (que
// pressupõe id/status/company_id) — é uma listagem simples, só leitura.
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("units").select("code, name").order("code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
