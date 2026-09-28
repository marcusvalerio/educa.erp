// Contas da HOMOLOGAÇÃO pelo fluxo oficial do app (idempotente).
//
//   APP=https://<preview> NEON_AUTH_BASE_URL=https://…/auth \
//   NEON_AUTH_SERVICE_EMAIL=… NEON_AUTH_SERVICE_PASSWORD=… \
//   HOMOLOG_OWNER_PASSWORD=… HOMOLOG_ADMIN_PASSWORD=… HOMOLOG_USER_PASSWORD=… \
//   [LEGACY_OWNER_EMAIL=…] [VERCEL_BYPASS_TOKEN=…] node scripts/homolog/bootstrap.mjs
//
// 1. Owner (owner.homolog@example.com): Platform OWNER, convidado pelo Owner
//    que já existe na homologação (LEGACY_OWNER_EMAIL, só na primeira vez).
//    Depois o próprio Owner novo desativa o anterior — SÓ na homologação.
//    O Owner também é o administrador da empresa ASTRA (convite de primeiro
//    admin da plataforma): usuários, papéis, permissões, configurações, módulos.
// 2. Admin (admin.homolog@example.com): papel novo "Administrador operacional
//    (Homologação)" — opera e aprova em todos os módulos, sem gerir usuários,
//    papéis, permissões, módulos nem configurações. Criado pelo Owner.
// 3. Usuário de Homologação (usuario.homolog@example.com): papel novo
//    "Vendedor (Homologação)", criado pelo Owner na tela oficial de papéis.
//
// As contas nascem no Neon Auth com a senha definida pelo dono do projeto
// (segredos do GitHub) e e-mail confirmado; o convite oficial do app só as
// vincula. Nenhuma senha é impressa.
import {
  ACCOUNTS, ADMIN_ROLE, COMPANY_ID, USER_ROLE,
  app, appLogin, context, log, need, neonAdmin, short, tokenOf,
} from "./lib.mjs";

const L = (s) => log("bootstrap", s);
const pw = Object.fromEntries(Object.entries(ACCOUNTS).map(([k, a]) => [k, need(a.passwordVar)]));
const neonA = await neonAdmin();

async function acceptInvite(email, password, inviteUrl) {
  const token = tokenOf(inviteUrl);
  if (!token) throw new Error(`convite sem token para ${email}`);
  const cookie = await appLogin(email, password);
  if (!cookie) throw new Error(`login antes do aceite falhou para ${email}`);
  const acc = await app("/api/onboarding/invitations/accept", { body: { token }, cookie });
  if (acc.status >= 400) throw new Error(`aceite do convite de ${email} → ${short(acc)}`);
  return cookie;
}
const hasRole = (ctx, code) => ctx?.tenant?.company?.id === COMPANY_ID && ctx.tenant.roles?.some((r) => r.code === code);

// ------------------------------------------------------------ 1. Owner
const O = ACCOUNTS.owner;
await neonA.ensure(O.email, O.name, pw.owner);
let ownerCookie = await appLogin(O.email, pw.owner);
let ownerCtx = ownerCookie ? await context(ownerCookie) : null;
if (ownerCtx?.platform?.role !== "OWNER") {
  const legacyEmail = (process.env.LEGACY_OWNER_EMAIL ?? "").toLowerCase();
  if (!legacyEmail) throw new Error("Owner novo ainda não é OWNER e LEGACY_OWNER_EMAIL não foi definido.");
  const legacy = await neonA.user(legacyEmail);
  if (!legacy) throw new Error("Owner anterior não existe no Neon Auth desta homologação.");
  // Sessão do Owner anterior por impersonação da conta de serviço (admin do
  // Neon Auth de homologação): a senha dele não é lida, usada nem alterada.
  // A ponte do app exige e-mail confirmado: confirma só durante o convite e
  // devolve o valor original logo depois.
  const wasVerified = !!legacy.emailVerified;
  if (!wasVerified) await neonA.setEmailVerified(legacy.id, true);
  try {
    const legacyCookie = await neonA.impersonate(legacy.id);
    const invite = () => app("/api/platform/members/invite", { body: { name: O.name, email: O.email, platformRole: "OWNER" }, cookie: legacyCookie });
    // BUG registrado (AUTH_PROVIDER=neon): no 1º convite de uma conta que já
    // existe no Neon, inviteWithNeon descarta o authUserId e a rota responde
    // 503; o login-sombra já ficou criado, então a 2ª tentativa passa.
    let inv = await invite();
    if (inv.status === 503) inv = await invite();
    await app("/api/auth/logout", { body: {}, cookie: legacyCookie });
    if (inv.status !== 201) throw new Error(`convite do Owner novo → ${short(inv)}`);
  } finally {
    if (!wasVerified) await neonA.setEmailVerified(legacy.id, false);
  }
  ownerCookie = await appLogin(O.email, pw.owner);
  ownerCtx = ownerCookie ? await context(ownerCookie) : null;
  if (ownerCtx?.platform?.role !== "OWNER") throw new Error("Owner novo não ficou OWNER.");
  L("Owner: promovido a OWNER pelo convite da plataforma");
} else L("Owner: já é OWNER");

