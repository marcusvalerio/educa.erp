// Setores com permissões e nova senha provisória (0102) no PostgreSQL real.
// POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL (nunca produção).
// Tudo numa transação desfeita no fim.
//
// Cobre: professor coloca aluno num setor (setor e perfil do setor criados no
// grupo, só isso; grupo segue sem produtos/fornecedores); permissões do setor
// valem para o aluno; Diretoria = Gerente; Administrador não muda de setor;
// professor de outra turma, operador e empresa alheia não mexem; nova senha
// para quem já tem acesso só com autorização e nunca para login da plataforma.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;

describe("Setores com permissões e nova senha (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const owner = randomUUID();
  const prof = randomUUID();
  const prof2 = randomUUID();
  const operadorTurma = randomUUID();
  const adminEmpresa = randomUUID();
  const aluno = randomUUID();
  let turma = "";
  let turma2 = "";
  let empresa = "";
  let grupo = "";
  let alunoId = "";
  let semLoginId = "";
  let liderId = "";

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
  const login = async (sub: string, company: string, roleCode: string, name: string) => {
    await asOwner();
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [sub, `${name}@example.com`]);
    const u = await one<{ id: string }>(
      "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $3, 'active') returning id",
      [company, sub, name, `${name}@example.com`]
    );
    await db.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = $3", [u.id, company, roleCode]);
    return u.id;
  };
  const holds = async (sub: string, company: string, code: string) => {
    await as(sub);
    return (await one<{ ok: boolean }>("select public.has_permission($1, $2) as ok", [company, code])).ok;
  };

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    turma = (await one<{ id: string }>("insert into public.companies (name) values ('Turma setores') returning id")).id;
    turma2 = (await one<{ id: string }>("insert into public.companies (name) values ('Turma setores 2') returning id")).id;
    empresa = (await one<{ id: string }>("insert into public.companies (name) values ('Empresa setores') returning id")).id;
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'owner.setores@example.com', now())", [owner]);
    await db.query("insert into public.platform_members (auth_user_id, name, email, platform_role) values ($1, 'Owner', 'owner.setores@example.com', 'OWNER')", [owner]);
    await login(prof, turma, "admin", "setores.prof");
    await login(prof2, turma2, "admin", "setores.prof2");
    await login(operadorTurma, turma, "operador", "setores.operador");
    await login(adminEmpresa, empresa, "admin", "setores.empresa");
    await as(owner);
    for (const id of [turma, turma2]) await db.query("select public.fn_platform_set_company_kind($1, 'study')", [id]);
    await as(prof);
    grupo = (await one<{ r: { group_id: string } }>("select public.fn_study_create_group('Grupo setores') as r")).r.group_id;
    const roleOp = (await one<{ id: string }>("select id from public.fn_study_group_roles($1) where code = 'operador'", [grupo])).id;
    const roleGer = (await one<{ id: string }>("select id from public.fn_study_group_roles($1) where code = 'gerente'", [grupo])).id;
    semLoginId = (await one<{ r: { user_id: string } }>("select public.fn_study_add_member($1, 'Sem login', 'semlogin.setores@example.com', $2) as r", [grupo, roleOp])).r.user_id;
    liderId = (await one<{ r: { user_id: string } }>("select public.fn_study_add_member($1, 'Lider', 'lider.setores@example.com', $2) as r", [grupo, roleGer])).r.user_id;
    alunoId = await login(aluno, grupo, "operador", "setores.aluno");
  });

  after(async () => {
    await db.query("rollback").catch(() => {});
    await db.end();
  });

  test("professor coloca o aluno em Compras: setor e perfil do setor no grupo, permissões de compras", async () => {
    await as(prof);
    const r = await attempt("select public.fn_study_set_member_sector($1, 'compras') as r", [alunoId]);
    assert.ok(r.ok, r.error);
    assert.equal(r.rows[0].r.sector_name, "Compras");
    assert.equal(await holds(aluno, grupo, "purchase_orders.create"), true);
    assert.equal(await holds(aluno, grupo, "suppliers.create"), true);
    assert.equal(await holds(aluno, grupo, "customers.read"), true, "consulta comum");
    assert.equal(await holds(aluno, grupo, "accounts_payable.create"), false, "financeiro não");
    assert.equal(await holds(aluno, grupo, "users.create"), false);
    await asOwner();
    const roles = (await db.query("select r.code from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1", [alunoId])).rows.map((x) => x.code);
    assert.deepEqual(roles, ["setor_compras"], "o perfil anterior (operador) sai");
    const u = await one<{ code: string }>("select d.code from public.users u join public.departments d on d.id = u.department_id where u.id = $1", [alunoId]);
    assert.equal(u.code, "COMPRAS");
    const zerado = await one<{ p: number; s: number; c: number }>(
      "select (select count(*)::int from products where company_id = $1) p, (select count(*)::int from suppliers where company_id = $1) s, (select count(*)::int from customers where company_id = $1) c",
      [grupo]
    );
    assert.deepEqual(zerado, { p: 0, s: 0, c: 0 }, "grupo continua sem cadastros");
  });

  test("trocar de setor: Financeiro tira compras; lista de membros mostra o setor", async () => {
    await as(prof);
    assert.ok((await attempt("select public.fn_study_set_member_sector($1, 'FINANCEIRO')", [alunoId])).ok);
    assert.equal(await holds(aluno, grupo, "accounts_payable.create"), true);
    assert.equal(await holds(aluno, grupo, "purchase_orders.create"), false);
    await as(prof);
    const m = await one<{ sector_code: string; sector_name: string; is_admin: boolean }>("select sector_code, sector_name, is_admin from public.fn_study_group_members($1) where id = $2", [grupo, alunoId]);
    assert.deepEqual(m, { sector_code: "FINANCEIRO", sector_name: "Financeiro", is_admin: false });
  });

  test("Diretoria usa o perfil Gerente; setor desconhecido é recusado", async () => {
    await as(prof);
    assert.ok((await attempt("select public.fn_study_set_member_sector($1, 'DIRETORIA')", [liderId])).ok);
    await asOwner();
    const roles = (await db.query("select r.code from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1", [liderId])).rows.map((x) => x.code);
    assert.deepEqual(roles, ["gerente"]);
    await as(prof);
    assert.match((await attempt("select public.fn_study_set_member_sector($1, 'MARKETING')", [liderId])).error, /Setor desconhecido/);
  });

  test("quem não pode: professor de outra turma, operador da turma e anon", async () => {
    await as(prof2);
    assert.match((await attempt("select public.fn_study_set_member_sector($1, 'COMPRAS')", [alunoId])).error, /não encontrado/);
    await as(operadorTurma);
    assert.match((await attempt("select public.fn_study_set_member_sector($1, 'COMPRAS')", [alunoId])).error, /Só o Administrador da turma/);
    await db.query("reset role");
    await db.query("set local role anon");
    assert.match((await attempt("select public.fn_study_set_member_sector($1, 'COMPRAS')", [alunoId])).error, /permission denied/);
    assert.match((await attempt("select public.fn_ensure_sector($1, 'COMPRAS')", [grupo])).error, /permission denied/);
    await as(prof);
    assert.match((await attempt("select public.fn_ensure_sector($1, 'COMPRAS')", [grupo])).error, /permission denied/, "interna");
  });

  test("Administrador da empresa: setor de quem é da empresa; nunca de outro Administrador nem de outra empresa", async () => {
    const vendedorId = await login(randomUUID(), empresa, "vendedor", "setores.vendedor");
    await as(adminEmpresa);
    assert.ok((await attempt("select public.fn_set_user_sector($1, 'COMERCIAL')", [vendedorId])).ok);
    const adminId = (await one<{ id: string }>("select id from public.users where auth_user_id = $1", [adminEmpresa])).id;
    assert.match((await attempt("select public.fn_set_user_sector($1, 'COMPRAS')", [adminId])).error, /Administrador não muda de setor/);
    assert.match((await attempt("select public.fn_set_user_sector($1, 'COMPRAS')", [alunoId])).error, /Permissão negada/);
  });

  test("nova senha: professor autoriza para aluno com acesso; não para quem ainda não ativou", async () => {
    await as(prof);
    const r = await attempt("select public.fn_study_authorize_member_password_reset($1) as r", [alunoId]);
    assert.ok(r.ok, r.error);
    assert.equal(r.rows[0].r.auth_user_id, aluno);
    assert.match((await attempt("select public.fn_study_authorize_member_password_reset($1)", [semLoginId])).error, /ainda não ativou/);
    await as(prof2);
    assert.match((await attempt("select public.fn_study_authorize_member_password_reset($1)", [alunoId])).error, /não encontrado/);
    await asOwner();
    const audit = await one<{ n: number }>("select count(*)::int n from audit_logs where entity_id = $1 and new_data ->> 'password_reset' = 'true'", [alunoId]);
    assert.equal(audit.n, 1);
  });

  test("nova senha: Administrador da empresa só na própria empresa; login da plataforma nunca", async () => {
    const outroId = await login(randomUUID(), empresa, "operador", "setores.outro");
    await as(adminEmpresa);
    assert.ok((await attempt("select public.fn_authorize_password_reset($1)", [outroId])).ok);
    assert.match((await attempt("select public.fn_authorize_password_reset($1)", [alunoId])).error, /Permissão negada/);
    await as(operadorTurma);
    const profId = (await one<{ id: string }>("select id from public.users where auth_user_id = $1", [prof])).id;
    assert.match((await attempt("select public.fn_authorize_password_reset($1)", [profId])).error, /Permissão negada/);
    // Um login que também é da plataforma não tem a senha trocada por empresa.
    await asOwner();
    const dono = await one<{ id: string }>(
      "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, 'Owner na empresa', 'owner.setores@example.com', 'owner.setores', 'active') returning id",
      [empresa, owner]
    );
    await as(adminEmpresa);
    assert.match((await attempt("select public.fn_authorize_password_reset($1)", [dono.id])).error, /administração da plataforma/);
  });
});
