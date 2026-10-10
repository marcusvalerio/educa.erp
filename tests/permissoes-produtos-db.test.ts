// Permissões do catálogo de produtos: o MESMO mapa usado pelas rotas
// (src/lib/api/entity-permissions.ts) × catálogo real de permissões × policies
// de RLS (PostgreSQL). POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL
// reconstruído pelo plano (nunca produção).
//
// Antes da 0091 os dois últimos casos eram `todo`: as rotas exigiam códigos
// que não existiam no catálogo de produção (units.*, unit_conversions.*,
// product_categories.*, product_brands.*, product_suppliers.*) e a policy
// units_select_authenticated (USING true) liberava unidades entre empresas.
// Modelo adotado e motivos: docs/homologacao/RELATORIO-PERMISSOES-PRODUTOS.md.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";
import { entityPermissionCode, type EntityAction } from "@/lib/api/entity-permissions";
import type { EntityRoute } from "@/lib/database/repositories";

const url = process.env.POC_DATABASE_OWNER_URL;

// Rotas do catálogo de produtos → tabela.
const CATALOG_ROUTES: [EntityRoute, string][] = [
  ["products", "products"],
  ["product-categories", "product_categories"],
  ["product-brands", "product_brands"],
  ["units", "units"],
  ["unit-conversions", "unit_conversions"],
  ["product-suppliers", "product_suppliers"],
  ["price-lists", "price_lists"],
  ["price-list-items", "price_list_items"],
];
// Tabelas do produto sem rota própria: seguem o produto.
const PRODUCT_CHILD_TABLES = ["product_units", "product_variants", "product_barcodes"];
const ACTIONS: EntityAction[] = ["read", "create", "update", "delete"];
const CMD: Record<EntityAction, string> = { read: "r", create: "a", update: "w", delete: "d" };

type Policy = { table: string; cmd: string; permissive: boolean; expr: string };

describe("permissões do catálogo de produtos (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  let catalog = new Set<string>();
  let policies: Policy[] = [];

  before(async () => {
    await db.connect();
    catalog = new Set((await db.query("select code from public.permissions")).rows.map((r) => r.code as string));
    policies = (
      await db.query(
        `select c.relname as table, p.polcmd as cmd, p.polpermissive as permissive,
                coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as expr
         from pg_policy p join pg_class c on c.oid = p.polrelid
         where c.relnamespace = 'public'::regnamespace`
      )
    ).rows as Policy[];
  });
  after(async () => {
    await db.end();
  });

  test("o catálogo tem products.*, categories.*, brands.* e price_lists.*", () => {
    for (const code of ["products.read", "categories.read", "brands.read", "price_lists.read"]) assert.ok(catalog.has(code), code);
  });

  test("todas as permissões exigidas pelas rotas do catálogo existem no catálogo de permissões", () => {
    const missing = CATALOG_ROUTES.flatMap(([route]) => ACTIONS.map((a) => entityPermissionCode(route, a))).filter((c) => !catalog.has(c));
    assert.deepEqual(missing, []);
  });

  test("nenhum sinônimo redundante foi criado (product_categories.*, product_brands.*, product_suppliers.*)", () => {
    assert.deepEqual([...catalog].filter((c) => /^(product_categories|product_brands|product_suppliers)\./.test(c)), []);
  });

  test("API e RLS exigem a MESMA permissão em cada operação de cada tabela do catálogo", () => {
    const divergences: string[] = [];
    for (const [route, table] of CATALOG_ROUTES) {
      for (const action of ACTIONS) {
        const code = entityPermissionCode(route, action);
        const mine = policies.filter((p) => p.table === table && (p.cmd === CMD[action] || p.cmd === "*"));
        if (mine.length === 0) divergences.push(`${table} ${action}: sem policy`);
        for (const p of mine) if (!p.expr.includes(`has_permission(company_id, '${code}'::text)`)) divergences.push(`${table} ${action}: API ${code} × RLS ${p.expr.trim()}`);
      }
    }
    assert.deepEqual(divergences, []);
  });

  test("variantes, códigos de barras e unidades do produto seguem products.read / products.update", () => {
    for (const table of PRODUCT_CHILD_TABLES) {
      for (const action of ACTIONS) {
        const expected = action === "read" ? "products.read" : "products.update";
        const mine = policies.filter((p) => p.table === table && p.cmd === CMD[action]);
        assert.ok(mine.length > 0, `${table} ${action}: sem policy`);
        for (const p of mine) assert.ok(p.expr.includes(`'${expected}'`), `${table} ${action}: ${p.expr}`);
      }
    }
  });

  test("unidades de medida não são legíveis por usuário de OUTRA empresa: nenhuma policy permissiva sem has_permission(company_id, …) no catálogo", () => {
    const tables = new Set([...CATALOG_ROUTES.map(([, t]) => t), ...PRODUCT_CHILD_TABLES]);
    const open = policies.filter((p) => tables.has(p.table) && p.permissive && !/has_permission\(company_id, '[a-z_]+\.[a-z_]+'::text\)/.test(p.expr));
    assert.deepEqual(open, [], "policy permissiva sem escopo de empresa (ex.: units_select_authenticated USING true)");
  });

  test("leitura não vira escrita: units.* e unit_conversions.* só foram dados a quem tem a mesma ação em categories.*", async () => {
    const { rows } = await db.query(
      `select r.code as role, r.company_id, pn.code
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       join public.permissions pn on pn.id = rp.permission_id and pn.code ~ '^(units|unit_conversions)\\.'
       where r.is_system and r.code in ('leitura', 'vendedor')
         and pn.action <> 'read'`
    );
    assert.deepEqual(rows, [], "Somente leitura/Vendedor com escrita em unidades");
  });
});
