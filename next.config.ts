import type { NextConfig } from "next";
import { legacyAppRedirects } from "./src/lib/navigation/app-routes";

const nextConfig: NextConfig = {
  // Provedor de identidade (src/lib/auth/provider.ts): um só valor, gravado
  // no build, visto igual pelo servidor e pelo navegador. Não é segredo.
  env: {
    NEXT_PUBLIC_AUTH_PROVIDER: process.env.AUTH_PROVIDER ?? "supabase",
  },

  // Rodam antes do proxy (src/proxy.ts): endereços antigos do ERP
  // (/comercial/…, /admin/…, …) → /app/… com 308, preservando a query; o
  // HTML da landing só é servido em "/", nunca duplicado em /landing/.
  async redirects() {
    return [
      ...legacyAppRedirects(),
      { source: "/landing", destination: "/", permanent: true },
      { source: "/landing/index.html", destination: "/", permanent: true },
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
