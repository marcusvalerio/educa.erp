// Camada de dados em PostgreSQL direto (DATA_BACKEND=postgres): o adaptador
// com a mesma forma de uso do supabase-js. Testes puros (geração de SQL,
// parâmetros, erros) rodam sempre; os de integração só com
// POC_DATABASE_URL (um banco descartável com o esquema do EDUCA — ver
// poc/neon-full/README.md), nunca contra produção.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  QueryBuilder,
  chooseFunction,
  ident,
  parseLogic,
  parseSelect,
  rpcSql,
  runRpc,
  type Catalog,
  type QueryExec,
  type SessionRunner,
} from "@/lib/database/pg/postgrest-compat";
import { sessionPreamble } from "@/lib/database/pg/client";
import { parseDataBackend } from "@/lib/database/backend";

const catalog: Catalog = {
  relationships: [
    { from: "sales_order_items", fromCols: ["order_id"], to: "sales_orders", toCols: ["id"] },
    { from: "sales_orders", fromCols: ["customer_id"], to: "customers", toCols: ["id"] },
    { from: "products", fromCols: ["company_id", "unit"], to: "units", toCols: ["company_id", "code"], name: "products_unit_company_id_fkey" },
    { from: "products", fromCols: ["sale_unit_id"], to: "units", toCols: ["id"], name: "products_sale_unit_id_fkey" },
  ],
  functions: new Map([
    ["fn_scalar", [{ kind: "scalar", args: [{ name: "p_id", type: "uuid", hasDefault: false }] }]],
    ["fn_set", [{ kind: "set", args: [] }]],
    ["fn_void", [{ kind: "void", args: [{ name: "p_payload", type: "jsonb", hasDefault: false }] }]],
    ["fn_row", [{ kind: "composite", args: [{ name: "p_a", type: "integer", hasDefault: false }, { name: "p_b", type: "text", hasDefault: true }] }]],
    [
      "fn_over",
      [
        { kind: "scalar", args: [{ name: "p_a", type: "integer", hasDefault: false }] },
        { kind: "scalar", args: [{ name: "p_b", type: "text", hasDefault: false }] },
      ],
    ],
  ]),
  primaryKeys: new Map([["products", ["id"]]]),
};
const cat = () => Promise.resolve(catalog);

/** Executor falso: registra o SQL e devolve linhas fixas. */
function fakeRunner(rows: Record<string, unknown>[] = [{ data: [] }]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const run: SessionRunner = async (work) => work((async (sql, params) => {
    calls.push({ sql, params });
    return { rows: sql.startsWith("select count(*)") ? [{ n: 7 }] : rows };
  }) as QueryExec);
  return { run, calls };
}

describe("identificadores e seleção", () => {
  test("ident aceita só nomes simples e cita", () => {
    assert.equal(ident("company_id"), '"company_id"');
    for (const bad of ['a"b', "a;drop table x", "A", "1a", "a b", "a.b", "a--", ""]) {
      assert.throws(() => ident(bad), /Identificador inválido/, bad);
    }
  });

  test("parseSelect: *, colunas, alias e recursos embutidos aninhados com dica", () => {
    assert.deepEqual(parseSelect("*"), [{ kind: "star" }]);
    assert.deepEqual(parseSelect("id, nome:name"), [
      { kind: "col", name: "id", alias: undefined },
      { kind: "col", name: "name", alias: "nome" },
    ]);
    const items = parseSelect("id, cliente:customers!sales_orders_customer_id_fkey(id, name), sales_order_items(*)");
    assert.equal(items.length, 3);
    assert.deepEqual(items[1], { kind: "embed", alias: "cliente", rel: "customers", hint: "sales_orders_customer_id_fkey", items: [{ kind: "col", name: "id", alias: undefined }, { kind: "col", name: "name", alias: undefined }] });
    assert.deepEqual(items[2], { kind: "embed", alias: "sales_order_items", rel: "sales_order_items", items: [{ kind: "star" }] });
    assert.throws(() => parseSelect("id; drop table x"), /Seleção não suportada/);
  });
});

