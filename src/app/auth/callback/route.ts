import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseSessionClient } from "@/lib/supabase/server";
import { authProvider } from "@/lib/auth/provider";
import { safeNextPath } from "@/lib/navigation/access";

// Retorno dos links do Supabase Auth (recuperação de senha, confirmação
// de e-mail). Troca, NO SERVIDOR, o código PKCE (?code=) ou o token do
// e-mail (?token_hash=&type=) por uma sessão em cookie e segue para
// `next` — sempre um caminho interno (safeNextPath: sem open redirect).
// Link inválido ou expirado volta ao login com uma mensagem neutra.
const OTP_TYPES: EmailOtpType[] = ["recovery", "invite", "signup", "magiclink", "email_change", "email"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const code = searchParams.get("code");
  // Cada pedido PKCE (ex.: dois "esqueci minha senha" seguidos) tem o seu
  // verificador; o Auth devolve o id do fluxo em sb_flow_id. Sem ele, só
  // o link mais recente funcionaria.
  const flowId = searchParams.get("sb_flow_id");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Formato próprio do Supabase Auth. Com AUTH_PROVIDER=neon os links do
  // Neon Auth voltam direto para /redefinir-senha e esta rota não é usada.
  const supabase = authProvider() === "supabase" ? await createSupabaseSessionClient() : null;
  let ok = false;
  if (!supabase) {
    ok = false;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    ok = !error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const target = request.nextUrl.clone();
  target.search = "";
  if (ok) {
    const [pathname, query] = next.split("?");
    target.pathname = pathname;
    if (query) target.search = `?${query}`;
  } else {
    target.pathname = "/login";
    target.searchParams.set("erro", "link");
  }
  return NextResponse.redirect(target, { status: 303 });
}
