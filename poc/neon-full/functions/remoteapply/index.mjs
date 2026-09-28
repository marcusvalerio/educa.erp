// Neon Function que aplica o pacote do esquema num banco Neon REMOTO pela API
// HTTP do Neon (POST https://<host>/sql). Existe porque Neon Functions não
// estão disponíveis em aws-sa-east-1 (região do educa-erp-prod) e porque o
// contêiner de desenvolvimento não alcança *.neon.tech.
//
// Mesmo protocolo da functions/schemaapply (POC): pacote lido do GitHub num
// commit fixo (BUNDLE_URL) e conferido por sha256 (BUNDLE_SHA256); cada arquivo
// numa transação; resultado em <META_SCHEMA>.build_files no banco ALVO; cada
// RUN_ID roda uma única vez; só roda por gatilho agendado da Neon.
//
// TARGET_DATABASE_URL (segredo): conexão do dono do banco alvo. Fica só no
// ambiente da função durante a aplicação; depois a senha do dono é trocada no
// alvo (reset) e a função é reimplantada sem a variável.
import crypto from "node:crypto";

const TARGET = process.env.TARGET_DATABASE_URL;
const META = /^[a-z_]+$/.test(process.env.META_SCHEMA ?? "") ? process.env.META_SCHEMA : "educa_migration";

async function sql(queries) {
  const host = new URL(TARGET).hostname;
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "content-type": "application/json", "neon-connection-string": TARGET, "neon-batch-isolation-level": "ReadCommitted" },
    body: JSON.stringify(Array.isArray(queries) ? { queries: queries.map((q) => ({ query: q, params: [] })) } : { query: queries, params: [] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ? `${body.message}${body.position ? ` (pos ${body.position})` : ""}` : `HTTP ${res.status}`);
  return body;
}
const esc = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

async function run(runId) {
  await sql(`create schema if not exists ${META}`);
  await sql(`create table if not exists ${META}.build_runs (run_id text primary key, status text not null, started_at timestamptz default now(), finished_at timestamptz, detail text)`);
  await sql(`create table if not exists ${META}.build_files (run_id text, ord int, file text, statements int, status text, error text, ms int, primary key (run_id, ord))`);
  const claimed = await sql(`insert into ${META}.build_runs (run_id, status) values (${esc(runId)}, 'running') on conflict do nothing returning run_id`);
  if (!claimed.rows?.length) return { skipped: true };

  const text = await (await fetch(process.env.BUNDLE_URL)).text();
  const digest = crypto.createHash("sha256").update(text).digest("hex");
  if (digest !== process.env.BUNDLE_SHA256) {
    await sql(`update ${META}.build_runs set status = 'rejected', finished_at = now(), detail = ${esc(`sha256 ${digest}`)} where run_id = ${esc(runId)}`);
    return { rejected: true };
  }
  let failed = null;
  for (const [ord, item] of JSON.parse(text).entries()) {
    const t0 = Date.now();
    let status = "ok", error = null;
    try {
      await sql(item.s);
    } catch (e) {
      status = "fail";
      error = String(e.message).slice(0, 2000);
    }
    await sql(`insert into ${META}.build_files values (${esc(runId)}, ${ord}, ${esc(item.f)}, ${item.s.length}, ${esc(status)}, ${esc(error)}, ${Date.now() - t0})`);
    if (status === "fail") { failed = item.f; break; }
  }
  await sql(`update ${META}.build_runs set status = ${esc(failed ? "failed" : "done")}, finished_at = now(), detail = ${esc(failed)} where run_id = ${esc(runId)}`);
  return { done: !failed };
}

export default {
  async fetch(request) {
    if (request.method !== "POST" || !request.headers.get("x-neon-trigger-invocation-id")) return new Response("not found", { status: 404 });
    const runId = process.env.RUN_ID;
    if (!runId || !process.env.BUNDLE_URL || !TARGET) return Response.json({ skipped: "config" });
    try {
      return Response.json(await run(runId));
    } catch (e) {
      console.log("ERRO", e.message);
      return Response.json({ error: e.message }, { status: 500 });
    }
  },
};
