// Cobertura estática das RPCs: toda chamada .rpc("nome", { args }) do app
// precisa resolver para exatamente UMA função do catálogo real (mesma regra
// do PostgREST: nome + nomes dos argumentos + obrigatórios presentes).
//   DATABASE_URL=postgres://…/educa_poc npx tsx poc/neon-full/tools/check-rpc-coverage.mts
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { chooseFunction } from "../../../src/lib/database/pg/postgrest-compat.ts";
import { closePool, loadCatalog } from "../../../src/lib/database/pg/client.ts";

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const f = path.join(d, n);
  return statSync(f).isDirectory() ? walk(f) : /\.(ts|tsx)$/.test(n) ? [f] : [];
});
const calls: { file: string; name: string; keys: string[] | null }[] = [];
for (const file of walk("src")) {
  if (file.includes("database/pg/")) continue;
  const text = readFileSync(file, "utf8");
  const re = /\.rpc\(\s*"(\w+)"\s*(?:,\s*(\{[\s\S]*?\})\s*)?\)/g;
  for (const m of text.matchAll(re)) {
    let keys: string[] | null = [];
    if (m[2]) {
      // chaves de nível superior do literal (nome: valor | nome abreviado); spread → indeterminado
      if (/\.\.\./.test(m[2])) keys = null;
      else {
        let depth = 0, cur = "";
        const parts: string[] = [];
        for (const ch of m[2].slice(1, -1)) {
          if ("([{".includes(ch)) depth++;
          if (")]}".includes(ch)) depth--;
          if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
        }
        parts.push(cur);
        keys = parts.map((p) => p.trim()).filter(Boolean).map((p) => (/^(\w+)\s*:/.exec(p)?.[1] ?? /^(\w+)$/.exec(p)?.[1] ?? "?"));
      }
    }
    calls.push({ file, name: m[1], keys });
  }
}
const cat = await loadCatalog();
let ok = 0;
const problems: string[] = [];
const dynamic: string[] = [];
for (const c of calls) {
  if (c.keys === null || c.keys.includes("?")) { dynamic.push(`${c.file}: ${c.name} (argumentos montados dinamicamente)`); if (cat.functions.has(c.name)) ok++; else problems.push(`${c.file}: ${c.name} não existe`); continue; }
  try {
    chooseFunction(cat.functions.get(c.name), c.name, Object.fromEntries(c.keys.map((k) => [k, null])));
    ok++;
  } catch (e) {
    problems.push(`${c.file}: ${c.name}(${c.keys.join(", ")}) → ${(e as Error).message}`);
  }
}
await closePool();
console.log(JSON.stringify({ chamadas: calls.length, distintas: new Set(calls.map((c) => c.name)).size, resolvidas: ok, dinamicas: dynamic, problemas: problems }, null, 1));
process.exit(problems.length ? 1 : 0);
