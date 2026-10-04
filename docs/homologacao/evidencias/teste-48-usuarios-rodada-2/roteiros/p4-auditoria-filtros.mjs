// Rodada 2 — filtros da trilha de auditoria (/api/admin/audit), conferidos no banco.
// Para cada empresa: o Administrador filtra por entidade, ação, autor (busca),
// registro (entityId), paginação e combinação; o resultado precisa bater com a
// contagem no banco da PRÓPRIA empresa e nunca trazer linha de outra empresa.
import fs from "node:fs";
import { session, api, state, close } from "../r48/lib.mjs";
import { COMPANIES } from "../r48/companies.mjs";
import { db, q } from "./ctx.mjs";

const out = [];
let pass = 0, fail = 0;
const rep = (co, label, ok, detail) => { ok ? pass++ : fail++; out.push({ company: co, label, ok, detail }); console.log(ok ? "PASS" : "FAIL", co, "|", label, "|", detail); };

const KEYS = (process.env.COS ?? "vertice,sertao,cobalto").split(",");
process.on("exit", () => {});
for (const key of KEYS) {
  const co = COMPANIES.find((c) => c.key === key);
  const cid = state.companies[key].companyId;
  const otherCid = state.companies[key === "vertice" ? "sertao" : "vertice"].companyId;
  const s = await session(co.admin.email);
  const get = (qs) => api(s.page, `/api/admin/audit?${qs}`);
  const total = async (where, params) => Number((await q(`select count(*)::int n from audit_logs where company_id=$1 ${where}`, [cid, ...params]))[0].n);

  // 1) sem filtro: total = banco
  const all = await get("pageSize=10");
  const nAll = await total("", []);
  rep(co.name, "sem filtro: total igual ao banco", all.status === 200 && all.body.meta?.total === nAll, `api ${all.body.meta?.total} · banco ${nAll}`);

  // 2) por entidade (as 3 mais frequentes)
  const ents = await q(`select entity, count(*)::int n from audit_logs where company_id=$1 group by 1 order by 2 desc limit 3`, [cid]);
  for (const e of ents) {
    const r = await get(`entity=${encodeURIComponent(e.entity)}&pageSize=100`);
    const onlyEnt = (r.body.data ?? []).every((x) => x.entity === e.entity);
    rep(co.name, `entidade = ${e.entity}`, r.status === 200 && r.body.meta?.total === e.n && onlyEnt, `api ${r.body.meta?.total} · banco ${e.n} · só a entidade: ${onlyEnt}`);
  }
  // 3) por ação
  for (const a of ["CREATE", "UPDATE", "APPROVE", "CANCEL"]) {
    const n = await total("and action=$2", [a]);
    const r = await get(`action=${a}&pageSize=100`);
    const onlyAct = (r.body.data ?? []).every((x) => x.action === a);
    rep(co.name, `ação = ${a}`, r.status === 200 && r.body.meta?.total === n && onlyAct, `api ${r.body.meta?.total} · banco ${n}`);
  }
  // 4) por autor (busca no rótulo do autor)
  const [author] = await q(`select actor_label, count(*)::int n from audit_logs where company_id=$1 and actor_label not like 'platform:%' group by 1 order by 2 desc limit 1`, [cid]);
  if (author) {
    const term = author.actor_label.split(" ")[0];
    const n = await total("and actor_label ilike $2", [`%${term}%`]);
    const r = await get(`search=${encodeURIComponent(term)}&pageSize=100`);
    const onlyAuthor = (r.body.data ?? []).every((x) => x.actor_label.toLowerCase().includes(term.toLowerCase()));
    rep(co.name, `autor contém "${term}"`, r.status === 200 && r.body.meta?.total === n && onlyAuthor, `api ${r.body.meta?.total} · banco ${n}`);
  }
  // 5) combinação entidade + ação
  if (ents[0]) {
    const n = await total("and entity=$2 and action=$3", [ents[0].entity, "CREATE"]);
    const r = await get(`entity=${encodeURIComponent(ents[0].entity)}&action=CREATE&pageSize=100`);
    rep(co.name, `entidade ${ents[0].entity} + ação CREATE`, r.status === 200 && r.body.meta?.total === n, `api ${r.body.meta?.total} · banco ${n}`);
  }
  // 6) histórico de um registro (entityId)
  const [rec] = await q(`select entity_id, count(*)::int n from audit_logs where company_id=$1 and entity_id is not null group by 1 order by 2 desc limit 1`, [cid]);
  if (rec) {
    const r = await get(`entityId=${rec.entity_id}&pageSize=100`);
    rep(co.name, "histórico de um registro (entityId)", r.status === 200 && r.body.meta?.total === rec.n && (r.body.data ?? []).every((x) => x.entity_id === rec.entity_id), `api ${r.body.meta?.total} · banco ${rec.n}`);
  }
  // 7) registro de OUTRA empresa pelo entityId: nada
  const [foreign] = await q(`select entity_id from audit_logs where company_id=$1 and entity_id is not null limit 1`, [otherCid]);
  if (foreign) {
    const r = await get(`entityId=${foreign.entity_id}`);
    rep(co.name, "entityId de outra empresa não devolve nada", r.status === 200 && r.body.meta?.total === 0, `api ${r.status} total ${r.body.meta?.total}`);
  }
  // 8) paginação: páginas 1 e 2 sem repetição, ordem decrescente
  const p1 = await get("pageSize=10&page=1"), p2 = await get("pageSize=10&page=2");
  const ids1 = new Set((p1.body.data ?? []).map((x) => x.id));
  const overlap = (p2.body.data ?? []).some((x) => ids1.has(x.id));
  const dates = [...(p1.body.data ?? []), ...(p2.body.data ?? [])].map((x) => Date.parse(x.created_at));
  const desc = dates.every((d, i) => i === 0 || d <= dates[i - 1]);
  rep(co.name, "paginação sem repetição e mais recente primeiro", !overlap && desc && ids1.size === 10, `p1 ${ids1.size} · repetição ${overlap} · ordem ${desc}`);
  // 9) entityId malformado e filtro inexistente: sem erro técnico
  const bad = await get("entityId=abc");
  rep(co.name, "entityId malformado: lista vazia, sem erro", bad.status === 200 && bad.body.meta?.total === 0, `${bad.status}`);
  const none = await get("action=NAO_EXISTE");
  rep(co.name, "ação inexistente: lista vazia, sem erro", none.status === 200 && none.body.meta?.total === 0, `${none.status}`);
  // 10) nenhuma linha devolvida pertence a outra empresa (amostra: 100 linhas)
  const big = await get("pageSize=100");
  const ids = (big.body.data ?? []).map((x) => x.id);
  const leak = ids.length ? Number((await q(`select count(*)::int n from audit_logs where id = any($1::uuid[]) and company_id <> $2`, [ids, cid]))[0].n) : 0;
  rep(co.name, "nenhuma linha de outra empresa (100 mais recentes)", leak === 0 && ids.length > 0, `${ids.length} linhas · de outra empresa: ${leak}`);
  // 11) R2-18: pedidos criados depois da 0086 têm CREATE (autor = quem criou) e SUBMIT
  const CUT = process.env.CUT_0086;
  if (CUT) {
    const [c] = await q(`select count(*)::int n,
        count(*) filter (where exists (select 1 from audit_logs a where a.entity='sales_orders' and a.entity_id=so.id and a.action='CREATE' and a.user_id=so.created_by and a.company_id=so.company_id))::int ok,
        count(*) filter (where so.status <> 'draft')::int enviados,
        count(*) filter (where so.status <> 'draft' and exists (select 1 from audit_logs a where a.entity='sales_orders' and a.entity_id=so.id and a.action='SUBMIT' and a.user_id is not null))::int sub
      from sales_orders so where so.company_id=$1 and so.created_at > $2`, [cid, CUT]);
    if (c.n === 0) { out.push({ company: co.name, label: "R2-18", ok: null, detail: "N/A: nenhum pedido criado nesta empresa depois da 0086" }); console.log("N/A", co.name, "| R2-18 sem pedidos novos"); }
    else rep(co.name, "R2-18: pedido criado depois da 0086 tem CREATE (autor = quem criou) e SUBMIT", c.ok === c.n && c.sub === c.enviados, `pedidos ${c.n} · CREATE com autor ${c.ok} · enviados ${c.enviados} · SUBMIT ${c.sub}`);
  }
  await s.c.close();
}
fs.writeFileSync(new URL("./p4-auditoria-filtros.out.json", import.meta.url), JSON.stringify({ pass, fail, out }, null, 2));
console.log(`auditoria (filtros): ${pass} PASS, ${fail} FAIL`);
await db.end();
await close();
process.exit(0);
