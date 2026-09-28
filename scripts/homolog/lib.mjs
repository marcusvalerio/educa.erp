// Utilidades dos scripts de homologação (bootstrap, dados e smoke).
// Só HTTP contra o app publicado e o Neon Auth de HOMOLOGAÇÃO. Nenhuma senha,
// token ou cookie é impresso: a saída traz apenas estados e códigos HTTP.

export const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Defina ${name}.`);
  return v;
};

export const APP = need("APP").replace(/\/+$/, "");
export const NEON = (process.env.NEON_AUTH_BASE_URL ?? "").replace(/\/+$/, "");

// Deployment Protection da Vercel: cabeçalho de bypass (opcional, nunca impresso).
export const BYPASS = process.env.VERCEL_BYPASS_TOKEN
  ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_TOKEN, "x-vercel-set-bypass-cookie": "true" }
  : {};

// Contas da homologação. E-mails em @example.com (domínio reservado: a caixa
// não existe). As senhas são definidas pelo dono do projeto nos segredos do
// ambiente "homolog" do GitHub e chegam aqui só por variável de ambiente.
export const ACCOUNTS = {
  owner: {
    email: (process.env.HOMOLOG_OWNER_EMAIL ?? "owner.homolog@example.com").toLowerCase(),
    name: "Owner Homologação",
    passwordVar: "HOMOLOG_OWNER_PASSWORD",
  },
  admin: {
    email: (process.env.HOMOLOG_ADMIN_EMAIL ?? "admin.homolog@example.com").toLowerCase(),
    name: "Admin Homologação",
    login: "admin.homolog",
    passwordVar: "HOMOLOG_ADMIN_PASSWORD",
  },
  user: {
    email: (process.env.HOMOLOG_USER_EMAIL ?? "usuario.homolog@example.com").toLowerCase(),
    name: "Usuário de Homologação",
    login: "usuario.homolog",
    passwordVar: "HOMOLOG_USER_PASSWORD",
  },
};

// Empresa da homologação: a ASTRA do seed fictício (supabase/seed.sql).
export const COMPANY_ID = process.env.HOMOLOG_COMPANY_ID ?? "00000000-0000-0000-0000-000000000001";

// Papel do Admin: administrador OPERACIONAL — as permissões do papel
// "Administrador" da empresa MENOS a governança (papéis e permissões,
// usuários, módulos, unidades, estrutura e configurações da empresa), que
// fica com o Owner. O "Operador" existente não serve: não aprova nada
// (pedidos, compras, estoque, financeiro) e nem move oportunidade no funil.
export const ADMIN_ROLE = {
  code: "admin_operacional_homolog",
  name: "Administrador operacional (Homologação)",
  description: "Opera e aprova em todos os módulos; sem gestão de usuários, papéis, permissões, módulos e configurações.",
  base: "admin",
  exclude: [
    /^roles\./, /^users\.(create|update|delete)$/, /^org\.assign$/, /^company_modules\.manage$/, /^branches\.manage$/,
    /^departments\.(create|update)$/, /^positions\.(create|update)$/, /^document_sequences\.(create|update)$/,
    /^settings\.(create|update|company\.update|establishment\.update)$/, /^fiscal_provider_configs\.manage$/, /^dashboard\.configure$/,
  ],
};

// Papel do Usuário de Homologação: vendedor. Comercial + CRM, sem aprovar,
// cancelar ou reservar pedido; cadastros e estoque só para consulta. Sem
// Financeiro, Fiscal, Suprimentos, Produção, Logística nem Administração.
export const USER_ROLE = {
  code: "vendedor_homolog",
  name: "Vendedor (Homologação)",
  description: "Papel limitado da homologação: Comercial e CRM, sem aprovações.",
  permissions: [
    "dashboard.view",
    "customers.read", "customers.create", "customers.update",
    "party_contacts.view", "party_contacts.create", "party_contacts.update",
    "party_addresses.view", "party_addresses.create", "party_addresses.update",
    "products.read", "categories.read", "brands.read", "price_lists.read",
    "payment_terms.view", "sales_representatives.read", "stock.view",
    "sales_quotes.view", "sales_quotes.create", "sales_quotes.update",
    "sales_orders.view", "sales_orders.create", "sales_orders.update",
    "leads.view", "leads.create", "leads.update", "leads.convert",
    "opportunities.view", "opportunities.create", "opportunities.update", "opportunities.move_stage", "opportunities.convert",
    "activities.view", "activities.create", "activities.update",
    "pipelines.view", "lead_origins.view",
    "commercial_reports.view", "crm_reports.view",
  ],
};

export const log = (tag, s) => console.log(`${tag}: ${s}`);

const setCookies = (res) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
export const cookieOf = (res, suffix) => setCookies(res).find((c) => c.split("=")[0].endsWith(suffix) && c.split("=")[1]);

// ------------------------------------------------------------ Neon Auth (admin)
export async function neon(path, { body, cookie, query } = {}) {
  if (!NEON) throw new Error("Defina NEON_AUTH_BASE_URL.");
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

export async function neonAdmin() {
  const r = await neon("/sign-in/email", { body: { email: need("NEON_AUTH_SERVICE_EMAIL"), password: need("NEON_AUTH_SERVICE_PASSWORD") } });
  const cookie = cookieOf(r.res, ".session_token");
  if (r.status !== 200 || !cookie) throw new Error(`conta de serviço não entrou no Neon Auth (${r.status})`);
  const admin = {
    async user(email) {
      const q = await neon("/admin/list-users", { cookie, query: { filterField: "email", filterValue: email, filterOperator: "eq", limit: "2" } });
      if (q.status !== 200) throw new Error(`admin/list-users → ${q.status}`);
      return (q.json?.users ?? []).find((u) => String(u.email).toLowerCase() === email) ?? null;
    },
    async setPassword(userId, password) {
      const a = await neon("/admin/set-user-password", { cookie, body: { userId, newPassword: password } });
      const b = await neon("/admin/update-user", { cookie, body: { userId, data: { emailVerified: true } } });
      if (a.status !== 200 || b.status !== 200) throw new Error(`admin set-password/update-user → ${a.status}/${b.status}`);
    },
    // Sessão de outro usuário (plugin admin do Better Auth). Devolve o cookie
    // do app (educa_session guarda "nome=valor" do cookie do Neon Auth).
    async setEmailVerified(userId, value) {
      const r = await neon("/admin/update-user", { cookie, body: { userId, data: { emailVerified: value } } });
      if (r.status !== 200) throw new Error(`admin/update-user → ${r.status}`);
    },
    async impersonate(userId) {
      const r = await neon("/admin/impersonate-user", { cookie, body: { userId } });
      const c = cookieOf(r.res, ".session_token");
      if (r.status !== 200 || !c) throw new Error(`admin/impersonate-user → ${r.status}`);
      return `educa_session=${encodeURIComponent(c)}`;
    },
    async ensure(email, name, password) {
      let u = await admin.user(email);
      if (!u) {
        const c = await neon("/admin/create-user", { cookie, body: { email, name, password, role: "user", data: { emailVerified: true } } });
        if (c.status !== 200) throw new Error(`admin/create-user ${email} → ${c.status}`);
        u = c.json?.user ?? (await admin.user(email));
      }
      await admin.setPassword(u.id, password);
      return u;
    },
  };
  return admin;
}

// ------------------------------------------------------------ app publicado
export async function app(path, { body, cookie, method } = {}) {
  const res = await fetch(`${APP}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { origin: APP, accept: "application/json", "content-type": "application/json", ...BYPASS, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, res };
}

export async function appLogin(email, password) {
  const r = await app("/api/auth/sign-in", { body: { email, password } });
  const cookie = setCookies(r.res).find((c) => c.startsWith("educa_session="));
  return r.status === 200 && cookie ? cookie : null;
}

export const context = async (cookie) => (await app("/api/session/context", { cookie })).json?.data ?? null;
export const tokenOf = (inviteUrl) => String(inviteUrl ?? "").split("/convite/")[1]?.split(/[?#]/)[0];
export const short = (r) => `${r.status} ${JSON.stringify(r.json?.error ?? r.json ?? "").slice(0, 180)}`;
