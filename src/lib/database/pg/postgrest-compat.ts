// Camada de compatibilidade: o subconjunto da API do supabase-js
// (postgrest-js) que o EDUCA usa — from/select/insert/update/upsert/delete,
// filtros eq/neq/gt/gte/lt/lte/like/ilike/is/in/not/or, order/range/limit,
// single/maybeSingle, count e rpc — executado em PostgreSQL DIRETO, sem
// PostgREST (DATA_BACKEND=postgres).
//
// Segurança: nada aqui decide acesso. Cada chamada roda numa transação
// própria em que o servidor já fixou o papel (anon/authenticated/
// service_role) e as claims do usuário (request.jwt.claims) — exatamente o
// que o PostgREST faz. auth.uid(), has_permission() e as 328 policies de
// RLS continuam sendo a autoridade. Identificadores são validados e
// citados; valores vão sempre como parâmetros ($n), nunca concatenados.
//
// As respostas imitam o PostgREST: JSON gerado pelo próprio Postgres
// (json_agg/row_to_json — mesmos tipos e formatos de data), erros com
// { code (SQLSTATE), message, details, hint } e PGRST116 em single().

export type PgError = { code: string; message: string; details: string | null; hint: string | null };
export type PgResponse<T = unknown> = { data: T | null; error: PgError | null; count: number | null; status: number; statusText: string };

export type Relationship = { from: string; fromCols: string[]; to: string; toCols: string[]; name?: string };
export type FnArg = { name: string; type: string; hasDefault: boolean };
export type FnInfo = { args: FnArg[]; kind: "set" | "composite" | "scalar" | "void" };
export type Catalog = { relationships: Relationship[]; functions: Map<string, FnInfo[]>; primaryKeys: Map<string, string[]> };

export type QueryExec = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
/** Executa `work` numa transação com papel e claims já fixados. */
export type SessionRunner = <T>(work: (exec: QueryExec) => Promise<T>) => Promise<T>;

const IDENT = /^[a-z_][a-z0-9_]*$/;
export function ident(name: string): string {
  const n = name.trim();
  if (!IDENT.test(n)) throw compatError("PGRST100", `Identificador inválido: ${JSON.stringify(name)}`);
  return `"${n}"`;
}
const table = (name: string) => `public.${ident(name)}`;

class CompatError extends Error {
  constructor(public code: string, message: string, public details: string | null = null) {
    super(message);
  }
}
const compatError = (code: string, message: string, details: string | null = null) => new CompatError(code, message, details);

export function toPgError(error: unknown): PgError {
  if (error instanceof CompatError) return { code: error.code, message: error.message, details: error.details, hint: null };
  const e = error as { code?: string; message?: string; detail?: string; hint?: string };
  return { code: e.code ?? "XX000", message: e.message ?? "Erro no banco.", details: e.detail ?? null, hint: e.hint ?? null };
}
function httpStatus(code: string): number {
  if (code === "PGRST116") return 406;
  if (code === "23505" || code === "23503") return 409;
  if (code === "42501") return 403;
  if (code.startsWith("PGRST")) return 400;
  return 400;
}

// ------------------------------------------------------------ parâmetros

class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v instanceof Date ? v.toISOString() : v);
    return `$${this.values.length}`;
  }
}

// ------------------------------------------------------------ select (com recursos embutidos)

