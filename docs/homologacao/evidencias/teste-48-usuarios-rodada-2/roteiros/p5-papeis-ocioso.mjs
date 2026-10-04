// /api/admin/roles com o sistema parado (rodada 1: 7,8 s antes → ~0,6 s depois da correção).
import fs from "node:fs";
import { session, api, close } from "../r48/lib.mjs";
import { COMPANIES } from "../r48/companies.mjs";
const out = {};
for (const key of ["cobalto", "vertice"]) {
  const co = COMPANIES.find((c) => c.key === key);
  const s = await session(co.admin.email);
  await api(s.page, "/api/admin/roles"); // aquecimento
  const ms = [];
  for (let i = 0; i < 10; i++) { const t = Date.now(); const r = await api(s.page, "/api/admin/roles"); ms.push(Date.now() - t); if (r.status !== 200) ms.push(-r.status); }
  const sorted = [...ms].sort((a, b) => a - b);
  out[co.name] = { ms, p50: sorted[5], max: sorted[sorted.length - 1] };
  console.log(co.name, JSON.stringify(out[co.name]));
  await s.c.close();
}
fs.writeFileSync(new URL("./p5-papeis-ocioso.out.json", import.meta.url), JSON.stringify(out, null, 2));
await close();
process.exit(0);
