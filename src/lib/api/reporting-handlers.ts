import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import { periodRangeQuerySchema } from "@/lib/validations/controlling";

// Handlers de Relatórios / BI Operacional (supabase/migrations/0048).
// Cada dashboard é uma função SQL parametrizada por período — nunca
// fabrica dado (ver docs/REPORTING.md §1): quando uma fonte não existe,
// a métrica correspondente não é criada. Relatórios OPERACIONAIS de
// lista (pedidos, recebimentos, expedições, documentos fiscais...)
// reaproveitam as APIs de listagem já existentes desde as fases
// anteriores — não duplicados aqui.

function firstIssueMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

function parsePeriodRange(request: NextRequest): { periodStart: string; periodEnd: string } {
  const { searchParams } = new URL(request.url);
  const parsed = periodRangeQuerySchema.safeParse({
    periodStart: searchParams.get("periodStart") ?? "",
    periodEnd: searchParams.get("periodEnd") ?? "",
  });
  if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
  return parsed.data;
}

function rpcError(error: { message?: string; code?: string }): ApiError {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("permissão negada")) return new ApiError("FORBIDDEN", error.message ?? "", 403);
  return translatePostgresError(error);
}

function reportHandlerFactory(permissionCode: string, rpcName: string) {
  return async function handler(request: NextRequest) {
    try {
      const ctx = await getAuthContext();
      if (!ctx) throw unauthorizedError();
      const allowed = await hasPermission(ctx.companyId, permissionCode);
      if (!allowed) throw forbiddenError(permissionCode);

      const { periodStart, periodEnd } = parsePeriodRange(request);
      const supabase = await createClient();
      const { data, error } = await supabase.rpc(rpcName, {
        p_company_id: ctx.companyId, p_period_start: periodStart, p_period_end: periodEnd,
      });
      if (error) throw rpcError(error);
      return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
    } catch (error) {
      return jsonError(error);
    }
  };
}

export const getExecutiveReport = reportHandlerFactory("reports.view", "fn_report_executive");
export const getCommercialReport = reportHandlerFactory("commercial_reports.view", "fn_report_commercial");
export const getInventoryReport = reportHandlerFactory("inventory_reports.view", "fn_report_inventory");
export const getPurchasesReport = reportHandlerFactory("purchase_reports.view", "fn_report_purchases");
export const getProductionReport = reportHandlerFactory("production_reports.view", "fn_report_production");
export const getLogisticsReport = reportHandlerFactory("logistics_reports.view", "fn_report_logistics");
export const getFinanceReport = reportHandlerFactory("financial_reports.view", "fn_report_finance");
export const getFiscalReport = reportHandlerFactory("fiscal_reports.view", "fn_report_fiscal");