type SelectItem = { kind: "star" } | { kind: "col"; name: string; alias?: string } | { kind: "embed"; rel: string; alias: string; hint?: string; items: SelectItem[] };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "", quote = false;
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === "(") depth++;
    if (!quote && ch === ")") depth--;
    if (!quote && ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function parseSelect(columns: string): SelectItem[] {
  return splitTop(columns.replace(/\s+/g, " ")).map((raw): SelectItem => {
    if (raw === "*") return { kind: "star" };
    const m = /^(?:([a-z_][a-z0-9_]*)\s*:\s*)?([a-z_][a-z0-9_]*)(?:!([a-z_][a-z0-9_]*))?\s*\(([\s\S]*)\)$/.exec(raw);
    if (m) return { kind: "embed", alias: m[1] ?? m[2], rel: m[2], ...(m[3] ? { hint: m[3] } : {}), items: parseSelect(m[4] || "*") };
    const c = /^(?:([a-z_][a-z0-9_]*)\s*:\s*)?([a-z_][a-z0-9_]*)$/.exec(raw);
    if (c) return { kind: "col", name: c[2], alias: c[1] };
    throw compatError("PGRST100", `Seleção não suportada: ${raw}`);
  });
}

function relationshipFor(catalog: Catalog, parent: string, rel: string, hint?: string): { many: boolean; join: [string, string][] } {
  const oneToMany = catalog.relationships.filter((r) => r.from === rel && r.to === parent);
  const manyToOne = catalog.relationships.filter((r) => r.from === parent && r.to === rel);
  // Dica como no PostgREST (rel!dica): nome da FK ou coluna da FK.
  const matches = (r: Relationship) => !hint || r.name === hint || (r.fromCols.length === 1 && r.fromCols[0] === hint);
  const found = [...oneToMany.filter(matches).map((r) => ({ r, many: true })), ...manyToOne.filter(matches).map((r) => ({ r, many: false }))];
  if (found.length === 0) throw compatError("PGRST200", `Sem relacionamento entre '${parent}' e '${rel}'.`);
  if (found.length > 1) throw compatError("PGRST201", `Mais de um relacionamento entre '${parent}' e '${rel}'.`);
  const { r, many } = found[0];
  // join: [coluna no embutido, coluna no pai]
  const join: [string, string][] = many ? r.fromCols.map((c, i) => [c, r.toCols[i]]) : r.toCols.map((c, i) => [c, r.fromCols[i]]);
  return { many, join };
}

let aliasSeq = 0;
function selectList(catalog: Catalog, tableName: string, alias: string, items: SelectItem[]): string {
  return items
    .map((it) => {
      if (it.kind === "star") return `${alias}.*`;
      if (it.kind === "col") return it.alias ? `${alias}.${ident(it.name)} as ${ident(it.alias)}` : `${alias}.${ident(it.name)}`;
      const { many, join } = relationshipFor(catalog, tableName, it.rel, it.hint);
      const a = `e${++aliasSeq}`;
      const where = join.map(([child, parent]) => `${a}.${ident(child)} = ${alias}.${ident(parent)}`).join(" and ");
      const inner = `select ${selectList(catalog, it.rel, a, it.items)} from ${table(it.rel)} ${a} where ${where}`;
      const expr = many
        ? `(select coalesce(json_agg(row_to_json(x)), '[]'::json) from (${inner}) x)`
        : `(select row_to_json(x) from (${inner}) x limit 1)`;
      return `${expr} as ${ident(it.alias)}`;
    })
    .join(", ");
}

// ------------------------------------------------------------ filtros

type Filter = (alias: string, p: Params) => string;

function opSql(col: string, op: string, value: unknown, p: Params): string {
  switch (op) {
    case "eq": return `${col} = ${p.add(value)}`;
    case "neq": return `${col} <> ${p.add(value)}`;
    case "gt": return `${col} > ${p.add(value)}`;
    case "gte": return `${col} >= ${p.add(value)}`;
    case "lt": return `${col} < ${p.add(value)}`;
    case "lte": return `${col} <= ${p.add(value)}`;
    case "like": return `${col} like ${p.add(value)}`;
    case "ilike": return `${col} ilike ${p.add(value)}`;
    case "in": return `${col} = any(${p.add(value)})`;
    case "is": {
      const v = value === null || value === "null" ? "null" : value === true || value === "true" ? "true" : value === false || value === "false" ? "false" : null;
      if (!v) throw compatError("PGRST100", `Valor inválido para is: ${String(value)}`);
      return `${col} is ${v}`;
    }
    default:
      throw compatError("PGRST100", `Operador não suportado: ${op}`);
  }
}

/** Filtro em texto no formato do PostgREST (usado por .or()): col.op.valor, and(...), or(...), not.col.op.valor */
export function parseLogic(expr: string, mode: "or" | "and"): Filter {
  const parts = splitTop(expr);
  const filters = parts.map((part): Filter => {
    const nested = /^(not\.)?(and|or)\(([\s\S]*)\)$/.exec(part);
    if (nested) {
      const inner = parseLogic(nested[3], nested[2] as "and" | "or");
      return (a, p) => (nested[1] ? `not (${inner(a, p)})` : `(${inner(a, p)})`);
    }
    const m = /^([a-z_][a-z0-9_]*)\.(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.([\s\S]*)$/.exec(part);
    if (!m) throw compatError("PGRST100", `Filtro não suportado: ${part}`);
    const [, colName, negate, op, rawValue] = m;
    let value: unknown = rawValue.replace(/^"([\s\S]*)"$/, "$1");
    if (op === "in") value = splitTop(rawValue.replace(/^\(([\s\S]*)\)$/, "$1")).map((v) => v.replace(/^"([\s\S]*)"$/, "$1"));
    if (op === "like" || op === "ilike") value = String(value).replace(/\*/g, "%");
    return (a, p) => {
      const sql = opSql(`${a}.${ident(colName)}`, op, value, p);
      return negate ? `not (${sql})` : sql;
    };
  });
  return (a, p) => filters.map((f) => f(a, p)).join(mode === "or" ? " or " : " and ");
}

// ------------------------------------------------------------ builder

/** Chaves com valor undefined somem, como no JSON.stringify do supabase-js. */
function definedOnly(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
}

type Action = { kind: "select" } | { kind: "insert"; rows: Record<string, unknown>[]; onConflict?: string; upsert?: boolean } | { kind: "update"; values: Record<string, unknown> } | { kind: "delete" };

export class QueryBuilder<T = unknown> implements PromiseLike<PgResponse<T>> {
  private action: Action = { kind: "select" };
  private columns: string | null = null;
  private countMode: "exact" | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nulls?: "first" | "last" }[] = [];
  private lim: number | null = null;
  private off: number | null = null;
  private cardinality: "many" | "single" | "maybe" = "many";
  // Como no supabase-js, montar a consulta nunca lança: um nome/filtro
  // inválido vira { error } no await (o PostgREST responderia 400).
  private deferred: unknown = null;

  constructor(private tableName: string, private catalog: () => Promise<Catalog>, private run: SessionRunner) {
    this.guard(() => ident(tableName));
  }

  private guard(fn: () => void): this {
    if (this.deferred === null) {
      try {
        fn();
      } catch (error) {
        this.deferred = error;
      }
    }
    return this;
  }

  select(columns = "*", opts: { count?: "exact" | "planned" | "estimated"; head?: boolean } = {}): this {
    this.columns = columns;
    if (opts.count) this.countMode = "exact";
    if (opts.head) this.head = true;
    return this;
  }
  // Como no supabase-js: um objeto vai como JSON (chaves undefined somem, a
  // coluna fica com o default/valor atual); um array vai com ?columns= da
  // união das chaves (chave ausente numa linha = NULL, igual ao PostgREST).
  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.action = { kind: "insert", rows: Array.isArray(values) ? values : [definedOnly(values)] };
    return this;
  }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], opts: { onConflict?: string } = {}): this {
    this.action = { kind: "insert", rows: Array.isArray(values) ? values : [definedOnly(values)], onConflict: opts.onConflict, upsert: true };
    return this;
  }
  update(values: Record<string, unknown>): this {
    this.action = { kind: "update", values: definedOnly(values) };
    return this;
  }
  delete(): this {
    this.action = { kind: "delete" };
    return this;
  }

  private add(col: string, op: string, value: unknown, negate = false): this {
    return this.guard(() => {
      ident(col);
      this.filters.push((a, p) => {
        const sql = opSql(`${a}.${ident(col)}`, op, value, p);
        return negate ? `not (${sql})` : sql;
      });
    });
  }
  eq(col: string, v: unknown) { return this.add(col, "eq", v); }
  neq(col: string, v: unknown) { return this.add(col, "neq", v); }
  gt(col: string, v: unknown) { return this.add(col, "gt", v); }
  gte(col: string, v: unknown) { return this.add(col, "gte", v); }
  lt(col: string, v: unknown) { return this.add(col, "lt", v); }
  lte(col: string, v: unknown) { return this.add(col, "lte", v); }
  like(col: string, v: string) { return this.add(col, "like", v); }
  ilike(col: string, v: string) { return this.add(col, "ilike", v); }
  is(col: string, v: null | boolean) { return this.add(col, "is", v); }
  in(col: string, v: readonly unknown[]) { return this.add(col, "in", [...v]); }
  not(col: string, op: string, v: unknown) { return this.add(col, op, v, true); }
  or(expr: string) {
    return this.guard(() => {
      const f = parseLogic(expr, "or");
      this.filters.push((a, p) => `(${f(a, p)})`);
    });
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    return this.guard(() => {
      ident(col);
      this.orders.push({ col, asc: opts.ascending !== false, nulls: opts.nullsFirst === undefined ? undefined : opts.nullsFirst ? "first" : "last" });
    });
  }
  limit(n: number) { this.lim = Math.max(0, Math.floor(n)); return this; }
  range(from: number, to: number) { this.off = Math.max(0, Math.floor(from)); this.lim = Math.max(0, Math.floor(to) - Math.floor(from) + 1); return this; }
  single() { this.cardinality = "single"; return this; }
  maybeSingle() { this.cardinality = "maybe"; return this; }

  private where(alias: string, p: Params): string {
    return this.filters.length ? ` where ${this.filters.map((f) => f(alias, p)).join(" and ")}` : "";
  }
  private tail(alias: string): string {
    const order = this.orders.length ? ` order by ${this.orders.map((o) => `${alias}.${ident(o.col)} ${o.asc ? "asc" : "desc"}${o.nulls ? ` nulls ${o.nulls}` : ""}`).join(", ")}` : "";
    return `${order}${this.lim !== null ? ` limit ${this.lim}` : ""}${this.off !== null ? ` offset ${this.off}` : ""}`;
  }

  /** SQL + parâmetros (exposto para testes). */
  async toSql(): Promise<{ sql: string; params: unknown[]; countSql?: string; countParams?: unknown[]; returns: boolean }> {
    if (this.deferred !== null) throw this.deferred;
    const catalog = await this.catalog();
    const p = new Params();
    const T = table(this.tableName);
    const items = parseSelect(this.columns ?? "*");
    const wrap = (src: string) => `select coalesce(json_agg(row_to_json(q)), '[]'::json) as data from (${src}) q`;

    if (this.action.kind === "select") {
      const list = selectList(catalog, this.tableName, "t0", items);
      const sql = wrap(`select ${list} from ${T} t0${this.where("t0", p)}${this.tail("t0")}`);
      let countSql: string | undefined, countParams: unknown[] | undefined;
      if (this.countMode) {
        const cp = new Params();
        countSql = `select count(*)::bigint as n from ${T} t0${this.where("t0", cp)}`;
        countParams = cp.values;
      }
      return { sql, params: p.values, countSql, countParams, returns: true };
    }

    const returns = this.columns !== null;
    const list = returns ? selectList(catalog, this.tableName, "t0", items) : "";
    let cte: string;
    if (this.action.kind === "insert") {
      const rows = this.action.rows;
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      if (cols.length === 0) throw compatError("PGRST102", "Nada para inserir.");
      const colSql = cols.map(ident).join(", ");
      const payload = p.add(JSON.stringify(rows));
      let conflict = "";
      if (this.action.upsert) {
        const target = (this.action.onConflict ? this.action.onConflict.split(",") : catalog.primaryKeys.get(this.tableName) ?? []).map((c) => c.trim());
        if (target.length === 0) throw compatError("PGRST100", "Upsert sem alvo de conflito.");
        const rest = cols.filter((c) => !target.includes(c));
        conflict = ` on conflict (${target.map(ident).join(", ")}) do ${rest.length ? `update set ${rest.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}` : "nothing"}`;
      }
      cte = `insert into ${T} (${colSql}) select ${colSql} from json_populate_recordset(null::${T}, ${payload}::json)${conflict}${returns ? " returning *" : ""}`;
    } else if (this.action.kind === "update") {
      const cols = Object.keys(this.action.values);
      if (cols.length === 0) throw compatError("PGRST102", "Nada para atualizar.");
      const payload = p.add(JSON.stringify(this.action.values));
      const sets = cols.map((c) => `${ident(c)} = s.${ident(c)}`).join(", ");
      cte = `update ${T} t0 set ${sets} from json_populate_record(null::${T}, ${payload}::json) s${this.where("t0", p)}${returns ? " returning t0.*" : ""}`;
    } else {
      cte = `delete from ${T} t0${this.where("t0", p)}${returns ? " returning t0.*" : ""}`;
    }
    if (!returns) return { sql: cte, params: p.values, returns: false };
    return { sql: `with m as (${cte}) ${wrap(`select ${list} from m t0`)}`, params: p.values, returns: true };
  }

  async execute(): Promise<PgResponse<T>> {
    try {
      const q = await this.toSql();
      const result = await this.run(async (exec) => {
        const main = await exec(q.sql, q.params);
        const count = q.countSql ? Number((await exec(q.countSql, q.countParams ?? [])).rows[0]?.n ?? 0) : null;
        return { rows: q.returns ? ((main.rows[0]?.data as unknown[]) ?? []) : null, count };
      });
      const rows = result.rows;
      if (this.head) return { data: null, error: null, count: result.count, status: 200, statusText: "OK" };
      if (rows === null) return { data: null, error: null, count: result.count, status: this.action.kind === "insert" ? 201 : 204, statusText: "OK" };
      if (this.cardinality !== "many") {
        if (rows.length > 1 || (this.cardinality === "single" && rows.length === 0)) {
          const err = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null };
          return { data: null, error: err, count: result.count, status: 406, statusText: "Not Acceptable" };
        }
        return { data: (rows[0] ?? null) as T, error: null, count: result.count, status: 200, statusText: "OK" };
      }
      return { data: rows as T, error: null, count: result.count, status: 200, statusText: "OK" };
    } catch (error) {
      const err = toPgError(error);
      return { data: null, error: err, count: null, status: httpStatus(err.code), statusText: "Error" };
    }
  }

  then<R1 = PgResponse<T>, R2 = never>(onfulfilled?: ((value: PgResponse<T>) => R1 | PromiseLike<R1>) | null, onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ------------------------------------------------------------ rpc

export function chooseFunction(overloads: FnInfo[] | undefined, name: string, args: Record<string, unknown>): FnInfo {
  const keys = Object.keys(args);
  const fits = (overloads ?? []).filter((f) => keys.every((k) => f.args.some((a) => a.name === k)) && f.args.every((a) => a.hasDefault || keys.includes(a.name)));
  if (fits.length === 0) throw compatError("PGRST202", `Função public.${name} não encontrada com esses argumentos.`);
  if (fits.length > 1) throw compatError("PGRST203", `Chamada ambígua para public.${name}.`);
  return fits[0];
}

export async function rpcSql(catalog: Catalog, name: string, args: Record<string, unknown>): Promise<{ sql: string; params: unknown[]; kind: FnInfo["kind"] }> {
  ident(name);
  const fn = chooseFunction(catalog.functions.get(name), name, args);
  const p = new Params();
  const call = `public.${ident(name)}(${Object.entries(args)
    .map(([k, v]) => {
      const arg = fn.args.find((a) => a.name === k)!;
      const json = arg.type === "json" || arg.type === "jsonb";
      return `${ident(k)} := ${p.add(json && v !== null ? JSON.stringify(v) : v)}::${arg.type}`;
    })
    .join(", ")})`;
  const sql =
    fn.kind === "set" ? `select coalesce(json_agg(r), '[]'::json) as data from ${call} r`
    : fn.kind === "composite" ? `select case when r is null then null else to_json(r) end as data from ${call} r`
    : fn.kind === "scalar" ? `select to_json(${call}) as data`
    : `select ${call} is null as data`;
  return { sql, params: p.values, kind: fn.kind };
}

export async function runRpc(catalog: () => Promise<Catalog>, run: SessionRunner, name: string, args: Record<string, unknown> = {}): Promise<PgResponse> {
  try {
    const q = await rpcSql(await catalog(), name, args);
    const rows = await run((exec) => exec(q.sql, q.params));
    const data = q.kind === "void" ? null : (rows.rows[0]?.data ?? null);
    return { data, error: null, count: null, status: 200, statusText: "OK" };
  } catch (error) {
    const err = toPgError(error);
    return { data: null, error: err, count: null, status: httpStatus(err.code), statusText: "Error" };
  }
}