describe("select → SQL", () => {
  test("filtros viram parâmetros; ordem, faixa e contagem", async () => {
    const q = new QueryBuilder("products", cat, fakeRunner().run)
      .select("*", { count: "exact" })
      .eq("company_id", "c1")
      .ilike("name", "%x%")
      .in("status", ["active", "blocked"])
      .is("deleted_at", null)
      .order("code", { ascending: false })
      .range(20, 29);
    const { sql, params, countSql, countParams } = await q.toSql();
    assert.match(sql, /from public\."products" t0 where t0\."company_id" = \$1 and t0\."name" ilike \$2 and t0\."status" = any\(\$3\) and t0\."deleted_at" is null order by t0\."code" desc limit 10 offset 20/);
    assert.deepEqual(params, ["c1", "%x%", ["active", "blocked"]]);
    assert.equal(countSql, 'select count(*)::bigint as n from public."products" t0 where t0."company_id" = $1 and t0."name" ilike $2 and t0."status" = any($3) and t0."deleted_at" is null');
    assert.deepEqual(countParams, params);
  });

  test("valor malicioso nunca entra no texto do SQL", async () => {
    const evil = "x' or 1=1; drop table products; --";
    const { sql, params } = await new QueryBuilder("products", cat, fakeRunner().run).select("*").eq("code", evil).or(`name.ilike.*${evil.replace(/[,()]/g, "")}*`).toSql();
    assert.ok(!sql.includes("drop table"));
    assert.ok(params.every((p) => typeof p === "string"));
    assert.ok(params.some((p) => String(p).includes("drop table")));
  });

  test("recurso embutido: um-para-muitos (json_agg) e muitos-para-um (row_to_json), FK composta", async () => {
    const { sql } = await new QueryBuilder("sales_orders", cat, fakeRunner().run).select("id, customers(name), sales_order_items(*)").toSql();
    assert.match(sql, /\(select row_to_json\(x\) from \(select e\d+\."name" from public\."customers" e\d+ where e\d+\."id" = t0\."customer_id"\) x limit 1\) as "customers"/);
    assert.match(sql, /\(select coalesce\(json_agg\(row_to_json\(x\)\), '\[\]'::json\) from \(select e\d+\.\* from public\."sales_order_items" e\d+ where e\d+\."order_id" = t0\."id"\) x\) as "sales_order_items"/);
    const ambiguous = await new QueryBuilder("products", cat, fakeRunner().run).select("id, units(name)");
    assert.equal(ambiguous.error?.code, "PGRST201", "duas FKs products→units: ambíguo, como no PostgREST");
    const byColumn = await new QueryBuilder("products", cat, fakeRunner().run).select("id, venda:units!sale_unit_id(name)").toSql();
    assert.match(byColumn.sql, /e\d+\."id" = t0\."sale_unit_id"\) x limit 1\) as "venda"/);
    const composite = await new QueryBuilder("products", cat, fakeRunner().run).select("id, units!products_unit_company_id_fkey(name)").toSql();
    assert.match(composite.sql, /e\d+\."company_id" = t0\."company_id" and e\d+\."code" = t0\."unit"/);
  });

  test("relação inexistente → PGRST200 no await (sem lançar)", async () => {
    const r = await new QueryBuilder("products", cat, fakeRunner().run).select("id, carriers(name)");
    assert.equal(r.error?.code, "PGRST200");
    assert.equal(r.data, null);
  });

  test(".or(): gramática do PostgREST (not, and/or aninhados, in, curinga *)", async () => {
    const f = parseLogic("code.ilike.*abc*,and(status.eq.active,kind.not.in.(a,\"b,c\")),name.not.is.null", "or");
    const p = { values: [] as unknown[], add(v: unknown) { this.values.push(v); return `$${this.values.length}`; } };
    const sql = f("t0", p as never);
    assert.equal(sql, 't0."code" ilike $1 or (t0."status" = $2 and not (t0."kind" = any($3))) or not (t0."name" is null)');
    assert.deepEqual(p.values, ["%abc%", "active", ["a", "b,c"]]);
    assert.throws(() => parseLogic("code.regex.x", "or"), /Filtro não suportado/);
    assert.throws(() => parseLogic("not.code.eq.x", "or"), /Filtro não suportado/, "negação é col.not.op no PostgREST");
    assert.equal(parseLogic("not.and(a.eq.1,b.eq.2)", "or")("t0", { values: [], add() { return "$"; } } as never), 'not (t0."a" = $ and t0."b" = $)');
  });

  test("erros de montagem ficam para o await, como no supabase-js (nada executa)", async () => {
    const { run, calls } = fakeRunner();
    const bad = new QueryBuilder("products", cat, run).select("*").order("codigo; drop table products");
    const r = await bad;
    assert.equal(r.error?.code, "PGRST100");
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0);
    const badOr = await new QueryBuilder("products", cat, run).select("*").or("x.bogus.1");
    assert.equal(badOr.error?.code, "PGRST100");
    const badTable = await new QueryBuilder("pro ducts", cat, run).select("*");
    assert.equal(badTable.error?.code, "PGRST100");
    assert.equal(calls.length, 0);
  });
});

