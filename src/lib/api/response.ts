import "server-only";

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/database/errors";
import { humanizeErrorMessage } from "@/lib/database/user-message";

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      // Mensagens do banco sem código de status/permissão, UUID ou "7.0000" (rodada 2).
      { success: false, error: { code: error.code, message: humanizeErrorMessage(error.message) } },
      { status: error.status }
    );
  }
  console.error("[api] erro não tratado:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor. Tente novamente." } },
    { status: 500 }
  );
}
