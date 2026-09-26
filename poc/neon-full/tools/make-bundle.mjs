// Gera o pacote do esquema (JSON com statements já divididos) a partir do
// plano equivalente a produção. Uso: node poc/neon-full/tools/make-bundle.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { splitSql } from "./split-sql.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const plan = fs.readFileSync(path.join(root, "poc/neon-full/plan-prod-equivalente.txt"), "utf8").split("\n").filter(Boolean);
const files = ["poc/neon-full/sql/00_supabase_compat.sql", ...plan];
const bundle = files.map((f) => {
  const text = fs.readFileSync(path.join(root, f), "utf8");
  return { f, sha256: crypto.createHash("sha256").update(text).digest("hex"), s: splitSql(text) };
});
const out = path.join(root, "poc/neon-full/bundle/schema-bundle.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(bundle));
console.log(`${bundle.length} arquivos, ${bundle.reduce((n, b) => n + b.s.length, 0)} statements, ${fs.statSync(out).size} bytes`);
