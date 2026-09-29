// Identidade do produto: ATLAS.ERP. Estes testes impedem que o nome anterior
// volte como NOME COMERCIAL (interface, landing, manuais) e conferem que os
// identificadores técnicos antigos continuam intactos — trocar o cookie, o
// GUC do banco ou as chaves do navegador quebraria sessão, convite e
// preferências sem nenhum ganho para quem usa o sistema.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { buildInfo, PRODUCT_AUTHOR, PRODUCT_CREDIT, PRODUCT_NAME, PRODUCT_WORDMARK } from "@/lib/brand";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full, ext));
    else if (ext.test(name)) out.push(full);
  }
  return out;
}
// Nome anterior como marca: "EDUCA", "EDUCA.ERP", "EDUCA ERP", "Educa ERP".
// Não pega identificadores técnicos em minúsculas (educa_session,
// educa.auth_link, educa-branch:…, educaerp.vercel.app).
const OLD_BRAND = /\bEDUCA\b|\bEduca ERP\b/;

describe("identidade ATLAS.ERP", () => {
  test("nome oficial, sem expansão, e autoria", () => {
    assert.equal(PRODUCT_NAME, "ATLAS.ERP");
    assert.equal(`${PRODUCT_WORDMARK.name}${PRODUCT_WORDMARK.suffix}`, PRODUCT_NAME);
    assert.equal(PRODUCT_AUTHOR, "Marcus Valério");
    assert.equal(PRODUCT_CREDIT, "Criado por Marcus Valério");
  });

  test("versão do build: commit curto da Vercel ou 'local'", () => {
    assert.deepEqual(buildInfo({ NEXT_PUBLIC_BUILD_COMMIT: "0123456789abcdef", NEXT_PUBLIC_BUILD_DATE: "2026-09-29" }), { commit: "0123456", date: "2026-09-29" });
    assert.deepEqual(buildInfo({}), { commit: "local", date: "" });
    // No navegador o Next só substitui referências diretas a process.env.NEXT_PUBLIC_*.
    const src = read("src/lib/brand.ts");
    assert.match(src, /process\.env\.NEXT_PUBLIC_BUILD_COMMIT/);
    assert.match(src, /process\.env\.NEXT_PUBLIC_BUILD_DATE/);
    assert.match(read("next.config.ts"), /NEXT_PUBLIC_BUILD_COMMIT: process\.env\.VERCEL_GIT_COMMIT_SHA/);
  });

  test("interface (src/) sem o nome anterior como marca", () => {
    const offenders: string[] = [];
    for (const file of files(path.join(ROOT, "src"), /\.(ts|tsx|css)$/)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => OLD_BRAND.test(line) && offenders.push(`${path.relative(ROOT, file)}:${i + 1}`));
    }
    assert.deepEqual(offenders, []);
  });

  test("metadados do app: título, aplicação e autoria vêm da identidade", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /applicationName: PRODUCT_NAME/);
    assert.match(layout, /authors: \[\{ name: PRODUCT_AUTHOR \}\]/);
    for (const p of ["src/app/app/admin/layout.tsx", "src/app/app/admincentral/layout.tsx"]) assert.match(read(p), /· ATLAS\.ERP"/, p);
  });

  test("assinatura só nos pontos institucionais (Sobre, rodapé da landing, metadados)", () => {
    const inSrc = files(path.join(ROOT, "src"), /\.(ts|tsx)$/)
      .filter((f) => /Marcus Valério|PRODUCT_CREDIT|PRODUCT_AUTHOR/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .sort();
    assert.deepEqual(inSrc, ["src/app/layout.tsx", "src/components/shell/AboutDialog.tsx", "src/lib/brand.ts"]);
    assert.match(read("src/components/shell/ShellControls.tsx"), /Sobre o ATLAS\.ERP/);
  });

  test("landing: título, marca, CTA e autoria de ATLAS.ERP; nada visível com o nome anterior", () => {
    const html = read("public/landing/index.html");
    assert.match(html, /<title>ATLAS\.ERP · /);
    assert.match(html, /<meta property="og:title" content="ATLAS\.ERP">/);
    assert.match(html, /<meta name="author" content="Marcus Valério">/);
    assert.match(html, /Entrar no ATLAS\.ERP/);
    assert.match(html, /<p class="footer-credit">ATLAS\.ERP · Criado por Marcus Valério<\/p>/);
    // Só o domínio atual (compatibilidade) ainda contém "educa".
    const visible = html.replace(/https:\/\/educaerp\.vercel\.app\//g, "");
    assert.doesNotMatch(visible, /educa/i);
    for (const src of ["landing/src/content.mjs", "scripts/build-landing.mjs"]) assert.doesNotMatch(read(src), OLD_BRAND, src);
  });

  // Os manuais completos são para quem já usa o sistema (Admin e Owner): os
  // PDFs continuam gerados e publicados em /landing/manuais, mas a landing
  // pública não os oferece (decisão do refino de 29/09/2026).
  test("manuais: PDFs com o nome novo, gerados e publicados, fora da landing pública", () => {
    const content = read("landing/src/content.mjs");
    for (const pdf of ["ATLAS-ERP-Manual-do-Usuario.pdf", "ATLAS-ERP-Manual-de-Administracao.pdf"]) {
      assert.ok(existsSync(path.join(ROOT, "docs/manual/pdf", pdf)), pdf);
      assert.ok(content.includes(`manuais/${pdf}`), pdf);
      assert.ok(read("scripts/build-manuals.mjs").includes(`output: "${pdf}"`), pdf);
    }
    assert.doesNotMatch(read("public/landing/index.html"), /\/landing\/manuais\//);
    assert.deepEqual(readdirSync(path.join(ROOT, "docs/manual/pdf")).filter((f) => f.startsWith("EDUCA")), []);
  });

  test("links antigos dos manuais continuam funcionando (308 para os PDFs novos)", () => {
    const config = read("next.config.ts");
    for (const name of ["Manual-do-Usuario", "Manual-de-Administracao"]) {
      assert.ok(
        config.includes(`{ source: "/landing/manuais/EDUCA-${name}.pdf", destination: "/landing/manuais/ATLAS-ERP-${name}.pdf", permanent: true }`),
        name
      );
    }
  });

  test("identificadores técnicos antigos preservados (compatibilidade)", () => {
    assert.match(read("src/lib/auth/neon/server.ts"), /SESSION_COOKIE = "educa_session"/);
    assert.match(read("src/lib/theme.ts"), /"educa-erp-theme-preference"/);
    assert.match(read("src/lib/onboarding/access.ts"), /"educa-branch:"/);
    assert.match(read("src/lib/onboarding/invitations.ts"), /educa_password_pending: true/);
    assert.match(read("supabase/migrations/0072_protect_auth_user_link.sql"), /educa\.auth_link/);
    assert.match(read("scripts/homolog/vercel-guard.mjs"), /"EDUCA_CUTOVER_NEON_CONFIRMADO"/);
  });
});
