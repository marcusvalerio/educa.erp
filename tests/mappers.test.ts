import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  productFromRow,
  productToRowFields,
  customerFromRow,
  driverFromRow,
  driverToRowFields,
  categoryFromRow,
  categoryToRowFields,
  brandFromRow,
  brandToRowFields,
  productSupplierFromRow,
  productSupplierToRowFields,
  productPriceFromRow,
  productPriceToRowFields,
  productUnitFromRow,
  productUnitToRowFields,
} from "@/lib/database/mappers";
import type {
  ProductRow,
  CustomerRow,
  DriverRow,
  ProductCategoryRow,
  ProductBrandRow,
  ProductSupplierRow,
  ProductPriceRow,
  ProductUnitRow,
} from "@/lib/database/schema";

const baseProductRow: ProductRow = {
  id: "11111111-1111-1111-1111-111111111111",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "PRD-0001",
  sku: "SKU-000001",
  barcode: null,
  name: "Parafuso Sextavado M8",
  description: "Parafuso",
  category: "Ferramentas",
  subcategory: null,
  unit: "UN",
  ncm: null,
  weight: 1.5,
  height_cm: null,
  width_cm: null,
  length_cm: null,
  minimum_stock: 10,
  maximum_stock: 500,
  reorder_point: 100,
  supplier_id: "22222222-2222-2222-2222-222222222222",
  category_id: null,
  brand_id: null,
  default_location_code: "CD01-R01-M01-N01-P01",
  batch_controlled: true,
  expiration_controlled: false,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("productFromRow", () => {
  test("mapeia status active/inactive para Ativo/Inativo", () => {
    const entity = productFromRow(baseProductRow);
    assert.equal(entity.status, "Ativo");
    assert.equal(productFromRow({ ...baseProductRow, status: "inactive" }).status, "Inativo");
  });

  test("preserva código, fornecedor e localização", () => {
    const entity = productFromRow(baseProductRow);
    assert.equal(entity.codigo, "PRD-0001");
    assert.equal(entity.fornecedorId, "22222222-2222-2222-2222-222222222222");
    assert.equal(entity.localizacaoPadrao, "CD01-R01-M01-N01-P01");
    assert.equal(entity.loteControlado, true);
  });

  test("converte null para valores neutros (não undefined)", () => {
    const entity = productFromRow(baseProductRow);
    assert.equal(entity.codigoBarras !== undefined, true);
    assert.equal(entity.codigoBarras, "");
  });
});

describe("productToRowFields", () => {
  test("omite campos ausentes (update parcial)", () => {
    const fields = productToRowFields({ descricao: "Novo nome" });
    assert.equal(fields.name, "Novo nome");
    assert.equal("category" in fields, false);
  });

  test("mapeia status Ativo/Inativo para active/inactive", () => {
    const fields = productToRowFields({ status: "Inativo" });
    assert.equal(fields.status, "inactive");
  });
});

const baseCustomerRow: CustomerRow = {
  id: "33333333-3333-3333-3333-333333333333",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "CLI-0001",
  type: "company",
  name: "Cliente Teste",
  trade_name: null,
  document: "12.345.678/0001-90",
  state_registration: null,
  email: null,
  phone: null,
  mobile_phone: null,
  zip_code: null,
  state: null,
  city: null,
  neighborhood: null,
  address: null,
  address_number: null,
  address_complement: null,
  credit_limit: 1000,
  payment_terms: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

test("customerFromRow mapeia type company/individual para Pessoa Jurídica/Física", () => {
  assert.equal(customerFromRow(baseCustomerRow).tipo, "Pessoa Jurídica");
  assert.equal(customerFromRow({ ...baseCustomerRow, type: "individual" }).tipo, "Pessoa Física");
});

const baseDriverRow: DriverRow = {
  id: "44444444-4444-4444-4444-444444444444",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "MOT-0001",
  carrier_id: "55555555-5555-5555-5555-555555555555",
  name: "Motorista Teste",
  document: "123.456.789-00",
  rg: null,
  cnh_number: "12345678900",
  cnh_category: "B",
  cnh_expiration: "2027-01-01",
  phone: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

test("driverFromRow/driverToRowFields fazem round-trip do vínculo com a transportadora", () => {
  const entity = driverFromRow(baseDriverRow);
  assert.equal(entity.transportadoraId, "55555555-5555-5555-5555-555555555555");
  const fields = driverToRowFields({ transportadoraId: "66666666-6666-6666-6666-666666666666" });
  assert.equal(fields.carrier_id, "66666666-6666-6666-6666-666666666666");
});

test("productFromRow/productToRowFields fazem round-trip de category_id/brand_id (catálogo relacional)", () => {
  const withCatalog: ProductRow = {
    ...baseProductRow,
    category_id: "77777777-7777-7777-7777-777777777777",
    brand_id: "88888888-8888-8888-8888-888888888888",
  };
  const entity = productFromRow(withCatalog);
  assert.equal(entity.categoriaId, "77777777-7777-7777-7777-777777777777");
  assert.equal(entity.marcaId, "88888888-8888-8888-8888-888888888888");

  const fields = productToRowFields({ categoriaId: "99999999-9999-9999-9999-999999999999" });
  assert.equal(fields.category_id, "99999999-9999-9999-9999-999999999999");
  // Campo não enviado (undefined) não deve virar NULL — mesma regra do
  // nullableText já coberta acima para outros campos (bug real da Fase 2).
  assert.equal("brand_id" in fields, false);
});

const baseCategoryRow: ProductCategoryRow = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  company_id: "00000000-0000-0000-0000-000000000001",
  parent_id: null,
  code: "CAT_MATERIA_PRIMA",
  name: "Matéria-prima",
  path: "aaaaaaaa_aaaa_aaaa_aaaa_aaaaaaaaaaaa",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("categoryFromRow/categoryToRowFields", () => {
  test("mapeia parent_id null para categoriaPaiId vazio (categoria raiz)", () => {
    const entity = categoryFromRow(baseCategoryRow);
    assert.equal(entity.categoriaPaiId, "");
    assert.equal(entity.nome, "Matéria-prima");
  });

  test("mapeia parent_id preenchido (subcategoria)", () => {
    const entity = categoryFromRow({ ...baseCategoryRow, parent_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    assert.equal(entity.categoriaPaiId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  });

  test("categoryToRowFields mapeia nome/código/pai", () => {
    const fields = categoryToRowFields({ codigo: "CAT_NOVA", nome: "Nova categoria", categoriaPaiId: "" });
    assert.equal(fields.code, "CAT_NOVA");
    assert.equal(fields.name, "Nova categoria");
    assert.equal(fields.parent_id, null);
  });
});

const baseBrandRow: ProductBrandRow = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "MRC-0001",
  name: "Marca Teste",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("brandFromRow/brandToRowFields", () => {
  test("faz round-trip de código/nome/status", () => {
    const entity = brandFromRow(baseBrandRow);
    assert.equal(entity.codigo, "MRC-0001");
    assert.equal(entity.nome, "Marca Teste");
    assert.equal(entity.status, "Ativo");

    const fields = brandToRowFields({ nome: "Marca Atualizada", status: "Inativo" });
    assert.equal(fields.name, "Marca Atualizada");
    assert.equal(fields.status, "inactive");
  });
});

const baseProductSupplierRow: ProductSupplierRow = {
  id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  company_id: "00000000-0000-0000-0000-000000000001",
  product_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  supplier_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
  supplier_sku: "SUP-SKU-1",
  cost: 42.5,
  lead_time_days: 5,
  is_preferred: true,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("productSupplierFromRow/productSupplierToRowFields", () => {
  test("faz round-trip de custo/prazo/preferência", () => {
    const entity = productSupplierFromRow(baseProductSupplierRow);
    assert.equal(entity.produtoId, "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    assert.equal(entity.fornecedorId, "ffffffff-ffff-ffff-ffff-ffffffffffff");
    assert.equal(entity.custo, 42.5);
    assert.equal(entity.prazoEntregaDias, 5);
    assert.equal(entity.preferencial, true);

    const fields = productSupplierToRowFields({ custo: 10, preferencial: false });
    assert.equal(fields.cost, 10);
    assert.equal(fields.is_preferred, false);
  });
});

const baseProductPriceRow: ProductPriceRow = {
  id: "11111111-2222-3333-4444-555555555555",
  company_id: "00000000-0000-0000-0000-000000000001",
  product_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  price_type: "sale",
  amount: 199.9,
  currency: "BRL",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_to: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("productPriceFromRow/productPriceToRowFields", () => {
  test("mapeia valid_to null para vigenciaFim vazio", () => {
    const entity = productPriceFromRow(baseProductPriceRow);
    assert.equal(entity.tipoPreco, "sale");
    assert.equal(entity.valor, 199.9);
    assert.equal(entity.vigenciaFim, "");
  });

  test("omite valid_from quando vigenciaInicio não é enviado (deixa o default now() do banco decidir)", () => {
    const fields = productPriceToRowFields({ produtoId: "x", tipoPreco: "cost", valor: 5 });
    assert.equal("valid_from" in fields, false);
  });

  test("envia valid_from quando vigenciaInicio é informado", () => {
    const fields = productPriceToRowFields({ vigenciaInicio: "2026-06-01T00:00:00.000Z" });
    assert.equal(fields.valid_from, "2026-06-01T00:00:00.000Z");
  });
});

const baseProductUnitRow: ProductUnitRow = {
  id: "66666666-7777-8888-9999-000000000000",
  company_id: "00000000-0000-0000-0000-000000000001",
  product_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  unit_code: "CX",
  conversion_factor: 12,
  barcode: "7891234567890",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("productUnitFromRow/productUnitToRowFields", () => {
  test("faz round-trip do fator de conversão e código de barras da embalagem", () => {
    const entity = productUnitFromRow(baseProductUnitRow);
    assert.equal(entity.unidadeCodigo, "CX");
    assert.equal(entity.fatorConversao, 12);
    assert.equal(entity.codigoBarras, "7891234567890");

    const fields = productUnitToRowFields({ fatorConversao: 24 });
    assert.equal(fields.conversion_factor, 24);
  });
});
