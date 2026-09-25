// POC — servidor de identidade: Better Auth 1.4.18, a mesma versão do
// "Managed Better Auth" (Neon Auth). Roda localmente porque o Neon não é
// acessível deste ambiente. O banco de identidade é SEPARADO do banco do
// EDUCA (database `neon_auth_poc`), como no Neon Auth real.
//
// Uso: node auth-server.mjs  (variáveis: POC_AUTH_DB, POC_AUTH_SECRET,
// POC_OUTBOX). Nenhum segredo fica no código.
import http from "node:http";
import fs from "node:fs";
import pg from "pg";
import { betterAuth } from "better-auth";
import { jwt, admin } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { getMigrations } from "better-auth/db";

const PORT = 3400;
export const ISSUER = `http://localhost:${PORT}`;
export const AUDIENCE = "educa-erp";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name}.`);
  return value;
}

export const options = {
  baseURL: ISSUER,
  basePath: "/api/auth",
  secret: required("POC_AUTH_SECRET"),
  database: new pg.Pool({ connectionString: required("POC_AUTH_DB") }),
  trustedOrigins: ["http://localhost:3200"],
  emailAndPassword: {
    enabled: true,
    // O EDUCA é só por convite: cadastro público desligado.
    disableSignUp: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 900,
    revokeSessionsOnPasswordReset: true,
    // "Caixa de saída" local: o link de redefinição vai para um arquivo,
    // como o Mailpit da réplica. Em produção seria o SMTP próprio.
    sendResetPassword: async ({ user, url, token }) => {
      fs.appendFileSync(required("POC_OUTBOX"), JSON.stringify({ to: user.email, url, token, at: Date.now() }) + "\n");
    },
    // Primeiro acesso = redefinição pelo link enviado ao e-mail: concluí-la
    // prova a posse da caixa, então o e-mail passa a confirmado. (No Neon
    // gerenciado este gancho não existe — ver docs, ponto a validar.)
    onPasswordReset: async ({ user }) => {
      const ctx = await auth.$context;
      await ctx.internalAdapter.updateUser(user.id, { emailVerified: true });
    },
  },
  plugins: [
    jwt({
      jwt: {
        issuer: ISSUER,
        audience: AUDIENCE,
        expirationTime: "5m",
        definePayload: ({ user }) => ({ email: user.email, emailVerified: user.emailVerified }),
      },
    }),
    admin(),
  ],
};

export const auth = betterAuth(options);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  http.createServer(toNodeHandler(auth)).listen(PORT, () => console.log(`identidade (Better Auth 1.4.18) em ${ISSUER}`));
}
