// POC do Plano A — Neon Auth (Better Auth 1.4.18 local) → ponte → Postgres
// do Supabase com RLS/RBAC intactos. Usa o MÓDULO REAL da ponte
// (src/lib/auth/neon-bridge.ts) e a réplica local do banco de produção.
//
// Pré-requisitos (ver README.md): réplica no ar (Postgres 54322, PostgREST
// 53000), `node auth-server.mjs` no ar (3400) e as variáveis POC_* e REPLICA_*.
// Rodar da raiz do repositório:  node --import tsx poc/neon-auth/run-poc.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRemoteJWKSet, SignJWT, generateKeyPair, decodeJwt } from "jose";
import { auth, ISSUER, AUDIENCE } from "./auth-server.mjs";
import { bridgeIdentity, mintDatabaseToken, verifyProviderToken } from "../../src/lib/auth/neon-bridge.ts";

const env = (n) => {
  if (!process.env[n]) throw new Error(`Defina ${n}.`);
  return process.env[n];
};
const REST = "http://localhost:53000";
const ORIGIN = "http://localhost:3200";
const SERVICE_KEY = env("REPLICA_SERVICE_KEY");
const DB_SECRET = new TextEncoder().encode(env("REPLICA_JWT_SECRET"));
const OUTBOX = env("POC_OUTBOX");
const PG = ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { env: { ...process.env, PGPASSWORD: env("REPLICA_PGPASS") } }).toString().trim();
const sqlFile = (f) => execFileSync("psql", [...PG, "-f", f], { env: { ...process.env, PGPASSWORD: env("REPLICA_PGPASS") } }).toString();

const results = [];
function check(area, name, ok, detail = "") {
  results.push({ area, name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${name}${ok || !detail ? "" : " — " + String(detail).slice(0, 220)}`);
}

// ------------------------------------------------------------ PostgREST
async function rest(path, { token, method = "GET", body, prefer } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (prefer) headers.prefer = prefer;
  const res = await fetch(`${REST}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const rpc = (fn, args, token) => rest(`/rpc/${fn}`, { method: "POST", body: args, token });

// ------------------------------------------------------------ identidade (Better Auth)
async function authFetch(path, { method = "GET", body, cookie } = {}) {
  const headers = { origin: ORIGIN };
  if (body) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${ISSUER}/api/auth${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  return { status: res.status, data, cookie: cookies, location: res.headers.get("location") };
}
async function signIn(email, password) {
  const r = await authFetch("/sign-in/email", { method: "POST", body: { email, password } });
  return r.status === 200 ? r.cookie : null;
}
async function providerToken(cookie) {
  const r = await authFetch("/token", { cookie });
  return r.status === 200 ? r.data.token : null;
}
function lastMail(to) {
  const lines = fs.readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return lines.filter((m) => m.to === to).at(-1);
}

// ------------------------------------------------------------ ponte (código real)
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/api/auth/jwks`));
const verify = (t) => verifyProviderToken(t, { jwks, issuer: ISSUER, audience: AUDIENCE });
async function resolveLink(externalUserId) {
  // Único uso de service_role na ponte: ler o vínculo (função restrita).
  const r = await rest("/rpc/fn_resolve_identity_link", { method: "POST", token: SERVICE_KEY, body: { p_provider: "neon", p_external_user_id: externalUserId } });
  return r.status === 200 && typeof r.data === "string" ? r.data : null;
}
const mint = (authUserId) => mintDatabaseToken({ authUserId, secret: DB_SECRET, ttlSeconds: 300 });
const bridge = (t) => bridgeIdentity(t, { verify, resolveLink, mint });
async function bridgeError(t) {
  try { await bridge(t); return null; } catch (e) { return e.code ?? e.message; }
}

// ============================================================ 0. preparação
sqlFile(new URL("../../supabase/migrations/0073_external_identity_links.sql", import.meta.url).pathname);
check("banco", "0073 aplicada na RÉPLICA (idempotente, só local)", sql("select to_regclass('public.auth_identity_links') is not null") === "t");

const PEOPLE = [
  { key: "OWNER", email: "owner.poc@neon-poc.test", name: "Owner POC" },
  { key: "A1", email: "a1.admin@empresa-a.test", name: "A1 Admin", company: "A", role: "admin" },
  { key: "A2", email: "a2.leitura@empresa-a.test", name: "A2 Leitura", company: "A", role: "leitura" },
  { key: "B1", email: "b1.admin@empresa-b.test", name: "B1 Admin", company: "B", role: "admin" },
  { key: "B2", email: "b2.operador@empresa-b.test", name: "B2 Operador", company: "B", role: "operador" },
];
// Fixtures SÓ na réplica: limpa rodada anterior e recria.
sql(`delete from public.auth_identity_links where email like '%neon-poc.test' or email like '%empresa-a.test' or email like '%empresa-b.test'`);
sql(`delete from public.platform_members where email = 'owner.poc@neon-poc.test'`);
sql(`delete from public.companies where name in ('POC Empresa A', 'POC Empresa B')`);
sql(`delete from auth.users where email like '%neon-poc.test' or email like '%empresa-a.test' or email like '%empresa-b.test'`);
sql(`insert into public.companies (name, status) values ('POC Empresa A', 'active'), ('POC Empresa B', 'active')`);
const company = { A: sql(`select id from public.companies where name='POC Empresa A'`), B: sql(`select id from public.companies where name='POC Empresa B'`) };
for (const p of PEOPLE) {
  // Login "sombra" em auth.users: guarda o UUID que users/platform_members já
  // referenciam. Não tem senha — o login real é o do Neon Auth.
  p.authUserId = sql(`insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${p.email}', now(), now(), now(), '{"provider":"neon"}', '{}') returning id`).split("\n")[0];
  if (p.company) {
    p.appUserId = sql(`begin; select set_config('educa.auth_link','invitation',true); insert into public.users (company_id, name, email, login, auth_user_id, status)
      values ('${company[p.company]}', '${p.name}', '${p.email}', '${p.key.toLowerCase()}', '${p.authUserId}', 'active') returning id; commit;`).split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l));
    sql(`insert into public.user_roles (user_id, role_id) select '${p.appUserId}', id from public.roles where company_id='${company[p.company]}' and code='${p.role}'`);
  } else {
    sql(`insert into public.platform_members (auth_user_id, name, email, platform_role, status) values ('${p.authUserId}', '${p.name}', '${p.email}', 'OWNER', 'active')`);
  }
}
sql(`insert into public.departments (company_id, code, name) values ('${company.A}', 'DEP-A', 'Depto A'), ('${company.B}', 'DEP-B', 'Depto B')`);
sql(`insert into public.branches (company_id, code, name) values ('${company.A}', 'FIL-A', 'Filial A'), ('${company.B}', 'FIL-B', 'Filial B')`);
const P = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));

