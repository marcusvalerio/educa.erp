// Trava da Vercel para a branch de HOMOLOGAÇÃO (claude/educa-homolog).
//
// Sem as variáveis do Preview restritas a esta branch, a Vercel usaria as
// variáveis de Preview gerais do projeto — que podem apontar para o Supabase
// de PRODUÇÃO. Esta trava impede isso:
//   node scripts/homolog/vercel-guard.mjs ignore  → "Ignored Build Step":
//       sai 0 (pula o deploy) se a branch é a de homologação e o ambiente não
//       está seguro; sai 1 (segue) nos demais casos.
//   node scripts/homolog/vercel-guard.mjs build   → antes do "next build":
//       falha o build (sai 1) nas mesmas condições.
// Imprime só NOMES de variáveis, nunca valores.
export const HOMOLOG_BRANCH = "claude/educa-homolog";
export const HOMOLOG_NEON_ENDPOINT = "ep-royal-flower-b6tz0xde"; // branch "homolog" do projeto educa-erp-prod
const NEUTRAL = "desativado";
const SUPABASE_VARS = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

export function homologProblems(env) {
  const problems = [];
  const host = (v) => {
    try {
      return new URL(v).hostname;
    } catch {
      return "";
    }
  };
  if (env.APP_ENV !== "homologacao") problems.push("APP_ENV deve ser 'homologacao'");
  if (env.DATA_BACKEND !== "postgres") problems.push("DATA_BACKEND deve ser 'postgres'");
  if (env.AUTH_PROVIDER !== "neon") problems.push("AUTH_PROVIDER deve ser 'neon'");
  if (!host(env.DATABASE_URL ?? "").startsWith(`${HOMOLOG_NEON_ENDPOINT}`)) problems.push(`DATABASE_URL deve apontar para o endpoint ${HOMOLOG_NEON_ENDPOINT} (branch homolog)`);
  if (!host(env.NEON_AUTH_BASE_URL ?? "").startsWith(`${HOMOLOG_NEON_ENDPOINT}.`)) problems.push(`NEON_AUTH_BASE_URL deve ser o Neon Auth da branch homolog (${HOMOLOG_NEON_ENDPOINT})`);
  if (!env.NEON_AUTH_SERVICE_EMAIL || !env.NEON_AUTH_SERVICE_PASSWORD) problems.push("NEON_AUTH_SERVICE_EMAIL/NEON_AUTH_SERVICE_PASSWORD ausentes");
  for (const name of SUPABASE_VARS) {
    if (env[name] && env[name] !== NEUTRAL) problems.push(`${name} está definida (sobrescreva com '${NEUTRAL}' só para esta branch)`);
  }
  return problems;
}

function main(mode) {
  const env = process.env;
  const onHomologBranch = env.VERCEL_GIT_COMMIT_REF === HOMOLOG_BRANCH;
  const problems = onHomologBranch ? homologProblems(env) : [];
  if (mode === "ignore") {
    if (problems.length) {
      console.log(`Homologação: deploy PULADO — ambiente inseguro:\n- ${problems.join("\n- ")}`);
      process.exit(0);
    }
    console.log(onHomologBranch ? "Homologação: ambiente seguro, seguindo com o build." : "Fora da branch de homologação: build normal.");
    process.exit(1);
  }
  if (problems.length) {
    console.error(`Homologação: build RECUSADO — ambiente inseguro:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv[2] ?? "build");
