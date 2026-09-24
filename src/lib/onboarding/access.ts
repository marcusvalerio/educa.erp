import { safeNextPath } from "@/lib/navigation/access";
import type { AccessState, SessionContext } from "@/lib/session/types";

// Regras de entrada (primeiro login e todo login seguinte). Puro: sem
// rede, sem Supabase — testável e usado igual no cliente e no servidor.
//
// Nada aqui concede acesso. O estado vem do próprio vínculo do usuário
// em public.users (lido pelo servidor com o cliente do usuário, sob
// RLS); a navegação só escolhe a tela mais útil para esse estado. Cada
// rota e cada tabela continuam validando no banco.

/**
 * Estado de acesso a partir do cadastro vinculado ao login.
 *   unlinked   — login sem cadastro em public.users (ninguém configurou)
 *   inactive   — cadastro desativado pela empresa
 *   no_company — cadastro ativo, mas a empresa não devolveu contexto
 *   active     — pode operar (o que exatamente decide o RBAC)
 */
export function resolveAccessState(appUser: { status: string } | null, hasTenant: boolean): AccessState {
  if (!appUser) return "unlinked";
  if (appUser.status !== "active") return "inactive";
  return hasTenant ? "active" : "no_company";
}

function inArea(path: string, area: string): boolean {
  return path === area || path.startsWith(`${area}/`) || path.startsWith(`${area}?`);
}

/**
 * Para onde ir depois de entrar.
 *   - membro só da plataforma → /admincentral (nunca o ERP de uma empresa);
 *   - usuário de empresa → o destino pedido (next) ou o ERP;
 *   - sem contexto utilizável → /acesso (tela explicativa).
 * `next` é sempre saneado (sem open redirect) e nunca leva alguém para um
 * ambiente que o próprio contexto já diz não ser dele.
 */
export function postLoginDestination(ctx: Pick<SessionContext, "access" | "tenant" | "platform">, next?: string | null): string {
  const wanted = next ? safeNextPath(next) : null;
  const hasTenant = ctx.access === "active" && !!ctx.tenant;
  const hasPlatform = !!ctx.platform;

  if (wanted && inArea(wanted, "/convite")) return wanted;
  if (!hasTenant && !hasPlatform) return "/acesso";
  if (wanted && wanted !== "/") {
    if (inArea(wanted, "/admincentral")) return hasPlatform ? wanted : "/";
    if (hasTenant) return wanted;
  }
  return hasTenant ? "/" : "/admincentral";
}

// ----------------------------------------------------------- rotas públicas
// Rotas de UI que abrem sem sessão (o proxy não redireciona para /login).
// Cada uma valida sozinha o que precisa: /convite consulta o token,
// /redefinir-senha exige a sessão de recuperação, /auth/callback troca o
// código do Supabase por sessão.
export const PUBLIC_PATHS = ["/login", "/recuperar-senha", "/redefinir-senha", "/convite", "/auth/callback"] as const;

// Rotas só para quem NÃO está autenticado: com sessão, voltam ao início.
export const GUEST_ONLY_PATHS = ["/login", "/recuperar-senha"] as const;

function matches(pathname: string, list: readonly string[]): boolean {
  return list.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const isPublicPath = (pathname: string) => matches(pathname, PUBLIC_PATHS);
export const isGuestOnlyPath = (pathname: string) => matches(pathname, GUEST_ONLY_PATHS);

// ----------------------------------------------------------- limpeza no logout
// Chaves de armazenamento local que carregam contexto do usuário anterior
// (unidade em foco por usuário). Preferências neutras (tema, sidebar)
// ficam — não identificam ninguém nem dão acesso a nada.
export const USER_SCOPED_STORAGE_PREFIXES = ["educa-branch:"] as const;

export function userScopedKeys(keys: Iterable<string>): string[] {
  return [...keys].filter((key) => USER_SCOPED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)));
}