// ============================================================ 1. convite → primeiro acesso → senha
// Conta criada no servidor com senha aleatória que ninguém conhece; o
// link de redefinição enviado ao e-mail é o "crie sua senha".
const ctx = await auth.$context;
for (const p of PEOPLE) {
  const existing = await ctx.internalAdapter.findUserByEmail(p.email);
  if (existing) await ctx.internalAdapter.deleteUser(existing.user.id);
  const created = await auth.api.createUser({ body: { email: p.email, password: crypto.randomBytes(24).toString("base64url"), name: p.name, role: "user" } });
  p.neonId = created.user.id;
}
check("primeiro acesso", "contas criadas pelo servidor (cadastro público desligado)", PEOPLE.every((p) => p.neonId));
const signup = await authFetch("/sign-up/email", { method: "POST", body: { email: "intruso@poc.test", password: "Qualquer#123", name: "X" } });
check("primeiro acesso", "cadastro público recusado", signup.status >= 400 && /SIGN_UP_IS_NOT_ENABLED/.test(JSON.stringify(signup.data)), JSON.stringify(signup.data));

{
  // Antes de concluir o primeiro acesso: e-mail não confirmado → a ponte recusa.
  await ctx.internalAdapter.updateUser(P.A1.neonId, {});
  const tmpPwd = "Temporaria#123";
  const hashed = await ctx.password.hash(tmpPwd);
  await ctx.internalAdapter.updatePassword(P.A1.neonId, hashed);
  const c = await signIn(P.A1.email, tmpPwd);
  const t = await providerToken(c);
  check("primeiro acesso", "conta sem e-mail confirmado não obtém identidade no banco", (await bridgeError(t)) === "EMAIL_NOT_VERIFIED");
}

