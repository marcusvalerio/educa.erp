// Rodada 2 — antes da 0081: as duplicatas criadas pela reprodução (títulos
// ativos, separações abertas e expedições excedentes do mesmo pedido) são
// CANCELADAS pela API oficial, com o papel responsável de cada empresa (o autor
// fica na auditoria). Nada é apagado. Mantém o título com recebimento (senão o
// mais antigo), a separação mais antiga e a expedição mais antiga.
import fs from "node:fs";
import { close } from "../r48/lib.mjs";
import { company, db, q, st, post } from "./ctx.mjs";
import { state } from "../r48/lib.mjs";

const out = [];
for (const key of Object.keys(state.companies)) {
  const cid = state.companies[key].companyId;
  const ar = await q(`select id, code, origin_id from (
      select ar.id, ar.code, ar.origin_id, row_number() over (partition by ar.origin_id order by (ar.received_amount > 0) desc nulls last, ar.created_at) rn
      from accounts_receivable ar
      where ar.company_id=$1 and ar.origin_type='sales_order' and ar.status<>'CANCELLED'
        and ar.origin_id in (select origin_id from accounts_receivable where company_id=$1 and origin_type='sales_order' and status<>'CANCELLED' group by origin_id having count(*)>1)
    ) d where rn > 1`, [cid]).catch(async () => q(`select id, code, origin_id from (
      select ar.id, ar.code, ar.origin_id, row_number() over (partition by ar.origin_id order by ar.created_at) rn
      from accounts_receivable ar
      where ar.company_id=$1 and ar.origin_type='sales_order' and ar.status<>'CANCELLED'
        and ar.origin_id in (select origin_id from accounts_receivable where company_id=$1 and origin_type='sales_order' and status<>'CANCELLED' group by origin_id having count(*)>1)
    ) d where rn > 1`, [cid]));
  const pl = await q(`select id, code from (select id, code, row_number() over (partition by sales_order_id order by created_at) rn from pick_lists where company_id=$1 and status in ('pending','in_progress')
      and sales_order_id in (select sales_order_id from pick_lists where company_id=$1 and status in ('pending','in_progress') group by sales_order_id having count(*)>1)) d where rn>1`, [cid]);
  const sh = await q(`select id, code from (select id, code, row_number() over (partition by sales_order_id order by created_at) rn from shipments where company_id=$1 and status in ('draft','ready','picking','packed','ready_to_ship')
      and sales_order_id in (select sales_order_id from shipments where company_id=$1 and status in ('draft','ready','picking','packed','ready_to_ship') group by sales_order_id having count(*)>1)) d where rn>1`, [cid]);
  if (!ar.length && !pl.length && !sh.length) continue;
  const C = await company(key, "limpeza");
  const fin = C.co.users.some((u) => u.role === "financeiro") ? "financeiro" : "gerente";
  for (const r of ar) { const x = await post((await C.as(fin)).page, `/api/accounts-receivable/${r.id}/cancel`, { reason: "Duplicado criado no teste de concorrência (rodada 2)" }); out.push([C.co.name, "título", r.code, st(x)]); }
  for (const r of pl) { const x = await post((await C.as("logistica")).page, `/api/pick-lists/${r.id}/cancel`, { reason: "Duplicada criada no teste de concorrência (rodada 2)" }); out.push([C.co.name, "separação", r.code, st(x)]); }
  for (const r of sh) { const x = await post((await C.as("logistica")).page, `/api/shipments/${r.id}/cancel`, { reason: "Duplicada criada no teste de concorrência (rodada 2)" }); out.push([C.co.name, "expedição", r.code, st(x)]); }
}
for (const r of out) console.log(r.join(" | "));
fs.writeFileSync(new URL("./p0-limpeza.out.json", import.meta.url), JSON.stringify(out, null, 2));
await db.end();
await close();
process.exit(0);
