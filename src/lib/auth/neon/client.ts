// Cliente HTTP do Neon Auth (Managed Better Auth) — só servidor.
//
// Só `fetch`, sem Next.js nem segredos embutidos: o servidor do EDUCA é
// o único que fala com o Neon Auth (padrão BFF). O navegador conversa com
// as rotas /api/auth/* do próprio app e nunca vê o cookie de sessão do
// Neon — ele fica num cookie HttpOnly do domínio do EDUCA.
//
// Contrato validado contra o serviço real (docs/NEON_AUTH_MIGRATION.md
// §10): rotas do Better Auth sob a base URL do Neon Auth, cookie de sessão
// "<prefixo>.session_token", JWT EdDSA no cabeçalho set-auth-jwt de
// /get-session, erros { code, message }.
//
// Sem `import "server-only"` de propósito: o mesmo módulo é executado
// dentro de uma Neon Function nos testes contra o Neon real. O teste de
// invariantes garante que nenhum módulo de navegador o importa.

export type NeonAuthConfig = {
  /** Base URL do Neon Auth, ex.: https://ep-x.neonauth.<região>.aws.neon.tech/neondb/auth */
  baseUrl: string;
  /** Origem do app (precisa estar entre as origens confiáveis do Neon Auth). */
  origin: string;
};

/** Dados da requisição original do navegador, repassados ao Neon Auth. */
export type ClientHints = { forwardedFor?: string | null; userAgent?: string | null };

export type NeonUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  banned: boolean;
};

export type NeonSession = {
  user: NeonUser;
  sessionId: string;
  expiresAt: string;
  /** JWT de curta duração (15 min) emitido junto com a sessão. */
  jwt: string | null;
  /** Novo valor do cookie de sessão, quando o Neon Auth o renovou. */
  renewedCookie: string | null;
};

export type NeonErrorCode =
  | "INVALID_CREDENTIALS"
  | "BANNED"
  | "RATE_LIMITED"
  | "INVALID_TOKEN"
  | "WEAK_PASSWORD"
  | "USER_EXISTS"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "UNAVAILABLE";

export class NeonAuthError extends Error {
  constructor(
    readonly code: NeonErrorCode,
    readonly status: number,
    message: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "NeonAuthError";
  }
}

const SESSION_COOKIE_SUFFIX = ".session_token";
const TIMEOUT_MS = 10_000;

export function neonAuthIssuer(baseUrl: string): string {
  // iss e aud dos tokens reais = origem da base URL (observado no Neon).
  return new URL(baseUrl).origin;
}

export function neonAuthJwksUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/.well-known/jwks.json`;
}

type RawResponse = { status: number; body: unknown; headers: Headers; setCookies: string[] };

async function request(
  config: NeonAuthConfig,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; cookie?: string | null; hints?: ClientHints; query?: Record<string, string> }
): Promise<RawResponse> {
  const url = new URL(`${config.baseUrl.replace(/\/+$/, "")}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { origin: config.origin, accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  if (init.hints?.forwardedFor) headers["x-forwarded-for"] = init.hints.forwardedFor;
  if (init.hints?.userAgent) headers["user-agent"] = init.hints.userAgent;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new NeonAuthError("UNAVAILABLE", 503, "Serviço de autenticação indisponível.");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return { status: res.status, body, headers: res.headers, setCookies };
}

function errorCode(body: unknown): string {
  return body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : "";
}

function fail(res: RawResponse): never {
  const code = errorCode(res.body);
  const retry = Number(res.headers.get("x-retry-after") ?? res.headers.get("retry-after"));
  if (res.status === 429) throw new NeonAuthError("RATE_LIMITED", 429, "Muitas tentativas. Aguarde e tente novamente.", Number.isFinite(retry) ? retry : null);
  if (code === "INVALID_EMAIL_OR_PASSWORD") throw new NeonAuthError("INVALID_CREDENTIALS", 401, "E-mail ou senha inválidos.");
  if (code === "BANNED_USER") throw new NeonAuthError("BANNED", 403, "Acesso bloqueado.");
  if (code === "INVALID_TOKEN") throw new NeonAuthError("INVALID_TOKEN", 400, "Link inválido ou expirado.");
  if (/PASSWORD_TOO_(SHORT|LONG)/.test(code)) throw new NeonAuthError("WEAK_PASSWORD", 400, "Senha fora da política.");
  if (/USER_ALREADY_EXISTS/.test(code)) throw new NeonAuthError("USER_EXISTS", 409, "Usuário já existe.");
  if (res.status === 401) throw new NeonAuthError("UNAUTHORIZED", 401, "Sessão inválida.");
  if (res.status === 403) throw new NeonAuthError("FORBIDDEN", 403, "Operação não permitida.");
  throw new NeonAuthError("UNAVAILABLE", 502, "Falha no serviço de autenticação.");
}

/** Extrai "nome=valor" do cookie de sessão; "" quando o Neon o apagou; null se não veio. */
export function sessionCookieFrom(setCookies: string[]): string | null {
  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    if (!name.endsWith(SESSION_COOKIE_SUFFIX)) continue;
    const value = pair.slice(eq + 1).trim();
    const cleared = value === "" || attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a));
    return cleared ? "" : `${name}=${value}`;
  }
  return null;
}

