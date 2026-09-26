// Plano A com o Neon Auth REAL: tokens emitidos pelo serviço gerenciado
// (projeto isolado `educa-neon-auth-test`) → ponte REAL (src/lib/auth/neon-bridge.ts,
// sem alteração) → PostgREST + Postgres da réplica local do EDUCA com as
// policies/RLS/RBAC de produção.
//
// Entradas (fora do repositório; nada secreto no código):
//   NEON_REAL_JWKS    arquivo com o JWKS público real (GET <base>/.well-known/jwks.json)
//   NEON_REAL_TOKENS  arquivo JSON { A1, A2, B1, B2, NAO_VERIFICADO } com JWTs reais
//                     (B2 foi emitido ANTES de um logout real no Neon)
//   NEON_REAL_ORIGIN  origem do Neon Auth (iss/aud reais)
//   REPLICA_SERVICE_KEY, REPLICA_JWT_SECRET, REPLICA_PGPASS
// Rodar da raiz: node --import tsx poc/neon-auth-real/run-real.mjs [--so-expiracao]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createLocalJWKSet, SignJWT, generateKeyPair, decodeJwt, decodeProtectedHeader } from "jose";
import { bridgeIdentity, mintDatabaseToken, verifyProviderToken } from "../../src/lib/auth/neon-bridge.ts";

const env = (n) => {
  if (!process.env[n]) throw new Error(`Defina ${n}.`);
  return process.env[n];
};
const REST = "http://localhost:53000";
const ORIGIN = env("NEON_REAL_ORIGIN");
const JWKS = JSON.parse(fs.readFileSync(env("NEON_REAL_JWKS"), "utf8"));
const TOKENS = JSON.parse(fs.readFileSync(env("NEON_REAL_TOKENS"), "utf8"));
const SERVICE_KEY = env("REPLICA_SERVICE_KEY");
const DB_SECRET = new TextEncoder().encode(env("REPLICA_JWT_SECRET"));
const PG = ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { env: { ...process.env, PGPASSWORD: env("REPLICA_PGPASS") } }).toString().trim();
const sqlFile = (f) => execFileSync("psql", [...PG, "-f", f], { env: { ...process.env, PGPASSWORD: env("REPLICA_PGPASS") } }).toString();
const ONLY_EXPIRY = process.argv.includes("--so-expiracao");