// Owner anterior: desativado na plataforma da homologação (produção não muda).
{
  const members = (await app("/api/platform/members", { cookie: ownerCookie })).json?.data ?? [];
  const others = members.filter((m) => m.platform_role === "OWNER" && m.status === "active" && String(m.email).toLowerCase() !== O.email);
  for (const m of others) {
    const r = await app("/api/platform/members", { body: { authUserId: m.auth_user_id, name: m.name, email: m.email, platformRole: "OWNER", status: "inactive" }, cookie: ownerCookie });
    if (r.status >= 400) throw new Error(`desativar Owner anterior → ${short(r)}`);
    L("Owner anterior: desativado na plataforma da homologação");
  }
}

// Owner como administrador da ASTRA (primeiro admin da empresa).
if (!hasRole(ownerCtx, "admin")) {
  const inv = await app(`/api/platform/companies/${COMPANY_ID}/admin-invitation`, { body: { name: O.name, email: O.email }, cookie: ownerCookie });
  if (inv.status !== 201) throw new Error(`convite de admin da ASTRA para o Owner → ${short(inv)}`);
  ownerCookie = await acceptInvite(O.email, pw.owner, inv.json.data.inviteUrl);
  ownerCtx = await context(ownerCookie);
  if (!hasRole(ownerCtx, "admin")) throw new Error("Owner não ficou administrador da ASTRA.");
  L("Owner: administrador da ASTRA (convite aceito)");
} else L("Owner: já administra a ASTRA");

// ------------------------------------------------------------ papéis
// Criados pela API oficial de papéis (a mesma da tela Administração → Papéis).
const roles = async () => (await app("/api/admin/roles", { cookie: ownerCookie })).json?.data ?? [];
async function ensureRole(def, permissionCodes) {
  let role = (await roles()).find((r) => r.code === def.code);
  if (!role) {
    const c = await app("/api/admin/roles", { body: { code: def.code, name: def.name, description: def.description }, cookie: ownerCookie });
    if (c.status >= 400) throw new Error(`criar papel ${def.code} → ${short(c)}`);
    role = (await roles()).find((r) => r.code === def.code);
    L(`papel ${def.name}: criado`);
  }
  const p = await app(`/api/admin/roles/${role.id}/permissions`, { method: "PUT", body: { permissionCodes }, cookie: ownerCookie });
  if (p.status >= 400) throw new Error(`permissões do papel ${def.code} → ${short(p)}`);
  L(`papel ${def.name}: ${permissionCodes.length} permissões`);
  return role;
}
const base = (await roles()).find((r) => r.code === ADMIN_ROLE.base);
if (!base?.permission_codes?.length) throw new Error(`papel ${ADMIN_ROLE.base} sem permissões visíveis para o Owner`);
const adminPerms = base.permission_codes.filter((c) => !ADMIN_ROLE.exclude.some((re) => re.test(c)));
const adminRole = await ensureRole(ADMIN_ROLE, adminPerms);
const vendedor = await ensureRole(USER_ROLE, USER_ROLE.permissions);

// ------------------------------------------------------------ 2 e 3. Admin e Usuário
async function companyUser(acc, password, role) {
  const cookie0 = await appLogin(acc.email, password).catch(() => null);
  if (cookie0 && hasRole(await context(cookie0), role.code)) return "já existia";
  const users = (await app("/api/admin/users", { cookie: ownerCookie })).json?.data ?? [];
  let userId = users.find((u) => String(u.email).toLowerCase() === acc.email)?.id;
  if (!userId) {
    const c = await app("/api/users", { body: { nome: acc.name, email: acc.email, login: acc.login, perfil: role.name }, cookie: ownerCookie });
    if (c.status !== 201) throw new Error(`criar usuário ${acc.login} → ${short(c)}`);
    userId = c.json.data.id;
  }
  const a = await app(`/api/admin/users/${userId}/roles`, { body: { roleId: role.id }, cookie: ownerCookie });
  if (a.status >= 400 && a.status !== 409) throw new Error(`papel de ${acc.login} → ${short(a)}`);
  await neonA.ensure(acc.email, acc.name, password);
  const inv = await app(`/api/admin/users/${userId}/invitation`, { body: {}, cookie: ownerCookie });
  if (inv.status !== 201) throw new Error(`convite de ${acc.login} → ${short(inv)}`);
  const cookie = await acceptInvite(acc.email, password, inv.json.data.inviteUrl);
  if (!hasRole(await context(cookie), role.code)) throw new Error(`${acc.login} não ficou com o papel ${role.code}`);
  await app("/api/auth/logout", { body: {}, cookie });
  return "criado, convidado e aceito";
}
L(`Admin (${adminRole.name}): ${await companyUser(ACCOUNTS.admin, pw.admin, adminRole)}`);
L(`Usuário de Homologação (${vendedor.name}): ${await companyUser(ACCOUNTS.user, pw.user, vendedor)}`);

await app("/api/auth/logout", { body: {}, cookie: ownerCookie });
L("pronto");
