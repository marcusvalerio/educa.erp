import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/response";
import { ApiError, validationError } from "@/lib/database/errors";
import { newPasswordSchema, recoverPasswordSchema } from "@/lib/onboarding/invitations";
import { authProvider } from "@/lib/auth/provider";
import { setNeonSessionCookie } from "@/lib/auth/session";
import {
  adminMarkEmailVerified,
  getSession,
  NeonAuthError,
  requestPasswordReset,
  resetPassword,
  revokeOtherSessions,
  signInWithPassword,
  signOut,
  type ClientHints,
} from "./client";
import { buildNeonPasswordLinkUrl } from "./links";
import { isTrustedAccountRequest, resetPasswordFlow, resolveNeonSession, signInFlow } from "./flows";
import { appOrigin, bridgeFor, neonConfig, withServiceSession } from "./server";
import { resolveCurrentNeonSession } from "./request";

// Rotas de conta do EDUCA com AUTH_PROVIDER=neon. O navegador fala só com
// elas; o servidor fala com o Neon Auth. Com AUTH_PROVIDER=supabase elas
// respondem 404 (o caminho do Supabase Auth continua no navegador).

const ok = (data: unknown = null) => NextResponse.json({ success: true, data });

function neonOnly() {
  if (authProvider() !== "neon") throw new ApiError("NOT_FOUND", "Rota indisponível.", 404);
}

/** Só aceita chamadas do próprio app (ver isTrustedAccountRequest: login CSRF). */
function sameAppOnly(request: NextRequest) {
  const own = request.nextUrl.origin;
  const allowed = [own];
  try {
    allowed.push(appOrigin(own));
  } catch {
    // sem APP_URL: só a origem da própria requisição
  }
  const trusted = isTrustedAccountRequest(
    { contentType: request.headers.get("content-type"), origin: request.headers.get("origin"), secFetchSite: request.headers.get("sec-fetch-site") },
    allowed
  );
  if (!trusted) throw new ApiError("FORBIDDEN_ORIGIN", "Requisição recusada.", 403);
}

function hintsOf(request: NextRequest): ClientHints {
  return { forwardedFor: request.headers.get("x-forwarded-for"), userAgent: request.headers.get("user-agent") };
}

async function body<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  return parsed.data;
}

function neonError(error: unknown): never {
  if (error instanceof NeonAuthError) {
    if (error.code === "INVALID_CREDENTIALS" || error.code === "BANNED") {
      // Mesma resposta para senha errada, e-mail inexistente e conta bloqueada.
      throw new ApiError("INVALID_CREDENTIALS", "E-mail ou senha inválidos. Confira os dados e tente novamente.", 401);
    }
    if (error.code === "RATE_LIMITED") throw new ApiError("RATE_LIMITED", "Muitas tentativas. Aguarde alguns segundos e tente novamente.", 429);
    if (error.code === "INVALID_TOKEN") throw new ApiError("INVALID_LINK", "O link expirou ou já foi usado. Solicite um novo.", 400);
    if (error.code === "WEAK_PASSWORD") throw validationError("A senha não atende à política de senhas.");
    throw new ApiError("AUTH_UNAVAILABLE", "O serviço de autenticação não respondeu. Tente novamente.", 503);
  }
  throw error;
}

const signInSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(256) }).strict();

// POST /api/auth/sign-in { email, password }
export async function neonSignIn(request: NextRequest) {
  try {
    neonOnly();
    sameAppOnly(request);
    const input = await body(request, signInSchema);
    const config = neonConfig(request.nextUrl.origin);
    const hints = hintsOf(request);
    const outcome = await signInFlow(input.email, input.password, {
      signIn: (e, p) => signInWithPassword(config, e, p, hints),
      resolve: (cookie) => resolveNeonSession(cookie, { getSession: (c) => getSession(config, c, hints), bridge: bridgeFor(config) }),
      signOut: (cookie) => signOut(config, cookie, hints),
    }).catch(neonError);
    if (outcome.status !== "ok") {
      throw new ApiError("ACCESS_NOT_READY", "Seu acesso ao EDUCA ainda não foi liberado. Use o link do convite enviado para o seu e-mail.", 403);
    }
    await setNeonSessionCookie(outcome.cookie);
    return ok();
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/auth/password/recover { email } — mesma resposta sempre.
export async function neonRecoverPassword(request: NextRequest) {
  try {
    neonOnly();
    sameAppOnly(request);
    const input = await body(request, recoverPasswordSchema);
    const config = neonConfig(request.nextUrl.origin);
    await requestPasswordReset(config, input.email, buildNeonPasswordLinkUrl(config.origin, input.email), hintsOf(request)).catch(() => undefined);
    return ok();
  } catch (error) {
    return jsonError(error);
  }
}

const resetSchema = z
  .object({
    token: z.string().min(8).max(512),
    email: z.string().trim().toLowerCase().email().max(254),
    password: newPasswordSchema,
    continueSession: z.boolean(),
  })
  .strict();

// POST /api/auth/password/reset { token, email, password, continueSession }
export async function neonResetPassword(request: NextRequest) {
  try {
    neonOnly();
    sameAppOnly(request);
    const input = await body(request, resetSchema);
    const config = neonConfig(request.nextUrl.origin);
    const hints = hintsOf(request);
    const outcome = await resetPasswordFlow(input, {
      resetPassword: (t, p) => resetPassword(config, t, p, hints),
      signIn: (e, p) => signInWithPassword(config, e, p, hints),
      markEmailVerified: (userId) => withServiceSession(config, (admin) => adminMarkEmailVerified(config, admin, userId)),
      revokeOtherSessions: (cookie) => revokeOtherSessions(config, cookie, hints),
      signOut: (cookie) => signOut(config, cookie, hints),
    }).catch(neonError);
    if (outcome.status === "ok" && outcome.cookie) await setNeonSessionCookie(outcome.cookie);
    return ok({ signedIn: outcome.status === "ok" && !!outcome.cookie });
  } catch (error) {
    return jsonError(error);
  }
}

// GET /api/auth/session — há sessão válida (identidade que chega ao EDUCA)?
export async function neonCurrentSession() {
  try {
    neonOnly();
    const resolved = await resolveCurrentNeonSession();
    if (resolved.status !== "ok") return ok({ authenticated: false, email: null });
    return ok({ authenticated: true, email: resolved.identity.email });
  } catch (error) {
    return jsonError(error);
  }
}

