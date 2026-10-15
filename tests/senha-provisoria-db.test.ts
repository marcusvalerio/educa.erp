// Senha provisória (migration 0095) executada de verdade no PostgreSQL com o
// esquema do ATLAS.ERP. POC_DATABASE_OWNER_URL: conexão do DONO de um banco
// DESCARTÁVEL (nunca produção). Tudo numa única transação desfeita no fim.
//
// Cobre: quem pode gerar (mesma empresa, users.update, sem escalada, nunca
// para si nem para a equipe da plataforma); uma pendente por cadastro; o
// login ligado é conferido antes de o servidor gravar a senha; enquanto a
// troca não acontece a identidade NÃO chega ao banco (fn_resolve_identity_link);
// a troca consome, liga o login ao cadastro e audita; vencida não vale;
// authenticated não lê a tabela nem chama as funções do servidor.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const ASTRA = "00000000-0000-0000-0000-000000000001";

describe("senha provisória (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const adminA = randomUUID();
  const adminB = randomUUID();
  const rh = randomUUID(); // users.update + roles.manage, sem o resto
  let companyB = "";
  const roleA: Record<string, string> = {};

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
  const asService = async () => {
    await db.query("reset role");
    await db.query("set local role service_role");
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
  const loginWithRole = async (sub: string, company: string, roleId: string, login: string) => {
    await asOwner();
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [sub, `${login}@example.com`]);
    const u = await one<{ id: string }>(
      "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $3, 'active') returning id",
      [company, sub, login, `${login}@example.com`]
    );
    await db.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [u.id, roleId]);
    return u.id;
  };
  /** Cadastro sem login (como o admin cria antes de liberar o acesso). */
  const cadastro = async (company: string, login: string, roleId?: string, status = "active") => {
    await asOwner();
    const u = await one<{ id: string }>(
      "insert into public.users (company_id, name, email, login, status) values ($1, $2, $3, $2, $4) returning id",
      [company, login, `${login}@example.com`, status]
    );
    if (roleId) await db.query("insert into public.user_roles (user_id, role_id) values ($1, $2)", [u.id, roleId]);
    return u.id;
  };
  const shadow = async (email: string) => {
    await asOwner();
    const id = randomUUID();
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, email]);
    return id;
  };
  const neonLink = async (authUserId: string, email: string) => {
    await asOwner();
    const ext = `neon-${randomUUID()}`;
    await db.query("insert into public.auth_identity_links (provider, external_user_id, auth_user_id, email) values ('neon', $1, $2, $3)", [ext, authUserId, email]);
    return ext;
  };
  const issue = (userId: string, ttl = 72) => attempt("select public.fn_issue_temporary_password($1, $2) as r", [userId, ttl]);
  const resolve = async (ext: string) => {
    await asOwner();
    return (await one<{ r: string | null }>("select public.fn_resolve_identity_link('neon', $1) as r", [ext])).r;
  };

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    for (const r of (await db.query("select id, code from public.roles where company_id = $1 and is_system", [ASTRA])).rows) roleA[r.code] = r.id;
    companyB = (await one<{ id: string }>("insert into public.companies (name) values ('Empresa B (teste senha provisória)') returning id")).id;
    const roleB = (await one<{ id: string }>("select id from public.roles where company_id = $1 and code = 'admin'", [companyB])).id;
    await loginWithRole(adminA, ASTRA, roleA.admin, "teste.tmp.admin.a");
    await loginWithRole(adminB, companyB, roleB, "teste.tmp.admin.b");
    const rhRole = (await one<{ id: string }>("insert into public.roles (company_id, code, name) values ($1, 'teste_tmp_rh', 'RH (teste)') returning id", [ASTRA])).id;
    await db.query("insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where code in ('users.read', 'users.update', 'roles.manage', 'roles.read')", [rhRole]);
    await loginWithRole(rh, ASTRA, rhRole, "teste.tmp.rh");
  });

  after(async () => {
    await db.query("rollback").catch(() => {});
    await db.end();
  });

  test("Administrador gera para cadastro da própria empresa; a resposta não traz senha e a ação é auditada", async () => {
    const userId = await cadastro(ASTRA, "teste.tmp.vendedor1", roleA.vendedor);
    await as(adminA);
    const r = await issue(userId);
    assert.ok(r.ok, r.error);
    const out = r.rows[0].r;
    assert.equal(out.email, "teste.tmp.vendedor1@example.com");
    assert.equal(out.auth_user_id, null);
    assert.equal(Object.keys(out).some((k) => /senha|password/i.test(k)), false);
    const hours = (new Date(out.expires_at).getTime() - Date.now()) / 3_600_000;
    assert.ok(hours > 71.9 && hours <= 72, String(hours));
    await asOwner();
    const audit = await one<{ n: number; data: string }>(
      "select count(*)::int n, max(new_data::text) data from public.audit_logs where entity = 'user_temporary_passwords' and entity_id = $1 and action = 'CREATE'",
      [out.id]
    );
    assert.equal(audit.n, 1);
    assert.doesNotMatch(audit.data, /senha|password/i);
  });

  test("isolamento e regras de quem pode gerar", async () => {
    const userId = await cadastro(ASTRA, "teste.tmp.op1", roleA.operador);
    // Outra empresa: negado sem revelar nada.
    await as(adminB);
    let r = await issue(userId);
    assert.equal(r.ok, false);
    assert.match(r.error, /Permissão negada/);
    // Para si mesmo: recusado.
    await asOwner();
    const self = (await one<{ id: string }>("select id from public.users where auth_user_id = $1", [adminA])).id;
    await as(adminA);
    r = await issue(self);
    assert.equal(r.ok, false);
    assert.match(r.error, /si mesmo/);
    // Escalada: RH não assume o acesso de quem tem mais permissões (Administrador).
    const outroAdmin = await cadastro(ASTRA, "teste.tmp.admin2", roleA.admin);
    await as(rh);
    r = await issue(outroAdmin);
    assert.equal(r.ok, false);
    assert.match(r.error, /permissões que você não possui/);
    // Cadastro inativo: recusado.
    const inativo = await cadastro(ASTRA, "teste.tmp.inativo", undefined, "inactive");
    await as(adminA);
    r = await issue(inativo);
    assert.equal(r.ok, false);
    assert.match(r.error, /inativo/);
    // Validade fora da faixa.
    r = await issue(userId, 500);
    assert.equal(r.ok, false);
    assert.match(r.error, /entre 1 e 168/);
    // Vendedor (sem users.update) não gera.
    const vend = randomUUID();
    await loginWithRole(vend, ASTRA, roleA.vendedor, "teste.tmp.vend.login");
    await as(vend);
    r = await issue(userId);
    assert.equal(r.ok, false);
    assert.match(r.error, /Permissão negada/);
  });

  test("gerar de novo invalida a anterior; revogar encerra a pendente", async () => {
    const userId = await cadastro(ASTRA, "teste.tmp.repete", roleA.leitura);
    await as(adminA);
    const a = await issue(userId);
    const b = await issue(userId);
    assert.ok(a.ok && b.ok, a.error || b.error);
    await asOwner();
    const rows = (await db.query("select id, status from public.user_temporary_passwords where user_id = $1 order by issued_at, id", [userId])).rows;
    assert.equal(rows.filter((x) => x.status === "pending").length, 1);
    assert.equal(rows.find((x) => x.id === a.rows[0].r.id)?.status, "revoked");
    await as(adminA);
    const rv = await attempt("select public.fn_revoke_temporary_password($1) as r", [userId]);
    assert.ok(rv.ok, rv.error);
    assert.equal(rv.rows[0].r.revoked, true);
    await asOwner();
    assert.equal((await one<{ n: number }>("select count(*)::int n from public.user_temporary_passwords where user_id = $1 and status = 'pending'", [userId])).n, 0);
  });

  test("login ligado é conferido ANTES de o servidor gravar a senha", async () => {
    const userId = await cadastro(ASTRA, "teste.tmp.attach", roleA.vendedor);
    await as(adminA);
    const id = (await issue(userId)).rows[0].r.id as string;
    // Login de outro e-mail: recusado.
    const outro = await shadow("outra.pessoa@example.com");
    await asService();
    let r = await attempt("select public.fn_attach_temporary_password_login($1, $2)", [id, outro]);
    assert.equal(r.ok, false);
    assert.match(r.error, /não corresponde ao e-mail/);
    // Login (mesmo e-mail) já usado por outro cadastro, ex.: em outra empresa: recusado.
    await asOwner();
    const emailComum = "teste.tmp.attach@example.com";
    const doOutro = await shadow(emailComum);
    await db.query(
      "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, 'Outro', $3, 'outro.attach', 'active')",
      [companyB, doOutro, emailComum]
    );
    await asService();
    r = await attempt("select public.fn_attach_temporary_password_login($1, $2)", [id, doOutro]);
    assert.equal(r.ok, false);
    assert.match(r.error, /outro cadastro/);
    // Equipe da plataforma: recusado.
    const userP = await cadastro(ASTRA, "teste.tmp.plat", roleA.leitura);
    await as(adminA);
    const idP = (await issue(userP)).rows[0].r.id as string;
    const plat = await shadow("teste.tmp.plat@example.com");
    await asOwner();
    await db.query("insert into public.platform_members (auth_user_id, name, email, platform_role) values ($1, 'Equipe', 'teste.tmp.plat@example.com', 'ADMIN')", [plat]);
    await asService();
    r = await attempt("select public.fn_attach_temporary_password_login($1, $2)", [idP, plat]);
    assert.equal(r.ok, false);
    assert.match(r.error, /equipe da plataforma/);
  });

  test("primeiro acesso: identidade bloqueada até a troca; troca liga o login e audita", async () => {
    const email = "teste.tmp.primeiro@example.com";
    const userId = await cadastro(ASTRA, "teste.tmp.primeiro", roleA.vendedor);
    await as(adminA);
    const id = (await issue(userId)).rows[0].r.id as string;
    const login = await shadow(email);
    await asService();
    const att = await attempt("select public.fn_attach_temporary_password_login($1, $2)", [id, login]);
    assert.ok(att.ok, att.error);
    const ext = await neonLink(login, email);
    // Pendente: a identidade não chega ao banco, mesmo com sessão válida no provedor.
    assert.equal(await resolve(ext), null);
    await asService();
    const state = (await one<{ r: { id: string; status: string } }>("select public.fn_temporary_password_state('neon', $1) as r", [ext])).r;
    assert.equal(state.id, id);
    assert.equal(state.status, "pending");
    // Troca concluída.
    const c = await attempt("select public.fn_consume_temporary_password($1, $2) as r", [id, login]);
    assert.ok(c.ok, c.error);
    assert.equal(await resolve(ext), login);
    await asOwner();
    assert.equal((await one<{ a: string }>("select auth_user_id a from public.users where id = $1", [userId])).a, login);
    const audit = await one<{ n: number }>(
      "select count(*)::int n from public.audit_logs where entity_id in ($1, $2) and action in ('CONFIRM', 'ASSIGN')",
      [id, userId]
    );
    assert.equal(audit.n, 2);
    // Não consome duas vezes.
    await asService();
    const again = await attempt("select public.fn_consume_temporary_password($1, $2)", [id, login]);
    assert.equal(again.ok, false);
    // Agora a pessoa entra com a senha dela e tem as permissões do papel.
    await as(login);
    assert.equal((await one<{ ok: boolean }>("select public.has_permission($1, 'sales_orders.create') ok", [ASTRA])).ok, true);
  });

  test("redefinição para conta ativa: bloqueia as sessões até a troca; vencida não vale", async () => {
    const sub = randomUUID();
    const email = "teste.tmp.ativa@example.com";
    const userId = await loginWithRole(sub, ASTRA, roleA.operador, "teste.tmp.ativa");
    const ext = await neonLink(sub, email);
    assert.equal(await resolve(ext), sub);
    await as(adminA);
    const r = await issue(userId, 1);
    assert.ok(r.ok, r.error);
    assert.equal(r.rows[0].r.auth_user_id, sub);
    assert.equal(await resolve(ext), null);
    // Vence.
    await asOwner();
    await db.query("update public.user_temporary_passwords set issued_at = now() - interval '3 hours', expires_at = now() - interval '1 hour' where id = $1", [r.rows[0].r.id]);
    await asService();
    const state = (await one<{ r: { status: string } }>("select public.fn_temporary_password_state('neon', $1) as r", [ext])).r;
    assert.equal(state.status, "expired");
    const c = await attempt("select public.fn_consume_temporary_password($1, $2)", [r.rows[0].r.id, sub]);
    assert.equal(c.ok, false);
    assert.match(c.error, /expirou/);
    assert.equal(await resolve(ext), null);
    // Revogar libera o bloqueio (a senha antiga já foi trocada no provedor pelo servidor).
    await as(adminA);
    await attempt("select public.fn_revoke_temporary_password($1)", [userId]);
    assert.equal(await resolve(ext), sub);
  });

  test("authenticated não lê a tabela nem chama as funções do servidor", async () => {
    await as(adminA);
    for (const sql of [
      "select * from public.user_temporary_passwords",
      "select public.fn_attach_temporary_password_login(gen_random_uuid(), gen_random_uuid())",
      "select public.fn_temporary_password_state('neon', 'x')",
      "select public.fn_consume_temporary_password(gen_random_uuid(), gen_random_uuid())",
    ]) {
      const r = await attempt(sql);
      assert.equal(r.ok, false, sql);
      assert.match(r.error, /permission denied/, sql);
    }
  });
});
