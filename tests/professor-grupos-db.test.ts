// 0109 no PostgreSQL real: o professor entra no ERP de cada grupo da turma
// e os grupos editam os dados da própria empresa. POC_DATABASE_OWNER_URL:
// dono de um banco DESCARTÁVEL (nunca produção). Tudo numa transação desfeita.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;

describe("Professor nos ERPs dos grupos (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const owner = randomUUID();
  const prof = randomUUID();
  const aluno = randomUUID();
  const outroProf = randomUUID();
  let turma = "";
  let outraTurma = "";
  let grupoA = "";
  let grupoB = "";
  let grupoOutro = "";

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
  };
  const currentCompany = async () => (await one<{ c: string }>("select company_id c from public.users where id = public.current_app_user_id()")).c;

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    turma = (await one<{ id: string }>("insert into public.companies (name) values ('Turma P') returning id")).id;
    outraTurma = (await one<{ id: string }>("insert into public.companies (name) values ('Turma Q') returning id")).id;
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'owner.p@example.com', now())", [owner]);
    await db.query("insert into public.platform_members (auth_user_id, name, email, platform_role) values ($1, 'Owner', 'owner.p@example.com', 'OWNER')", [owner]);
    await as(owner);
    for (const id of [turma, outraTurma]) await db.query("select public.fn_platform_set_company_kind($1, 'study')", [id]);
    await asOwner();
    await db.query("update public.company_platform_profiles set lifecycle_status = 'ACTIVE' where company_id in ($1, $2)", [turma, outraTurma]);
    await login(prof, turma, "admin", "prof.p");
    await login(outroProf, outraTurma, "admin", "prof.q");
    await as(prof);
    grupoA = (await one<{ g: { group_id: string } }>("select public.fn_study_create_group('Grupo A') g")).g.group_id;
    grupoB = (await one<{ g: { group_id: string } }>("select public.fn_study_create_group('Grupo B') g")).g.group_id;
    await as(outroProf);
    grupoOutro = (await one<{ g: { group_id: string } }>("select public.fn_study_create_group('Grupo Q') g")).g.group_id;
    await login(aluno, grupoA, "gerente", "aluno.p");
  });

  after(async () => {
    await db.query("rollback").catch(() => {});
    await db.end();
  });

  test("professor lista a turma e os grupos; aluno não lista nada", async () => {
    await as(prof);
    const rows = (await db.query("select company_id, is_class, is_current from public.fn_study_workspaces()")).rows;
    assert.deepEqual(rows.map((r) => r.company_id), [turma, grupoA, grupoB]);
    assert.equal(rows.find((r) => r.is_current)?.company_id, turma);
    await as(aluno);
    assert.equal((await db.query("select * from public.fn_study_workspaces()")).rows.length, 0);
  });

  test("entra no grupo como Administrador escondido, troca de grupo e volta para a turma", async () => {
    await as(prof);
    { const r = await attempt("select public.fn_study_enter_workspace($1)", [grupoA]); assert.ok(r.ok, r.error); }
    assert.equal(await currentCompany(), grupoA);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'sales_orders.create') ok", [grupoA])).ok, true);
    // integrantes não mostram o professor
    const names = (await db.query("select name from public.fn_study_group_members($1)", [grupoA])).rows.map((r) => r.name);
    assert.deepEqual(names, ["aluno.p"]);
    // de dentro do grupo A vai direto para o B (sem duplicar o usuário no A)
    assert.ok((await attempt("select public.fn_study_enter_workspace($1)", [grupoB])).ok);
    assert.equal(await currentCompany(), grupoB);
    assert.ok((await attempt("select public.fn_study_enter_workspace($1)", [grupoA])).ok);
    await asOwner();
    assert.equal((await one<{ n: number }>("select count(*)::int n from public.users where company_id = $1 and auth_user_id = $2", [grupoA, prof])).n, 1);
    await as(prof);
    assert.ok((await attempt("select public.fn_study_enter_workspace($1)", [turma])).ok);
    assert.equal(await currentCompany(), turma);
  });

  test("ninguém entra em grupo de outra turma; aluno não entra em nada", async () => {
    await as(prof);
    assert.match((await attempt("select public.fn_study_enter_workspace($1)", [grupoOutro])).error, /Grupo não encontrado/);
    await as(aluno);
    assert.match((await attempt("select public.fn_study_enter_workspace($1)", [grupoB])).error, /Só o Administrador da turma/);
    assert.equal(await currentCompany(), grupoA);
  });

  test("grupo edita os dados da empresa; o nome original fica guardado para o professor", async () => {
    await as(aluno);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'companies.update') ok", [grupoA])).ok, true);
    // a API grava com o cliente de serviço depois de checar companies.update
    await asOwner();
    await db.query("update public.companies set name = 'Elétrica Faísca Ltda', legal_name = 'Faísca Comércio Ltda', group_label = 'x' where id = $1", [grupoA]);
    const c = await one<{ name: string; group_label: string }>("select name, group_label from public.companies where id = $1", [grupoA]);
    assert.deepEqual([c.name, c.group_label], ["Elétrica Faísca Ltda", "Grupo A"]);
    await as(prof);
    const g = await one<{ name: string }>("select name from public.fn_study_groups() where id = $1", [grupoA]);
    assert.equal(g.name, "Grupo A — Elétrica Faísca Ltda");
  });

  test("0110: aluno não exclui; o professor (Administrador do grupo) exclui", async () => {
    await as(aluno);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'products.delete') ok", [grupoA])).ok, false);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'products.update') ok", [grupoA])).ok, true);
    await as(prof);
    await db.query("select public.fn_study_enter_workspace($1)", [grupoA]);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'products.delete') ok", [grupoA])).ok, true);
    // devolver a exclusão a um papel de aluno é ignorado
    await asOwner();
    await db.query("insert into public.role_permissions (role_id, permission_id) select r.id, p.id from public.roles r, public.permissions p where r.company_id = $1 and r.code = 'gerente' and p.code = 'products.delete' on conflict do nothing", [grupoA]);
    await as(aluno);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'products.delete') ok", [grupoA])).ok, false);
  });
});
