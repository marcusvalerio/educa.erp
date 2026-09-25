import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isGuestOnlyPath, isPublicPath } from "@/lib/onboarding/access";
import { authProvider } from "@/lib/auth/provider";
import { getSession as getNeonSession } from "@/lib/auth/neon/client";
import { neonConfig, SESSION_COOKIE } from "@/lib/auth/neon/server";

// Atualiza a sessão (Supabase Auth ou Neon Auth, conforme AUTH_PROVIDER —
// src/lib/auth/provider.ts) a cada requisição e protege as
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
  const neon = authProvider() === "neon";
  const session = neon ? await neonSession(request) : await supabaseSession(request);
  if (!session) return NextResponse.next();
  const { signedIn, response } = session;
  // Neon: o redirecionamento leva junto o cookie local renovado/apagado.
  const redirect = (url: URL) => (neon ? withCookiesOf(response, NextResponse.redirect(url)) : NextResponse.redirect(url));

  const pathname = request.nextUrl.pathname;
  if (!signedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return redirect(url);
  }

  if (signedIn && isGuestOnlyPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirect(url);
  }

  return response;
}

function withCookiesOf(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

type ProxySession = { signedIn: boolean; response: NextResponse } | null;

// Supabase Auth (AUTH_PROVIDER=supabase): renova a sessão em cookies e
// confere o usuário no Auth a cada navegação.
async function supabaseSession(request: NextRequest): Promise<ProxySession> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
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

  return { signedIn: !!user, response };
}

// Neon Auth (AUTH_PROVIDER=neon): a sessão vale se o Neon Auth a reconhece
// agora (revogada/expirada = sem sessão). Renovação do cookie pelo Neon é
// repassada; sessão morta apaga o cookie local. A identidade no banco
// (ponte + vínculo) é resolvida nas rotas — aqui só a navegação.
async function neonSession(request: NextRequest): Promise<ProxySession> {
  if (!process.env.NEON_AUTH_BASE_URL) return null;
  const response = NextResponse.next({ request });
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return { signedIn: false, response };
  const session = await getNeonSession(neonConfig(request.nextUrl.origin), cookie, {
    forwardedFor: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent"),
  }).catch(() => null);
  if (!session || session.user.banned) {
    response.cookies.delete(SESSION_COOKIE);
    return { signedIn: false, response };
  }
  if (session.renewedCookie && session.renewedCookie !== cookie) {
    response.cookies.set(SESSION_COOKIE, session.renewedCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  }
  return { signedIn: true, response };
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