describe("mutações → SQL", () => {
  test("insert com json_populate_recordset e returning só com .select()", async () => {
    const withSelect = await new QueryBuilder("products", cat, fakeRunner().run).insert([{ code: "A", name: "x" }, { code: "B" }]).select("id").toSql();
    assert.match(withSelect.sql, /^with m as \(insert into public\."products" \("code", "name"\) select "code", "name" from json_populate_recordset\(null::public\."products", \$1::json\) returning \*\)/);
    assert.deepEqual(withSelect.params, [JSON.stringify([{ code: "A", name: "x" }, { code: "B" }])]);
    const bare = await new QueryBuilder("products", cat, fakeRunner().run).insert({ code: "A" }).toSql();
    assert.equal(bare.returns, false);
    assert.ok(!bare.sql.includes("returning"));
  });

  test("upsert: alvo explícito ou chave primária", async () => {
    const a = await new QueryBuilder("products", cat, fakeRunner().run).upsert({ company_id: "c", code: "A", name: "n" }, { onConflict: "company_id,code" }).toSql();
    assert.match(a.sql, /on conflict \("company_id", "code"\) do update set "name" = excluded\."name"/);
    const b = await new QueryBuilder("products", cat, fakeRunner().run).upsert({ id: "1", name: "n" }).toSql();
    assert.match(b.sql, /on conflict \("id"\) do update set "name" = excluded\."name"/);
    const c = await new QueryBuilder("products", cat, fakeRunner().run).upsert({ id: "1" }).toSql();
    assert.match(c.sql, /on conflict \("id"\) do nothing/);
  });

  test("update e delete respeitam os filtros (sem filtro = todas as linhas visíveis pela RLS, como o PostgREST sem trava)", async () => {
    const u = await new QueryBuilder("products", cat, fakeRunner().run).update({ name: "n" }).eq("id", "p1").select("*").toSql();
    assert.match(u.sql, /update public\."products" t0 set "name" = s\."name" from json_populate_record\(null::public\."products", \$1::json\) s where t0\."id" = \$2 returning t0\.\*/);
    const d = await new QueryBuilder("products", cat, fakeRunner().run).delete().eq("id", "p1").toSql();
    assert.equal(d.sql, 'delete from public."products" t0 where t0."id" = $1');
    const empty = await new QueryBuilder("products", cat, fakeRunner().run).update({});
    assert.equal(empty.error?.code, "PGRST102");
  });
});