for (const p of PEOPLE) {
  p.password = `Educa#${p.key}#2026x`;
  const req = await authFetch("/request-password-reset", { method: "POST", body: { email: p.email, redirectTo: `${ORIGIN}/redefinir-senha` } });
  const mail = lastMail(p.email);
  const done = await authFetch("/reset-password", { method: "POST", body: { newPassword: p.password, token: mail?.token } });
  p.firstAccessOk = req.status === 200 && !!mail && done.status === 200;
}
check("primeiro acesso", "link por e-mail → senha criada, para as 5 contas", PEOPLE.every((p) => p.firstAccessOk));
check("primeiro acesso", "concluir o link confirma o e-mail", (await ctx.internalAdapter.findUserById(P.A1.neonId))?.emailVerified === true);

// ------------------------------------------------------------ vínculo (feito no aceite, pelo servidor)
for (const p of PEOPLE) {
  const r = await rest("/rpc/fn_link_identity", { method: "POST", token: SERVICE_KEY, body: { p_provider: "neon", p_external_user_id: p.neonId, p_email: p.email, p_auth_user_id: p.authUserId } });
  p.linked = r.status === 200 || r.status === 204;
}
check("vínculo", "5 identidades vinculadas ao auth_user_id existente", PEOPLE.every((p) => p.linked));
{
  const wrong = await rest("/rpc/fn_link_identity", { method: "POST", token: SERVICE_KEY, body: { p_provider: "neon", p_external_user_id: "outra-identidade", p_email: P.B1.email, p_auth_user_id: P.A1.authUserId } });
  check("vínculo", "vínculo com e-mail diferente do login é recusado", wrong.status >= 400, JSON.stringify(wrong.data));
  const steal = await rest("/rpc/fn_link_identity", { method: "POST", token: SERVICE_KEY, body: { p_provider: "neon", p_external_user_id: P.A1.neonId, p_email: P.B1.email, p_auth_user_id: P.B1.authUserId } });
  check("vínculo", "identidade já vinculada não pode apontar para outro login", steal.status >= 400, JSON.stringify(steal.data));
  const asUser = await rest("/rpc/fn_link_identity", { method: "POST", body: { p_provider: "neon", p_external_user_id: "x", p_email: P.A1.email, p_auth_user_id: P.A1.authUserId } });
  const readAnon = await rest("/auth_identity_links?select=*");
  check("vínculo", "anon não cria vínculo nem lê a tabela", asUser.status >= 400 && readAnon.status >= 400, `${asUser.status}/${readAnon.status}`);
}

// ============================================================ 2. login → sessão → identidade no banco
for (const p of PEOPLE) {
  p.cookie = await signIn(p.email, p.password);
  p.providerToken = p.cookie ? await providerToken(p.cookie) : null;
  const b = p.providerToken ? await bridge(p.providerToken) : null;
  p.db = b?.dbToken;
  p.bridgedAuthUserId = b?.authUserId;
}
check("login", "5 logins com a senha criada", PEOPLE.every((p) => p.cookie && p.providerToken));
check("identidade", "ponte resolve cada identidade para o auth_user_id certo", PEOPLE.every((p) => p.bridgedAuthUserId === p.authUserId));
{
  const claims = decodeJwt(P.A1.db);
  check("identidade", "token do banco: sub=auth_user_id, role=authenticated, validade ≤ 300 s", claims.sub === P.A1.authUserId && claims.role === "authenticated" && claims.exp - claims.iat <= 300);
}
for (const k of ["A1", "A2", "B1", "B2"]) {
  const r = await rpc("current_app_user_id", {}, P[k].db);
  P[k].seenAs = r.data;
}
check("identidade", "current_app_user_id() distingue A1, A2, B1 e B2", ["A1", "A2", "B1", "B2"].every((k) => P[k].seenAs === P[k].appUserId), JSON.stringify(["A1", "A2", "B1", "B2"].map((k) => [P[k].seenAs, P[k].appUserId])));
{
  const ctxA1 = await rpc("fn_user_context", { p_company_id: company.A }, P.A1.db);
  check("identidade", "fn_user_context devolve a empresa e o papel de A1", ctxA1.status === 200 && JSON.stringify(ctxA1.data).includes(company.A), JSON.stringify(ctxA1.data).slice(0, 200));
  const owner = await rpc("has_platform_permission", { p_code: "platform.companies.create" }, P.OWNER.db);
  const notOwner = await rpc("has_platform_permission", { p_code: "platform.companies.create" }, P.A1.db);
  check("plataforma", "Owner tem permissão de plataforma; Company Admin não", owner.data === true && notOwner.data === false);
  const create = await rpc("fn_platform_create_company", { p_name: "Tentativa A1" }, P.A1.db);
  check("plataforma", "Company Admin não cria empresa (42501)", create.status >= 400 && /42501|Permissão/.test(JSON.stringify(create.data)), JSON.stringify(create.data));
}

