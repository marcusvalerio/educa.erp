import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth/session";

// Encerra a sessão no provedor de identidade (Supabase Auth: revoga o
// refresh token; Neon Auth: revoga a sessão no Neon) e apaga os cookies
// de sessão; volta ao login. 303: o navegador faz GET em /login, sem
// reenviar o POST. A limpeza do estado local do navegador (unidade em
// foco, caches) é feita pelo botão de sair antes do envio.
export async function POST(request: Request) {
  await endSession();
  const url = new URL("/login", request.url);
  url.searchParams.set("saiu", "1");
  return NextResponse.redirect(url, { status: 303 });
}
