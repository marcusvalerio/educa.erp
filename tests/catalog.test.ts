import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  productSchema,
  productCategorySchema,
  productBrandSchema,
  unitSchema,
  unitConversionSchema,
  productSupplierSchema,
} from "@/lib/validations/cadastros";
import {
  productFromRow,
  productToRowFields,
  productCategoryFromRow,
  productCategoryToRowFields,
  productBrandFromRow,
  unitFromRow,
  unitConversionFromRow,
  productSupplierFromRow,
} from "@/lib/database/mappers";
import type {
  ProductRow,
  ProductCategoryRow,
  ProductBrandRow,
  UnitRow,
  UnitConversionRow,
  ProductSupplierRow,
} from "@/lib/database/schema";

// Evolução do catálogo (Fase 2b) — categorias, marcas, unidades,
// conversões e fornecedor por produto. Cobre validação (Zod) e
// mapeamento (camelCase <-> snake_case) da mesma forma que os 8
// cadastros originais em tests/validations.test.ts e tests/mappers.test.ts.

describe("productSchema — novos campos de catálogo", () => {
  test("aceita produto sem categoriaId/marcaId/unidadeId/preços (todos opcionais)", () => {
    const result = productSchema.safeParse({
      codigo: "PRD-0002",
      descricao: "Produto de teste",
      categoria: "Geral",
      unidade: "UN",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.categoriaId, "");
      assert.equal(result.data.marcaId, "");
      assert.equal(result.data.unidadeId, "");
      assert.equal(result.data.precoCusto, 0);
      assert.equal(result.data.precoVenda, 0);
      assert.equal(result.data.precoMinimo, 0);
    }
  });

  test("aceita preços informados", () => {
    const result = productSchema.safeParse({
      codigo: "PRD-0003",
      descricao: "Produto com preço",
      categoria: "Geral",
      unidade: "UN",
      precoCusto: 10.5,
      precoVenda: 19.9,
      precoMinimo: 15,
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.precoVenda, 19.9);
    }
  });
});

describe("productCategorySchema", () => {
  test("exige nome", () => {
    assert.equal(productCategorySchema.safeParse({}).success, false);
  });

  test("aceita categoria de topo (sem categoriaPaiId)", () => {
    const result = productCategorySchema.safeParse({ nome: "Ferramentas" });
    assert.equal(result.success, true);
  });

  test("aceita subcategoria com categoriaPaiId", () => {
    const result = productCategorySchema.safeParse({
      nome: "Chaves de fenda",
      categoriaPaiId: "11111111-1111-1111-1111-111111111111",
    });
    assert.equal(result.success, true);
  });
});

describe("productBrandSchema", () => {
  test("exige nome", () => {
    assert.equal(productBrandSchema.safeParse({}).success, false);
  });

  test("aceita marca válida", () => {
    assert.equal(productBrandSchema.safeParse({ nome: "Marca X" }).success, true);
  });
});