// ============================================================ 3. multi-tenancy (RLS)
{
  const users = await rest("/users?select=company_id", { token: P.A1.db });
  check("tenant", "SELECT users: A1 vê só a Empresa A", users.status === 200 && users.data.length >= 2 && users.data.every((u) => u.company_id === company.A), JSON.stringify(users.data).slice(0, 200));
  const usersB = await rest("/users?select=company_id", { token: P.B1.db });
  check("tenant", "SELECT users: B1 vê só a Empresa B", usersB.status === 200 && usersB.data.length >= 2 && usersB.data.every((u) => u.company_id === company.B));
  const crossRead = await rest(`/departments?company_id=eq.${company.B}&select=id`, { token: P.A1.db });
  check("tenant", "SELECT departments da Empresa B por A1 → vazio", crossRead.status === 200 && crossRead.data.length === 0);
  const own = await rest(`/departments?company_id=eq.${company.A}&select=id`, { token: P.A1.db });
  check("tenant", "SELECT departments da própria empresa → visível", own.status === 200 && own.data.length === 1);
  const insB = await rest("/departments", { method: "POST", token: P.A1.db, body: { company_id: company.B, code: "HACK", name: "Invasão" } });
  check("tenant", "INSERT na Empresa B por A1 → recusado pela RLS", insB.status === 403 || insB.status === 401 || /42501|row-level/.test(JSON.stringify(insB.data)), `${insB.status} ${JSON.stringify(insB.data)}`);
  const insA = await rest("/departments", { method: "POST", token: P.A1.db, prefer: "return=representation", body: { company_id: company.A, code: "OK-A", name: "Novo A" } });
  check("tenant", "INSERT na própria empresa por A1 (admin) → aceito", insA.status === 201);
  const updB = await rest(`/departments?company_id=eq.${company.B}`, { method: "PATCH", token: P.A1.db, prefer: "return=representation", body: { name: "Alterado por A" } });
  check("tenant", "UPDATE na Empresa B por A1 → 0 linhas", updB.status === 200 && updB.data.length === 0, JSON.stringify(updB.data));
  const delB = await rest(`/branches?company_id=eq.${company.B}`, { method: "DELETE", token: P.A1.db, prefer: "return=representation" });
  check("tenant", "DELETE na Empresa B por A1 → 0 linhas", delB.status === 200 && delB.data.length === 0, JSON.stringify(delB.data));
  const stillB = sql(`select count(*) from public.branches where company_id='${company.B}'`);
  check("tenant", "Filial da Empresa B continua existindo (conferido no banco)", stillB === "1");
  const permB = await rpc("has_permission", { p_company_id: company.B, p_code: "users.read" }, P.A1.db);
  check("tenant", "has_permission(Empresa B) para A1 → false", permB.data === false);
  const invB = await rpc("fn_create_user_invitation", { p_user_id: P.B2.appUserId }, P.A1.db);
  check("tenant", "A1 não convida usuário da Empresa B", invB.status >= 400);
  const idor = await rest(`/users?id=eq.${P.B2.appUserId}&select=id,email`, { token: P.A1.db });
  check("tenant", "IDOR: A1 busca usuário de B pelo id → vazio", idor.status === 200 && idor.data.length === 0);
}

