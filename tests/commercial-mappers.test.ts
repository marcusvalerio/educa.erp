import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  salesRepresentativeFromRow,
  salesRepresentativeToRowFields,
  priceListFromRow,
  priceListItemFromRow,
  customerFromRow,
  customerToRowFields,
} from "@/lib/database/mappers";
import type { SalesRepresentativeRow, PriceListRow, PriceListItemRow, CustomerRow } from "@/lib/database/schema";

const baseSalesRepRow: SalesRepresentativeRow = {
  id: "11111111-1111-1111-1111-111111111111",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "VEN-0001",
  name: "João Vendas",
  document: null,
  email: null,
  phone: null,
  commission_percentage: 5,
  notes: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("salesRepresentativeFromRow / salesRepresentativeToRowFields", () => {
  test("mapeia comissão e status corretamente", () => {
    const entity = salesRepresentativeFromRow(baseSalesRepRow);
    assert.equal(entity.percentualComissao, 5);
    assert.equal(entity.status, "Ativo");
  });

  test("round-trip preserva o nome", () => {
    const entity = salesRepresentativeFromRow(baseSalesRepRow);
    const fields = salesRepresentativeToRowFields(entity);
    assert.equal(fields.name, "João Vendas");
  });
});

const basePriceListRow: PriceListRow = {
  id: "22222222-2222-2222-2222-222222222222",
  company_id: "00000000-0000-0000-0000-000000000001",
  code: "VAREJO",
  name: "Varejo",
  valid_from: "2026-01-01",
  valid_until: null,
  priority: 10,
  notes: null,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("priceListFromRow", () => {
  test("mapeia vigência e prioridade", () => {
    const entity = priceListFromRow(basePriceListRow);
    assert.equal(entity.vigenciaInicio, "2026-01-01");
    assert.equal(entity.vigenciaFim, "");
    assert.equal(entity.prioridade, 10);
  });
});

const basePriceListItemRow: PriceListItemRow = {
  id: "33333333-3333-3333-3333-333333333333",
  company_id: "00000000-0000-0000-0000-000000000001",
  price_list_id: "22222222-2222-2222-2222-222222222222",
  product_id: "44444444-4444-4444-4444-444444444444",
  unit_price: 90,
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("priceListItemFromRow", () => {
  test("mapeia preço do item", () => {
    const entity = priceListItemFromRow(basePriceListItemRow);
    assert.equal(entity.preco, 90);
    assert.equal(entity.tabelaPrecoId, "22222222-2222-2222-2222-222222222222");
  });
});

const baseCustomerRow: CustomerRow = {
  id: "55555555-5555-5555-5555-555555555555",
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
  default_sales_representative_id: "11111111-1111-1111-1111-111111111111",
  default_price_list_id: null,
  default_payment_terms_id: null,
  segment: "Atacado",
  commercial_status: "credit_hold",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("customerFromRow / customerToRowFields — extensão comercial", () => {
  test("mapeia statusComercial credit_hold -> Bloqueio de Crédito", () => {
    const entity = customerFromRow(baseCustomerRow);
    assert.equal(entity.statusComercial, "Bloqueio de Crédito");
    assert.equal(entity.segmento, "Atacado");
    assert.equal(entity.vendedorPadraoId, "11111111-1111-1111-1111-111111111111");
    assert.equal(entity.tabelaPrecoPadraoId, "");
  });

  test("round-trip preserva statusComercial e segmento", () => {
    const entity = customerFromRow(baseCustomerRow);
    const fields = customerToRowFields(entity);
    assert.equal(fields.commercial_status, "credit_hold");
    assert.equal(fields.segment, "Atacado");
  });
});
