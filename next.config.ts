import type { NextConfig } from "next";
import { legacyAppRedirects } from "./src/lib/navigation/app-routes";

const nextConfig: NextConfig = {
  // Provedor de identidade (src/lib/auth/provider.ts): um só valor, gravado
  // no build, visto igual pelo servidor e pelo navegador. Não é segredo.
  env: {
    NEXT_PUBLIC_AUTH_PROVIDER: process.env.AUTH_PROVIDER ?? "supabase",
    // Versão exibida em "Sobre o ATLAS.ERP" (commit do deploy e data do build).
    NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
  },

  // Rodam antes do proxy (src/proxy.ts): endereços antigos do ERP
  // (/comercial/…, /admin/…, …) → /app/… com 308, preservando a query; o
  // HTML da landing só é servido em "/", nunca duplicado em /landing/.
  async redirects() {
    return [
      ...legacyAppRedirects(),
      { source: "/landing", destination: "/", permanent: true },
      { source: "/landing/index.html", destination: "/", permanent: true },
      // Manuais com o nome anterior do produto: links já distribuídos
      // continuam funcionando (308 para os PDFs do ATLAS.ERP).
      { source: "/landing/manuais/EDUCA-Manual-do-Usuario.pdf", destination: "/landing/manuais/ATLAS-ERP-Manual-do-Usuario.pdf", permanent: true },
      { source: "/landing/manuais/EDUCA-Manual-de-Administracao.pdf", destination: "/landing/manuais/ATLAS-ERP-Manual-de-Administracao.pdf", permanent: true },
    ];
  },

  // Landing pública em "/": HTML estático gerado em public/landing/
  // (scripts/build-landing.mjs). Roda depois do proxy, que antes decide se
  // a pessoa vê a landing (sem sessão) ou vai para /app (com sessão).
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
