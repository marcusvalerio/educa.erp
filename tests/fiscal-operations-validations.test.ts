// Testes de validação (Zod) do Fiscal Operacional Avançado
// (src/lib/validations/fiscal-operations.ts, supabase/migrations/0063,
// Fase 22).
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0063, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_authorize_fiscal_document/fn_reject_fiscal_document: guard
//     ampliado para aceitar READY/AUTHORIZING sem quebrar o fluxo
//     antigo (só READY)
//   - fn_begin_fiscal_document_authorization: transição
//     READY/REJECTED -> AUTHORIZING, numeração de tentativa
//   - fn_process_fiscal_authorization_response: delega para
//     fn_authorize_fiscal_document/fn_reject_fiscal_document sem
//     duplicar a lógica de transição; nunca autoriza sem p_result
//     explícito (seção "não fingir autorização")
//   - fn_register_fiscal_document_event_idempotent: idempotência real
//     contra o banco (idempotency_key único por documento)
//   - fn_guard_fiscal_document_snapshot: imutabilidade também em
//     AUTHORIZING
//   - RBAC via has_permission em cada fn_* (fiscal_provider_configs.*,
//     fiscal_documents.submit_authorization, fiscal_document_files.*)
//   - RLS (isolamento por company_id; escrita exclusiva via função)
// Ver docs/FISCAL_OPERATIONS.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  configureFiscalProviderSchema,
  registerFiscalCertificateSchema,
  beginFiscalAuthorizationSchema,
  processFiscalAuthorizationResponseSchema,
  registerFiscalDocumentFileSchema,
  registerFiscalDocumentEventIdempotentSchema,
} from "@/lib/validations/fiscal-operations";

describe("configureFiscalProviderSchema", () => {
  test("aceita objeto vazio com defaults (NONE/HOMOLOGATION)", () => {
    const result = configureFiscalProviderSchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.providerCode, "NONE");
      assert.equal(result.data.environment, "HOMOLOGATION");
    }
  });
  test("rejeita environment fora do enum", () => {
    assert.equal(configureFiscalProviderSchema.safeParse({ environment: "STAGING" }).success, false);
  });
});

describe("registerFiscalCertificateSchema", () => {
  test("exige alias e certificateType", () => {
    assert.equal(registerFiscalCertificateSchema.safeParse({}).success, false);
    assert.equal(registerFiscalCertificateSchema.safeParse({ alias: "Cert 2026", certificateType: "A1" }).success, true);
  });
  test("rejeita certificateType fora de A1/A3", () => {
    assert.equal(registerFiscalCertificateSchema.safeParse({ alias: "x", certificateType: "A2" }).success, false);
  });
  test("nunca aceita um campo de senha/chave — o schema não define esses campos", () => {
    const shape = registerFiscalCertificateSchema.shape;
    assert.equal("password" in shape, false);
    assert.equal("privateKey" in shape, false);
    assert.equal("secret" in shape, false);
  });
});

describe("beginFiscalAuthorizationSchema", () => {
  test("aceita objeto vazio (providerCode default NONE)", () => {
    const result = beginFiscalAuthorizationSchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.providerCode, "NONE");
  });
});

describe("processFiscalAuthorizationResponseSchema", () => {
  test("exige accessKey quando result=AUTHORIZED", () => {
    assert.equal(processFiscalAuthorizationResponseSchema.safeParse({ result: "AUTHORIZED" }).success, false);
    assert.equal(processFiscalAuthorizationResponseSchema.safeParse({ result: "AUTHORIZED", accessKey: "chave-123" }).success, true);
  });
  test("REJECTED e ERROR não exigem accessKey", () => {
    assert.equal(processFiscalAuthorizationResponseSchema.safeParse({ result: "REJECTED", errorMessage: "Rejeitado pelo provedor." }).success, true);
    assert.equal(processFiscalAuthorizationResponseSchema.safeParse({ result: "ERROR" }).success, true);
  });
  test("rejeita result fora do enum", () => {
    assert.equal(processFiscalAuthorizationResponseSchema.safeParse({ result: "PENDING" }).success, false);
  });
});

describe("registerFiscalDocumentFileSchema", () => {
  test("exige fileType e storageReference", () => {
    assert.equal(registerFiscalDocumentFileSchema.safeParse({}).success, false);
    const result = registerFiscalDocumentFileSchema.safeParse({ fileType: "XML_AUTHORIZED", storageReference: "storage://fiscal/doc-1.xml" });
    assert.equal(result.success, true);
  });
  test("aceita os seis tipos de arquivo", () => {
    for (const fileType of ["XML_SENT", "XML_AUTHORIZED", "XML_CANCELLATION", "XML_CORRECTION_LETTER", "XML_EVENT", "OTHER"] as const) {
      const result = registerFiscalDocumentFileSchema.safeParse({ fileType, storageReference: "ref" });
      assert.equal(result.success, true, `fileType ${fileType} deveria ser aceito`);
    }
  });
});

describe("registerFiscalDocumentEventIdempotentSchema", () => {
  test("exige eventType e idempotencyKey", () => {
    assert.equal(registerFiscalDocumentEventIdempotentSchema.safeParse({}).success, false);
    const result = registerFiscalDocumentEventIdempotentSchema.safeParse({ eventType: "MANIFESTATION", idempotencyKey: "evt-123" });
    assert.equal(result.success, true);
  });
  test("rejeita eventType do ciclo automático (ex.: AUTHORIZED não é registrável manualmente)", () => {
    const result = registerFiscalDocumentEventIdempotentSchema.safeParse({ eventType: "AUTHORIZED", idempotencyKey: "evt-1" });
    assert.equal(result.success, false);
  });
});