// ============================================================ 4. RBAC e escalada
{
  const ins = await rest("/departments", { method: "POST", token: P.A2.db, body: { company_id: company.A, code: "LEIT", name: "Leitura tenta" } });
  check("rbac", "A2 (leitura) não cria departamento", ins.status >= 400, `${ins.status}`);
  const adminRoleA = sql(`select id from public.roles where company_id='${company.A}' and code='admin'`);
  const esc = await rpc("fn_assign_user_role", { p_user_id: P.A2.appUserId, p_role_id: adminRoleA }, P.A2.db);
  check("rbac", "A2 não se promove a admin via fn_assign_user_role", esc.status >= 400, JSON.stringify(esc.data));
  const adminRoleB = sql(`select id from public.roles where company_id='${company.B}' and code='admin'`);
  const esc2 = await rpc("fn_assign_user_role", { p_user_id: P.B2.appUserId, p_role_id: adminRoleB }, P.B2.db);
  check("rbac", "B2 (operador, com users.update) não se promove a admin", esc2.status >= 400, JSON.stringify(esc2.data));
  const direct = await rest("/user_roles", { method: "POST", token: P.B2.db, body: { user_id: P.B2.appUserId, role_id: adminRoleB } });
  check("rbac", "B2 não insere papel direto em user_roles", direct.status >= 400, `${direct.status}`);
  const hijack = await rest(`/users?id=eq.${P.A2.appUserId}`, { method: "PATCH", token: P.A1.db, body: { auth_user_id: P.B1.authUserId } });
  check("rbac", "A1 (admin) não troca auth_user_id de A2 (gatilho 0072)", hijack.status >= 400 && /42501|convite/.test(JSON.stringify(hijack.data)), `${hijack.status} ${JSON.stringify(hijack.data)}`);
  const still = sql(`select auth_user_id from public.users where id='${P.A2.appUserId}'`);
  check("rbac", "auth_user_id de A2 inalterado no banco", still === P.A2.authUserId);
  const ok = await rpc("fn_assign_user_role", { p_user_id: P.A2.appUserId, p_role_id: sql(`select id from public.roles where company_id='${company.A}' and code='leitura'`) }, P.A1.db);
  check("rbac", "A1 (admin, roles.manage) gerencia papéis da própria empresa", ok.status < 300, JSON.stringify(ok.data));
}

// ============================================================ 5. segurança da ponte
{
  const { privateKey } = await generateKeyPair("EdDSA");
  const kid = (await (await fetch(`${ISSUER}/api/auth/jwks`)).json()).keys[0].kid;
  const forged = await new SignJWT({ email: P.B1.email, emailVerified: true }).setProtectedHeader({ alg: "EdDSA", kid }).setSubject(P.B1.neonId)
    .setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  check("ponte", "token forjado com outra chave (mesmo kid) → recusado", (await bridgeError(forged)) === "INVALID_TOKEN");
  const [h, , s] = P.A1.providerToken.split(".");
  const tampered = [h, Buffer.from(JSON.stringify({ ...decodeJwt(P.A1.providerToken), sub: P.B1.neonId })).toString("base64url"), s].join(".");
  check("ponte", "payload adulterado (sub de B1) → recusado", (await bridgeError(tampered)) === "INVALID_TOKEN");
  const none = [Buffer.from('{"alg":"none"}').toString("base64url"), tampered.split(".")[1], ""].join(".");
  check("ponte", "alg=none → recusado", (await bridgeError(none)) === "INVALID_TOKEN");
  check("ponte", "lixo / vazio → recusado", (await bridgeError("abc.def.ghi")) === "INVALID_TOKEN" && (await bridgeError("")) === "INVALID_TOKEN");

  const forgedDb = await new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(P.B1.authUserId).setAudience("authenticated")
    .setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("segredo-inventado-pelo-cliente-0123456789"));
  const r = await rest("/users?select=id", { token: forgedDb });
  check("ponte", "token do banco forjado pelo cliente (outro segredo) → 401 no PostgREST", r.status === 401, `${r.status}`);
  const expired = await mintDatabaseToken({ authUserId: P.A1.authUserId, secret: DB_SECRET, ttlSeconds: 30, now: Math.floor(Date.now() / 1000) - 3600 });
  const r2 = await rest("/users?select=id", { token: expired });
  check("ponte", "token do banco expirado → 401", r2.status === 401, `${r2.status}`);
  const anon = await rest("/users?select=id");
  check("ponte", "sem token (anon) → nenhum dado", anon.status >= 400 || (Array.isArray(anon.data) && anon.data.length === 0), `${anon.status}`);

  // Conta verificada no provedor, mas sem vínculo no EDUCA.
  const loose = await auth.api.createUser({ body: { email: "solto@neon-poc.test", password: "Solta#2026xx", name: "Solto", role: "user", data: { emailVerified: true } } }).catch(async () => ({ user: (await ctx.internalAdapter.findUserByEmail("solto@neon-poc.test")).user }));
  await ctx.internalAdapter.updateUser(loose.user.id, { emailVerified: true });
  const lt = await providerToken(await signIn("solto@neon-poc.test", "Solta#2026xx"));
  check("ponte", "identidade válida sem vínculo no EDUCA → UNLINKED (sem acesso)", (await bridgeError(lt)) === "UNLINKED");
}

