import "server-only";

import { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ApiError, translatePostgresError, unauthorizedError, validationError } from "@/lib/database/errors";

// Base comum das rotas de governança (sessão, /admin, /admincentral).
//
// Diferente dos handlers de domínio mais antigos (que usam o cliente
// service_role + checagem explícita), TODA rota aqui roda como o usuário
// autenticado: RLS e as funções SECURITY DEFINER das migrations
// 0064-0070 são a única autoridade. Nada nesta camada concede acesso —
// ela só traduz HTTP <-> banco. Se o banco recusa, a rota recusa.

export type UserClient = Awaited<ReturnType<typeof createClient>>;

export async function requireSession(): Promise<{ supabase: UserClient; authUserId: string; email: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw unauthorizedError();
  return { supabase, authUserId: data.user.id, email: data.user.email ?? null };
}

// Empresa do usuário autenticado, resolvida pelo próprio vínculo em
// public.users (policy users_select permite ler a própria linha). Nunca
// aceita company_id vindo do cliente.
export async function requireCompanyUser() {
  const session = await requireSession();
  const { data, error } = await session.supabase
    .from("users")
    .select("id, company_id, status")
    .eq("auth_user_id", session.authUserId)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data || data.status !== "active") {
    throw new ApiError("NO_COMPANY", "Seu usuário não está vinculado a uma empresa ativa.", 403);
  }
  return { ...session, appUserId: data.id as string, companyId: data.company_id as string };
}

export async function requirePlatformMember() {
  const session = await requireSession();
  const { data, error } = await session.supabase.rpc("current_platform_role");
  if (error) throw dbError(error);
  if (!data) throw new ApiError("NOT_PLATFORM_MEMBER", "Acesso restrito à Administração Central da plataforma.", 403);
  return { ...session, platformRole: data as "OWNER" | "ADMIN" };
}

// Erros das funções de governança já vêm em português e são pensados
// para o usuário final (ex.: "Não é possível remover o último
// administrador ativo da empresa."). Eles são repassados; o restante
// cai na tradução genérica, que nunca vaza detalhe técnico.
export function dbError(error: { code?: string; message?: string; details?: string }): ApiError {
  const message = error.message ?? "";
  if (error.code === "42501") {
    return new ApiError("FORBIDDEN", message || "Você não tem permissão para esta operação.", 403);
  }
  if (error.code === "P0002") return new ApiError("NOT_FOUND", message || "Registro não encontrado.", 404);
  if (error.code === "P0001" || error.code === "22023" || error.code === "23514") {
    return new ApiError("BUSINESS_RULE", message || "Operação recusada pelas regras do sistema.", 422);
  }
  return translatePostgresError(error);
}

export async function parseJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  return parsed.data;
}

export type IdRouteContext = { params: Promise<{ id: string }> };