const results = [];
function check(area, name, ok, detail = "") {
  results.push({ area, name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${name}${ok || !detail ? "" : " — " + String(detail).slice(0, 240)}`);
}

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

// ------------------------------------------------------------ ponte (código real, sem alteração)
// Configuração derivada do token REAL: iss = aud = origem do Neon Auth.
const jwks = createLocalJWKSet(JWKS);
const cfg = { jwks, issuer: ORIGIN, audience: ORIGIN };
const verify = (t) => verifyProviderToken(t, cfg);
async function resolveLink(externalUserId) {
  const r = await rest("/rpc/fn_resolve_identity_link", { method: "POST", token: SERVICE_KEY, body: { p_provider: "neon", p_external_user_id: externalUserId } });
  return r.status === 200 && typeof r.data === "string" ? r.data : null;
}
const mint = (authUserId) => mintDatabaseToken({ authUserId, secret: DB_SECRET, ttlSeconds: 300 });
const bridge = (t) => bridgeIdentity(t, { verify, resolveLink, mint });
async function bridgeError(t, c = cfg) {
  try {
    await bridgeIdentity(t, { verify: (x) => verifyProviderToken(x, c), resolveLink, mint });
    return null;
  } catch (e) {
    return e.code ?? e.message;
  }
}

const PEOPLE = [
  { key: "A1", email: "a1@educa-teste.example.com", name: "A1 Admin (Neon real)", company: "A", role: "admin" },
  { key: "A2", email: "a2@educa-teste.example.com", name: "A2 Leitura (Neon real)", company: "A", role: "leitura" },
  { key: "B1", email: "b1@educa-teste.example.com", name: "B1 Admin (Neon real)", company: "B", role: "admin" },
  { key: "B2", email: "b2@educa-teste.example.com", name: "B2 Operador (Neon real)", company: "B", role: "operador" },
];
const P = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));
for (const p of PEOPLE) {
  p.providerToken = TOKENS[p.key];
  p.neonId = decodeJwt(p.providerToken).sub;
}

if (ONLY_EXPIRY) {
  // Depois de 15 min: os MESMOS tokens reais já expiraram.
  for (const p of PEOPLE) {
    const exp = decodeJwt(p.providerToken).exp;
    check("expiração", `token real de ${p.key} expirado (exp ${new Date(exp * 1000).toISOString()}) → INVALID_TOKEN`, Date.now() / 1000 > exp && (await bridgeError(p.providerToken)) === "INVALID_TOKEN");
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length ? 1 : 0);
}

// ============================================================ 0. token real
{
  const h = decodeProtectedHeader(P.A1.providerToken);
  const c = decodeJwt(P.A1.providerToken);
  const kids = JWKS.keys.map((k) => k.kid);
  check("token real", "header: alg EdDSA e kid presente no JWKS real", h.alg === "EdDSA" && kids.includes(h.kid), JSON.stringify(h));
  check("token real", "iss = aud = origem do Neon Auth", c.iss === ORIGIN && c.aud === ORIGIN, `${c.iss} ${c.aud}`);
  check("token real", "sub é UUID do Neon (≠ auth_user_id do EDUCA)", /^[0-9a-f-]{36}$/.test(c.sub) && c.sub === c.id);
  check("token real", "validade de 15 min (exp - iat = 900)", c.exp - c.iat === 900, `${c.exp - c.iat}`);
  check("token real", "claims email e emailVerified presentes", typeof c.email === "string" && typeof c.emailVerified === "boolean");
  for (const p of PEOPLE) {
    const id = await verify(p.providerToken).catch((e) => e);
    check("token real", `assinatura de ${p.key} verificada no JWKS real`, id?.externalUserId === p.neonId && id.email === p.email, id?.message);
  }
}

// ============================================================ 1. fixtures SÓ na réplica
sqlFile(new URL("../../supabase/migrations/0073_external_identity_links.sql", import.meta.url).pathname);
check("banco", "0073 aplicada na RÉPLICA (idempotente, só local)", sql("select to_regclass('public.auth_identity_links') is not null") === "t");
sql(`delete from public.auth_identity_links where email like '%@educa-teste.example.com'`);
sql(`delete from public.companies where name in ('REAL Empresa A', 'REAL Empresa B')`);
sql(`delete from auth.users where email like '%@educa-teste.example.com'`);
sql(`insert into public.companies (name, status) values ('REAL Empresa A', 'active'), ('REAL Empresa B', 'active')`);
const company = { A: sql(`select id from public.companies where name='REAL Empresa A'`), B: sql(`select id from public.companies where name='REAL Empresa B'`) };
for (const p of PEOPLE) {
  // Login "sombra": mantém o UUID que users.auth_user_id referencia; sem senha.
  p.authUserId = sql(`insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${p.email}', now(), now(), now(), '{"provider":"neon"}', '{}') returning id`).split("\n")[0];
  p.appUserId = sql(`begin; select set_config('educa.auth_link','invitation',true); insert into public.users (company_id, name, email, login, auth_user_id, status)
    values ('${company[p.company]}', '${p.name}', '${p.email}', 'real-${p.key.toLowerCase()}', '${p.authUserId}', 'active') returning id; commit;`).split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l));
  sql(`insert into public.user_roles (user_id, role_id) select '${p.appUserId}', id from public.roles where company_id='${company[p.company]}' and code='${p.role}'`);
}
sql(`insert into public.departments (company_id, code, name) values ('${company.A}', 'RDEP-A', 'Depto A'), ('${company.B}', 'RDEP-B', 'Depto B')`);
sql(`insert into public.branches (company_id, code, name) values ('${company.A}', 'RFIL-A', 'Filial A'), ('${company.B}', 'RFIL-B', 'Filial B')`);