describe("unitSchema", () => {
  test("exige código e nome", () => {
    assert.equal(unitSchema.safeParse({}).success, false);
    assert.equal(unitSchema.safeParse({ codigo: "UN" }).success, false);
  });

  test("fracionavel tem default true", () => {
    const result = unitSchema.safeParse({ codigo: "KG", nome: "Quilograma" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.fracionavel, true);
  });
});

describe("unitConversionSchema", () => {
  test("exige as duas unidades", () => {
    assert.equal(unitConversionSchema.safeParse({ fator: 12 }).success, false);
  });

  test("rejeita fator zero ou negativo", () => {
    const base = {
      unidadeOrigemId: "11111111-1111-1111-1111-111111111111",
      unidadeDestinoId: "22222222-2222-2222-2222-222222222222",
    };
    assert.equal(unitConversionSchema.safeParse({ ...base, fator: 0 }).success, false);
    assert.equal(unitConversionSchema.safeParse({ ...base, fator: -1 }).success, false);
  });

  test("aceita conversão válida (1 CX = 12 UN)", () => {
    const result = unitConversionSchema.safeParse({
      unidadeOrigemId: "11111111-1111-1111-1111-111111111111",
      unidadeDestinoId: "22222222-2222-2222-2222-222222222222",
      fator: 12,
    });
    assert.equal(result.success, true);
  });
});

describe("productSupplierSchema", () => {
  test("exige produto e fornecedor", () => {
    assert.equal(productSupplierSchema.safeParse({}).success, false);
  });

  test("aceita vínculo válido com defaults", () => {
    const result = productSupplierSchema.safeParse({
      produtoId: "11111111-1111-1111-1111-111111111111",
      fornecedorId: "22222222-2222-2222-2222-222222222222",
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.preferencial, false);
  });
});

const baseProductRow: ProductRow = {
  id: "11111111-1111-1111-1111-111111111111",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "PRD-0001",
  sku: "SKU-000001",
  barcode: null,
  name: "Parafuso Sextavado M8",
  description: null,
  category: "Ferramentas",
  subcategory: null,
  unit: "UN",
  ncm: null,
  weight: null,
  height_cm: null,
  width_cm: null,
  length_cm: null,
  minimum_stock: null,
  maximum_stock: null,
  reorder_point: null,
  supplier_id: null,
  default_location_code: null,
  batch_controlled: false,
  expiration_controlled: false,
  category_id: "33333333-3333-3333-3333-333333333333",
  brand_id: "44444444-4444-4444-4444-444444444444",
  unit_id: "55555555-5555-5555-5555-555555555555",
  cost_price: 10.5,
  sale_price: 19.9,
  min_price: 15,
  purchase_unit_id: null,
  sale_unit_id: null,
  production_unit_id: null,
  product_segment: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("productFromRow/productToRowFields — colunas relacionais", () => {
  test("mapeia category_id/brand_id/unit_id e preços para camelCase", () => {
    const entity = productFromRow(baseProductRow);
    assert.equal(entity.categoriaId, "33333333-3333-3333-3333-333333333333");
    assert.equal(entity.marcaId, "44444444-4444-4444-4444-444444444444");
    assert.equal(entity.unidadeId, "55555555-5555-5555-5555-555555555555");
    assert.equal(entity.precoVenda, 19.9);
  });

  test("colunas relacionais nulas viram string/0 neutros, não undefined", () => {
    const entity = productFromRow({ ...baseProductRow, category_id: null, brand_id: null, unit_id: null, cost_price: null });
    assert.equal(entity.categoriaId, "");
    assert.equal(entity.marcaId, "");
    assert.equal(entity.precoCusto, 0);
  });

  test("update parcial não sobrescreve category_id/brand_id/unit_id não enviados", () => {
    const fields = productToRowFields({ descricao: "Novo nome" });
    assert.equal("category_id" in fields, false);
    assert.equal("brand_id" in fields, false);
    assert.equal("unit_id" in fields, false);
  });

  test("categoriaId vazio grava NULL (desvincula), ausente não toca a coluna", () => {
    const cleared = productToRowFields({ categoriaId: "" });
    assert.equal(cleared.category_id, null);
    const untouched = productToRowFields({});
    assert.equal("category_id" in untouched, false);
  });
});

const baseCategoryRow: ProductCategoryRow = {
  id: "33333333-3333-3333-3333-333333333333",
  company_id: "00000000-0000-0000-0000-000000000001",
  parent_id: null,
  code: "ferramentas",
  name: "Ferramentas",
  description: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("productCategoryFromRow", () => {
  test("categoria de topo tem categoriaPaiId vazio", () => {
    const entity = productCategoryFromRow(baseCategoryRow);
    assert.equal(entity.categoriaPaiId, "");
  });

  test("subcategoria preserva o parent_id", () => {
    const entity = productCategoryFromRow({ ...baseCategoryRow, parent_id: "99999999-9999-9999-9999-999999999999" });
    assert.equal(entity.categoriaPaiId, "99999999-9999-9999-9999-999999999999");
  });

  test("productCategoryToRowFields mapeia categoriaPaiId para parent_id", () => {
    const fields = productCategoryToRowFields({ nome: "Chaves", categoriaPaiId: "33333333-3333-3333-3333-333333333333" });
    assert.equal(fields.name, "Chaves");
    assert.equal(fields.parent_id, "33333333-3333-3333-3333-333333333333");
  });
});

describe("productBrandFromRow", () => {
  test("mapeia nome", () => {
    const row: ProductBrandRow = {
      id: "1",
      company_id: "c1",
      code: null,
      name: "Marca X",
      description: null,
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    assert.equal(productBrandFromRow(row).nome, "Marca X");
  });
});

describe("unitFromRow", () => {
  test("mapeia fractionable para fracionavel", () => {
    const row: UnitRow = {
      id: "1",
      company_id: "c1",
      code: "UN",
      name: "Unidade",
      symbol: null,
      unit_type: null,
      decimal_places: 0,
      base_unit_id: null,
      fractionable: false,
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const entity = unitFromRow(row);
    assert.equal(entity.codigo, "UN");
    assert.equal(entity.fracionavel, false);
  });
});

describe("unitConversionFromRow", () => {
  test("mapeia fator como número (1 CX = 12 UN)", () => {
    const row: UnitConversionRow = {
      id: "1",
      company_id: "c1",
      from_unit_id: "cx",
      to_unit_id: "un",
      product_id: null,
      factor: 12,
      valid_from: null,
      valid_until: null,
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const entity = unitConversionFromRow(row);
    assert.equal(entity.fator, 12);
    assert.equal(entity.unidadeOrigemId, "cx");
    assert.equal(entity.unidadeDestinoId, "un");
  });
});

describe("productSupplierFromRow", () => {
  test("mapeia is_preferred para preferencial", () => {
    const row: ProductSupplierRow = {
      id: "1",
      company_id: "c1",
      product_id: "p1",
      supplier_id: "s1",
      supplier_sku: "SUP-1",
      cost: 8.5,
      lead_time_days: 5,
      is_preferred: true,
      status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const entity = productSupplierFromRow(row);
    assert.equal(entity.preferencial, true);
    assert.equal(entity.custo, 8.5);
    assert.equal(entity.prazoEntregaDias, 5);
  });
});
