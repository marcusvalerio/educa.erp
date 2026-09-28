// Prepara as contas do E2E de homologação SEM trabalho manual e SEM segredo
// em disco/log. Usa a conta de serviço do Neon Auth (papel admin) e as rotas
// do próprio app publicado. Depois roda o e2e-homolog.mjs com as credenciais
// só em memória (variáveis do processo filho).
//
//   APP=https://<preview> NEON_AUTH_BASE_URL=https://…/authdb/auth \
//   NEON_AUTH_SERVICE_EMAIL=… NEON_AUTH_SERVICE_PASSWORD=… \
//   [VERCEL_BYPASS_TOKEN=…] [E2E_OWNER_PASSWORD=…] \
//   node poc/neon-full/homolog/bootstrap-homolog.mjs --run-e2e
//
// O que faz (idempotente — pode rodar a cada execução):
//   1. Owner da plataforma (o que já existe; nunca cria outro): se
//      E2E_OWNER_PASSWORD não vier, recebe uma senha aleatória desta execução
//      (o dono volta a entrar pelo "Esqueci a senha"); e-mail confirmado.
//   2. Admin A (empresa A = COMPANY_A_ID, a ASTRA na homologação), leitura A
//      e admin B (empresa "Beta Homologação E2E", criada só se o admin B ainda
//      não funcionar). Contas @example.com, criadas pelo fluxo OFICIAL de
//      convite do app (vínculo 0073 + aceite); a senha é definida pela API
//      admin do Neon Auth (a conta nasce no Neon com senha e e-mail confirmado —
//      a caixa não existe — e o convite do app só a vincula).
//   3. Nenhuma senha é impressa. Saída: só o estado de cada conta.
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const need = (n) => {
  if (!process.env[n]) throw new Error(`Defina ${n}.`);
  return process.env[n];
};
const APP = need("APP").replace(/\/+$/, "");
const NEON = need("NEON_AUTH_BASE_URL").replace(/\/+$/, "");
const SVC = [need("NEON_AUTH_SERVICE_EMAIL"), need("NEON_AUTH_SERVICE_PASSWORD")];
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "contatomarcusjr@gmail.com").toLowerCase();
// Empresa A: por padrão a ASTRA da homologação (a plataforma só convida o PRIMEIRO
// admin de uma empresa — a ASTRA não tem nenhum com acesso). COMPANY_A_ID="" cria
// uma empresa própria do E2E ("Alfa Homologação E2E").
const COMPANY_A_ID = process.env.COMPANY_A_ID ?? "00000000-0000-0000-0000-000000000001";
const COMPANY_A_NAME = process.env.COMPANY_A_NAME ?? "Alfa Homologação E2E";
const COMPANY_B_NAME = process.env.COMPANY_B_NAME ?? "Beta Homologação E2E";
const ACCOUNTS = {
  adminA: process.env.E2E_ADMIN_A_EMAIL ?? "e2e.admin.a@example.com",
  readerA: process.env.E2E_READER_A_EMAIL ?? "e2e.leitura.a@example.com",
  adminB: process.env.E2E_ADMIN_B_EMAIL ?? "e2e.admin.b@example.com",
};
const BYPASS = process.env.VERCEL_BYPASS_TOKEN ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_TOKEN } : {};
const pw = () => `${crypto.randomBytes(15).toString("base64url")}#Aa1`;
const log = (s) => console.log(`bootstrap: ${s}`);

const cookieOf = (res, suffix) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.split("=")[0].endsWith(suffix) && c.split("=")[1]);

