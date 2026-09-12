// Testes de validação (Zod) das estruturas novas de Cadastros Mestres
// Avançados (src/lib/validations/master-data.ts, supabase/migrations/
// 0049-0051). units/product_categories/product_brands/unit_conversions/
// products já têm seus próprios testes de schema em
// tests/catalog.test.ts (entidades pré-existentes desde a Fase 2b, só
// evoluídas nesta fase) — não duplicados aqui.
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0049-0051, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_convert_unit_quantity: resolução determinística (produto
//     específico > global, direto > inverso), NUMERIC sem perda
//   - fn_guard_product_category_hierarchy: prevenção de ciclo profundo
//     (A->B->C->A), não só o caso trivial (parent_id = id)
//   - fn_assign_product_attribute: consistência do valor com
//     input_type (SELECT/TEXT/NUMBER/BOOLEAN), upsert (reatribuir
//     substitui)
//   - fn_assert_party_exists / trigger guard_party_reference: rejeitar
//     party_id inexistente ou de outra empresa
//   - fn_set_primary_party_address/fn_set_primary_party_contact:
//     atomicidade ao trocar o primário
//   - índice único parcial: nunca dois primários simultâneos por
//     parceiro
//   - unicidade de unit_conversions considerando product_id (grão
//     produto vs. global coexistindo sem colisão)
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id) em todas as tabelas novas
// Ver docs/MASTER_DATA.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  convertUnitQuantitySchema,
  productAttributeSchema,
  productAttributeValueSchema,
  assignProductAttributeSchema,
  partyAddressSchema,
  partyContactSchema,
} from "@/lib/validations/master-data";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("convertUnitQuantitySchema", () => {
  test("exige fromUnitId, toUnitId e quantity", () => {
    const result = convertUnitQuantitySchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita payload mínimo válido", () => {
    const result = convertUnitQuantitySchema.safeParse({ fromUnitId: uuid1, toUnitId: uuid2, quantity: 10 });
    assert.equal(result.success, true);
  });

  test("aceita productId opcional para conversão específica", () => {
    const result = convertUnitQuantitySchema.safeParse({ fromUnitId: uuid1, toUnitId: uuid2, quantity: 10, productId: uuid1 });
    assert.equal(result.success, true);
  });
});

describe("productAttributeSchema", () => {
  test("exige code, name e inputType", () => {
    const result = productAttributeSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita os quatro tipos de entrada", () => {
    for (const inputType of ["TEXT", "NUMBER", "BOOLEAN", "SELECT"] as const) {
      const result = productAttributeSchema.safeParse({ code: "COR", name: "Cor", inputType });
      assert.equal(result.success, true, `inputType ${inputType} deveria ser aceito`);
    }
  });

  test("rejeita inputType fora do vocabulário", () => {
    const result = productAttributeSchema.safeParse({ code: "COR", name: "Cor", inputType: "MULTISELECT" });
    assert.equal(result.success, false);
  });
});

describe("productAttributeValueSchema", () => {
  test("exige attributeId e value", () => {
    const result = productAttributeValueSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita valor mínimo válido", () => {
    const result = productAttributeValueSchema.safeParse({ attributeId: uuid1, value: "Azul" });
    assert.equal(result.success, true);
  });
});

describe("assignProductAttributeSchema", () => {
  test("exige productId e attributeId", () => {
    const result = assignProductAttributeSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita atribuição SELECT (valueId)", () => {
    const result = assignProductAttributeSchema.safeParse({ productId: uuid1, attributeId: uuid2, valueId: uuid1 });
    assert.equal(result.success, true);
  });

  test("aceita atribuição NUMBER (valueNumber)", () => {
    const result = assignProductAttributeSchema.safeParse({ productId: uuid1, attributeId: uuid2, valueNumber: 220 });
    assert.equal(result.success, true);
  });

  test("aceita atribuição BOOLEAN (valueBoolean)", () => {
    const result = assignProductAttributeSchema.safeParse({ productId: uuid1, attributeId: uuid2, valueBoolean: true });
    assert.equal(result.success, true);
  });
});

describe("partyAddressSchema", () => {
  test("exige partyType, partyId e addressType", () => {
    const result = partyAddressSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita os três tipos de parceiro", () => {
    for (const partyType of ["customer", "supplier", "carrier"] as const) {
      const result = partyAddressSchema.safeParse({ partyType, partyId: uuid1, addressType: "delivery" });
      assert.equal(result.success, true, `partyType ${partyType} deveria ser aceito`);
    }
  });

  test("aceita os seis tipos de endereço", () => {
    for (const addressType of ["billing", "delivery", "invoicing", "commercial", "correspondence", "main"] as const) {
      const result = partyAddressSchema.safeParse({ partyType: "customer", partyId: uuid1, addressType });
      assert.equal(result.success, true, `addressType ${addressType} deveria ser aceito`);
    }
  });

  test("rejeita partyType fora do vocabulário", () => {
    const result = partyAddressSchema.safeParse({ partyType: "employee", partyId: uuid1, addressType: "main" });
    assert.equal(result.success, false);
  });
});

describe("partyContactSchema", () => {
  test("exige partyType, partyId e name", () => {
    const result = partyContactSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita contato mínimo válido, contactType default commercial", () => {
    const result = partyContactSchema.safeParse({ partyType: "supplier", partyId: uuid1, name: "Maria Silva" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.contactType, "commercial");
  });

  test("rejeita e-mail inválido", () => {
    const result = partyContactSchema.safeParse({ partyType: "supplier", partyId: uuid1, name: "Maria Silva", email: "invalido" });
    assert.equal(result.success, false);
  });

  test("aceita e-mail vazio (opcional)", () => {
    const result = partyContactSchema.safeParse({ partyType: "supplier", partyId: uuid1, name: "Maria Silva", email: "" });
    assert.equal(result.success, true);
  });
});