// ============================================================ 2. vínculo
check("vínculo", "identidade real verificada, ainda SEM vínculo → UNLINKED", (await bridgeError(P.A2.providerToken)) === "UNLINKED");
for (const p of PEOPLE) {
  const r = await rest("/rpc/fn_link_identity", { method: "POST", token: SERVICE_KEY, body: { p_provider: "neon", p_external_user_id: p.neonId, p_email: p.email, p_auth_user_id: p.authUserId } });
  p.linked = r.status === 200 || r.status === 204;
}
check("vínculo", "4 identidades reais vinculadas ao auth_user_id existente", PEOPLE.every((p) => p.linked));
{
  const steal = await rest("/rpc/fn_link_identity", { method: "POST", token: SERVICE_KEY, body: { p_provider: "neon", p_external_user_id: P.A1.neonId, p_email: P.B1.email, p_auth_user_id: P.B1.authUserId } });
  check("vínculo", "identidade de A1 não pode ser religada ao login de B1", steal.status >= 400, JSON.stringify(steal.data));
  const asUser = await rest("/rpc/fn_link_identity", { method: "POST", token: (await bridge(P.A1.providerToken)).dbToken, body: { p_provider: "neon", p_external_user_id: "x", p_email: P.A1.email, p_auth_user_id: P.A1.authUserId } });
  const readAuth = await rest("/auth_identity_links?select=*", { token: (await bridge(P.A1.providerToken)).dbToken });
  check("vínculo", "usuário autenticado não cria vínculo nem lê a tabela", asUser.status >= 400 && readAuth.status >= 400, `${asUser.status}/${readAuth.status}`);
}

// ============================================================ 3. identidade no banco
for (const p of PEOPLE) {
  const b = await bridge(p.providerToken);
  p.db = b.dbToken;
  p.bridgedAuthUserId = b.authUserId;
}
check("identidade", "ponte resolve cada identidade REAL para o auth_user_id certo", PEOPLE.every((p) => p.bridgedAuthUserId === p.authUserId));
{
  const c = decodeJwt(P.A1.db);
  check("identidade", "token do banco: sub=auth_user_id, role=authenticated, ≤ 300 s", c.sub === P.A1.authUserId && c.role === "authenticated" && c.exp - c.iat <= 300);
  for (const p of PEOPLE) p.seenAs = (await rpc("current_app_user_id", {}, p.db)).data;
  check("identidade", "auth.uid() → current_app_user_id() distingue A1, A2, B1, B2", PEOPLE.every((p) => p.seenAs === p.appUserId), JSON.stringify(PEOPLE.map((p) => [p.key, p.seenAs === p.appUserId])));
  const permA1 = await rpc("has_permission", { p_company_id: company.A, p_code: "users.read" }, P.A1.db);
  const permA2w = await rpc("has_permission", { p_company_id: company.A, p_code: "users.update" }, P.A2.db);
  check("identidade", "has_permission(): A1 lê usuários da A; A2 (leitura) não altera", permA1.data === true && permA2w.data === false, `${permA1.data} ${permA2w.data}`);
}

// ============================================================ 4. multi-tenancy (RLS)
{
  const users = await rest("/users?select=company_id", { token: P.A1.db });
  check("tenant", "SELECT users: A1 vê só a Empresa A", users.status === 200 && users.data.length >= 2 && users.data.every((u) => u.company_id === company.A));
  const usersB = await rest("/users?select=company_id", { token: P.B1.db });
  check("tenant", "SELECT users: B1 vê só a Empresa B", usersB.status === 200 && usersB.data.length >= 2 && usersB.data.every((u) => u.company_id === company.B));
  // O papel "leitura" tem branches.read mas NÃO departments.view.
  const a2 = await rest("/branches?select=company_id", { token: P.A2.db });
  check("tenant", "SELECT branches: A2 (leitura) vê só a A", a2.status === 200 && a2.data.length >= 1 && a2.data.every((d) => d.company_id === company.A), JSON.stringify(a2.data));
  const a2d = await rest("/departments?select=id", { token: P.A2.db });
  check("rbac", "A2 (leitura, sem departments.view) não vê departamentos nem da própria empresa", a2d.status === 200 && a2d.data.length === 0);
  const crossRead = await rest(`/departments?company_id=eq.${company.B}&select=id`, { token: P.A1.db });
  check("tenant", "SELECT departments da B por A1 → vazio", crossRead.status === 200 && crossRead.data.length === 0);
  const crossReadB = await rest(`/departments?company_id=eq.${company.A}&select=id`, { token: P.B1.db });
  check("tenant", "SELECT departments da A por B1 → vazio", crossReadB.status === 200 && crossReadB.data.length === 0);
  const insB = await rest("/departments", { method: "POST", token: P.A1.db, body: { company_id: company.B, code: "HACK", name: "Invasão" } });
  check("tenant", "INSERT na B por A1 → recusado pela RLS", insB.status === 403 || insB.status === 401 || /42501|row-level/.test(JSON.stringify(insB.data)), `${insB.status}`);
  const insA = await rest("/departments", { method: "POST", token: P.A1.db, prefer: "return=representation", body: { company_id: company.A, code: "OK-A", name: "Novo A" } });
  check("tenant", "INSERT na própria empresa por A1 (admin) → aceito", insA.status === 201);
  const updB = await rest(`/departments?company_id=eq.${company.B}`, { method: "PATCH", token: P.A1.db, prefer: "return=representation", body: { name: "Alterado por A" } });
  check("tenant", "UPDATE na B por A1 → 0 linhas", updB.status === 200 && updB.data.length === 0);
  const delB = await rest(`/branches?company_id=eq.${company.B}`, { method: "DELETE", token: P.A1.db, prefer: "return=representation" });
  check("tenant", "DELETE na B por A1 → 0 linhas", delB.status === 200 && delB.data.length === 0);
  check("tenant", "banco conferido: depto e filial da B intactos", sql(`select count(*) from public.branches where company_id='${company.B}'`) === "1" && sql(`select name from public.departments where company_id='${company.B}'`) === "Depto B" && sql(`select count(*) from public.departments where code='HACK'`) === "0");
  const permB = await rpc("has_permission", { p_company_id: company.B, p_code: "users.read" }, P.A1.db);
  check("tenant", "has_permission(Empresa B) para A1 → false", permB.data === false);
  const idor = await rest(`/users?id=eq.${P.B2.appUserId}&select=id,email`, { token: P.A1.db });
  check("tenant", "IDOR: A1 busca usuário de B pelo id → vazio", idor.status === 200 && idor.data.length === 0);
  const invB = await rpc("fn_create_user_invitation", { p_user_id: P.B2.appUserId }, P.A1.db);
  check("tenant", "A1 não convida usuário da B", invB.status >= 400);
  const b2 = await rest(`/departments?company_id=eq.${company.A}&select=id`, { token: P.B2.db });
  check("tenant", "B2 (operador) não vê dados da A", b2.status === 200 && b2.data.length === 0);
}

