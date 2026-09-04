import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  productFromRow,
  productToRowFields,
  customerFromRow,
  driverFromRow,
  driverToRowFields,
} from "@/lib/database/mappers";
import type { ProductRow, CustomerRow, DriverRow } from "@/lib/database/schema";

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
