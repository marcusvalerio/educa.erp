// Gera, com o PRÓPRIO adaptador (src/lib/database/pg/postgrest-compat.ts), o
// SQL de consultas representativas do app e o imprime como um lote JSON com
// os parâmetros embutidos (literais citados), para executar no Neon real por
// um canal que não aceita parâmetros (API HTTP /sql, MCP run_sql_transaction).
// Serve para provar o adaptador no Neon quando o contêiner não alcança o Neon
// por TCP. O catálogo (FKs/funções) vem de um banco com o mesmo esquema
// (DATABASE_URL local — as impressões digitais de esquema são idênticas).
//   DATABASE_URL=postgres://…/educa_poc npx tsx poc/neon-full/tools/adapter-sql-for-neon.mts <sub> <company_id>
import { QueryBuilder, rpcSql, type SessionRunner } from "../../../src/lib/database/pg/postgrest-compat.ts";
import { closePool, loadCatalog, sessionPreamble } from "../../../src/lib/database/pg/client.ts";

const [sub, company] = process.argv.slice(2);
if (!sub || !company) throw new Error("uso: <sub> <company_id>");

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return lit(`{${v.map((x) => `"${String(x).replace(/["\\]/g, "\\$&")}"`).join(",")}}`);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const inline = (sql: string, params: unknown[]) => params.reduceRight<string>((s, p, i) => s.split(`$${i + 1}`).join(lit(p)), sql);

const captured: { label: string; sql: string }[] = [];
const capture = (label: string): SessionRunner => async (work) =>
  work(async (sql, params) => {
    captured.push({ label, sql: inline(sql, params) });
    return { rows: [{ data: [], n: 0 }] };
  });

const catalog = () => loadCatalog();
const q = (label: string) => new QueryBuilder("products", catalog, capture(label));

await q("Q1 lista de produtos: embutido many-to-one (FK composta), .or, ordem, faixa, contagem")
  .select("id, code, name, unidade:units!products_unit_company_id_fkey(name)", { count: "exact" })
  .eq("company_id", company)
  .or("code.ilike.*ALFA*,name.ilike.*Alfa*")
  .order("code")
  .range(0, 9);
await new QueryBuilder("sales_orders", catalog, capture("Q2 pedidos: embutidos one-to-many e many-to-one")).select("id, customers(name), sales_order_items(*)").limit(5);
await q("Q3 upsert de produto com retorno").upsert({ company_id: company, code: "P-NEON-ADAPTER", name: "Via adaptador", unit: "UN" }, { onConflict: "company_id,code" }).select("id, code, name");
await q("Q4 update com retorno").update({ name: "Via adaptador (editado)" }).eq("company_id", company).eq("code", "P-NEON-ADAPTER").select("code, name");

const cat = await loadCatalog();
const rpcs: [string, string, Record<string, unknown>][] = [
  ["R1 rpc set-returning", "current_user_company_ids", {}],
  ["R2 rpc escalar", "has_permission", { p_company_id: company, p_permission_code: "products.create" }],
  ["R3 rpc composta (id inexistente → erro do banco)", "fn_activate_bom", { p_bom_id: "00000000-0000-4000-8000-000000000000" }],
];
for (const [label, name, args] of rpcs) {
  const fn = cat.functions.get(name);
  const argNames = fn?.[0]?.args.map((a) => a.name) ?? [];
  const fixed = name === "has_permission" ? Object.fromEntries(Object.values(args).map((v, i) => [argNames[i], v])) : args;
  const r = await rpcSql(cat, name, fixed);
  captured.push({ label, sql: inline(r.sql, r.params) });
}
await closePool();

const preamble = sessionPreamble({ role: "authenticated", sub }).split(";\n").slice(1); // sem "begin": o lote já é uma transação
console.log(JSON.stringify({ preamble, queries: captured }, null, 1));