// ============================================================ 5. RBAC e escalada
{
  const ins = await rest("/departments", { method: "POST", token: P.A2.db, body: { company_id: company.A, code: "LEIT", name: "Leitura tenta" } });
  check("rbac", "A2 (leitura) não cria departamento", ins.status >= 400, `${ins.status}`);
  const upd = await rest(`/departments?company_id=eq.${company.A}`, { method: "PATCH", token: P.A2.db, prefer: "return=representation", body: { name: "A2 alterou" } });
  check("rbac", "A2 (leitura) não altera departamento (0 linhas)", upd.status >= 400 || (upd.status === 200 && upd.data.length === 0), `${upd.status}`);
  const adminRoleA = sql(`select id from public.roles where company_id='${company.A}' and code='admin'`);
  const esc = await rpc("fn_assign_user_role", { p_user_id: P.A2.appUserId, p_role_id: adminRoleA }, P.A2.db);
  check("rbac", "A2 não se promove a admin", esc.status >= 400);
  const adminRoleB = sql(`select id from public.roles where company_id='${company.B}' and code='admin'`);
  const esc2 = await rpc("fn_assign_user_role", { p_user_id: P.B2.appUserId, p_role_id: adminRoleB }, P.B2.db);
  check("rbac", "B2 (operador) não se promove a admin", esc2.status >= 400);
  const direct = await rest("/user_roles", { method: "POST", token: P.B2.db, body: { user_id: P.B2.appUserId, role_id: adminRoleB } });
  check("rbac", "B2 não insere papel direto em user_roles", direct.status >= 400);
  const hijack = await rest(`/users?id=eq.${P.A2.appUserId}`, { method: "PATCH", token: P.A1.db, body: { auth_user_id: P.B1.authUserId } });
  check("rbac", "A1 não troca auth_user_id de A2 (gatilho 0072)", hijack.status >= 400);
  check("rbac", "banco conferido: auth_user_id de A2 e papéis inalterados", sql(`select auth_user_id from public.users where id='${P.A2.appUserId}'`) === P.A2.authUserId && sql(`select r.code from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id='${P.A2.appUserId}'`) === "leitura" && sql(`select r.code from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id='${P.B2.appUserId}'`) === "operador");
}

