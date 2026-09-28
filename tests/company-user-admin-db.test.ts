// Administração de usuários DA EMPRESA (migration 0075) executada de verdade no
// PostgreSQL com o esquema do EDUCA. POC_DATABASE_OWNER_URL: conexão do DONO de
// um banco DESCARTÁVEL (ver poc/neon-full/README.md; nunca produção) — o dono
// prepara os logins de teste com a mesma marca do aceite de convite (0072) e as
// ações rodam como "authenticated", pelas funções do banco e pela RLS. Tudo
// numa única transação desfeita no fim: o banco não guarda nada do teste.
//
// Cobre: papéis de sistema (Administrador, Gerente, Operador, Vendedor,
// Somente leitura) em toda empresa; o Administrador convida e define o papel;
// o convidado aceita e só tem o que o papel permite; ninguém concede o que
// não tem (escalada); isolamento entre empresas; empresa ≠ plataforma.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const ASTRA = "00000000-0000-0000-0000-000000000001";

describe("administração de usuários da empresa (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const adminA = randomUUID(); // Administrador da ASTRA
  const adminB = randomUUID(); // Administrador de outra empresa
  const rh = randomUUID(); // papel customizado com roles.manage + users.create, sem o resto
  let companyB = "";
  const roleA: Record<string, string> = {};
  let roleB = "";

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const asOwner = async () => {
    await db.query("reset role");
    await db.query("select set_config('educa.auth_link', 'invitation', true)");
  };
  const as = async (sub: string) => {
    await db.query("reset role");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub, role: "authenticated" }), sub]);
  };
  // Cada tentativa num savepoint: um erro esperado não derruba a transação.
  const attempt = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint t");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint t");
      return { ok: true as const, rows: r.rows, error: "" };
    } catch (e) {
      await db.query("rollback to savepoint t");
      return { ok: false as const, rows: [], error: (e as Error).message };
    }
  };
  const loginWithRole = async (sub: string, company: string, roleId: string, login: string) => {
    await asOwner();
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [sub, `${login}@example.com`]);
    const u = await one<{ id: string }>(
      "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $3, 'active') returning id",
      [company, sub, login, `${login}@example.com`]
    );
    await db.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [u.id, roleId]);
  };
  const invite = (name: string, email: string, roleId: string) =>
    attempt("select public.fn_invite_company_user(p_name => $1, p_email => $2, p_role_id => $3) as r", [name, email, roleId]);
  const holds = async (sub: string, company: string, code: string) => {
    await as(sub);
    return (await one<{ ok: boolean }>("select public.has_permission($1, $2) as ok", [company, code])).ok;
  };

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    for (const r of (await db.query("select id, code from public.roles where company_id = $1 and is_system", [ASTRA])).rows) roleA[r.code] = r.id;
    companyB = (await one<{ id: string }>("insert into public.companies (name) values ('Empresa B (teste RBAC)') returning id")).id;
    roleB = (await one<{ id: string }>("select id from public.roles where company_id = $1 and code = 'admin'", [companyB])).id;
    await loginWithRole(adminA, ASTRA, roleA.admin, "teste.rbac.admin.a");
    await loginWithRole(adminB, companyB, roleB, "teste.rbac.admin.b");
    // Papel "RH": administra usuários (users.*, roles.manage) sem mais nada.
    const rhRole = (await one<{ id: string }>("insert into public.roles (company_id, code, name) values ($1, 'teste_rh', 'RH (teste)') returning id", [ASTRA])).id;
    await db.query("insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where code in ('users.read', 'users.create', 'users.update', 'roles.manage', 'roles.read')", [rhRole]);
    await loginWithRole(rh, ASTRA, rhRole, "teste.rbac.rh");
  });

  after(async () => {
    await db.query("rollback").catch(() => {});
    await db.end();
  });

  test("toda empresa tem os papéis de sistema: Administrador, Gerente, Operador, Vendedor, Somente leitura", async () => {
    await asOwner();
    for (const company of [ASTRA, companyB]) {
      const codes = (await db.query("select code from public.roles where company_id = $1 and is_system order by code", [company])).rows.map((r) => r.code);
      assert.deepEqual(codes, ["admin", "gerente", "leitura", "operador", "vendedor"], company);
    }
  });

  test("Administrador convida Gerente, Operador e Vendedor; cada um aceita e tem só o que o papel dá", async () => {
    const people = { gerente: randomUUID(), operador: randomUUID(), vendedor: randomUUID() };
    for (const [code, sub] of Object.entries(people)) {
      const email = `teste.rbac.${code}@example.com`;
      await as(adminA);
      const inv = await invite(`Teste ${code}`, email, roleA[code]);
      assert.ok(inv.ok, `${code}: ${inv.error}`);
      const r = inv.rows[0].r;
      assert.equal(r.kind, "USER");
      assert.equal(r.role_code, code);
      // O convidado cria a conta (login confirmado) e aceita o convite.
      await asOwner();
      await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [sub, email]);
      await as(sub);
      const acc = await attempt("select public.fn_accept_user_invitation($1) as r", [r.token]);
      assert.ok(acc.ok, `${code} aceite: ${acc.error}`);
    }
    // Gerente: opera e aprova; não administra usuários nem papéis.
    assert.equal(await holds(people.gerente, ASTRA, "sales_orders.approve"), true);
    assert.equal(await holds(people.gerente, ASTRA, "users.create"), false);
    assert.equal(await holds(people.gerente, ASTRA, "roles.manage"), false);
    // Operador: cria e edita cadastros; não aprova; não administra usuários.
    assert.equal(await holds(people.operador, ASTRA, "customers.create"), true);
    assert.equal(await holds(people.operador, ASTRA, "sales_orders.approve"), false);
    assert.equal(await holds(people.operador, ASTRA, "users.create"), false);
    assert.equal(await holds(people.operador, ASTRA, "users.update"), false);
    // Vendedor: pedido e CRM; sem aprovar, sem financeiro.
    assert.equal(await holds(people.vendedor, ASTRA, "sales_orders.create"), true);
    assert.equal(await holds(people.vendedor, ASTRA, "sales_orders.approve"), false);
    assert.equal(await holds(people.vendedor, ASTRA, "accounts_receivable.view"), false);
    // Nenhum deles convida.
    for (const sub of Object.values(people)) {
      await as(sub);
      const denied = await invite("Não deve", `nao.deve.${randomUUID().slice(0, 6)}@example.com`, roleA.leitura);
      assert.equal(denied.ok, false);
      assert.match(denied.error, /Permissão negada/);
    }
  });

  test("sem escalada: quem administra usuários só concede o que ele mesmo tem", async () => {
    await as(rh);
    for (const code of ["admin", "gerente", "vendedor", "leitura"]) {
      const r = await invite("Escalada", `escalada.${code}@example.com`, roleA[code]);
      assert.equal(r.ok, false, code);
      assert.match(r.error, /não pode conceder permissões que não possui/, code);
    }
    // Papel só com o que o RH já tem: permitido.
    await asOwner();
    const mini = (await one<{ id: string }>("insert into public.roles (company_id, code, name) values ($1, 'teste_mini', 'Mini (teste)') returning id", [ASTRA])).id;
    await db.query("insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where code = 'users.read'", [mini]);
    await as(rh);
    assert.equal((await invite("Mini", "teste.rbac.mini@example.com", mini)).ok, true);
    // Nem acrescentando ao papel o que não tem, nem atribuindo o Administrador.
    const add = await attempt("select public.fn_set_role_permissions($1, array['users.read', 'sales_orders.approve'])", [mini]);
    assert.equal(add.ok, false);
    assert.match(add.error, /sales_orders\.approve/);
    const self = await one<{ id: string }>("select id from public.users where auth_user_id = $1", [rh]);
    const grant = await attempt("select public.fn_assign_user_role($1, $2)", [self.id, roleA.admin]);
    assert.equal(grant.ok, false);
    assert.match(grant.error, /não pode conceder/);
  });

  test("isolamento: o Administrador de uma empresa não alcança outra", async () => {
    // Papel da outra empresa no convite: recusado.
    await as(adminA);
    const cross = await invite("Cruzado", "teste.rbac.cruzado@example.com", roleB);
    assert.equal(cross.ok, false);
    assert.match(cross.error, /Papel não encontrado nesta empresa/);
    // O convite cai sempre na empresa de quem convida.
    await as(adminB);
    const own = await invite("Da empresa B", "teste.rbac.b@example.com", roleB);
    assert.ok(own.ok, own.error);
    await asOwner();
    const created = await one<{ company_id: string }>("select company_id from public.users where email = 'teste.rbac.b@example.com'");
    assert.equal(created.company_id, companyB);
    // Admin B não atribui papel a usuário da ASTRA.
    const astraUser = await one<{ id: string }>("select id from public.users where auth_user_id = $1", [adminA]);
    await as(adminB);
    const reach = await attempt("select public.fn_assign_user_role($1, $2)", [astraUser.id, roleA.leitura]);
    assert.equal(reach.ok, false);
    assert.match(reach.error, /roles\.manage/);
  });

  test("empresa ≠ plataforma: o Administrador da empresa não administra Owners nem membros da plataforma", async () => {
    await as(adminA);
    const member = await attempt("select public.fn_upsert_platform_member($1, 'X', 'x@example.com', 'ADMIN', 'active')", [adminA]);
    assert.equal(member.ok, false);
    assert.match(member.error, /platform\.members\.manage/);
    const owner = await attempt("select public.fn_upsert_platform_member($1, 'X', 'x@example.com', 'OWNER', 'active')", [adminA]);
    assert.equal(owner.ok, false);
    const companyAdmin = await attempt("select public.fn_platform_invite_company_admin($1, 'X', 'x@example.com', 24)", [companyB]);
    assert.equal(companyAdmin.ok, false);
    assert.match(companyAdmin.error, /platform\.companies\.create/);
    const canPlatform = await one<{ ok: boolean }>("select public.has_platform_permission('platform.members.view') as ok");
    assert.equal(canPlatform.ok, false);
  });
});
