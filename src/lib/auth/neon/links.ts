import { safeNextPath } from "@/lib/navigation/access";

// Link de senha do Neon Auth (primeiro acesso e recuperação).
//
// O e-mail do Neon aponta para <base>/reset-password/<token>?callbackURL=…;
// o Neon confere o token e redireciona para o callbackURL (só origens
// confiáveis) acrescentando ?token=…. O callbackURL é sempre montado aqui,
// no servidor: /redefinir-senha do próprio app, com o e-mail da conta (só
// para exibir e para o servidor entrar com a senha recém-criada — quem
// prova a identidade é o token de uso único) e, no primeiro acesso, o
// destino interno seguinte.
export function buildNeonPasswordLinkUrl(origin: string, email: string, options: { firstAccess?: boolean; next?: string | null } = {}): string {
  const url = new URL("/redefinir-senha", new URL(origin).origin);
  url.searchParams.set("e", email.trim().toLowerCase());
  if (options.firstAccess) url.searchParams.set("primeiro-acesso", "1");
  if (options.next) url.searchParams.set("next", safeNextPath(options.next));
  return url.toString();
}

/** Destino do primeiro acesso a partir do redirect pedido pelo convite (sempre caminho interno). */
export function firstAccessNextFrom(redirectTo: string): string {
  const url = new URL(redirectTo);
  if (url.pathname === "/redefinir-senha") return safeNextPath(url.searchParams.get("next"));
  return safeNextPath(`${url.pathname}${url.search}`);
}
