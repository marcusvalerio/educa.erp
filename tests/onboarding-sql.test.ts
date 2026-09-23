// Migration 0071 (onboarding & identidade) executada de verdade num
// Postgres (PGlite, WASM) sobre stubs mínimos das peças do Supabase:
// auth.users, auth.uid(), papéis anon/authenticated e as funções de
// permissão existentes (has_permission, has_platform_permission).
// O objetivo é provar as regras de segurança — sobretudo os cenários
// negativos — sem banco remoto e sem segredo nenhum.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(path.join(process.cwd(), "supabase/migrations/0071_onboarding_identity.sql"), "utf8");

// Esquema mínimo com as colunas/constraints reais usadas pela 0071.
const STUBS = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null, legal_name text, document text, email text, phone text,
  address text, city text, state text, zip_code text,
  status text not null default 'active'
);
create table public.company_platform_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  lifecycle_status text not null default 'ACTIVE',
  plan_code text
);
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null, name text not null, status text not null default 'active',
  unique (company_id, code)
);
create sequence public.users_code_seq;
create table public.users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null default ('USR-' || nextval('public.users_code_seq')),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null, email text not null, login text not null, role text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  unique (company_id, email), unique (company_id, login), unique (company_id, code)
);
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null, name text not null, is_system boolean not null default false,
  status text not null default 'active'
);
create table public.user_roles (
  user_id uuid references public.users(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  primary key (user_id, role_id)
);
create table public.role_permissions (role_id uuid references public.roles(id) on delete cascade, code text not null);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  actor_label text not null, entity text not null, entity_id uuid not null,
  action text not null check (action in ('CREATE','UPDATE','CONFIRM','REVOKE','ASSIGN')),
  old_data jsonb, new_data jsonb, created_at timestamptz not null default now()
);
create table public.platform_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id),
  name text not null, email text not null, platform_role text not null, status text not null default 'active'
);
create table public.platform_role_permissions (platform_role text not null, permission_code text not null);
insert into public.platform_role_permissions values
  ('OWNER', 'platform.companies.create'), ('OWNER', 'platform.companies.view'), ('OWNER', 'platform.members.manage'),
  ('ADMIN', 'platform.companies.create'), ('ADMIN', 'platform.companies.view'), ('ADMIN', 'platform.members.manage');

-- Semeadura mínima equivalente aos gatilhos reais de companies.
create function public.stub_seed_company() returns trigger language plpgsql as $$
begin
  insert into public.company_platform_profiles (company_id) values (new.id);
  insert into public.roles (company_id, code, name, is_system) values
    (new.id, 'admin', 'Administrador', true), (new.id, 'operador', 'Operador', true);
  insert into public.role_permissions (role_id, code)
    select id, c from public.roles, unnest(array['users.read', 'users.update']) c where company_id = new.id and code = 'admin';
  return new;
end $$;
create trigger seed after insert on public.companies for each row execute function public.stub_seed_company();

create function public.has_permission(p_company_id uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    join public.user_roles ur on ur.user_id = u.id
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    where u.auth_user_id = auth.uid() and u.company_id = p_company_id
      and u.status = 'active' and r.status = 'active' and rp.code = p_code)
$$;
create function public.has_platform_permission(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_members m
    join public.platform_role_permissions prp on prp.platform_role = m.platform_role
    where m.auth_user_id = auth.uid() and m.status = 'active' and prp.permission_code = p_code)
$$;
create function public.current_app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid() and status = 'active' limit 1
$$;
create function public.fn_log_platform_audit(p_entity text, p_entity_id uuid, p_action text, p_old_data jsonb default null, p_new_data jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (company_id, user_id, actor_label, entity, entity_id, action, old_data, new_data)
  values (null, null, coalesce((select 'platform:' || m.platform_role || ':' || m.email from public.platform_members m where m.auth_user_id = auth.uid()), 'platform:system'),
    p_entity, p_entity_id, p_action, p_old_data, p_new_data);
end $$;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.has_platform_permission(text) to authenticated;

-- Privilégios padrão do Supabase: tudo para anon/authenticated em
-- objetos novos. A 0071 precisa revogar explicitamente.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

type Row = Record<string, unknown>;
let db: PGlite;

async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(sql, params);
  return res.rows;
}
async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  return rows[0];
}

