import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { unauthorizedError, validationError } from "@/lib/database/errors";
import { jsonError } from "@/lib/api/response";
import { normalizeNcmQuery, searchNcmTable } from "@/lib/fiscal/ncm-search";
import NCM_TABLE from "@/lib/fiscal/ncm-table.json";

// Consulta de NCM para os cadastros: busca na cópia local da tabela pública
// vigente e devolve só códigos de 8 dígitos. Exige sessão.
export async function GET(request: NextRequest) {
  try {
    if (!(await getAuthContext())) throw unauthorizedError();
    const q = normalizeNcmQuery(new URL(request.url).searchParams.get("q") ?? "");
    if (!q) throw validationError("Digite ao menos 2 números ou 3 letras.");
    // Tabela local (cópia da tabela pública vigente): sem depender da BrasilAPI,
    // que falhava a partir da Vercel e deixava a consulta sem resposta.
    return NextResponse.json({ success: true, data: searchNcmTable(NCM_TABLE as [string, string][], q) });
  } catch (error) {
    return jsonError(error);
  }
}