function toUser(raw: unknown): NeonUser | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  if (typeof u.id !== "string" || typeof u.email !== "string") return null;
  return {
    id: u.id,
    email: u.email.toLowerCase(),
    emailVerified: u.emailVerified === true,
    name: typeof u.name === "string" ? u.name : null,
    banned: u.banned === true,
  };
}

// ------------------------------------------------------------ sessão do usuário

export async function signInWithPassword(config: NeonAuthConfig, email: string, password: string, hints?: ClientHints): Promise<{ cookie: string; user: NeonUser }> {
  const res = await request(config, "/sign-in/email", { body: { email, password, rememberMe: true }, hints });
  if (res.status !== 200) fail(res);
  const cookie = sessionCookieFrom(res.setCookies);
  const user = toUser((res.body as { user?: unknown } | null)?.user);
  if (!cookie || !user) throw new NeonAuthError("UNAVAILABLE", 502, "Resposta de login inesperada.");
  return { cookie, user };
}

/** Sessão válida no Neon (consulta o serviço: sessão revogada = null). */
export async function getSession(config: NeonAuthConfig, cookie: string, hints?: ClientHints): Promise<NeonSession | null> {
  const res = await request(config, "/get-session", { cookie, hints });
  if (res.status === 401) return null;
  if (res.status !== 200) fail(res);
  const body = res.body as { user?: unknown; session?: { id?: unknown; expiresAt?: unknown } } | null;
  const user = toUser(body?.user);
  if (!body || !user || typeof body.session?.id !== "string") return null;
  const renewed = sessionCookieFrom(res.setCookies);
  return {
    user,
    sessionId: body.session.id,
    expiresAt: String(body.session.expiresAt ?? ""),
    jwt: res.headers.get("set-auth-jwt"),
    renewedCookie: renewed === null ? null : renewed || null,
  };
}

export async function signOut(config: NeonAuthConfig, cookie: string, hints?: ClientHints): Promise<void> {
  const res = await request(config, "/sign-out", { body: {}, cookie, hints });
  if (res.status !== 200 && res.status !== 401) fail(res);
}

/** Revoga as demais sessões do usuário, mantendo a do cookie informado. */
export async function revokeOtherSessions(config: NeonAuthConfig, cookie: string, hints?: ClientHints): Promise<void> {
  const res = await request(config, "/revoke-other-sessions", { body: {}, cookie, hints });
  if (res.status !== 200) fail(res);
}

/** Sempre a mesma resposta ao chamador (sem enumeração). Erros só de infraestrutura sobem. */
export async function requestPasswordReset(config: NeonAuthConfig, email: string, redirectTo: string, hints?: ClientHints): Promise<void> {
  const res = await request(config, "/request-password-reset", { body: { email, redirectTo }, hints });
  if (res.status === 200 || res.status === 429) return;
  fail(res);
}

export async function resetPassword(config: NeonAuthConfig, token: string, newPassword: string, hints?: ClientHints): Promise<void> {
  const res = await request(config, "/reset-password", { body: { token, newPassword }, hints });
  if (res.status !== 200) fail(res);
}

// ------------------------------------------------------------ administração (conta de serviço)
// Exigem o cookie de sessão de um usuário com papel "admin" no Neon Auth.

export async function adminCreateUser(config: NeonAuthConfig, adminCookie: string, input: { email: string; name: string }): Promise<NeonUser> {
  // Sem senha: a pessoa cria a senha pelo link de primeiro acesso.
  const res = await request(config, "/admin/create-user", { body: { email: input.email, name: input.name, role: "user" }, cookie: adminCookie });
  if (res.status !== 200) fail(res);
  const user = toUser((res.body as { user?: unknown } | null)?.user);
  if (!user) throw new NeonAuthError("UNAVAILABLE", 502, "Resposta de criação inesperada.");
  return user;
}

export async function adminFindUserByEmail(config: NeonAuthConfig, adminCookie: string, email: string): Promise<NeonUser | null> {
  const res = await request(config, "/admin/list-users", {
    cookie: adminCookie,
    query: { filterField: "email", filterValue: email.toLowerCase(), filterOperator: "eq", limit: "2" },
  });
  if (res.status !== 200) fail(res);
  const users = ((res.body as { users?: unknown[] } | null)?.users ?? []).map(toUser).filter((u): u is NeonUser => !!u && u.email === email.toLowerCase());
  return users[0] ?? null;
}

export async function adminMarkEmailVerified(config: NeonAuthConfig, adminCookie: string, userId: string): Promise<void> {
  const res = await request(config, "/admin/update-user", { body: { userId, data: { emailVerified: true } }, cookie: adminCookie });
  if (res.status !== 200) fail(res);
}

export async function adminRevokeUserSessions(config: NeonAuthConfig, adminCookie: string, userId: string): Promise<void> {
  const res = await request(config, "/admin/revoke-user-sessions", { body: { userId }, cookie: adminCookie });
  if (res.status !== 200) fail(res);
}
