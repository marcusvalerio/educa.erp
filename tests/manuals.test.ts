// Manuais dentro do app (src/lib/manuals.ts): mesma fonte que o build publica
// (docs/manual/pdf → /landing/manuais/), quem vê cada manual e a landing sem
// oferta de manuais.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MANUALS, manualsFor } from "@/lib/manuals";
import { ERP_NAV } from "@/lib/nav";
import { META } from "../landing/src/content.mjs";

describe("manuais no app", () => {
  test("apontam para os PDFs versionados que o build publica (sem cópia própria)", () => {
    const published = [META.manualUser, META.manualAdmin].map((h: string) => `/landing/${h}`);
    assert.deepEqual(MANUALS.map((m) => m.href), published);
    for (const m of MANUALS) {
      assert.ok(existsSync(path.join(process.cwd(), "docs/manual/pdf", m.file)), m.file);
      assert.equal(path.basename(m.href), m.file);
    }
  });
  test("Manual do Usuário para todos; de Administração só para quem administra", () => {
    const ids = (a: Parameters<typeof manualsFor>[0]) => manualsFor(a).map((m) => m.id);
    assert.deepEqual(ids({ governsCompany: false, platformMember: false }), ["usuario"]);
    assert.deepEqual(ids({ governsCompany: true, platformMember: false }), ["usuario", "administracao"]);
    assert.deepEqual(ids({ governsCompany: false, platformMember: true }), ["usuario", "administracao"]);
  });
  test("Configurações → Documentação está no menu, sem exigir permissão", () => {
    const item = ERP_NAV.find((s) => s.id === "configuracoes")!.items.find((i) => i.href === "/app/configuracoes/documentacao");
    assert.ok(item);
    assert.equal(item!.permission, undefined);
  });
  test("a landing não oferece os manuais", () => {
    const html = path.join(process.cwd(), "public/landing/index.html");
    if (!existsSync(html)) return;
    const text = readFileSync(html, "utf8");
    assert.doesNotMatch(text, /\.pdf"/);
    assert.doesNotMatch(text, /Manual do Usuário|Manual de Administração/);
  });
});
