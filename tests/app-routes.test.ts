// Arquitetura unificada: landing em "/", entrada/autenticação nas rotas de
// sempre, ERP autenticado em /app, APIs em /api — tudo na mesma aplicação.
// Estes testes travam o que não pode regredir: os 308 dos endereços antigos,
// nenhum link interno apontando para eles, a landing fora do proxy e sem
// arquivo quebrado.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ADMIN_NAV, ERP_NAV, PLATFORM_NAV } from "@/lib/nav";
import { APP_HOME, LEGACY_APP_AREAS, legacyAppPath, legacyAppRedirects } from "@/lib/navigation/app-routes";

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

describe("endereços antigos do ERP → /app (308)", () => {
  test("cada área do ERP tem redirecionamento permanente, com e sem subcaminho", () => {
    const redirects = legacyAppRedirects();
    for (const area of LEGACY_APP_AREAS) {
      assert.ok(redirects.some((r) => r.source === `/${area}` && r.destination === `/app/${area}` && r.permanent), area);
      assert.ok(redirects.some((r) => r.source === `/${area}/:path*` && r.destination === `/app/${area}/:path*` && r.permanent), area);
    }
    assert.equal(redirects.length, LEGACY_APP_AREAS.length * 2);
  });

  test("as áreas são exatamente as pastas do ERP (módulo novo não fica sem 308)", () => {
    const erp = readdirSync(path.join(ROOT, "src/app/app/(erp)")).filter((n) => statSync(path.join(ROOT, "src/app/app/(erp)", n)).isDirectory());
    assert.deepEqual([...LEGACY_APP_AREAS].sort(), [...erp, "admin", "admincentral"].sort());
  });

  test("nenhum 308 alcança entrada, autenticação, API ou landing", () => {
    const sources = legacyAppRedirects().map((r) => r.source.split("/")[1]);
    for (const kept of ["", "app", "api", "login", "recuperar-senha", "redefinir-senha", "convite", "acesso", "auth", "landing", "_next"]) {
      assert.ok(!sources.includes(kept), kept);
    }
  });

  test("legacyAppPath: só endereços antigos, com query e subcaminho", () => {
    assert.equal(legacyAppPath("/comercial"), "/app/comercial");
    assert.equal(legacyAppPath("/comercial/pedidos-venda?view=aprovacao"), "/app/comercial/pedidos-venda?view=aprovacao");
    assert.equal(legacyAppPath("/admincentral/companies"), "/app/admincentral/companies");
    assert.equal(legacyAppPath("/admin"), "/app/admin");
    for (const p of ["/", "/app", "/app/comercial", "/login", "/api/customers", "/comercialx", "/administrador", "/acesso"]) assert.equal(legacyAppPath(p), null, p);
  });
});

describe("links internos do ERP", () => {
  test("todo item de menu (ERP, Administração, Administração Central) mora em /app", () => {
    for (const section of [...ERP_NAV, ...ADMIN_NAV, ...PLATFORM_NAV]) {
      for (const href of [section.href, ...section.items.map((i) => i.href)]) {
        assert.ok(href === APP_HOME || href.startsWith(`${APP_HOME}/`), href);
      }
    }
  });

  test("nenhum link, redirect ou destino do app aponta para um endereço antigo", () => {
    // Literais "/comercial…", '/admin…', `/gestao…`, (/crm…) fora das APIs.
    // Exceção: rotas da API do próprio Neon Auth (/admin/create-user…), que
    // não são páginas do ATLAS.ERP.
    const legacy = new RegExp(`["'\`(]/(${LEGACY_APP_AREAS.join("|")})(?=[/"'\`?#)]|\\$)`);
    const offenders: string[] = [];
    for (const file of files(path.join(ROOT, "src"), /\.(ts|tsx)$/)) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      if (rel.startsWith("src/app/api/") || rel === "src/lib/auth/neon/client.ts") continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith("//") || code.startsWith("*")) return; // comentário explicando a mudança
          if (legacy.test(line)) offenders.push(`${rel}:${i + 1}: ${code}`);
        });
    }
    assert.deepEqual(offenders, []);
  });

  test("a raiz do ERP é /app: nada no app manda para '/' como se fosse o ERP", () => {
    const shell = read("src/components/shell/ShellFrame.tsx");
    assert.match(shell, /rootLabel: "Início", rootHref: "\/app"/);
    assert.doesNotMatch(shell, /href="\/"/);
    assert.match(read("src/proxy.ts"), /url\.pathname = APP_HOME;/);
  });
});

