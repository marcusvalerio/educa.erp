import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Encerra a sessão no Supabase Auth (revoga o refresh token e apaga os
// cookies de sessão) e volta ao login. 303: o navegador faz GET em
// /login, sem reenviar o POST. A limpeza do estado local do navegador
// (unidade em foco, caches) é feita pelo botão de sair antes do envio.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  url.searchParams.set("saiu", "1");
  return NextResponse.redirect(url, { status: 303 });
}
