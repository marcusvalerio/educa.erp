// Onde cada parte do ATLAS.ERP mora (uma aplicação, um domínio):
//
//   /                      Landing pública (HTML estático em public/landing/)
//   /login, /recuperar-senha, /redefinir-senha, /convite/…, /acesso, /auth/callback
//                          Entrada e autenticação (iguais a antes)
//   /app, /app/…           ERP autenticado: módulos, /app/admin e /app/admincentral
//   /api/…                 APIs (iguais a antes)
//
// Os endereços antigos do ERP (/comercial/…, /admin/…, …) continuam valendo
// por redirecionamento permanente (308) para /app/… — ver next.config.ts.
//
// Sem dependências: é importado pelo next.config.ts, pelo proxy e pelo app.

/** Raiz do ERP autenticado (antes, "/"). */
export const APP_HOME = "/app";

/** Áreas do ERP que moravam na raiz e agora moram em /app. */
export const LEGACY_APP_AREAS = [
  "ativos",
  "cadastros",
  "comercial",
  "configuracoes",
  "crm",
  "financeiro",
  "fiscal",
  "gestao",
  "logistica",
  "producao",
  "projetos",
  "qualidade",
  "suprimentos",
  "admin",
  "admincentral",
] as const;

/** Endereço antigo do ERP → endereço novo em /app (ou null se não é antigo). */
export function legacyAppPath(path: string): string | null {
  const area = path.slice(1).split(/[/?#]/, 1)[0];
  return (LEGACY_APP_AREAS as readonly string[]).includes(area) ? `${APP_HOME}${path}` : null;
}

/** Redirecionamentos 308 dos endereços antigos (next.config.ts). */
export function legacyAppRedirects() {
  return LEGACY_APP_AREAS.flatMap((area) => [
    { source: `/${area}`, destination: `${APP_HOME}/${area}`, permanent: true },
    { source: `/${area}/:path*`, destination: `${APP_HOME}/${area}/:path*`, permanent: true },
  ]);
}