// ------------------------------------------------------------ Neon Auth (admin)
async function neon(path, { body, cookie, query } = {}) {
  const url = new URL(`${NEON}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: APP, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, res };
}
const svcLogin = await neon("/sign-in/email", { body: { email: SVC[0], password: SVC[1] } });
const admin = cookieOf(svcLogin.res, ".session_token");
if (svcLogin.status !== 200 || !admin) throw new Error(`conta de serviço não entrou no Neon Auth (${svcLogin.status})`);
async function neonUser(email) {
  const r = await neon("/admin/list-users", { cookie: admin, query: { filterField: "email", filterValue: email, filterOperator: "eq", limit: "2" } });
  if (r.status !== 200) throw new Error(`admin/list-users → ${r.status}`);
  return (r.json?.users ?? []).find((u) => String(u.email).toLowerCase() === email) ?? null;
}
async function setPassword(userId, password) {
  const a = await neon("/admin/set-user-password", { cookie: admin, body: { userId, newPassword: password } });
  const b = await neon("/admin/update-user", { cookie: admin, body: { userId, data: { emailVerified: true } } });
  if (a.status !== 200 || b.status !== 200) throw new Error(`admin set-password/update-user → ${a.status}/${b.status}`);
}

// ------------------------------------------------------------ app publicado
async function app(path, { body, cookie, method } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { origin: APP, accept: "application/json", "content-type": "application/json", ...BYPASS, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, res };
}
async function appLogin(email, password) {
  const r = await app("/api/auth/sign-in", { body: { email, password } });
  const cookie = cookieOf(r.res, "educa_session") ?? (r.res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("educa_session="));
  if (r.status === 200 && cookie) return cookie;
  lastLoginError = `${r.status} ${r.json?.error?.code ?? ""}`;
  return null;
}
let lastLoginError = "";
const context = async (cookie) => (await app("/api/session/context", { cookie })).json?.data ?? null;
const tokenOf = (inviteUrl) => String(inviteUrl ?? "").split("/convite/")[1]?.split(/[?#]/)[0];

/** Conta que já funciona (entra e está na empresa esperada com o papel esperado)? */
async function ready(email, password, companyId, roleCode) {
  const user = await neonUser(email);
  if (!user) return null;
  await setPassword(user.id, password);
  const cookie = await appLogin(email, password);
  if (!cookie) return null;
  const ctx = await context(cookie);
  const t = ctx?.tenant;
  if (!t || (companyId && t.company?.id !== companyId) || !t.roles?.some((r) => r.code === roleCode)) return null;
  return { cookie, companyId: t.company.id };
}
/** Conta de teste nova: nasce no Neon COM senha e e-mail confirmado; o convite oficial
 *  do app reaproveita a identidade (provisionIdentity → "existing_account") e a vincula. */
async function ensureNeonUser(email, name, password) {
  const found = await neonUser(email);
  if (found) return found;
  const r = await neon("/admin/create-user", { cookie: admin, body: { email, name, password, role: "user", data: { emailVerified: true } } });
  if (r.status !== 200) throw new Error(`admin/create-user ${email} → ${r.status}`);
  return r.json?.user ?? (await neonUser(email));
}
/** Convite já emitido → senha pela API admin → login → aceite pelo app. */
async function acceptInvite(email, password, inviteUrl) {
  const token = tokenOf(inviteUrl);
  const user = await neonUser(email);
  if (!token || !user) throw new Error(`convite sem token ou sem identidade no Neon para ${email}`);
  await setPassword(user.id, password);
  const cookie = await appLogin(email, password);
  if (!cookie) throw new Error(`login após o convite falhou para ${email}: ${lastLoginError}`);
  const acc = await app("/api/onboarding/invitations/accept", { body: { token }, cookie });
  if (acc.status >= 400) throw new Error(`aceite do convite → ${acc.status} ${JSON.stringify(acc.json)?.slice(0, 160)}`);
  return cookie;
}

const env = {};
// 1. Owner (existente)
const owner = await neonUser(OWNER_EMAIL);
if (!owner) throw new Error(`Owner ${OWNER_EMAIL} não existe no Neon Auth desta homologação (não é criado aqui)`);
const ownerPw = process.env.E2E_OWNER_PASSWORD ?? pw();
if (!process.env.E2E_OWNER_PASSWORD) await setPassword(owner.id, ownerPw);
const ownerCookie = await appLogin(OWNER_EMAIL, ownerPw);
const ownerCtx = ownerCookie ? await context(ownerCookie) : null;
if (ownerCtx?.platform?.role !== "OWNER") throw new Error("Owner não entrou no app publicado como OWNER");
Object.assign(env, { E2E_OWNER_EMAIL: OWNER_EMAIL, E2E_OWNER_PASSWORD: ownerPw });
log("Owner: entra como OWNER");

// 2. Admin A (empresa A)
async function companyAdmin(email, password, companyId, companyName, label) {
  let x = await ready(email, password, companyId || null, "admin");
  if (x && (companyId || x.companyId !== COMPANY_A_ID)) return { ...x, created: false };
  let target = companyId;
  if (!target) {
    const c = await app("/api/platform/companies", { body: { name: companyName, branchCode: "E2E", branchName: `${companyName} Centro` }, cookie: ownerCookie });
    target = c.json?.data?.company_id;
    if (c.status !== 201 || !target) throw new Error(`criar ${companyName} → ${c.status} ${JSON.stringify(c.json)?.slice(0, 200)}`);
  }
  await ensureNeonUser(email, label, password);
  const inv = await app(`/api/platform/companies/${target}/admin-invitation`, { body: { name: label, email }, cookie: ownerCookie });
  if (inv.status !== 201) throw new Error(`convite ${label} → ${inv.status} ${JSON.stringify(inv.json)?.slice(0, 200)}`);
  await acceptInvite(email, password, inv.json.data.inviteUrl);
  x = await ready(email, password, target, "admin");
  if (!x) throw new Error(`${label} não ficou pronto`);
  return { ...x, created: true };
}
const adminApw = pw();
const a = await companyAdmin(ACCOUNTS.adminA, adminApw, COMPANY_A_ID, COMPANY_A_NAME, "Admin A (E2E)");
log(`admin A: ${a.created ? "convidado e aceito" : "já existia"}`);
Object.assign(env, { E2E_ADMIN_A_EMAIL: ACCOUNTS.adminA, E2E_ADMIN_A_PASSWORD: adminApw });

// 3. Leitura A (criado pelo admin A)
const readerPw = pw();
let r = await ready(ACCOUNTS.readerA, readerPw, a.companyId, "leitura");
if (!r) {
  const roles = (await app("/api/roles", { cookie: a.cookie })).json?.data ?? [];
  const leitura = roles.find((x) => x.code === "leitura");
  if (!leitura) throw new Error("papel leitura não encontrado na empresa A");
  const users = (await app("/api/admin/users", { cookie: a.cookie })).json?.data ?? [];
  let userId = users.find((u) => String(u.email).toLowerCase() === ACCOUNTS.readerA)?.id;
  if (!userId) {
    const c = await app("/api/users", { body: { nome: "Leitura A (E2E)", email: ACCOUNTS.readerA, login: "e2e.leitura.a", perfil: "leitura" }, cookie: a.cookie });
    if (c.status !== 201) throw new Error(`criar usuário leitura → ${c.status} ${JSON.stringify(c.json)?.slice(0, 200)}`);
    userId = c.json.data.id;
  }
  await app(`/api/admin/users/${userId}/roles`, { body: { roleId: leitura.id }, cookie: a.cookie });
  await ensureNeonUser(ACCOUNTS.readerA, "Leitura A (E2E)", readerPw);
  const inv = await app(`/api/admin/users/${userId}/invitation`, { body: {}, cookie: a.cookie });
  if (inv.status !== 201) throw new Error(`convite leitura → ${inv.status} ${JSON.stringify(inv.json)?.slice(0, 200)}`);
  await acceptInvite(ACCOUNTS.readerA, readerPw, inv.json.data.inviteUrl);
  r = await ready(ACCOUNTS.readerA, readerPw, a.companyId, "leitura");
  if (!r) throw new Error("leitura A não ficou pronto");
  log("leitura A: criado, convidado e aceito");
} else log("leitura A: já existia");
Object.assign(env, { E2E_READER_A_EMAIL: ACCOUNTS.readerA, E2E_READER_A_PASSWORD: readerPw });

// 4. Admin B (empresa B própria do E2E, criada só se o admin B ainda não funcionar)
const adminBpw = pw();
const b = await companyAdmin(ACCOUNTS.adminB, adminBpw, "", COMPANY_B_NAME, "Admin B (E2E)");
if (b.companyId === a.companyId) throw new Error("admin B caiu na mesma empresa do admin A");
log(`admin B: ${b.created ? "empresa B criada, convite aceito" : "já existia"}`);
Object.assign(env, { E2E_ADMIN_B_EMAIL: ACCOUNTS.adminB, E2E_ADMIN_B_PASSWORD: adminBpw });

// Sessões do bootstrap encerradas (o E2E abre as próprias).
for (const c of [ownerCookie, a.cookie, r.cookie, b.cookie]) await app("/api/auth/logout", { body: {}, cookie: c }).catch(() => undefined);
log("contas prontas (senhas só em memória)");

if (process.argv.includes("--run-e2e")) {
  const run = spawnSync(process.execPath, [new URL("./e2e-homolog.mjs", import.meta.url).pathname], { env: { ...process.env, ...env }, stdio: "inherit" });
  process.exit(run.status ?? 1);
}
