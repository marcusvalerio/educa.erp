import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isGuestOnlyPath, isPublicPath } from "@/lib/onboarding/access";

// Atualiza a sessão do Supabase Auth a cada requisição e protege as
// rotas de UI: sem sessão, redireciona para /login; com sessão, /login
// redireciona para a home. Rotas de API não são redirecionadas aqui —
// cada rota já rejeita (401/403) sem autenticação/permissão via
// src/lib/api/handlers.ts, com uma mensagem estruturada em vez de um
// redirect HTML.
//
// Sem .env.local configurado (Supabase ainda não provisionado), o
// proxy não bloqueia nada — mantém o mesmo comportamento de
// degradação graciosa que o resto do app já tem nesta fase (ver
// docs/SUPABASE.md): a UI carrega, só as chamadas de API é que falham
// com um erro claro.
//
// Next.js 16 renomeou `middleware.ts`/`middleware()` para
// `proxy.ts`/`proxy()` (a convenção antiga fica deprecated) — ver
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
//
// Rotas públicas e rotas só-visitante: src/lib/onboarding/access.ts
// (convite, recuperação/redefinição de senha e retorno do Auth abrem sem
// sessão; cada página valida sozinha o que precisa).

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isGuestOnlyPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
