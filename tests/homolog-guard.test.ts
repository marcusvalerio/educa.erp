// Trava da Vercel da branch de homologação (scripts/homolog/vercel-guard.mjs):
// sem as variáveis restritas à branch, o Preview não sobe com o Supabase de
// produção nem com outro banco que não seja a branch "homolog" do Neon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homologProblems } from "../scripts/homolog/vercel-guard.mjs";

const safe = {
  APP_ENV: "homologacao",
  DATA_BACKEND: "postgres",
  AUTH_PROVIDER: "neon",
  DATABASE_URL: "postgres://educa_app:x@ep-royal-flower-b6tz0xde-pooler.c-2.sa-east-1.aws.neon.tech/educa?sslmode=require",
  NEON_AUTH_BASE_URL: "https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth",
  NEON_AUTH_SERVICE_EMAIL: "svc@example.com",
  NEON_AUTH_SERVICE_PASSWORD: "x",
};

test("ambiente de homologação completo passa", () => {
  assert.deepEqual(homologProblems(safe), []);
  assert.deepEqual(homologProblems({ ...safe, SUPABASE_SERVICE_ROLE_KEY: "desativado", NEXT_PUBLIC_SUPABASE_URL: "desativado" }), []);
});

test("variáveis de Preview gerais (Supabase) são recusadas", () => {
  const problems = homologProblems({ ...safe, SUPABASE_SERVICE_ROLE_KEY: "eyJ…", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" });
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p: string) => !p.includes("eyJ") && !p.includes("supabase.co")), "não imprime valores");
});

test("sem as variáveis da branch (modo supabase padrão) é recusado", () => {
  const problems = homologProblems({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" });
  assert.ok(problems.some((p: string) => p.startsWith("APP_ENV")));
  assert.ok(problems.some((p: string) => p.startsWith("DATA_BACKEND")));
  assert.ok(problems.some((p: string) => p.startsWith("DATABASE_URL")));
});

test("banco ou Neon Auth de outra branch/projeto é recusado", () => {
  assert.ok(homologProblems({ ...safe, DATABASE_URL: "postgres://u:p@ep-other-123-pooler.c-2.sa-east-1.aws.neon.tech/educa" }).some((p: string) => p.startsWith("DATABASE_URL")));
  assert.ok(homologProblems({ ...safe, NEON_AUTH_BASE_URL: "https://ep-long-leaf-b86ezbh8.neonauth.c-14.us-east-1.aws.neon.tech/neondb/auth" }).some((p: string) => p.startsWith("NEON_AUTH_BASE_URL")));
});
