import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  warehouseFromRow,
  warehouseToRowFields,
  productLotFromRow,
  productLotToRowFields,
  warehouseLocationFromRow,
  warehouseLocationToRowFields,
} from "@/lib/database/mappers";
import type { WarehouseRow, ProductLotRow, WarehouseLocationRow } from "@/lib/database/schema";

const baseWarehouseRow: WarehouseRow = {
  id: "11111111-1111-1111-1111-111111111111",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "PRINCIPAL",
  name: "Depósito Principal",
  type: "standard",
  address: null,
  city: null,
  state: null,
  zip_code: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("warehouseFromRow", () => {
  test("mapeia type standard/virtual para Padrão/Virtual", () => {
    assert.equal(warehouseFromRow(baseWarehouseRow).tipo, "Padrão");
    assert.equal(warehouseFromRow({ ...baseWarehouseRow, type: "virtual" }).tipo, "Virtual");
  });

  test("mapeia status active/inactive para Ativo/Inativo", () => {
    assert.equal(warehouseFromRow(baseWarehouseRow).status, "Ativo");
    assert.equal(warehouseFromRow({ ...baseWarehouseRow, status: "inactive" }).status, "Inativo");
  });

  test("campos nulos viram string vazia", () => {
    const entity = warehouseFromRow(baseWarehouseRow);
    assert.equal(entity.endereco, "");
    assert.equal(entity.cidade, "");
  });
});

describe("warehouseToRowFields", () => {
  test("round-trip: fromRow(toRowFields(x)) preserva os campos enviados", () => {
    const entity = warehouseFromRow(baseWarehouseRow);
    const fields = warehouseToRowFields({ ...entity, nome: "Depósito Novo", tipo: "Virtual" });
    assert.equal(fields.name, "Depósito Novo");
    assert.equal(fields.type, "virtual");
  });

  test("string vazia vira null; campo omitido fica undefined (patch parcial)", () => {
    const fields = warehouseToRowFields({ endereco: "" });
    assert.equal(fields.address, null);
    assert.equal("city" in fields, false);
  });
});

const baseLotRow: ProductLotRow = {
  id: "33333333-3333-3333-3333-333333333333",
  company_id: "00000000-0000-0000-0000-000000000001",
  product_id: "11111111-1111-1111-1111-111111111111",
  lot_number: "L2026-001",
  manufactured_at: "2026-01-01",
  expires_at: "2026-12-31",
  supplier_id: null,
  notes: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("productLotFromRow / productLotToRowFields", () => {
  test("mapeia campos de data e nulos corretamente", () => {
    const entity = productLotFromRow(baseLotRow);
    assert.equal(entity.dataFabricacao, "2026-01-01");
    assert.equal(entity.dataValidade, "2026-12-31");
    assert.equal(entity.fornecedorId, "");
  });

  test("round-trip preserva número do lote e produto", () => {
    const entity = productLotFromRow(baseLotRow);
    const fields = productLotToRowFields(entity);
    assert.equal(fields.lot_number, "L2026-001");
    assert.equal(fields.product_id, baseLotRow.product_id);
  });
});

// ---------------------------------------------- Finalidade do local (0013)
const baseLocationRow: WarehouseLocationRow = {
  id: "44444444-4444-4444-4444-444444444444",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "CD01-R01-M01-N01-P01",
  name: "Rua 1",
  warehouse: "CD01",
  purpose: "STOCK",
  zone: null,
  aisle: "R01",
  rack: "M01",
  level: "N01",
  position: "P01",
  location_type: "Rua",
  capacity: 100,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("warehouseLocationFromRow / warehouseLocationToRowFields — finalidade", () => {
  test("mapeia cada purpose para o rótulo em português correspondente", () => {
    assert.equal(warehouseLocationFromRow(baseLocationRow).finalidade, "Estoque");
    assert.equal(warehouseLocationFromRow({ ...baseLocationRow, purpose: "OPERATIONAL_WAREHOUSE" }).finalidade, "Almoxarifado Operacional");
    assert.equal(warehouseLocationFromRow({ ...baseLocationRow, purpose: "PRODUCTION" }).finalidade, "Produção");
    assert.equal(warehouseLocationFromRow({ ...baseLocationRow, purpose: "QUARANTINE" }).finalidade, "Quarentena");
    assert.equal(warehouseLocationFromRow({ ...baseLocationRow, purpose: "TRANSIT" }).finalidade, "Trânsito");
  });

  test("round-trip: toRowFields(fromRow(x)) preserva purpose", () => {
    const entity = warehouseLocationFromRow({ ...baseLocationRow, purpose: "OPERATIONAL_WAREHOUSE" });
    const fields = warehouseLocationToRowFields(entity);
    assert.equal(fields.purpose, "OPERATIONAL_WAREHOUSE");
  });
});
