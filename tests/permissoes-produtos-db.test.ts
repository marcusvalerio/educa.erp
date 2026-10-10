// Permissões das listas auxiliares da tela de Produtos (unidades, conversões,
// categorias, marcas) × catálogo REAL de permissões (PostgreSQL).
// POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL reconstruído pelo plano
// equivalente à produção (nunca produção).
//
// Estado atual documentado (docs/homologacao/RELATORIO-CORRECOES-CRM-E-PAINEIS.md
// §Permissões de produtos): as rotas exigem códigos que só existem na 0005 do
// repositório, não na 0005 aplicada em produção. A correção depende de uma
// DECISÃO (opções A, B ou C) — por isso os casos que dependem dela estão
// como `todo` (pendentes, não contados como aprovados).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;

// O que a API exige hoje (src/lib/api/handlers.ts → PERMISSION_MODULE + ação)
// e o que as policies de RLS das tabelas exigem para ler.
const REQUIRED_BY_API = ["units.read", "unit_conversions.read", "product_categories.read", "product_brands.read"];

describe("permissões das listas auxiliares de Produtos (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  let catalog = new Set<string>();

  before(async () => {
    await db.connect();
    catalog = new Set((await db.query("select code from public.permissions")).rows.map((r) => r.code as string));
  });
  after(async () => {
    await db.end();
  });

  test("o catálogo tem products.read e as permissões do módulo catalog (categories.*, brands.*)", () => {
    for (const code of ["products.read", "categories.read", "brands.read"]) assert.ok(catalog.has(code), code);
  });

  test("estado atual: as 4 permissões exigidas pela API NÃO existem no catálogo (defeito U-01, causa-raiz)", () => {
    assert.deepEqual(REQUIRED_BY_API.filter((c) => catalog.has(c)), []);
  });

  test("todas as permissões exigidas pelas rotas das listas auxiliares existem no catálogo", { todo: "decisão pendente: opção A (criar units.*/unit_conversions.* e afins), B (usar products.*) ou C (híbrida)" }, () => {
    for (const code of REQUIRED_BY_API) assert.ok(catalog.has(code), code);
  });

  test("unidades de medida não são legíveis por usuário de OUTRA empresa (RLS)", { todo: "a policy units_select_authenticated (USING true, vinda da produção) libera a leitura entre empresas; removê-la sem decidir o modelo deixa ninguém ler unidades" }, async () => {
    const { rows } = await db.query("select pg_get_expr(polqual, polrelid) q from pg_policy where polrelid = 'public.units'::regclass and polcmd = 'r'");
    assert.ok(rows.every((r) => r.q !== "true"), JSON.stringify(rows));
  });
});
