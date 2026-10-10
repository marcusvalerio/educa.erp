// Isolamento multiempresa do catálogo (unidades, conversões, produtos) e das
// views, com RLS de verdade no PostgreSQL. Cenário: empresas Alfa e Beta, com
// usuários comuns (Somente leitura), administradores, um usuário sem
// permissão de unidades e um login ligado às duas empresas.
// POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL reconstruído pelo plano
// (nunca produção). Os dados são gravados com identificadores novos a cada
// execução.
//
// Antes da 0091 (banco igual ao de produção): o caso 3 falha — a Somente
// leitura da Alfa lê as unidades da Beta (policy units_select_authenticated,
// USING true) —, os casos 11 e 12 também (FKs de uma coluna e views sem
// security_invoker). Ver docs/homologacao/RELATORIO-SEGURANCA-MULTIEMPRESA.md.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;

type Who = { auth: string; label: string };
type Row = Record<string, unknown>;

describe("isolamento multiempresa do catálogo e das views (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const owner = new Client({ connectionString: url });
  const tag = randomUUID().slice(0, 8);
  const alfa = randomUUID();
  const beta = randomUUID();
  const mk = (label: string): Who => ({ auth: randomUUID(), label });
  const alfaComum = mk("alfa.leitura");
  const betaComum = mk("beta.leitura");
  const alfaAdmin = mk("alfa.admin");
  const betaAdmin = mk("beta.admin");
  const alfaSemPermissao = mk("alfa.sem");
  const duasEmpresas = mk("duas.empresas");
  let betaUnit = "";
  let betaUnitCode = "";
  let alfaUnit = "";
  let alfaUnitCode = "";
  let betaCategory = "";

  const one = async <T = Row>(c: Client, sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0] as T;
  /** Executa como o usuário (papel authenticated + JWT) numa transação desfeita no fim. */
  const as = async <T>(who: Who | null, fn: (c: Client) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      await c.query("begin");
      if (who) {
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
          JSON.stringify({ sub: who.auth, role: "authenticated" }),
          who.auth,
        ]);
      } else {
        await c.query("set local role anon");
      }
      return { ok: true, value: await fn(c) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await c.query("rollback").catch(() => undefined);
      await c.end();
    }
  };
  const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
    if (!r.ok) assert.fail(r.error);
    return r.value;
  };
  const unitsSeen = async (who: Who, where = "true", params: unknown[] = []) =>
    must(await as(who, async (c) => (await c.query(`select id, company_id, code from public.units where ${where}`, params)).rows as { id: string; company_id: string; code: string }[]));
  const addUser = async (who: Who, company: string, role: string | null) => {
    await owner.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()) on conflict (id) do nothing", [who.auth, `${who.label}.${tag}@example.com`]);
    const user = await one<{ id: string }>(
      owner,
      "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $5, 'active') returning id",
      [company, who.auth, `${who.label} ${tag}`, `${who.label}.${tag}@example.com`, `${who.label}.${tag}`]
    );
    if (role) await owner.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = $3", [user.id, company, role]);
  };

  before(async () => {
    await owner.connect();
    await owner.query("select set_config('educa.auth_link', 'invitation', false)");
    // Empresas criadas pelo caminho normal: os gatilhos de companies semeiam
    // papéis de sistema, unidades padrão e depósito.
    await owner.query("insert into public.companies (id, name) values ($1, $2), ($3, $4)", [alfa, `Alfa ${tag}`, beta, `Beta ${tag}`]);
    // Papel personalizado da Alfa só com products.read (sem unidades).
    const role = await one<{ id: string }>(owner, "insert into public.roles (company_id, code, name) values ($1, 'so_produtos', 'Só produtos') returning id", [alfa]);
    await owner.query("insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where code = 'products.read'", [role.id]);
    await addUser(alfaComum, alfa, "leitura");
    await addUser(betaComum, beta, "leitura");
    await addUser(alfaAdmin, alfa, "admin");
    await addUser(betaAdmin, beta, "admin");
    await addUser(alfaSemPermissao, alfa, "so_produtos");
    await addUser(duasEmpresas, alfa, "leitura");
    await addUser(duasEmpresas, beta, null);
    ({ id: betaUnit, code: betaUnitCode } = await one<{ id: string; code: string }>(owner, "select id, code from public.units where company_id = $1 order by code limit 1", [beta]));
    ({ id: alfaUnit, code: alfaUnitCode } = await one<{ id: string; code: string }>(owner, "select id, code from public.units where company_id = $1 order by code limit 1", [alfa]));
    betaCategory = (await one<{ id: string }>(owner, "insert into public.product_categories (company_id, code, name) values ($1, $2, 'Categoria Beta') returning id", [beta, `CB${tag}`])).id;
  });

  after(async () => {
    await owner.end();
  });

  test("0 — as duas empresas têm unidades próprias (semeadas na criação) e não existe unidade sem empresa", async () => {
    const r = await one<{ alfa: number; beta: number; sem_empresa: number; nullable: string }>(
      owner,
      `select count(*) filter (where company_id = $1)::int as alfa, count(*) filter (where company_id = $2)::int as beta,
              count(*) filter (where company_id is null)::int as sem_empresa,
              (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'units' and column_name = 'company_id') as nullable
       from public.units`,
      [alfa, beta]
    );
    assert.ok(r.alfa > 0 && r.beta > 0, JSON.stringify(r));
    assert.equal(r.sem_empresa, 0);
    assert.equal(r.nullable, "NO", "units.company_id é obrigatório: não há unidade global");
  });

  test("1 — Alfa (Somente leitura) consulta as próprias unidades", async () => {
    const rows = await unitsSeen(alfaComum);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((u) => u.company_id === alfa), "só unidades da Alfa");
  });

  test("2 — Beta (Somente leitura) consulta as próprias unidades", async () => {
    const rows = await unitsSeen(betaComum);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((u) => u.company_id === beta), "só unidades da Beta");
  });

  test("3 — Alfa não lê unidades privadas da Beta (nem filtrando pela empresa)", async () => {
    assert.equal((await unitsSeen(alfaComum, "company_id = $1", [beta])).length, 0);
    assert.equal((await unitsSeen(alfaAdmin, "company_id = $1", [beta])).length, 0, "nem o administrador da Alfa");
  });

  test("4 — Beta não lê unidades privadas da Alfa", async () => {
    assert.equal((await unitsSeen(betaComum, "company_id = $1", [alfa])).length, 0);
    assert.equal((await unitsSeen(betaAdmin, "company_id = $1", [alfa])).length, 0);
  });

  test("5 — nem por id direto, código, paginação ou junções (produtos, conversões)", async () => {
    assert.equal((await unitsSeen(alfaComum, "id = $1", [betaUnit])).length, 0, "id direto");
    assert.equal((await unitsSeen(alfaComum, "code = $1", [betaUnitCode])).filter((u) => u.company_id === beta).length, 0, "código");
    const pages = must(await as(alfaComum, async (c) => (await c.query("select company_id from public.units order by code limit 500 offset 0")).rows));
    assert.ok(pages.every((u) => u.company_id === alfa), "paginação");
    const viaConversions = must(await as(alfaAdmin, async (c) => (await c.query("select 1 from public.unit_conversions uc join public.units u on u.id = uc.from_unit_id where u.company_id = $1", [beta])).rowCount));
    assert.equal(viaConversions, 0);
  });

  test("6 — Alfa não insere unidade em nome da Beta (nem o administrador)", async () => {
    const r = await as(alfaAdmin, (c) => c.query("insert into public.units (company_id, code, name) values ($1, $2, 'Invasora')", [beta, `X${tag}`]));
    assert.ok(!r.ok && /row-level security/i.test(r.error), r.ok ? "inseriu" : r.error);
  });

  test("7 — Alfa não altera nem exclui unidade da Beta", async () => {
    const upd = must(await as(alfaAdmin, async (c) => (await c.query("update public.units set name = 'Alterada' where id = $1", [betaUnit])).rowCount));
    const del = must(await as(alfaAdmin, async (c) => (await c.query("delete from public.units where id = $1", [betaUnit])).rowCount));
    assert.equal(upd, 0);
    assert.equal(del, 0);
    const still = await one<{ name: string }>(owner, "select name from public.units where id = $1", [betaUnit]);
    assert.notEqual(still.name, "Alterada");
  });

  test("8 — trocar o tenant pelo cliente não dá acesso: mover a própria unidade para a Beta é recusado; has_permission da Beta é falso", async () => {
    // Recusa por RLS (WITH CHECK) — ou nenhuma linha afetada; nos dois casos a unidade continua na Alfa.
    const move = await as(alfaAdmin, async (c) => (await c.query("update public.units set company_id = $1 where id = $2", [beta, alfaUnit])).rowCount);
    assert.ok(!move.ok ? /row-level security/i.test(move.error) : move.value === 0, move.ok ? `linhas: ${move.value}` : move.error);
    assert.equal((await one<{ company_id: string }>(owner, "select company_id from public.units where id = $1", [alfaUnit])).company_id, alfa);
    const perm = must(await as(alfaAdmin, async (c) => (await one<{ ok: boolean }>(c, "select public.has_permission($1, 'units.read') as ok", [beta])).ok));
    assert.equal(perm, false);
  });

  test("8b — login ligado às duas empresas, com papel só na Alfa, vê só a Alfa", async () => {
    const rows = await unitsSeen(duasEmpresas);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((u) => u.company_id === alfa));
  });

  test("9 — registros globais: o conceito não existe para unidades (nenhuma policy concede leitura fora da empresa)", async () => {
    const { rows } = await owner.query(
      "select polname, pg_get_expr(polqual, polrelid) as q from pg_policy where polrelid = 'public.units'::regclass and polcmd in ('r', '*')"
    );
    assert.ok(rows.length > 0);
    for (const p of rows) assert.match(String(p.q), /^has_permission\(company_id, 'units\.read'::text\)$/, `${p.polname}: ${p.q}`);
  });

  test("10 — sem permissão não lê; Somente leitura lê mas não cria, altera nem exclui", async () => {
    assert.equal((await unitsSeen(alfaSemPermissao)).length, 0, "papel só com products.read");
    const ins = await as(alfaComum, (c) => c.query("insert into public.units (company_id, code, name) values ($1, $2, 'Nova')", [alfa, `L${tag}`]));
    assert.ok(!ins.ok && /row-level security/i.test(ins.error), ins.ok ? "inseriu" : ins.error);
    const upd = must(await as(alfaComum, async (c) => (await c.query("update public.units set name = 'X' where id = $1", [alfaUnit])).rowCount));
    const del = must(await as(alfaComum, async (c) => (await c.query("delete from public.units where id = $1", [alfaUnit])).rowCount));
    assert.equal(upd, 0);
    assert.equal(del, 0);
  });

  test("11 — produto e conversão: funciona com unidade da própria empresa; unidade/categoria de OUTRA empresa é recusada", async () => {
    const ok = must(
      await as(alfaAdmin, async (c) => {
        const p = await one<{ id: string }>(c, "insert into public.products (company_id, code, name, unit, unit_id) values ($1, $2, 'Produto Alfa', $3, $4) returning id", [alfa, `PA${tag}`, alfaUnitCode, alfaUnit]);
        const upd = await c.query("update public.products set name = 'Produto Alfa (editado)' where id = $1", [p.id]);
        return upd.rowCount;
      })
    );
    assert.equal(ok, 1, "criar e editar produto com unidade própria");
    const crossUnit = await as(alfaAdmin, (c) => c.query("insert into public.products (company_id, code, name, unit, unit_id) values ($1, $2, 'Produto X', $3, $4)", [alfa, `PX${tag}`, alfaUnitCode, betaUnit]));
    assert.ok(!crossUnit.ok && /same_company_fk|foreign key/i.test(crossUnit.error), crossUnit.ok ? "aceitou unidade da Beta" : crossUnit.error);
    const crossCategory = await as(alfaAdmin, (c) => c.query("insert into public.products (company_id, code, name, unit, category_id) values ($1, $2, 'Produto Y', $3, $4)", [alfa, `PY${tag}`, alfaUnitCode, betaCategory]));
    assert.ok(!crossCategory.ok && /foreign key/i.test(crossCategory.error), crossCategory.ok ? "aceitou categoria da Beta" : crossCategory.error);
    const crossConversion = await as(alfaAdmin, (c) => c.query("insert into public.unit_conversions (company_id, from_unit_id, to_unit_id, factor) values ($1, $2, $3, 2)", [alfa, alfaUnit, betaUnit]));
    assert.ok(!crossConversion.ok && /foreign key/i.test(crossConversion.error), crossConversion.ok ? "aceitou conversão para unidade da Beta" : crossConversion.error);
    // Mesma regra para gravações privilegiadas (a API usa o cliente administrativo).
    const privileged = await owner.query("insert into public.unit_conversions (company_id, from_unit_id, to_unit_id, factor) values ($1, $2, $3, 2)", [alfa, alfaUnit, betaUnit]).then(() => "aceitou", (e: Error) => e.message);
    assert.match(privileged, /foreign key/i);
  });

  test("12 — caminhos privilegiados: views financeiras/estoque não vazam; funções de semeadura não são executáveis por usuários", async () => {
    for (const view of ["v_cash_flow_summary", "v_cash_flow_projection", "inventory_valuation", "v_sales_order_item_margin"]) {
      const anon = await as(null, (c) => c.query(`select company_id from public.${view}`));
      assert.ok(!anon.ok && /permission denied/i.test(anon.error), `${view} sem login: ${anon.ok ? "leu" : anon.error}`);
      const rows = must(await as(alfaComum, async (c) => (await c.query(`select distinct company_id from public.${view}`)).rows));
      assert.ok(rows.every((r) => r.company_id === alfa), `${view}: ${JSON.stringify(rows)}`);
    }
    const anonUnits = await as(null, async (c) => (await c.query("select 1 from public.units")).rowCount);
    assert.ok(!anonUnits.ok || anonUnits.value === 0, "anon não lê unidades");
    for (const fn of ["fn_seed_company_units", "fn_seed_default_roles_for_company"]) {
      const r = await as(alfaAdmin, (c) => c.query(`select public.${fn}($1)`, [beta]));
      assert.ok(!r.ok && /permission denied/i.test(r.error), `${fn}: ${r.ok ? "executou" : r.error}`);
    }
  });
});