describe("resposta no formato do supabase-js", () => {
  test("lista, contagem e head", async () => {
    const list = await new QueryBuilder("products", cat, fakeRunner([{ data: [{ id: 1 }, { id: 2 }] }]).run).select("*", { count: "exact" });
    assert.deepEqual(list.data, [{ id: 1 }, { id: 2 }]);
    assert.equal(list.count, 7);
    const head = await new QueryBuilder("products", cat, fakeRunner().run).select("*", { count: "exact", head: true });
    assert.equal(head.data, null);
    assert.equal(head.count, 7);
  });

  test("single / maybeSingle → PGRST116 (406) como o PostgREST", async () => {
    const none = await new QueryBuilder("products", cat, fakeRunner([{ data: [] }]).run).select("*").single();
    assert.equal(none.error?.code, "PGRST116");
    assert.equal(none.status, 406);
    const maybe = await new QueryBuilder("products", cat, fakeRunner([{ data: [] }]).run).select("*").maybeSingle();
    assert.equal(maybe.error, null);
    assert.equal(maybe.data, null);
    const two = await new QueryBuilder("products", cat, fakeRunner([{ data: [{}, {}] }]).run).select("*").maybeSingle();
    assert.equal(two.error?.code, "PGRST116");
    const one = await new QueryBuilder("products", cat, fakeRunner([{ data: [{ id: 9 }] }]).run).select("*").single();
    assert.deepEqual(one.data, { id: 9 });
  });

  test("erro do Postgres preserva code/message/details/hint (usados por translatePostgresError)", async () => {
    const run: SessionRunner = async () => {
      throw Object.assign(new Error('duplicate key value violates unique constraint "products_code_key"'), { code: "23505", detail: "Key (code)=(A) already exists." });
    };
    const r = await new QueryBuilder("products", cat, run).insert({ code: "A" });
    assert.deepEqual(r.error, { code: "23505", message: 'duplicate key value violates unique constraint "products_code_key"', details: "Key (code)=(A) already exists.", hint: null });
    assert.equal(r.status, 409);
  });
});

describe("rpc", () => {
  test("escolha da sobrecarga por nomes de argumentos (PGRST202/203)", () => {
    assert.equal(chooseFunction(catalog.functions.get("fn_over"), "fn_over", { p_b: "x" }).args[0].name, "p_b");
    assert.throws(() => chooseFunction(catalog.functions.get("fn_over"), "fn_over", {}), /não encontrada/);
    assert.throws(() => chooseFunction(undefined, "nada", {}), /não encontrada/);
    assert.equal(chooseFunction(catalog.functions.get("fn_row"), "fn_row", { p_a: 1 }).kind, "composite");
    assert.throws(() => chooseFunction(catalog.functions.get("fn_row"), "fn_row", { p_a: 1, p_x: 2 }), /não encontrada/);
  });

  test("SQL por tipo de retorno; argumentos tipados e jsonb serializado", async () => {
    const s = await rpcSql(catalog, "fn_scalar", { p_id: "u1" });
    assert.equal(s.sql, 'select to_json(public."fn_scalar"("p_id" := $1::uuid)) as data');
    assert.deepEqual(s.params, ["u1"]);
    assert.match((await rpcSql(catalog, "fn_set", {})).sql, /^select coalesce\(json_agg\(r\), '\[\]'::json\) as data from public\."fn_set"\(\) r$/);
    const v = await rpcSql(catalog, "fn_void", { p_payload: { a: [1, "x'y"] } });
    assert.equal(v.sql, 'select public."fn_void"("p_payload" := $1::jsonb) is null as data');
    assert.deepEqual(v.params, [JSON.stringify({ a: [1, "x'y"] })]);
    assert.match((await rpcSql(catalog, "fn_row", { p_a: 1 })).sql, /case when r is null then null else to_json\(r\) end as data from public\."fn_row"\("p_a" := \$1::integer\) r/);
  });

  test("runRpc devolve { data, error } e nunca lança", async () => {
    const ok = await runRpc(cat, fakeRunner([{ data: "abc" }]).run, "fn_scalar", { p_id: "u" });
    assert.deepEqual([ok.data, ok.error], ["abc", null]);
    const missing = await runRpc(cat, fakeRunner().run, "fn_nada", {});
    assert.equal(missing.error?.code, "PGRST202");
    const bad = await runRpc(cat, fakeRunner().run, "fn; drop", {});
    assert.equal(bad.error?.code, "PGRST100");
  });
});

