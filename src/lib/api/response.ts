import "server-only";

import { NextResponse } from "next/server";
import { ApiError } from "@/lib/database/errors";

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  console.error("[api] erro não tratado:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor. Tente novamente." } },
    { status: 500 }
  );
}