/** Executa como o usuário autenticado `authUid` (null = anon), com o papel do PostgREST. */
async function as<T>(authUid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [authUid ?? ""]);
  await db.exec(`set role ${authUid ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

/** Espera erro do Postgres com o SQLSTATE informado. */
async function rejects(promise: Promise<unknown>, code: string, match?: RegExp) {
  await assert.rejects(promise, (error: { code?: string; message?: string }) => {
    assert.equal(error.code, code, `SQLSTATE esperado ${code}, recebido ${error.code}: ${error.message}`);
    if (match) assert.match(error.message ?? "", match);
    return true;
  });
}

async function authUser(email: string, confirmed = true): Promise<string> {
  const row = await one<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id", [email, confirmed ? new Date() : null]);
  return row.id;
}
async function company(name: string): Promise<string> {
  return (await one<{ id: string }>("insert into public.companies (name) values ($1) returning id", [name])).id;
}
async function appUser(companyId: string, email: string, opts: { auth?: string | null; admin?: boolean; status?: string } = {}): Promise<string> {
  const row = await one<{ id: string }>(
    "insert into public.users (company_id, name, email, login, auth_user_id, status) values ($1, $2, $3, $4, $5, $6) returning id",
    [companyId, email.split("@")[0], email, email.split("@")[0], opts.auth ?? null, opts.status ?? "active"]
  );
  if (opts.admin) await q("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = 'admin'", [row.id, companyId]);
  return row.id;
}

// Cenário base: duas empresas, cada uma com um administrador com login;
// um Owner e um Admin da plataforma; e logins avulsos.
const ids: Record<string, string> = {};

before(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  await db.exec(MIGRATION);

  ids.companyA = await company("Empresa A");
  ids.companyB = await company("Empresa B");
  ids.adminAAuth = await authUser("admin.a@a.test");
  ids.adminBAuth = await authUser("admin.b@b.test");
  ids.adminA = await appUser(ids.companyA, "admin.a@a.test", { auth: ids.adminAAuth, admin: true });
  ids.adminB = await appUser(ids.companyB, "admin.b@b.test", { auth: ids.adminBAuth, admin: true });
  ids.operatorAAuth = await authUser("op.a@a.test");
  ids.operatorA = await appUser(ids.companyA, "op.a@a.test", { auth: ids.operatorAAuth });
  ids.ownerAuth = await authUser("owner@educa.test");
  ids.platformAdminAuth = await authUser("padmin@educa.test");
  await q("insert into public.platform_members (auth_user_id, name, email, platform_role) values ($1, 'Owner', 'owner@educa.test', 'OWNER'), ($2, 'PAdmin', 'padmin@educa.test', 'ADMIN')", [
    ids.ownerAuth,
    ids.platformAdminAuth,
  ]);
});

after(async () => {
  await db?.close();
});

describe("0071 — privilégios", () => {
  test("anon e authenticated não emitem convite diretamente (helper interno)", async () => {
    await as(null, () => rejects(q("select public.fn_issue_user_invitation(gen_random_uuid(), 'USER', 1, 'x', null)"), "42501"));
    await as(ids.adminAAuth, () => rejects(q("select public.fn_issue_user_invitation(gen_random_uuid(), 'USER', 1, 'x', null)"), "42501"));
  });

  test("anon não cria convite, não aceita, não cria empresa", async () => {
    await as(null, async () => {
      await rejects(q("select public.fn_create_user_invitation(gen_random_uuid())"), "42501");
      await rejects(q("select public.fn_accept_user_invitation('x')"), "42501");
      await rejects(q("select public.fn_platform_create_company('X')"), "42501");
      await rejects(q("select public.fn_platform_auth_user_id('owner@educa.test')"), "42501");
    });
  });

  test("anon consulta convite só pelo token e recebe 'invalid' sem detalhes", async () => {
    const res = await as(null, () => one<{ r: Row }>("select public.fn_get_invitation($1) r", ["0".repeat(64)]));
    assert.deepEqual(res.r, { status: "invalid" });
  });

  test("nenhuma escrita direta em user_invitations pelo cliente", async () => {
    await as(ids.adminAAuth, async () => {
      await rejects(q("insert into public.user_invitations (company_id, user_id, email, token_hash, expires_at, created_by_label) values ($1, $2, 'x@x', 'h', now(), 'x')", [ids.companyA, ids.adminA]), "42501");
      await rejects(q("update public.user_invitations set status = 'accepted'"), "42501");
    });
    await as(null, () => rejects(q("select * from public.user_invitations"), "42501"));
  });
});

describe("0071 — convite pelo Company Admin", () => {
  test("fluxo completo: convidar → consultar → aceitar → vínculo auth_user_id + auditoria", async () => {
    const target = await appUser(ids.companyA, "novo@a.test");
    const inv = await as(ids.adminAAuth, () => one<{ r: Row }>("select public.fn_create_user_invitation($1) r", [target]));
    const token = inv.r.token as string;
    assert.equal(inv.r.kind, "USER");
    assert.equal(inv.r.email, "novo@a.test");
    assert.equal(inv.r.company_name, "Empresa A");
    assert.match(token, /^[0-9a-f]{64}$/);

    // Só o hash fica no banco.
    const stored = await one<{ token_hash: string }>("select token_hash from public.user_invitations where id = $1", [inv.r.invitation_id]);
    assert.notEqual(stored.token_hash, token);
    assert.equal(stored.token_hash.length, 64);

    const preview = await as(null, () => one<{ r: Row }>("select public.fn_get_invitation($1) r", [token]));
    assert.equal(preview.r.status, "pending");
    assert.equal(preview.r.email_hint, "n***@a.test");
    assert.equal(preview.r.company_name, "Empresa A");
    for (const key of Object.keys(preview.r)) assert.ok(!/id$/.test(key), `prévia não expõe ids (${key})`);

    const newAuth = await authUser("novo@a.test");
    const accepted = await as(newAuth, () => one<{ r: Row }>("select public.fn_accept_user_invitation($1) r", [token]));
    assert.deepEqual(accepted.r, { status: "accepted", kind: "USER" });

    const linked = await one<{ auth_user_id: string }>("select auth_user_id from public.users where id = $1", [target]);
    assert.equal(linked.auth_user_id, newAuth);

    const audit = await q<{ entity: string; action: string }>("select entity, action from public.audit_logs where company_id = $1 and (entity_id = $2 or entity_id = $3) order by created_at", [
      ids.companyA,
      inv.r.invitation_id,
      target,
    ]);
    assert.deepEqual(
      audit.map((a) => `${a.entity}:${a.action}`).sort(),
      ["user_invitations:CREATE", "user_invitations:CONFIRM", "users:ASSIGN"].sort()
    );

    // Uso único.
    const reuseAuth = await authUser("outro@a.test");
    await as(reuseAuth, () => rejects(q("select public.fn_accept_user_invitation($1)", [token]), "P0001", /já foi utilizado/));
    const after = await as(null, () => one<{ r: Row }>("select public.fn_get_invitation($1) r", [token]));
    assert.equal(after.r.status, "accepted");
  });

  test("Company A não convida usuário da Company B (cross-company)", async () => {
    const targetB = await appUser(ids.companyB, "alvo@b.test");
    await as(ids.adminAAuth, () => rejects(q("select public.fn_create_user_invitation($1)", [targetB]), "42501"));
  });

  test("usuário comum (sem users.update) não convida", async () => {
    const target = await appUser(ids.companyA, "semperm@a.test");
    await as(ids.operatorAAuth, () => rejects(q("select public.fn_create_user_invitation($1)", [target]), "42501"));
  });

  test("não convida cadastro inativo nem cadastro já vinculado", async () => {
    const inactive = await appUser(ids.companyA, "inativo@a.test", { status: "inactive" });
    await as(ids.adminAAuth, () => rejects(q("select public.fn_create_user_invitation($1)", [inactive]), "P0001", /inativo/));
    await as(ids.adminAAuth, () => rejects(q("select public.fn_create_user_invitation($1)", [ids.operatorA]), "P0001", /já possui login/));
  });

  test("reenvio revoga o convite pendente anterior", async () => {
    const target = await appUser(ids.companyA, "reenvio@a.test");
    const first = await as(ids.adminAAuth, () => one<{ r: Row }>("select public.fn_create_user_invitation($1) r", [target]));
    const second = await as(ids.adminAAuth, () => one<{ r: Row }>("select public.fn_create_user_invitation($1) r", [target]));
    const firstPreview = await as(null, () => one<{ r: Row }>("select public.fn_get_invitation($1) r", [first.r.token]));
    assert.equal(firstPreview.r.status, "revoked");
    const auth = await authUser("reenvio@a.test");
    await as(auth, () => rejects(q("select public.fn_accept_user_invitation($1)", [first.r.token]), "P0001", /cancelado/));
    await as(auth, async () => {
      const ok = await one<{ r: Row }>("select public.fn_accept_user_invitation($1) r", [second.r.token]);
      assert.equal(ok.r.status, "accepted");
    });
  });

  test("revogar: só pendente, só da própria empresa; convite revogado não é aceito", async () => {
    const target = await appUser(ids.companyA, "revogar@a.test");
    const inv = await as(ids.adminAAuth, () => one<{ r: Row }>("select public.fn_create_user_invitation($1) r", [target]));
    await as(ids.adminBAuth, () => rejects(q("select public.fn_revoke_user_invitation($1)", [inv.r.invitation_id]), "42501"));
    await as(ids.adminAAuth, () => q("select public.fn_revoke_user_invitation($1)", [inv.r.invitation_id]));
    await as(ids.adminAAuth, () => rejects(q("select public.fn_revoke_user_invitation($1)", [inv.r.invitation_id]), "P0001"));
    const auth = await authUser("revogar@a.test");
    await as(auth, () => rejects(q("select public.fn_accept_user_invitation($1)", [inv.r.token]), "P0001", /cancelado/));
    const audit = await one<{ n: number }>("select count(*)::int n from public.audit_logs where entity_id = $1 and action = 'REVOKE'", [inv.r.invitation_id]);
    assert.equal(audit.n, 1);
  });

  test("RLS: convites visíveis apenas para quem lê usuários da empresa", async () => {
    const seenByA = await as(ids.adminAAuth, () => q<{ company_id: string }>("select company_id from public.user_invitations"));
    assert.ok(seenByA.length > 0);
    assert.ok(seenByA.every((r) => r.company_id === ids.companyA));
    const seenByB = await as(ids.adminBAuth, () => q("select 1 from public.user_invitations where company_id = $1", [ids.companyA]));
    assert.equal(seenByB.length, 0);
    const seenByOperator = await as(ids.operatorAAuth, () => q("select 1 from public.user_invitations"));
    assert.equal(seenByOperator.length, 0);
  });
});

describe("0071 — aceite: identidade vem do Auth, nunca do cliente", () => {
  async function freshInvite(email: string) {
    const target = await appUser(ids.companyA, email);
    const inv = await as(ids.adminAAuth, () => one<{ r: Row }>("select public.fn_create_user_invitation($1) r", [target]));
    return { target, token: inv.r.token as string, invitationId: inv.r.invitation_id as string };
  }

  test("sem sessão: recusado", async () => {
    const { token } = await freshInvite("semsessao@a.test");
    await as(null, () => rejects(q("select public.fn_accept_user_invitation($1)", [token]), "42501"));
  });

  test("login com outro e-mail: recusado (não aceita auth_user_id arbitrário)", async () => {
    const { token, target } = await freshInvite("certo@a.test");
    const intruder = await authUser("intruso@x.test");
    await as(intruder, () => rejects(q("select public.fn_accept_user_invitation($1)", [token]), "42501", /outro e-mail/));
    const row = await one<{ auth_user_id: string | null }>("select auth_user_id from public.users where id = $1", [target]);
    assert.equal(row.auth_user_id, null);
  });

  test("e-mail não confirmado: recusado", async () => {
    const { token } = await freshInvite("naoconfirmado@a.test");
    const auth = await authUser("naoconfirmado@a.test", false);
    await as(auth, () => rejects(q("select public.fn_accept_user_invitation($1)", [token]), "42501", /Confirme/));
  });

  test("login já vinculado a outro cadastro (outra empresa): recusado", async () => {
    const { token } = await freshInvite("admin.b@b.test");
    await as(ids.adminBAuth, () => rejects(q("select public.fn_accept_user_invitation($1)", [token]), "P0001", /já está vinculada/));
  });

  test("convite expirado: recusado e reportado como expirado", async () => {
    const { token, invitationId } = await freshInvite("expirado@a.test");
    await q("update public.user_invitations set expires_at = now() - interval '1 minute' where id = $1", [invitationId]);
    const preview = await as(null, () => one<{ r: Row }>("select public.fn_get_invitation($1) r", [token]));
    assert.equal(preview.r.status, "expired");
    const auth = await authUser("expirado@a.test");
    await as(auth, () => rejects(q("select public.fn_accept_user_invitation($1)", [token]), "P0001", /expirou/));
  });

  test("cadastro desativado depois do convite: recusado, status preservado", async () => {
    const { token, target } = await freshInvite("desativado@a.test");
    await q("update public.users set status = 'inactive' where id = $1", [target]);
    const auth = await authUser("desativado@a.test");
    await as(auth, () => rejects(q("select public.fn_accept_user_invitation($1)", [token]), "P0001", /desativado/));
    const row = await one<{ status: string; auth_user_id: string | null }>("select status, auth_user_id from public.users where id = $1", [target]);
    assert.deepEqual(row, { status: "inactive", auth_user_id: null });
  });

  test("token inválido: recusado", async () => {
    const auth = await authUser("qualquer@a.test");
    await as(auth, () => rejects(q("select public.fn_accept_user_invitation($1)", ["f".repeat(64)]), "P0002"));
  });

  test("TTL é limitado a 1..720 horas", async () => {
    const target = await appUser(ids.companyA, "ttl@a.test");
    const inv = await as(ids.adminAAuth, () => one<{ r: Row }>("select public.fn_create_user_invitation($1, 100000) r", [target]));
    const hours = await one<{ h: number }>("select extract(epoch from (expires_at - created_at)) / 3600 as h from public.user_invitations where id = $1", [inv.r.invitation_id]);
    assert.ok(Math.round(Number(hours.h)) === 720);
  });
});

describe("0071 — plataforma: criar empresa e primeiro administrador", () => {
  test("Company Admin não cria empresa nem convida admin de empresa", async () => {
    await as(ids.adminAAuth, async () => {
      await rejects(q("select public.fn_platform_create_company('Nova')"), "42501");
      await rejects(q("select public.fn_platform_invite_company_admin($1, 'X', 'x@x.test')", [ids.companyB]), "42501");
      await rejects(q("select public.fn_platform_company_onboarding($1)", [ids.companyB]), "42501");
      await rejects(q("select public.fn_platform_auth_user_id('owner@educa.test')"), "42501");
    });
  });

  test("Platform Admin cria empresa com unidade inicial; defaults semeados; auditoria de plataforma", async () => {
    const res = await as(ids.platformAdminAuth, () =>
      one<{ r: Row }>("select public.fn_platform_create_company(p_name => 'Nova Ltda', p_document => '12.345.678/0001-90', p_branch_code => 'mtz', p_branch_name => 'Matriz', p_plan_code => 'pro') r")
    );
    assert.equal(res.r.name, "Nova Ltda");
    assert.equal(res.r.lifecycle_status, "TRIAL");
    assert.ok(res.r.branch_id);
    ids.newCompany = res.r.company_id as string;
    const branch = await one<{ code: string }>("select code from public.branches where id = $1", [res.r.branch_id]);
    assert.equal(branch.code, "MTZ");
    const profile = await one<{ lifecycle_status: string; plan_code: string }>("select lifecycle_status, plan_code from public.company_platform_profiles where company_id = $1", [ids.newCompany]);
    assert.deepEqual(profile, { lifecycle_status: "TRIAL", plan_code: "pro" });
    const audit = await one<{ actor_label: string; company_id: string | null }>("select actor_label, company_id from public.audit_logs where entity = 'companies' and entity_id = $1", [ids.newCompany]);
    assert.equal(audit.actor_label, "platform:ADMIN:padmin@educa.test");
    assert.equal(audit.company_id, null);
  });

  test("criar empresa: validações (documento duplicado, ciclo de vida, unidade incompleta)", async () => {
    await as(ids.ownerAuth, async () => {
      await rejects(q("select public.fn_platform_create_company(p_name => 'Dup', p_document => '12345678000190')"), "P0001", /documento/);
      await rejects(q("select public.fn_platform_create_company(p_name => 'X', p_lifecycle_status => 'SUSPENDED')"), "22023");
      await rejects(q("select public.fn_platform_create_company(p_name => 'X', p_branch_code => 'A')"), "22023");
      await rejects(q("select public.fn_platform_create_company(p_name => '  ')"), "22023");
    });
  });

  test("convidar primeiro admin: cria cadastro com papel admin e convite COMPANY_ADMIN; aceite dá acesso", async () => {
    const inv = await as(ids.ownerAuth, () => one<{ r: Row }>("select public.fn_platform_invite_company_admin($1, 'Maria Admin', ' Maria@Nova.test ') r", [ids.newCompany]));
    assert.equal(inv.r.kind, "COMPANY_ADMIN");
    assert.equal(inv.r.email, "maria@nova.test");
    const user = await one<{ id: string; login: string; auth_user_id: string | null }>("select id, login, auth_user_id from public.users where company_id = $1 and email = 'maria@nova.test'", [ids.newCompany]);
    assert.equal(user.login, "maria");
    assert.equal(user.auth_user_id, null);
    const role = await one<{ code: string }>("select r.code from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1", [user.id]);
    assert.equal(role.code, "admin");

    const status = await as(ids.platformAdminAuth, () => one<{ r: Row }>("select public.fn_platform_company_onboarding($1) r", [ids.newCompany]));
    assert.equal(status.r.admin_with_access, false);
    assert.equal((status.r.pending_admin_invitation as Row).email_hint, "m***@nova.test");

    // Plataforma e empresa auditadas.
    const tenantAudit = await one<{ n: number }>("select count(*)::int n from public.audit_logs where company_id = $1 and entity = 'user_invitations' and action = 'CREATE'", [ids.newCompany]);
    assert.equal(tenantAudit.n, 1);
    const platformAudit = await one<{ n: number }>("select count(*)::int n from public.audit_logs where company_id is null and entity = 'users' and action = 'ASSIGN' and entity_id = $1", [user.id]);
    assert.equal(platformAudit.n, 1);

    const mariaAuth = await authUser("maria@nova.test");
    const ok = await as(mariaAuth, () => one<{ r: Row }>("select public.fn_accept_user_invitation($1) r", [inv.r.token]));
    assert.deepEqual(ok.r, { status: "accepted", kind: "COMPANY_ADMIN" });

    const after = await as(ids.ownerAuth, () => one<{ r: Row }>("select public.fn_platform_company_onboarding($1) r", [ids.newCompany]));
    assert.equal(after.r.admin_with_access, true);
    assert.equal(after.r.pending_admin_invitation, null);

    // A nova admin administra a própria empresa, não as outras.
    const canOwn = await as(mariaAuth, () => one<{ ok: boolean }>("select public.has_permission($1, 'users.update') ok", [ids.newCompany]));
    assert.equal(canOwn.ok, true);
    const canOther = await as(mariaAuth, () => one<{ ok: boolean }>("select public.has_permission($1, 'users.update') ok", [ids.companyA]));
    assert.equal(canOther.ok, false);
    await as(mariaAuth, () => rejects(q("select public.fn_platform_create_company('X')"), "42501"));
  });

  test("depois que um admin tem acesso, a plataforma não emite novo admin (a empresa decide)", async () => {
    await as(ids.ownerAuth, () => rejects(q("select public.fn_platform_invite_company_admin($1, 'Outro', 'outro@nova.test')", [ids.newCompany]), "P0001", /já possui um administrador/));
    await as(ids.ownerAuth, () => rejects(q("select public.fn_platform_invite_company_admin($1, 'X', 'x@a.test')", [ids.companyA]), "P0001"));
  });

  test("convite de admin valida e-mail, nome e empresa", async () => {
    const c = await as(ids.ownerAuth, () => one<{ r: Row }>("select public.fn_platform_create_company('Val') r"));
    const cid = c.r.company_id as string;
    await as(ids.ownerAuth, async () => {
      await rejects(q("select public.fn_platform_invite_company_admin($1, 'X', 'sem-arroba')", [cid]), "22023");
      await rejects(q("select public.fn_platform_invite_company_admin($1, '', 'a@b.test')", [cid]), "22023");
      await rejects(q("select public.fn_platform_invite_company_admin(gen_random_uuid(), 'X', 'a@b.test')"), "P0002");
    });
  });

  test("membro da plataforma inativo perde as permissões", async () => {
    await q("update public.platform_members set status = 'inactive' where auth_user_id = $1", [ids.platformAdminAuth]);
    await as(ids.platformAdminAuth, () => rejects(q("select public.fn_platform_create_company('X')"), "42501"));
    await q("update public.platform_members set status = 'active' where auth_user_id = $1", [ids.platformAdminAuth]);
  });

  test("localizar login por e-mail: só para quem administra membros", async () => {
    const found = await as(ids.ownerAuth, () => one<{ id: string }>("select public.fn_platform_auth_user_id(' OWNER@educa.test ') id"));
    assert.equal(found.id, ids.ownerAuth);
    await as(ids.operatorAAuth, () => rejects(q("select public.fn_platform_auth_user_id('owner@educa.test')"), "42501"));
  });
});
