// Qual provedor de identidade está ativo: "supabase" (padrão, caminho
// atual) ou "neon" (Plano A — Neon Auth + ponte para o Postgres do
// Supabase). A escolha é UMA variável, AUTH_PROVIDER, gravada no build
// (next.config.ts a expõe como NEXT_PUBLIC_AUTH_PROVIDER para servidor e
// navegador lerem o mesmo valor). Voltar ao Supabase = AUTH_PROVIDER=supabase
// + novo deploy; nenhum código muda.
//
// Só a camada de autenticação consulta isto (src/lib/auth/*, proxy e as
// telas de login/senha via src/lib/auth/client). O resto do app não sabe
// qual provedor está ativo.

export type AuthProviderName = "supabase" | "neon";

export function parseAuthProvider(value: string | undefined): AuthProviderName {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "" || normalized === "supabase") return "supabase";
  if (normalized === "neon") return "neon";
  // Valor desconhecido nunca vira "algum" provedor: falha fechada.
  throw new Error(`AUTH_PROVIDER inválido: "${value}". Use "supabase" ou "neon".`);
}

export function authProvider(): AuthProviderName {
  return parseAuthProvider(process.env.NEXT_PUBLIC_AUTH_PROVIDER);
}

export const isNeonAuth = () => authProvider() === "neon";
