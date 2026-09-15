// Testes de validação (Zod) da infraestrutura de Importação/Exportação
// (src/lib/validations/import-export.ts, src/lib/import-export/registry.ts,
// supabase/migrations/0062, Fase 21).
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0062, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_stage_import_rows/fn_record_import_row_result: contadores sob
//     concorrência (FOR UPDATE em import_jobs)
//   - fn_complete_import_validation: READY vs FAILED conforme
//     quantidade de linhas válidas
//   - fn_reopen_import_job_for_reprocess: nunca reabre linhas PROCESSED
//   - RBAC via has_permission em cada fn_* (import_export.view/import/
//     export/cancel)
//   - RLS (isolamento por company_id; escrita exclusiva via função)
//   - persistImportRow (registry.ts): idempotência real contra o banco
//     (upsert por chave natural)
// Ver docs/IMPORT_EXPORT.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setImportMappingSchema, cancelImportJobSchema } from "@/lib/validations/import-export";
import { IMPORT_ENTITIES, isImportableEntity, validateImportRow } from "@/lib/import-export/registry";

describe("setImportMappingSchema", () => {
  test("rejeita mapeamento vazio", () => {
    assert.equal(setImportMappingSchema.safeParse({ mapping: {} }).success, false);
  });
  test("aceita mapeamento com ao menos uma coluna", () => {
    const result = setImportMappingSchema.safeParse({ mapping: { "Código": "codigo", "Nome": "nome" } });
    assert.equal(result.success, true);
  });
});

describe("cancelImportJobSchema", () => {
  test("aceita objeto vazio (reason é opcional)", () => {
    assert.equal(cancelImportJobSchema.safeParse({}).success, true);
  });
});

describe("isImportableEntity", () => {
  test("reconhece as 6 entidades registradas", () => {
    for (const key of Object.keys(IMPORT_ENTITIES)) {
      assert.equal(isImportableEntity(key), true, `${key} deveria ser importável`);
    }
  });
  test("rejeita entidades não registradas nesta fase (preparadas, não implementadas)", () => {
    for (const key of ["unit-conversions", "price-lists", "stock_initial", "purchase-orders", "unknown"]) {
      assert.equal(isImportableEntity(key), false, `${key} não deveria ser importável ainda`);
    }
  });
});

describe("validateImportRow", () => {
  test("product-categories: aceita linha só com nome", () => {
    const result = validateImportRow("product-categories", { nome: "Eletrônicos" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.naturalKey, "Eletrônicos");
  });

  test("product-categories: rejeita linha sem nome", () => {
    const result = validateImportRow("product-categories", { nome: "" });
    assert.equal(result.success, false);
  });

  test("units: exige codigo e nome", () => {
    assert.equal(validateImportRow("units", { codigo: "UN", nome: "Unidade" }).success, true);
    assert.equal(validateImportRow("units", { nome: "Unidade" }).success, false);
  });

  test("customers: exige tipo/nome/documento", () => {
    const result = validateImportRow("customers", { tipo: "Pessoa Jurídica", nome: "Cliente Um", documento: "12345678000190" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.naturalKey, "12345678000190");
  });

  test("customers: rejeita tipo fora do enum", () => {
    const result = validateImportRow("customers", { tipo: "Outro", nome: "Cliente Um", documento: "123" });
    assert.equal(result.success, false);
  });

  test("products: exige codigo/descricao/categoria/unidade", () => {
    const ok = validateImportRow("products", { codigo: "P1", descricao: "Produto 1", categoria: "Geral", unidade: "UN" });
    assert.equal(ok.success, true);
    const missing = validateImportRow("products", { codigo: "P1", descricao: "Produto 1" });
    assert.equal(missing.success, false);
  });

  test("erros trazem o campo e a mensagem para localizar a linha/coluna", () => {
    const result = validateImportRow("units", {});
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.every((e) => typeof e.message === "string" && e.message.length > 0));
    }
  });
});
