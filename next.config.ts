import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Provedor de identidade (src/lib/auth/provider.ts): um só valor, gravado
  // no build, visto igual pelo servidor e pelo navegador. Não é segredo.
  env: {
    NEXT_PUBLIC_AUTH_PROVIDER: process.env.AUTH_PROVIDER ?? "supabase",
  },
};

export default nextConfig;