// ============================================================ 6. segurança da ponte com token REAL
{
  const real = P.A1.providerToken;
  const [h, p, s] = real.split(".");
  const kid = decodeProtectedHeader(real).kid;
  const tampered = [h, Buffer.from(JSON.stringify({ ...decodeJwt(real), sub: P.B1.neonId, email: P.B1.email })).toString("base64url"), s].join(".");
  check("segurança", "token real adulterado (sub/email de B1) → INVALID_TOKEN", (await bridgeError(tampered)) === "INVALID_TOKEN");
  const { privateKey } = await generateKeyPair("EdDSA");
  const forged = await new SignJWT({ ...decodeJwt(real), sub: P.B1.neonId }).setProtectedHeader({ alg: "EdDSA", kid }).sign(privateKey);
  check("segurança", "assinado com outra chave (mesmo kid real) → INVALID_TOKEN", (await bridgeError(forged)) === "INVALID_TOKEN");
  const badKid = await new SignJWT({ ...decodeJwt(real) }).setProtectedHeader({ alg: "EdDSA", kid: "kid-inexistente" }).sign(privateKey);
  check("segurança", "kid inexistente no JWKS → INVALID_TOKEN", (await bridgeError(badKid)) === "INVALID_TOKEN");
  const none = [Buffer.from(JSON.stringify({ alg: "none", kid })).toString("base64url"), p, ""].join(".");
  check("segurança", "alg=none → INVALID_TOKEN", (await bridgeError(none)) === "INVALID_TOKEN");
  const hs = await new SignJWT({ ...decodeJwt(real) }).setProtectedHeader({ alg: "HS256", kid }).sign(new TextEncoder().encode("x".repeat(40)));
  check("segurança", "HS256 (confusão de algoritmo) → INVALID_TOKEN", (await bridgeError(hs)) === "INVALID_TOKEN");
  check("segurança", "emissor esperado diferente → INVALID_TOKEN", (await bridgeError(real, { ...cfg, issuer: "https://outro.neonauth.example" })) === "INVALID_TOKEN");
  check("segurança", "audiência esperada diferente → INVALID_TOKEN", (await bridgeError(real, { ...cfg, audience: "educa-erp" })) === "INVALID_TOKEN");
  if (TOKENS.NAO_VERIFICADO) {
    const c = decodeJwt(TOKENS.NAO_VERIFICADO);
    check("segurança", "token real com emailVerified=false → EMAIL_NOT_VERIFIED", c.emailVerified === false && (await bridgeError(TOKENS.NAO_VERIFICADO)) === "EMAIL_NOT_VERIFIED", `emailVerified=${c.emailVerified}`);
  }
  // Janela residual (documentada): o JWT do Neon é autocontido; após o logout
  // real de B2 no Neon ele continua verificável até exp (≤ 15 min). A ponte
  // precisa checar a sessão no Neon (getSession) para fechar essa janela.
  check("segurança", "JWT de B2 emitido antes do logout no Neon ainda verifica (janela residual ≤ 15 min — exige checagem de sessão na integração)", (await bridgeError(P.B2.providerToken)) === null);
  const forgedDb = await new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setSubject(P.B1.authUserId).setAudience("authenticated").setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("segredo-inventado-pelo-cliente-0123456789"));
  check("segurança", "token do banco forjado pelo cliente → 401 no PostgREST", (await rest("/users?select=id", { token: forgedDb })).status === 401);
  const expired = await mintDatabaseToken({ authUserId: P.A1.authUserId, secret: DB_SECRET, ttlSeconds: 30, now: Math.floor(Date.now() / 1000) - 3600 });
  check("segurança", "token do banco expirado → 401", (await rest("/users?select=id", { token: expired })).status === 401);
  const neonAsDb = await rest("/users?select=id", { token: real });
  check("segurança", "token do Neon enviado direto ao PostgREST → recusado (só a ponte fala com o banco)", neonAsDb.status === 401, `${neonAsDb.status}`);
}

// ============================================================ 7. desativação no EDUCA
{
  sql(`update public.users set status='inactive' where id='${P.A2.appUserId}'`);
  const again = await bridge(P.A2.providerToken);
  const who = await rpc("current_app_user_id", {}, again.dbToken);
  const deps = await rest(`/departments?company_id=eq.${company.A}&select=id`, { token: again.dbToken });
  const perm = await rpc("has_permission", { p_company_id: company.A, p_code: "users.read" }, again.dbToken);
  check("desativação", "cadastro inativo no EDUCA: sem identidade de app, sem dados, sem permissão", who.data === null && deps.data.length === 0 && perm.data === false, `${JSON.stringify(who.data)} ${deps.data.length} ${perm.data}`);
  sql(`update public.users set status='active' where id='${P.A2.appUserId}'`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
