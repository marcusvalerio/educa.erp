// Navegação por permissão (src/lib/navigation/access.ts + src/lib/nav.ts).
// A UI nunca substitui RLS/RBAC: estes testes garantem só que a
// navegação esconde o que o perfil não pode abrir e que o casamento de
// rotas é por segmento (/admin não fica ativo em /admincentral).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { ADMIN_NAV, ERP_NAV, PLATFORM_NAV } from "@/lib/nav";
import { breadcrumbFor, canAccess, initials, isPathActive, matchLeaf, routeRequirement, safeNextPath, visibleSections } from "@/lib/navigation/access";

const only = (...perms: string[]) => (p: string) => perms.includes(p);

describe("isPathActive", () => {
  test("compara por segmento, não por prefixo de texto", () => {
    assert.equal(isPathActive("/app/admincentral", "/app/admin"), false);
    assert.equal(isPathActive("/app/admincentral/companies", "/app/admin"), false);
    assert.equal(isPathActive("/app/admin/users", "/app/admin"), true);
    assert.equal(isPathActive("/app/admin", "/app/admincentral"), false);
  });
  test("raiz do ERP (/app) só é ativa na raiz", () => {
    assert.equal(isPathActive("/app", "/app"), true);
    assert.equal(isPathActive("/app?periodo=30d", "/app"), true);
    assert.equal(isPathActive("/app/comercial", "/app"), false);
    assert.equal(isPathActive("/app/admin/users", "/app"), false);
  });
  test("modo exato e query string", () => {
    assert.equal(isPathActive("/app/gestao/dashboard/comercial", "/app/gestao/dashboard", true), false);
    assert.equal(isPathActive("/app/gestao/dashboard?periodo=30d", "/app/gestao/dashboard", true), true);
  });
});

describe("canAccess / visibleSections", () => {
  test("item sem permissão é público; lista exige qualquer uma", () => {
    assert.equal(canAccess(undefined, only()), true);
    assert.equal(canAccess(["a", "b"], only("b")), true);
    assert.equal(canAccess(["a", "b"], only()), false);
  });
  test("seção some quando nenhum item é permitido", () => {
    const sections = visibleSections(ERP_NAV, only("sales_orders.view"));
    const ids = sections.map((s) => s.id);
    assert.ok(ids.includes("comercial"));
    assert.ok(!ids.includes("financeiro"));
    const comercial = sections.find((s) => s.id === "comercial")!;
    assert.ok(comercial.items.every((i) => canAccess(i.permission, only("sales_orders.view"))));
  });
  test("perfil sem permissões vê só o início e a aparência pessoal", () => {
    const sections = visibleSections(ERP_NAV, only());
    assert.deepEqual(sections.map((s) => s.id), ["inicio", "configuracoes"]);
    assert.deepEqual(sections[1].items.map((i) => i.href), ["/app/configuracoes/aparencia"]);
  });
});

describe("routeRequirement / matchLeaf", () => {
  test("rota de item exige a permissão do item", () => {
    assert.equal(routeRequirement(ERP_NAV, "/app/comercial/pedidos-venda"), "sales_orders.view");
  });
  test("detalhe herda a permissão da lista", () => {
    assert.equal(routeRequirement(ERP_NAV, "/app/comercial/pedidos-venda/0b9b3c5e-0000-4000-8000-000000000000"), "sales_orders.view");
  });
  test("item mais específico vence", () => {
    const m = matchLeaf(ERP_NAV, "/app/gestao/dashboard/comercial");
    assert.equal(m?.leaf?.href, "/app/gestao/dashboard/comercial");
  });
  test("landing do módulo exige qualquer permissão dos itens", () => {
    const req = routeRequirement(ERP_NAV, "/app/financeiro");
    assert.ok(Array.isArray(req) && req.length > 0);
  });
  test("/admin e /admincentral não se misturam", () => {
    assert.equal(matchLeaf(ADMIN_NAV, "/app/admincentral/companies"), null);
    assert.equal(matchLeaf(PLATFORM_NAV, "/app/admin/users"), null);
    assert.equal(routeRequirement(ADMIN_NAV, "/app/admin/users/cadastro"), "users.read");
  });
  test("breadcrumb segue seção e item", () => {
    const crumbs = breadcrumbFor(ERP_NAV, "/app/comercial/pedidos-venda", "Início", "/app");
    assert.deepEqual(crumbs.map((c) => c.label), ["Início", "Comercial", "Pedidos de venda"]);
  });
});

describe("safeNextPath / initials", () => {
  test("bloqueia redirecionamento aberto", () => {
    assert.equal(safeNextPath("https://evil.example"), "/");
    assert.equal(safeNextPath("//evil.example"), "/");
    assert.equal(safeNextPath("/\\evil"), "/");
    assert.equal(safeNextPath(null), "/");
    assert.equal(safeNextPath("/app/financeiro?x=1"), "/app/financeiro?x=1");
  });
  test("iniciais do nome real", () => {
    assert.equal(initials("Maria da Silva"), "MS");
    assert.equal(initials("João"), "JO");
    assert.equal(initials(""), "?");
    assert.equal(initials("Admin A (E2E)"), "AA");
    assert.equal(initials("(E2E)"), "?");
  });
});

describe("mapa de navegação", () => {
  const all = [...ERP_NAV, ...ADMIN_NAV, ...PLATFORM_NAV];
  test("hrefs de item são únicos", () => {
    const hrefs = all.flatMap((s) => s.items.map((i) => i.href));
    assert.equal(new Set(hrefs).size, hrefs.length);
  });
  test("cada ambiente fica no seu prefixo", () => {
    for (const item of ADMIN_NAV.flatMap((s) => s.items)) assert.ok(isPathActive(item.href, "/app/admin"), item.href);
    for (const item of PLATFORM_NAV.flatMap((s) => s.items)) assert.ok(isPathActive(item.href, "/app/admincentral"), item.href);
    for (const item of ERP_NAV.flatMap((s) => s.items)) {
      assert.ok(!isPathActive(item.href, "/app/admin") && !isPathActive(item.href, "/app/admincentral"), item.href);
    }
  });
  test("toda rota do menu tem página", () => {
    const root = path.join(process.cwd(), "src", "app");
    for (const section of all) {
      for (const href of [section.href, ...section.items.map((i) => i.href)]) {
        const clean = href.split("?")[0];
        const inErp = clean.replace(/^\/app(?=\/|$)/, "");
        const candidates = [path.join(root, "app", "(erp)", inErp, "page.tsx"), path.join(root, clean, "page.tsx")];
        assert.ok(candidates.some((c) => existsSync(c)), `sem página para ${href}`);
      }
    }
  });
});
