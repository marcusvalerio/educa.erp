// Neon Function da POC (projeto isolado educa-neon-poc). Aplica o pacote do
// esquema (poc/neon-full/bundle/schema-bundle.json) no banco do PRÓPRIO
// projeto, arquivo por arquivo, cada um numa transação (API HTTP do Neon).
//
// Existe porque o container de desenvolvimento não alcança *.neon.tech:
// o pacote é lido do GitHub num commit fixo (BUNDLE_URL) e o resultado fica
// em poc_meta.build_files, lido depois pelo conector.
//
// Segurança: só roda por gatilho agendado da Neon (cabeçalho
// x-neon-trigger-invocation-id); só executa o pacote do commit fixado cujo
// sha256 bate com BUNDLE_SHA256; cada RUN_ID roda uma única vez (registro
// em poc_meta.build_runs).
import crypto from "node:crypto";

const DB = new URL(process.env.DATABASE_URL);

async function sql(queries) {
  const res = await fetch(`https://${DB.hostname}/sql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "neon-connection-string": process.env.DATABASE_URL,
      "neon-batch-isolation-level": "ReadCommitted",
    },
    body: JSON.stringify(Array.isArray(queries) ? { queries: queries.map((q) => ({ query: q, params: [] })) } : { query: queries, params: [] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ? `${body.message}${body.position ? ` (pos ${body.position})` : ""}` : `HTTP ${res.status}`);
  return body;
}

async function run(runId) {
  await sql("create schema if not exists poc_meta");
  await sql("create table if not exists poc_meta.build_runs (run_id text primary key, status text not null, started_at timestamptz default now(), finished_at timestamptz, detail text)");
  await sql("create table if not exists poc_meta.build_files (run_id text, ord int, file text, statements int, status text, error text, ms int, primary key (run_id, ord))");
  const claimed = await sql(`insert into poc_meta.build_runs (run_id, status) values ('${runId.replace(/'/g, "")}', 'running') on conflict do nothing returning run_id`);
  if (!claimed.rows?.length) return { skipped: true };

  const text = await (await fetch(process.env.BUNDLE_URL)).text();
  const digest = crypto.createHash("sha256").update(text).digest("hex");
  if (digest !== process.env.BUNDLE_SHA256) {
    await sql(`update poc_meta.build_runs set status = 'rejected', finished_at = now(), detail = 'sha256 ${digest}' where run_id = '${runId.replace(/'/g, "")}'`);
    return { rejected: true };
  }
  const bundle = JSON.parse(text);
  let failed = null;
  for (const [ord, item] of bundle.entries()) {
    const t0 = Date.now();
    let status = "ok", error = null;
    try {
      await sql(item.s);
    } catch (e) {
      status = "fail";
      error = String(e.message).slice(0, 2000);
    }
    const esc = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
    await sql(`insert into poc_meta.build_files values (${esc(runId)}, ${ord}, ${esc(item.f)}, ${item.s.length}, ${esc(status)}, ${esc(error)}, ${Date.now() - t0})`);
    if (status === "fail") { failed = item.f; break; }
  }
  await sql(`update poc_meta.build_runs set status = '${failed ? "failed" : "done"}', finished_at = now(), detail = ${failed ? `'${failed}'` : "null"} where run_id = '${runId.replace(/'/g, "")}'`);
  return { done: !failed };
}

export default {
  async fetch(request) {
    if (request.method !== "POST" || !request.headers.get("x-neon-trigger-invocation-id")) return new Response("not found", { status: 404 });
    const runId = process.env.RUN_ID;
    if (!runId || !process.env.BUNDLE_URL) return Response.json({ skipped: "config" });
    try {
      return Response.json(await run(runId));
    } catch (e) {
      console.log("ERRO", e.message);
      return Response.json({ error: e.message }, { status: 500 });
    }
  },
};