// ============================================================ 6. desativação
{
  sql(`update public.users set status='inactive' where id='${P.A2.appUserId}'`);
  const again = await bridge(await providerToken(P.A2.cookie));
  const who = await rpc("current_app_user_id", {}, again.dbToken);
  const users = await rest("/users?select=id", { token: again.dbToken });
  const deps = await rest(`/departments?company_id=eq.${company.A}&select=id`, { token: again.dbToken });
  const perm = await rpc("has_permission", { p_company_id: company.A, p_code: "users.read" }, again.dbToken);
  // users_select libera a PRÓPRIA linha por desenho (é como /api/session/context
  // descobre "Conta desativada") — mesmo comportamento com o Supabase Auth.
  check("desativação", "cadastro inativo: current_app_user_id() nulo, só a própria linha, nenhum dado da empresa, nenhuma permissão",
    who.data === null && users.status === 200 && users.data.length === 1 && users.data[0].id === P.A2.appUserId && deps.data.length === 0 && perm.data === false,
    `${JSON.stringify(who.data)} ${JSON.stringify(users.data)} ${JSON.stringify(deps.data)} ${JSON.stringify(perm.data)}`);
  sql(`update public.users set status='active' where id='${P.A2.appUserId}'`);
}

// ============================================================ 7. recuperação de senha
{
  const before = P.B2.cookie;
  const bad = await authFetch("/reset-password", { method: "POST", body: { newPassword: "Nova#Senha2026", token: "token-invalido" } });
  check("recuperação", "token inválido → recusado", bad.status >= 400);
  await authFetch("/request-password-reset", { method: "POST", body: { email: P.B2.email, redirectTo: `${ORIGIN}/redefinir-senha` } });
  const mail = lastMail(P.B2.email);
  const open = await authFetch(`/reset-password/${mail.token}?callbackURL=${encodeURIComponent(`${ORIGIN}/redefinir-senha`)}`);
  check("recuperação", "link do e-mail redireciona só para origem confiável", open.status === 302 && open.location?.startsWith(`${ORIGIN}/redefinir-senha`), `${open.status} ${open.location}`);
  const evil = await authFetch(`/reset-password/${mail.token}?callbackURL=${encodeURIComponent("https://site-malicioso.com")}`);
  check("recuperação", "callbackURL externo (open redirect) → recusado", evil.status === 403 || (evil.status >= 400 && evil.status < 500), `${evil.status} ${evil.location}`);
  const done = await authFetch("/reset-password", { method: "POST", body: { newPassword: "B2#NovaSenha2026", token: mail.token } });
  check("recuperação", "nova senha gravada", done.status === 200);
  const reuse = await authFetch("/reset-password", { method: "POST", body: { newPassword: "B2#Outra2026x", token: mail.token } });
  check("recuperação", "mesmo link não funciona duas vezes", reuse.status >= 400);
  check("recuperação", "senha antiga não entra; nova entra", !(await signIn(P.B2.email, P.B2.password)) && !!(await signIn(P.B2.email, "B2#NovaSenha2026")));
  check("recuperação", "sessão anterior revogada após a troca", (await providerToken(before)) === null);
  const unknown = await authFetch("/request-password-reset", { method: "POST", body: { email: "ninguem@nada.test", redirectTo: `${ORIGIN}/redefinir-senha` } });
  const known = await authFetch("/request-password-reset", { method: "POST", body: { email: P.A1.email, redirectTo: `${ORIGIN}/redefinir-senha` } });
  check("recuperação", "mesma resposta para e-mail existente e inexistente (sem enumeração)", unknown.status === known.status && JSON.stringify(unknown.data) === JSON.stringify(known.data), `${JSON.stringify(unknown.data)} vs ${JSON.stringify(known.data)}`);
}

// ============================================================ 8. login / logout
{
  const wrong = await authFetch("/sign-in/email", { method: "POST", body: { email: P.A1.email, password: "senha-errada-123" } });
  const nobody = await authFetch("/sign-in/email", { method: "POST", body: { email: "nao.existe@poc.test", password: "senha-errada-123" } });
  check("login", "senha errada e usuário inexistente → mesma resposta 401", wrong.status === 401 && nobody.status === 401 && JSON.stringify(wrong.data) === JSON.stringify(nobody.data));
  const out = await authFetch("/sign-out", { method: "POST", cookie: P.A1.cookie, body: {} });
  check("logout", "logout encerra a sessão no provedor", out.status === 200 && (await providerToken(P.A1.cookie)) === null);
  const stillValid = await rpc("current_app_user_id", {}, P.A1.db);
  check("logout", "token do banco já emitido vale até expirar (≤ 300 s) — janela residual documentada", stillValid.data === P.A1.appUserId);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