describe("sessão no banco (papel + claims por transação)", () => {
  test("preâmbulo fixa papel e claims; lista branca de papéis; sub obrigatório para authenticated", () => {
    const sub = "3f0c2a1e-9b7d-4c1a-8e2f-0a1b2c3d4e5f";
    const sql = sessionPreamble({ role: "authenticated", sub, email: "o'brien@x.test" });
    assert.match(sql, /^begin;\nset local role authenticated;\n/);
    assert.ok(sql.includes(`'{"role":"authenticated","sub":"${sub}","email":"o''brien@x.test"}'`));
    assert.ok(sql.includes(", true)"), "set_config local à transação");
    assert.throws(() => sessionPreamble({ role: "authenticated" }), /auth_user_id/);
    assert.throws(() => sessionPreamble({ role: "authenticated", sub: "x' or 1=1" }), /auth_user_id/);
    assert.throws(() => sessionPreamble({ role: "postgres" as never }), /Papel/);
    assert.match(sessionPreamble({ role: "anon" }), /set local role anon/);
  });

  test("DATA_BACKEND: supabase por padrão; valor desconhecido falha fechado; postgres exige Neon Auth", () => {
    assert.equal(parseDataBackend(undefined), "supabase");
    assert.equal(parseDataBackend(" Postgres "), "postgres");
    assert.throws(() => parseDataBackend("mysql"), /inválido/);
    const server = readFileSync(path.join(process.cwd(), "src/lib/supabase/server.ts"), "utf8");
    assert.match(server, /if \(authProvider\(\) !== "neon"\) throw new Error\("DATA_BACKEND=postgres exige AUTH_PROVIDER=neon\."\)/);
  });
});

// ------------------------------------------------------------ integração (opcional)
const url = process.env.POC_DATABASE_URL;
describe("integração com PostgreSQL real (POC_DATABASE_URL)", { skip: !url && "POC_DATABASE_URL não definida" }, () => {
  let mod: typeof import("@/lib/database/pg/client");
  const load = async () => {
    process.env.DATABASE_URL = url;
    mod ??= await import("@/lib/database/pg/client");
    return mod;
  };
  after(async () => {
    if (mod) await mod.closePool();
  });

  test("anon não lê dados de empresa; service_role lê (BYPASSRLS)", async () => {
    const { createPgDataClient } = await load();
    const anon = await createPgDataClient({ role: "anon" }).from("companies").select("id");
    assert.ok(anon.error || (anon.data as unknown[]).length === 0);
    const admin = await createPgDataClient({ role: "service_role" }).from("companies").select("id", { count: "exact", head: true });
    assert.equal(admin.error, null);
    assert.ok((admin.count ?? 0) >= 1);
  });

  test("authenticated com sub desconhecido não vê nenhuma empresa (RLS)", async () => {
    const { createPgDataClient } = await load();
    const r = await createPgDataClient({ role: "authenticated", sub: "00000000-0000-4000-8000-000000000000" }).from("products").select("id");
    assert.equal(r.error, null);
    assert.deepEqual(r.data, []);
  });

  test("rpc real: função do banco resolvida pelo catálogo", async () => {
    const { createPgDataClient } = await load();
    const r = await createPgDataClient({ role: "authenticated", sub: "00000000-0000-4000-8000-000000000000" }).rpc("is_platform_owner");
    assert.equal(r.error, null);
    assert.equal(r.data, false);
  });
});

describe("invariantes da camada pg no código", () => {
  test("só módulos server-only importam src/lib/database/pg (driver e DATABASE_URL nunca no navegador)", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(process.cwd(), "src");
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
    });
    const offenders = walk(root)
      .filter((f) => !f.includes(`${path.sep}lib${path.sep}database${path.sep}pg${path.sep}`))
      .map((f) => ({ f, t: readFileSync(f, "utf8") }))
      .filter(({ t }) => /from "@\/lib\/database\/pg\//.test(t) && !/^import "server-only";/m.test(t))
      .map(({ f }) => path.relative(process.cwd(), f));
    assert.deepEqual(offenders, []);
  });
});
