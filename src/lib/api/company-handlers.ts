import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import { updateCompanyProfileSchema } from "@/lib/validations/company";

// Fase 19 — Configurações → Empresa: primeira rota a expor leitura/
// edição do próprio perfil de companies. As permissões companies.read/
// companies.update já existem desde 0005 (RBAC), nunca antes ligadas a
// uma rota — nenhuma permissão nova foi criada aqui.

export async function getCompanyProfile() {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    if (!(await hasPermission(ctx.companyId, "companies.read"))) throw forbiddenError("companies.read");

    const { data, error } = await createAdminClient().from("companies").select("*").eq("id", ctx.companyId).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Empresa");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateCompanyProfile(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    if (!(await hasPermission(ctx.companyId, "companies.update"))) throw forbiddenError("companies.update");

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
    const parsed = updateCompanyProfileSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const { data, error } = await createAdminClient()
      .from("companies")
      .update({
        name: parsed.data.name,
        legal_name: parsed.data.legalName,
        document: parsed.data.document,
        email: parsed.data.email || undefined,
        phone: parsed.data.phone,
        address: parsed.data.address,
        city: parsed.data.city,
        state: parsed.data.state,
        zip_code: parsed.data.zipCode,
      })
      .eq("id", ctx.companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Empresa");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
