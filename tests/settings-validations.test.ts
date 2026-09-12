// Testes de validação (Zod) de Configuração e Parametrização do ERP
// (src/lib/validations/settings.ts, supabase/migrations/0052-0053).
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0052-0053, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_resolve_setting: precedência determinística ESTABLISHMENT >
//     COMPANY > GLOBAL — sem configuração específica usa default; com
//     company, company vence default; com establishment, establishment
//     vence company (seção 14.7/14.18)
//   - fn_upsert_setting: permissão certa por nível (settings.create
//     para GLOBAL novo, settings.update para GLOBAL existente,
//     settings.company.update, settings.establishment.update),
//     idempotência do upsert, CHECK de exatamente um campo de valor
//     preenchido correspondente a value_type
//   - fn_create_document_sequence/fn_next_document_number: numeração
//     concorrente-segura (FOR UPDATE, nunca MAX+1) — seção 14.27:
//     chamadas concorrentes devolvem 1,2,3,4, nunca 1,1,2,3
//   - fn_assign_fiscal_document_number: integração aditiva, nunca
//     altera fn_create_fiscal_document (0039)
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id; linhas GLOBAIS visíveis a
//     qualquer authenticated, por design)
//   - nenhum segredo armazenável (value_type não inclui SECRET/TOKEN)
// Ver docs/SETTINGS.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSettingQuerySchema,
  upsertSettingSchema,
  createDocumentSequenceSchema,
  updateDocumentSequenceSchema,
  nextDocumentNumberSchema,
  assignFiscalDocumentNumberSchema,
} from "@/lib/validations/settings";

const uuid1 = "11111111-1111-4111-8111-111111111111";

describe("resolveSettingQuerySchema", () => {
  test("exige module e key", () => {
    const result = resolveSettingQuerySchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita módulo/chave sem establishmentId (nível não obrigatório)", () => {
    const result = resolveSettingQuerySchema.safeParse({ module: "inventory", key: "default_cost_method" });
    assert.equal(result.success, true);
  });
});

describe("upsertSettingSchema", () => {
  test("exige module, key e valueType", () => {
    const result = upsertSettingSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("rejeita valueType STRING sem valueString", () => {
    const result = upsertSettingSchema.safeParse({ module: "sales", key: "default_payment_term", valueType: "STRING" });
    assert.equal(result.success, false);
  });

  test("aceita STRING com valueString", () => {
    const result = upsertSettingSchema.safeParse({ module: "sales", key: "default_payment_term", valueType: "STRING", valueString: "30/60/90" });
    assert.equal(result.success, true);
  });

  test("aceita BOOLEAN com valueBoolean (inclusive false)", () => {
    const result = upsertSettingSchema.safeParse({ module: "purchasing", key: "approval_required", valueType: "BOOLEAN", valueBoolean: false });
    assert.equal(result.success, true);
  });

  test("rejeita DECIMAL sem valueDecimal", () => {
    const result = upsertSettingSchema.safeParse({ module: "sales", key: "max_discount_pct", valueType: "DECIMAL" });
    assert.equal(result.success, false);
  });

  test("aceita JSON com valueJson", () => {
    const result = upsertSettingSchema.safeParse({ module: "logistics", key: "packing_rules", valueType: "JSON", valueJson: { maxWeight: 30 } });
    assert.equal(result.success, true);
  });
});

describe("createDocumentSequenceSchema", () => {
  test("exige documentType", () => {
    const result = createDocumentSequenceSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita payload mínimo com defaults (seriesCode='1', padding=6)", () => {
    const result = createDocumentSequenceSchema.safeParse({ documentType: "FISCAL_DOCUMENT" });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.seriesCode, "1");
      assert.equal(result.data.padding, 6);
    }
  });

  test("rejeita documentType fora do vocabulário", () => {
    const result = createDocumentSequenceSchema.safeParse({ documentType: "INVOICE" });
    assert.equal(result.success, false);
  });

  test("rejeita padding fora do intervalo 1-12", () => {
    const result = createDocumentSequenceSchema.safeParse({ documentType: "SALES_ORDER", padding: 20 });
    assert.equal(result.success, false);
  });
});

describe("updateDocumentSequenceSchema", () => {
  test("aceita corpo vazio (todos os campos opcionais)", () => {
    const result = updateDocumentSequenceSchema.safeParse({});
    assert.equal(result.success, true);
  });
});

describe("nextDocumentNumberSchema", () => {
  test("exige documentType, aceita establishmentId opcional", () => {
    const withEstablishment = nextDocumentNumberSchema.safeParse({ documentType: "TRANSFER", establishmentId: uuid1 });
    const withoutEstablishment = nextDocumentNumberSchema.safeParse({ documentType: "TRANSFER" });
    assert.equal(withEstablishment.success, true);
    assert.equal(withoutEstablishment.success, true);
  });
});

describe("assignFiscalDocumentNumberSchema", () => {
  test("aceita corpo vazio, seriesCode default '1'", () => {
    const result = assignFiscalDocumentNumberSchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.seriesCode, "1");
  });
});
