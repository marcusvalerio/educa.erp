// Sem "server-only" de propósito: scripts de servidor (bootstrap) também
// usam este módulo. No app, só é importado por src/lib/supabase/{server,admin}.ts
// (ambos server-only); o driver pg nem compila para o navegador.
import { Pool, type PoolClient } from "pg";
import { QueryBuilder, runRpc, type Catalog, type FnInfo, type QueryExec, type Relationship, type SessionRunner } from "./postgrest-compat";

// Acesso a dados em PostgreSQL direto (DATA_BACKEND=postgres): Neon em
// produção, qualquer Postgres com o esquema do EDUCA em teste.
//
// Cada chamada abre uma transação e fixa, antes de tudo:
//   SET LOCAL ROLE anon | authenticated | service_role
//   request.jwt.claims = {"sub": <auth_user_id>, "role": <papel>}
// — o mesmo que o PostgREST faz — então auth.uid(), has_permission() e a
// RLS valem sem mudança. O papel de login (DATABASE_URL) deve ser um papel
// sem privilégios próprios, membro (SET) de anon/authenticated/service_role.

export type DbRole = "anon" | "authenticated" | "service_role";
export type DbContext = { role: DbRole; sub?: string; email?: string };

const ROLES: Record<DbRole, string> = { anon: "anon", authenticated: "authenticated", service_role: "service_role" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pool: Pool | null = null;
export async function closePool(): Promise<void> {
  const p = pool;
  pool = null;
  catalogPromise = null;
  await p?.end();
}
function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Defina DATABASE_URL (DATA_BACKEND=postgres).");
    pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 5), idleTimeoutMillis: 10_000 });
    // Conexão ociosa derrubada pelo servidor (Neon suspende o compute; failover):
    // o pool descarta o cliente e abre outro na próxima chamada. Sem este
    // ouvinte o evento "error" derrubaria o processo.
    pool.on("error", () => undefined);
  }
  return pool;
}

/** Literal SQL seguro para as claims (valores já validados/serializados). */
function literal(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function sessionPreamble(ctx: DbContext): string {
  const role = ROLES[ctx.role];
  if (!role) throw new Error("Papel de banco inválido.");
  if (ctx.role === "authenticated" && !(ctx.sub && UUID.test(ctx.sub))) throw new Error("Sessão sem auth_user_id válido.");
  const claims: Record<string, string> = { role };
  if (ctx.sub) claims.sub = ctx.sub;
  if (ctx.email) claims.email = ctx.email;
  const json = JSON.stringify(claims);
  return [
    "begin",
    `set local role ${role}`,
    `select set_config('request.jwt.claims', ${literal(json)}, true), set_config('request.jwt.claim.sub', ${literal(ctx.sub ?? "")}, true), set_config('request.jwt.claim.role', ${literal(role)}, true)`,
  ].join(";\n");
}

export function sessionRunner(ctx: DbContext): SessionRunner {
  return async <T>(work: (exec: QueryExec) => Promise<T>): Promise<T> => {
    const client: PoolClient = await getPool().connect();
    try {
      await client.query(sessionPreamble(ctx));
      const result = await work((sql, params) => client.query(sql, params) as Promise<{ rows: Record<string, unknown>[] }>);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };
}

// ------------------------------------------------------------ catálogo (FKs e assinaturas), lido uma vez por processo

let catalogPromise: Promise<Catalog> | null = null;
export function loadCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const c = await getPool().connect();
      try {
        const fks = await c.query<{ name: string; from: string; to: string; from_cols: string[]; to_cols: string[] }>(`
          select k.conname::text as name, k.conrelid::regclass::text as from, k.confrelid::regclass::text as to,
            array(select a.attname::text from unnest(k.conkey) with ordinality u(n, o) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n order by u.o) as from_cols,
            array(select a.attname::text from unnest(k.confkey) with ordinality u(n, o) join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n order by u.o) as to_cols
          from pg_constraint k
          where k.contype = 'f' and k.connamespace = 'public'::regnamespace and (select relnamespace from pg_class where oid = k.confrelid) = 'public'::regnamespace`);
        const fns = await c.query<{ name: string; retset: boolean; typtype: string; rettype: string; names: string[] | null; modes: string[] | null; argtypes: string[]; ndefaults: number }>(`
          select p.proname as name, p.proretset as retset, t.typtype, format_type(p.prorettype, null) as rettype,
            p.proargnames as names, p.proargmodes::text[] as modes,
            array(select format_type(x, null) from unnest(p.proargtypes) x) as argtypes, p.pronargdefaults as ndefaults
          from pg_proc p join pg_type t on t.oid = p.prorettype
          where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`);
        const pks = await c.query<{ tbl: string; cols: string[] }>(`
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
        const primaryKeys = new Map(pks.rows.map((r) => [strip(r.tbl), r.cols]));
        return { relationships, functions, primaryKeys };
      } finally {
        c.release();
      }
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

// ------------------------------------------------------------ cliente

type AdminUser = { id: string; email: string | null; email_confirmed_at: string | null; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> };

/**
 * Cliente de dados com a mesma forma de uso do supabase-js no EDUCA
 * (from/rpc; e, só com service_role, auth.admin para o login "sombra" em
 * auth.users — que no Neon é uma tabela comum, sem senha).
 */
export function createPgDataClient(ctx: DbContext) {
  const run = sessionRunner(ctx);
  const client = {
    from: (tableName: string) => new QueryBuilder(tableName, loadCatalog, run),
    rpc: (name: string, args: Record<string, unknown> = {}) => runRpc(loadCatalog, run, name, args),
    auth: {
      admin: {
        async listUsers({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) {
          if (ctx.role !== "service_role") return { data: { users: [] as AdminUser[] }, error: { message: "not_admin" } };
          const rows = await run((exec) =>
            exec(
              `select id::text, email, email_confirmed_at, raw_app_meta_data as app_metadata, raw_user_meta_data as user_metadata from auth.users order by created_at, id limit $1 offset $2`,
              [perPage, (page - 1) * perPage]
            )
          );
          return { data: { users: rows.rows as AdminUser[] }, error: null };
        },
        async createUser(input: { email: string; email_confirm?: boolean; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) {
          if (ctx.role !== "service_role") return { data: { user: null }, error: { message: "not_admin" } };
          try {
            const rows = await run((exec) =>
              exec(
                `insert into auth.users (email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values (lower($1), case when $2 then now() end, $3::jsonb, $4::jsonb)
                 returning id::text, email, email_confirmed_at, raw_app_meta_data as app_metadata, raw_user_meta_data as user_metadata`,
                [input.email, !!input.email_confirm, JSON.stringify(input.app_metadata ?? {}), JSON.stringify(input.user_metadata ?? {})]
              )
            );
            return { data: { user: rows.rows[0] as AdminUser }, error: null };
          } catch (error) {
            return { data: { user: null }, error: { message: (error as Error).message } };
          }
        },
      },
    },
  };
  return client;
}

export type PgDataClient = ReturnType<typeof createPgDataClient>;
