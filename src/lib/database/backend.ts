// Onde ficam os DADOS do ATLAS.ERP:
//   "supabase" (padrão) → PostgREST do projeto Supabase (supabase-js);
//   "postgres"          → PostgreSQL direto (Neon), sem PostgREST
//                         (src/lib/database/pg).
// Lida só no servidor (DATA_BACKEND não vai para o navegador). "postgres"
// exige AUTH_PROVIDER=neon (sem Supabase não há Supabase Auth): a camada de
// autenticação confere isso em src/lib/supabase/server.ts.

export type DataBackend = "supabase" | "postgres";

export function parseDataBackend(value: string | undefined): DataBackend {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "" || normalized === "supabase") return "supabase";
  if (normalized === "postgres") return "postgres";
  // Valor desconhecido nunca vira "algum" backend: falha fechada.
  throw new Error(`DATA_BACKEND inválido: "${value}". Use "supabase" ou "postgres".`);
}

export function dataBackend(): DataBackend {
  return parseDataBackend(process.env.DATA_BACKEND);
}
