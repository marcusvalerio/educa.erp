// Banco do ATLAS.ERP inteiro em PGlite (Postgres WASM, sem servidor):
// camada de compatibilidade Supabase do POC (poc/neon-full/sql/00_supabase_compat.sql),
// o plano equivalente à produção (poc/neon-full/plan-prod-equivalente.txt)
// e as migrations seguintes do repositório. ~4 s por processo de teste.
//
// pgliteDataClient() devolve um cliente com a mesma forma do supabase-js
// (from/rpc) sobre o adaptador pg do repositório (postgrest-compat), com o
// papel e as claims por transação — RLS e has_permission valem como em
// produção.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { ltree } from "@electric-sql/pglite/contrib/ltree";
import { moddatetime } from "@electric-sql/pglite/contrib/moddatetime";
import { QueryBuilder, runRpc, type Catalog, type FnInfo, type QueryExec, type Relationship } from "@/lib/database/pg/postgrest-compat";
import { sessionPreamble, type DbContext } from "@/lib/database/pg/client";

const ROOT = process.cwd();

export function migrationPlan(): string[] {
  const plan = readFileSync(path.join(ROOT, "poc/neon-full/plan-prod-equivalente.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const last = Math.max(...plan.map((f) => Number(/\/(\d{4})_/.exec(f)?.[1] ?? 0)));
  const later = readdirSync(path.join(ROOT, "supabase/migrations"))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) > last)
    .sort()
    .map((f) => `supabase/migrations/${f}`);
  return [...plan, ...later];
}

export async function createAtlasDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto, uuid_ossp, btree_gist, ltree, moddatetime } });
  await db.exec(readFileSync(path.join(ROOT, "poc/neon-full/sql/00_supabase_compat.sql"), "utf8"));
  await db.exec(
    "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;" +
      "alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;" +
      "alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;"
  );
  for (const file of migrationPlan()) {
    try {
      await db.exec(readFileSync(path.join(ROOT, file), "utf8"));
    } catch (e) {
      throw new Error(`migration ${file}: ${(e as Error).message}`);
    }
  }
  return db;
}

// ------------------------------------------------------------ cliente no formato do supabase-js

let lock: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = lock.then(work, work);
  lock = next.catch(() => undefined);
  return next;
}

const catalogs = new WeakMap<PGlite, Promise<Catalog>>();
function loadCatalog(db: PGlite): Promise<Catalog> {
  let p = catalogs.get(db);
  if (!p) {
    p = (async () => {
      const fks = await db.query<{ name: string; from: string; to: string; from_cols: string[]; to_cols: string[] }>(`
        select k.conname::text as name, k.conrelid::regclass::text as from, k.confrelid::regclass::text as to,
          array(select a.attname::text from unnest(k.conkey) with ordinality u(n, o) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n order by u.o) as from_cols,
          array(select a.attname::text from unnest(k.confkey) with ordinality u(n, o) join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n order by u.o) as to_cols
        from pg_constraint k
        where k.contype = 'f' and k.connamespace = 'public'::regnamespace and (select relnamespace from pg_class where oid = k.confrelid) = 'public'::regnamespace`);
      const fns = await db.query<{ name: string; retset: boolean; typtype: string; rettype: string; names: string[] | null; modes: string[] | null; argtypes: string[]; ndefaults: number }>(`
        select p.proname as name, p.proretset as retset, t.typtype, format_type(p.prorettype, null) as rettype,
          p.proargnames as names, p.proargmodes::text[] as modes,
          array(select format_type(x, null) from unnest(p.proargtypes) x) as argtypes, p.pronargdefaults as ndefaults
        from pg_proc p join pg_type t on t.oid = p.prorettype
        where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`);
      const pks = await db.query<{ tbl: string; cols: string[] }>(`
        select k.conrelid::regclass::text as tbl,
          array(select a.attname::text from unnest(k.conkey) with ordinality u(n, o) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n order by u.o) as cols
        from pg_constraint k where k.contype = 'p' and k.connamespace = 'public'::regnamespace`);
      const strip = (n: string) => n.replace(/^public\./, "");
      const relationships: Relationship[] = fks.rows.map((r) => ({ name: r.name, from: strip(r.from), to: strip(r.to), fromCols: r.from_cols, toCols: r.to_cols }));
      const functions = new Map<string, FnInfo[]>();
      for (const f of fns.rows) {
        const modes = f.modes ?? f.argtypes.map(() => "i");
        const inputNames = (f.names ?? []).filter((_, i) => modes[i] === "i" || modes[i] === "b");
        const hasOut = modes.some((m) => m === "o" || m === "t");
        const firstDefault = f.argtypes.length - f.ndefaults;
        const args = f.argtypes.map((type, i) => ({ name: inputNames[i] ?? `$${i + 1}`, type, hasDefault: i >= firstDefault }));
        const kind: FnInfo["kind"] = f.retset ? "set" : f.rettype === "void" ? "void" : hasOut || f.typtype === "c" || f.rettype === "record" ? "composite" : "scalar";
        functions.set(f.name, [...(functions.get(f.name) ?? []), { args, kind }]);
      }
      return { relationships, functions, primaryKeys: new Map(pks.rows.map((r) => [strip(r.tbl), r.cols])) };
    })();
    catalogs.set(db, p);
  }
  return p;
}