describe("proxy × landing", () => {
  // O matcher do proxy (config estática) como expressão regular.
  const source = read("src/proxy.ts").match(/matcher: \["([^"]+)"\]/)?.[1];
  const matcher = new RegExp(`^${source!.replace(/\\\\/g, "\\")}$`);

  test("arquivos da landing (CSS, JS, fontes, imagens, PDFs) ficam fora do proxy", () => {
    for (const p of ["/landing/styles.css", "/landing/main.js", "/landing/motion.js", "/landing/vendor/gsap.min.js", "/landing/fonts/dm-sans-latin-wght-normal.woff2", "/landing/img/x.webp", "/landing/manuais/ATLAS-ERP-Manual-do-Usuario.pdf", "/landing/manuais/EDUCA-Manual-do-Usuario.pdf"]) {
      assert.equal(matcher.test(p), false, p);
    }
  });

  test("páginas continuam passando pelo proxy (sessão e redirecionamentos)", () => {
    for (const p of ["/", "/login", "/recuperar-senha", "/app", "/app/comercial/pedidos-venda", "/app/admin", "/app/admincentral", "/acesso", "/convite/x", "/landing"]) {
      assert.equal(matcher.test(p), true, p);
    }
  });
});

describe("landing servida pelo app (public/landing)", () => {
  const html = read("public/landing/index.html");

  test("todo arquivo citado existe (PDFs: a fonte versionada que o build copia)", () => {
    const urls = new Set<string>();
    for (const m of html.matchAll(/\s(?:src|href|srcset|imagesrcset)="([^"]*)"/g)) {
      for (const part of m[1].split(", ")) {
        const url = part.split(" ")[0];
        if (url.startsWith("/landing/")) urls.add(url);
      }
    }
    assert.ok(urls.size > 100, `poucos arquivos: ${urls.size}`);
    const css = read("public/landing/styles.css");
    for (const m of css.matchAll(/url\((fonts\/[^)]+)\)/g)) urls.add(`/landing/${m[1]}`);
    const missing = [...urls].filter((url) => {
      const rel = url.slice("/landing/".length);
      if (rel.startsWith("manuais/")) return !existsSync(path.join(ROOT, "docs/manual/pdf", path.basename(rel)));
      return !existsSync(path.join(ROOT, "public/landing", rel));
    });
    assert.deepEqual(missing, []);
  });

  test("nenhum arquivo por caminho relativo (quebraria com a página servida em '/')", () => {
    assert.deepEqual(html.match(/\s(?:src|href|srcset|imagesrcset)="(?:img|fonts|vendor|manuais)\//g), null);
    assert.doesNotMatch(html, /\s(?:src|href)="(?:styles\.css|main\.js|motion\.js)"/);
  });

  test("'Entrar no ATLAS.ERP' leva ao /login do mesmo domínio; nenhum CTA de cadastro", () => {
    const enter = [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*Entrar(?:(?!<\/a>)[\s\S])*<\/a>/g)].map((m) => m[1]);
    assert.ok(enter.length >= 3, `CTAs: ${enter.length}`);
    assert.ok(enter.every((href) => href === "/login"), enter.join(", "));
    assert.doesNotMatch(html, /href="https?:\/\/[^"]*\/login/);
    assert.doesNotMatch(html, /criar conta|cadastre-se|teste gr[aá]tis|come[cç]ar agora|solicitar acesso/i);
  });

  test("link do Supabase que cai em '/' com a sessão no fragmento vai para /login", () => {
    const script = html.match(/<script>(\(function\(\)\{var h=location\.hash;[^<]*)<\/script>/)?.[1];
    assert.ok(script, "encaminhamento ausente");
    // O encaminhamento é o primeiro script da página (antes de qualquer animação).
    assert.equal(html.indexOf("<script"), html.indexOf(`<script>${script}`));
    const run = (hash: string) => {
      let to: string | null = null;
      new Function("location", script)({ hash, replace: (u: string) => (to = u) });
      return to;
    };
    assert.equal(run("#access_token=a&refresh_token=b&type=recovery"), "/login#access_token=a&refresh_token=b&type=recovery");
    assert.equal(run("#error=access_denied&error_code=otp_expired"), "/login#error=access_denied&error_code=otp_expired");
    assert.equal(run("#expires_at=1&access_token=a"), "/login#expires_at=1&access_token=a");
    for (const anchor of ["", "#", "#conteudo", "#siga-um-pedido", "#areas"]) assert.equal(run(anchor), null, anchor);
  });

  test("uma página só: o HTML da landing não mora em /landing/ (308 para '/')", () => {
    const config = read("next.config.ts");
    assert.match(config, /source: "\/", destination: "\/landing\/index\.html"/);
    assert.match(config, /source: "\/landing\/index\.html", destination: "\/", permanent: true/);
    assert.match(html, /<link rel="canonical" href="https:\/\/educaerp\.vercel\.app\/">/);
  });
});
