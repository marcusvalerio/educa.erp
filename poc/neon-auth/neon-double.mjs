// Dublê LOCAL do Neon Auth para os E2E do app com AUTH_PROVIDER=neon.
//
// Mesmo motor do serviço gerenciado (Better Auth 1.4.18) configurado para
// reproduzir o contrato MEDIDO no Neon real (docs/NEON_AUTH_MIGRATION.md
// §10): base path /neondb/auth, JWKS em /.well-known/jwks.json, JWT EdDSA
// de 15 min com iss = aud = origem, claims do Neon (email, emailVerified,
// role "authenticated", banned…), cookie "neon-auth.session_token",
// cadastro público fechado, link de redefinição de 1 h, e — como no Neon —
// a redefinição NÃO confirma o e-mail nem revoga sessões (o app compensa).
//
// Não substitui a validação no Neon real; serve para exercitar o app
// inteiro (navegador → servidor → Neon Auth → ponte → PostgREST → RLS)
// sem rede externa. E-mails vão para o Mailpit da réplica.
//
//   POC_AUTH_SECRET=… NEON_DOUBLE_DB=postgres://…/neon_double?options=-c%20search_path%3Dpublic \
//   NEON_AUTH_SERVICE_EMAIL=… NEON_AUTH_SERVICE_PASSWORD=… node neon-double.mjs
import http from "node:http";
import pg from "pg";
import { betterAuth } from "better-auth";
import { jwt, admin } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { getMigrations } from "better-auth/db";

const PORT = Number(process.env.NEON_DOUBLE_PORT ?? 3401);
const ORIGIN = `http://localhost:${PORT}`;
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:58025";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name}.`);
  return value;
}

async function sendMail(to, subject, url) {
  const res = await fetch(`${MAILPIT}/api/v1/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      From: { Email: "auth@mail.myneon.app", Name: "Neon Auth (dublê)" },
      To: [{ Email: to }],
      Subject: subject,
      HTML: `<p>${subject}</p><p><a href="${url}">Continuar</a></p>`,
      Text: `${subject}\n${url}`,
    }),
  });
  if (!res.ok) throw new Error(`Mailpit recusou o e-mail (${res.status}).`);
}

export const options = {
  baseURL: ORIGIN,
  basePath: "/neondb/auth",
  secret: required("POC_AUTH_SECRET"),
  database: new pg.Pool({ connectionString: required("NEON_DOUBLE_DB") }),
  trustedOrigins: (process.env.NEON_DOUBLE_TRUSTED ?? "http://localhost:3200").split(","),
  advanced: { cookiePrefix: "neon-auth" },
  rateLimit: { enabled: false },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: false,
    sendResetPassword: async ({ user, url }) => sendMail(user.email, "Redefinir senha", url),
  },
  plugins: [
    jwt({
      jwks: { jwksPath: "/.well-known/jwks.json" },
      jwt: {
        issuer: ORIGIN,
        audience: ORIGIN,
        expirationTime: "15m",
        definePayload: ({ user }) => ({
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          role: "authenticated",
          banned: user.banned ?? false,
          banReason: user.banReason ?? null,
          banExpires: user.banExpires ?? null,
          id: user.id,
        }),
      },
    }),
    admin(),
  ],
};

export const auth = betterAuth(options);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  // Conta de serviço do EDUCA (papel admin), como no projeto Neon de teste.
  const ctx = await auth.$context;
  const email = required("NEON_AUTH_SERVICE_EMAIL");
  if (!(await ctx.internalAdapter.findUserByEmail(email))) {
    await auth.api.createUser({ body: { email, password: required("NEON_AUTH_SERVICE_PASSWORD"), name: "Serviço EDUCA", role: "admin" } });
  }
  http.createServer(toNodeHandler(auth)).listen(PORT, () => console.log(`dublê do Neon Auth em ${ORIGIN}/neondb/auth`));
}