export function pgliteDataClient(db: PGlite, ctx: DbContext) {
  const run = <T>(work: (exec: QueryExec) => Promise<T>): Promise<T> =>
    serialized(async () => {
      await db.exec(sessionPreamble(ctx));
      try {
        const result = await work(async (sql, params) => {
          const r = await db.query<Record<string, unknown>>(sql, params as unknown[]);
          return { rows: r.rows };
        });
        await db.exec("commit");
        return result;
      } catch (e) {
        await db.exec("rollback").catch(() => undefined);
        throw e;
      }
    });
  const catalog = () => loadCatalog(db);
  return {
    from: (table: string) => new QueryBuilder(table, catalog, run),
    rpc: (name: string, args: Record<string, unknown> = {}) => runRpc(catalog, run, name, args),
  };
}

/** Executa SQL como dono (sem RLS), fora de qualquer papel. */
export function ownerQuery<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return serialized(async () => (await db.query<T>(sql, params)).rows);
}

/** Vários comandos como dono (sem parâmetros). */
export function ownerExec(db: PGlite, sql: string): Promise<unknown> {
  return serialized(() => db.exec(sql));
}

// ------------------------------------------------------------ dados de teste

export type SeededCompany = {
  companyId: string;
  adminAuthId: string;
  adminUserId: string;
  warehouseId: string;
  warehouseCode: string;
  unitId: string;
};

let seq = 0;

/** Empresa com papéis/unidades/depósito semeados pelos gatilhos e um admin com login. */
export async function seedCompany(db: PGlite, name: string, id?: string, adminUserId?: string): Promise<SeededCompany> {
  seq++;
  const [company] = await ownerQuery<{ id: string }>(
    db,
    "insert into companies (id, name, legal_name, document, email, city, state) values (coalesce($3::uuid, gen_random_uuid()), $1, $1, $2, 'contato@exemplo.com', 'São Paulo', 'SP') returning id",
    [name, String(11111111000100 + seq), id ?? null]
  );
  const email = `admin.${company.id.slice(0, 8)}@exemplo.com`;
  const [auth] = await ownerQuery<{ id: string }>(db, "insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]);
  const user = await serialized(async () => {
    await db.exec("begin; select set_config('educa.auth_link', 'invitation', true)");
    const r = await db.query<{ id: string }>(
      "insert into users (id, company_id, auth_user_id, name, email, login, status) values (coalesce($5::uuid, gen_random_uuid()), $1, $2, 'Admin ' || $3, $4, $4, 'active') returning id",
      [company.id, auth.id, name, email, adminUserId ?? null]
    );
    await db.exec("commit");
    return r.rows[0];
  });
  await ownerQuery(db, "insert into user_roles (user_id, role_id) select $1, id from roles where company_id = $2 and code = 'admin'", [user.id, company.id]);
  const [wh] = await ownerQuery<{ id: string; code: string }>(db, "select id, code from warehouses where company_id = $1 order by created_at limit 1", [company.id]);
  const [unit] = await ownerQuery<{ id: string }>(db, "select id from units where company_id = $1 and code = 'UN'", [company.id]);
  return { companyId: company.id, adminAuthId: auth.id, adminUserId: user.id, warehouseId: wh.id, warehouseCode: wh.code, unitId: unit.id };
}
