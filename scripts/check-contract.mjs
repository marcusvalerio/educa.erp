#!/usr/bin/env node
// Confere o SHA-256 de cada fixture de docs/contrato com docs/contrato/index.json
// (contrato ATLAS ↔ ORION, §7.4). Falha (exit 1) se divergir ou faltar arquivo.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "docs/contrato");
const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8"));
const listed = new Set(index.files.map((f) => f.file));
let bad = 0;
for (const f of index.files) {
  const sha = createHash("sha256").update(readFileSync(path.join(dir, f.file))).digest("hex");
  if (sha !== f.sha256) { console.error(`SHA-256 diferente: ${f.file}`); bad++; }
}
for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "index.json")) {
  if (!listed.has(f)) { console.error(`fora do índice: ${f}`); bad++; }
}
if (bad) process.exit(1);
console.log(`contrato ${index.contract} v${index.version}: ${index.files.length} fixtures conferidas`);
