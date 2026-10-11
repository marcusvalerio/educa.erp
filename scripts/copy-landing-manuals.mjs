#!/usr/bin/env node
// Copia os PDFs dos manuais (versionados em docs/manual/pdf) para
// public/landing/manuais/, de onde o app os oferece (Configurações →
// Documentação e Administração Central → Políticas; src/lib/manuals.ts).
// A landing não oferece os manuais.
// A pasta de destino fica fora do Git (os PDFs já estão no repositório).
// Roda antes do `next build` (package.json e vercel.json): leve, sem
// dependências, sem rede. Falha o build se um manual faltar — a landing
// nunca vai ao ar com um link de download quebrado.
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { META } from "../landing/src/content.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FROM = path.join(ROOT, "docs/manual/pdf");
const TO = path.join(ROOT, "public/landing/manuais");
// Os mesmos arquivos que a landing oferece (landing/src/content.mjs).
const FILES = [META.manualUser, META.manualAdmin].map((href) => path.basename(href));

await mkdir(TO, { recursive: true });
for (const f of FILES) {
  const src = path.join(FROM, f);
  if (!existsSync(src)) {
    console.error(`Manual não encontrado: ${path.relative(ROOT, src)} (rode npm run manuals:pdf)`);
    process.exit(1);
  }
  await copyFile(src, path.join(TO, f));
}
console.log(`Manuais da landing: ${FILES.length} PDFs em public/landing/manuais/`);
