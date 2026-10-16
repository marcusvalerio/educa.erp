// Modo Estudo (0096) executado de verdade no PostgreSQL com o esquema do
// ATLAS.ERP. POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL (nunca
// produção). Tudo numa transação desfeita no fim.
//
// Cobre: só a plataforma define o tipo; só o Administrador de uma TURMA cria
// grupos e cadastra alunos; grupo nasce como empresa isolada (papéis e
// módulos herdados); o professor não vê dados do grupo; outra turma, outra
// empresa e o próprio aluno não gerenciam grupos alheios; convite do aluno
// funciona com o aceite normal; ninguém muda tipo/turma por UPDATE direto.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;

describe("Modo Estudo: turma e grupos (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const owner = randomUUID(); // plataforma
  const prof = randomUUID(); // Administrador da turma
  const prof2 = randomUUID(); // Administrador de outra turma
  const operadorTurma = randomUUID(); // operador da turma (sem roles.manage)
  const adminEmpresa = randomUUID(); // Administrador de empresa comum
  let turma = "";
  let turma2 = "";
  let empresa = "";
  let grupo = "";

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

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    turma = (await one<{ id: string }>("insert into public.companies (name) values ('Turma teste') returning id")).id;
    turma2 = (await one<{ id: string }>("insert into public.companies (name) values ('Turma teste 2') returning id")).id;
    empresa = (await one<{ id: string }>("insert into public.companies (name) values ('Empresa comum teste') returning id")).id;
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'owner.estudo@example.com', now())", [owner]);
    await db.query("insert into public.platform_members (auth_user_id, name, email, platform_role) values ($1, 'Owner', 'owner.estudo@example.com', 'OWNER')", [owner]);
    await login(prof, turma, "admin", "teste.estudo.prof");
    await login(prof2, turma2, "admin", "teste.estudo.prof2");
    await login(operadorTurma, turma, "operador", "teste.estudo.operador");
    await login(adminEmpresa, empresa, "admin", "teste.estudo.empresa");
  });

  after(async () => {
    await db.query("rollback").catch(() => {});
    await db.end();
  });

  test("tipo: só a plataforma define; UPDATE direto é recusado até para o dono do banco", async () => {
    await as(prof);
    assert.match((await attempt("select public.fn_platform_set_company_kind($1, 'study')", [turma])).error, /Permissão negada/);
    await asOwner();
    assert.match((await attempt("update public.companies set company_kind = 'study' where id = $1", [turma])).error, /só são alterados pelas funções/);
    assert.match((await attempt("update public.companies set parent_company_id = $1 where id = $2", [turma, empresa])).error, /só são alterados pelas funções/);
    await as(owner);
    for (const id of [turma, turma2]) assert.ok((await attempt("select public.fn_platform_set_company_kind($1, 'study')", [id])).ok);
    assert.match((await attempt("select public.fn_platform_set_company_kind($1, 'outro')", [turma])).error, /Tipo inválido/);
  });

  test("contexto: professor da turma gerencia; operador da turma e empresa comum não", async () => {
    await as(prof);
    assert.deepEqual((await one<{ r: unknown }>("select public.fn_study_context() as r")).r, { is_study: true, can_manage: true, parent_name: null });
    await as(operadorTurma);
    assert.equal((await one<{ r: { can_manage: boolean } }>("select public.fn_study_context() as r")).r.can_manage, false);
    await as(adminEmpresa);
    assert.equal((await one<{ r: { is_study: boolean } }>("select public.fn_study_context() as r")).r.is_study, false);
  });

  test("grupo: professor cria; nasce empresa comum ligada à turma, com papéis e módulos da turma", async () => {
    await as(adminEmpresa);
    assert.match((await attempt("select public.fn_study_create_group('Grupo X')")).error, /só em empresas do tipo Estudo/);
    await as(operadorTurma);
    assert.match((await attempt("select public.fn_study_create_group('Grupo X')")).error, /Só o Administrador da turma/);
    await as(prof);
    const r = await attempt("select public.fn_study_create_group('Grupo 1') as r");
    assert.ok(r.ok, r.error);
    grupo = r.rows[0].r.group_id;
    assert.match((await attempt("select public.fn_study_create_group('grupo 1')")).error, /Já existe um grupo/);
    await asOwner();
    const g = await one<{ company_kind: string; parent_company_id: string }>("select company_kind, parent_company_id from public.companies where id = $1", [grupo]);
    assert.deepEqual(g, { company_kind: "business", parent_company_id: turma });
    const roles = (await db.query("select code from public.roles where company_id = $1 and is_system order by code", [grupo])).rows.map((x) => x.code);
    assert.deepEqual(roles, ["admin", "gerente", "leitura", "operador", "vendedor"]);
    const diff = await one<{ n: number }>(
      `select count(*)::int n from public.company_modules p
       left join public.company_modules g on g.company_id = $2 and g.module_code = p.module_code
       where p.company_id = $1 and (g.id is null or g.contracted <> p.contracted or g.enabled_by_company <> p.enabled_by_company)`,
      [turma, grupo]
    );
    assert.equal(diff.n, 0, "módulos do grupo iguais aos da turma");
    // Um grupo não vira turma nem a turma volta a ser empresa com grupos.
    await as(owner);
    assert.match((await attempt("select public.fn_platform_set_company_kind($1, 'study')", [grupo])).error, /grupo de turma não pode mudar/);
    assert.match((await attempt("select public.fn_platform_set_company_kind($1, 'business')", [turma])).error, /tem grupos/);
    // A lista da plataforma mostra tipo e turma (sem nome); professor não lê.
    const kinds = (await db.query("select company_id, company_kind, parent_company_id, groups::int from public.fn_platform_company_kinds() where company_id in ($1, $2)", [turma, grupo])).rows;
    assert.deepEqual(kinds.sort((a, b) => (a.company_id === turma ? -1 : 1)), [
      { company_id: turma, company_kind: "study", parent_company_id: null, groups: 1 },
      { company_id: grupo, company_kind: "business", parent_company_id: turma, groups: 0 },
    ]);
    await as(prof);
    assert.match((await attempt("select * from public.fn_platform_company_kinds()")).error, /Permissão negada/);
  });

  test("alunos: professor cadastra com papel do grupo; outra turma e empresa comum não", async () => {
    await as(prof);
    const roleTurma = (await one<{ id: string }>("select id from public.roles where company_id = $1 and code = 'admin'", [turma])).id;
    const roleGrupo = (await one<{ id: string }>("select id from public.fn_study_group_roles($1) where code = 'gerente'", [grupo])).id;
    assert.match((await attempt("select public.fn_study_add_member($1, 'Aluno', 'aluno1.estudo@example.com', $2)", [grupo, roleTurma])).error, /Papel não encontrado neste grupo/);
    const add = await attempt("select public.fn_study_add_member($1, 'Aluno Um', 'Aluno1.Estudo@example.com', $2) as r", [grupo, roleGrupo]);
    assert.ok(add.ok, add.error);
    assert.match((await attempt("select public.fn_study_add_member($1, 'Outro', 'aluno1.estudo@example.com', $2)", [grupo, roleGrupo])).error, /já está cadastrado/);
    const members = (await db.query("select name, email, has_login, roles from public.fn_study_group_members($1)", [grupo])).rows;
    assert.deepEqual(members, [{ name: "Aluno Um", email: "aluno1.estudo@example.com", has_login: false, roles: "Gerente" }]);
    for (const sub of [prof2, adminEmpresa]) {
      await as(sub);
      assert.ok(!(await attempt("select public.fn_study_add_member($1, 'X', 'x.estudo@example.com', $2)", [grupo, roleGrupo])).ok);
      assert.ok(!(await attempt("select * from public.fn_study_group_members($1)", [grupo])).ok);
    }
    await as(prof2);
    assert.equal((await db.query("select * from public.fn_study_groups()")).rows.length, 0, "outra turma não lista os grupos");
  });

  test("convite do aluno: professor emite, aluno aceita normalmente e entra só no grupo", async () => {
    await as(prof);
    const member = (await one<{ id: string }>("select id from public.fn_study_group_members($1)", [grupo])).id;
    await as(prof2);
    assert.match((await attempt("select public.fn_study_create_member_invitation($1)", [member])).error, /não encontrado nos grupos/);
    await as(prof);
    const inv = await attempt("select public.fn_study_create_member_invitation($1) as r", [member]);
    assert.ok(inv.ok, inv.error);
    const token = inv.rows[0].r.token as string;
    const pending = await one<{ r: { id: string } }>("select public.fn_study_member_pending_invitation($1) as r", [member]);
    assert.ok(pending.r?.id);
    const aluno = randomUUID();
    await asOwner();
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'aluno1.estudo@example.com', now())", [aluno]);
    await as(aluno);
    const acc = await attempt("select public.fn_accept_user_invitation($1)", [token]);
    assert.ok(acc.ok, acc.error);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'products.read') ok", [grupo])).ok, true);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'products.read') ok", [turma])).ok, false);
    // Aluno não gerencia grupos (nem o próprio).
    assert.ok(!(await attempt("select public.fn_study_create_group('Grupo do aluno')")).ok);
    assert.ok(!(await attempt("select * from public.fn_study_groups()")).ok);
    // Já com acesso: novo convite é recusado.
    await as(prof);
    assert.match((await attempt("select public.fn_study_create_member_invitation($1)", [member])).error, /já tem acesso/);
  });

  test("isolamento: o grupo não vê a turma e o professor não vê os dados do grupo (só contagens)", async () => {
    await asOwner();
    await db.query("insert into public.products (company_id, code, name, unit, status) values ($1, 'PRD-G1', 'Produto do grupo', 'UN', 'active'), ($2, 'PRD-T1', 'Produto da turma', 'UN', 'active')", [grupo, turma]);
    await as(prof);
    const seen = (await db.query("select code from public.products where company_id in ($1, $2) order by code", [grupo, turma])).rows.map((x) => x.code);
    assert.deepEqual(seen, ["PRD-T1"], "professor só vê os produtos da turma");
    const groups = (await db.query("select name, members::int, logins::int, products::int from public.fn_study_groups()")).rows;
    assert.deepEqual(groups, [{ name: "Grupo 1", members: 1, logins: 1, products: 1 }]);
    // Nem a lista de usuários do grupo o professor lê direto (RLS).
    assert.equal((await db.query("select id from public.users where company_id = $1", [grupo])).rows.length, 0);
    await asOwner();
    const aluno = (await one<{ auth_user_id: string }>("select auth_user_id from public.users where company_id = $1 and auth_user_id is not null", [grupo])).auth_user_id;
    await as(aluno);
    const alunoVe = (await db.query("select code from public.products where company_id in ($1, $2) order by code", [grupo, turma])).rows.map((x) => x.code);
    assert.deepEqual(alunoVe, ["PRD-G1"], "aluno só vê os produtos do grupo");
  });

  test("revogar convite pendente: professor revoga; outra turma não", async () => {
    await as(prof);
    const roleGrupo = (await one<{ id: string }>("select id from public.fn_study_group_roles($1) where code = 'operador'", [grupo])).id;
    const m = (await one<{ r: { user_id: string } }>("select public.fn_study_add_member($1, 'Aluno Dois', 'aluno2.estudo@example.com', $2) as r", [grupo, roleGrupo])).r.user_id;
    const inv = (await one<{ r: { invitation_id: string } }>("select public.fn_study_create_member_invitation($1) as r", [m])).r.invitation_id;
    await as(prof2);
    assert.ok(!(await attempt("select public.fn_study_revoke_member_invitation($1)", [inv])).ok);
    await as(prof);
    assert.deepEqual((await one<{ r: unknown }>("select public.fn_study_revoke_member_invitation($1) as r", [inv])).r, { revoked: true });
    assert.equal((await one<{ r: unknown }>("select public.fn_study_member_pending_invitation($1) as r", [m])).r, null);
  });
});
