// Testes de validação (Zod) do domínio Fiscal/Núcleo Tributário
// (src/lib/validations/fiscal.ts). Cobrem a camada de forma/tipo — a
// primeira barreira antes de qualquer chamada RPC.
//
// IMPORTANTE — o que NÃO está coberto aqui (27 cenários pedidos na
// etapa, a maioria regra de negócio real vivendo em
// supabase/migrations/0036-0040, só verificável contra um Postgres
// real — nenhum Supabase real foi tocado, por instrução explícita):
//   - fn_set_product_fiscal_profile: versionamento (só 1 'active' por
//     produto, anterior vira 'obsolete' na mesma transação)
//   - fn_create_tax_rule/fn_add_tax_rule_item/fn_approve_tax_rule:
//     workflow draft->active, exigir >=1 item para ativar
//   - fn_resolve_applicable_tax_rules: resolução por prioridade quando
//     múltiplas regras casam com o mesmo contexto, vigência
//   - fn_create_fiscal_document: idempotência por origem (índice
//     único + checagem explícita) — uma mesma origem nunca gera dois
//     documentos ativos
//   - fn_add_fiscal_document_item: resolução de NCM/CFOP/origem a
//     partir de product_fiscal_profiles/natureza de operação quando
//     não informados explicitamente, snapshot em texto (nunca FK viva)
//   - fn_calculate_fiscal_document: cálculo de base/imposto por item,
//     delete+reinsert idempotente, consolidação dos totais do
//     cabeçalho, SNAPSHOT IMUTÁVEL (mudar uma tax_rule depois não
//     altera um documento já calculado — requisito crítico, seção 4)
//   - fn_authorize_fiscal_document/fn_reject_fiscal_document: guarda
//     de status (só a partir de CALCULATED)
//   - fn_cancel_fiscal_document: nunca apagar, bloquear cancelamento
//     duplicado
//   - fn_register_fiscal_document_event: bloquear tipos automáticos
//     (CREATED/CALCULATED/AUTHORIZED/REJECTED/CANCELLED) no logger manual
//   - fn_create_fiscal_document_from_purchase_receipt/sales_order:
//     exigir evento apropriado (recebimento confirmado / pedido
//     aprovado), população de itens a partir da origem
//   - Fiscal nunca tocar stock_movements/stock_balances diretamente
//   - Fiscal nunca criar accounts_payable/accounts_receivable
//     automaticamente
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id) em todas as 13 tabelas novas
//   - vocabulário ampliado de audit_logs.action (AUTHORIZE/EVENT)
//   - precisão monetária real (numeric no banco)
// Ver docs/FISCAL.md (aviso no topo, §17) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  fiscalEstablishmentSchema,
  fiscalNcmSchema,
  fiscalCfopSchema,
  fiscalOperationNatureSchema,
  fiscalCstCodeSchema,
  fiscalCsosnCodeSchema,
  setProductFiscalProfileSchema,
  createTaxRuleSchema,
  addTaxRuleItemSchema,
  createFiscalDocumentSchema,
  addFiscalDocumentItemSchema,
  authorizeFiscalDocumentSchema,
  rejectFiscalDocumentSchema,
  cancelFiscalDocumentSchema,
  registerFiscalDocumentEventSchema,
  createFiscalDocumentFromReceiptSchema,
  createFiscalDocumentFromSalesOrderSchema,
  addFiscalDocumentReferenceSchema,
  addFiscalDocumentPackageSchema,
  createFiscalDocumentReturnSchema,
} from "@/lib/validations/fiscal";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("fiscalEstablishmentSchema", () => {
  test("exige código, nome, CNPJ e regime tributário", () => {
    const result = fiscalEstablishmentSchema.safeParse({ code: "MATRIZ", name: "Matriz" });
    assert.equal(result.success, false);
  });

  test("aceita estabelecimento mínimo válido", () => {
    const result = fiscalEstablishmentSchema.safeParse({
      code: "MATRIZ", name: "Matriz", cnpj: "12.345.678/0001-99", taxRegime: "SIMPLES_NACIONAL",
    });
    assert.equal(result.success, true);
  });

  test("rejeita taxRegime fora do enum", () => {
    const result = fiscalEstablishmentSchema.safeParse({
      code: "X", name: "X", cnpj: "123", taxRegime: "LUCRO_ARBITRADO",
    });
    assert.equal(result.success, false);
  });
});

describe("fiscalNcmSchema", () => {
  test("exige código e descrição", () => {
    const result = fiscalNcmSchema.safeParse({ code: "8471.30.12" });
    assert.equal(result.success, false);
  });

  test("aceita NCM mínimo válido", () => {
    const result = fiscalNcmSchema.safeParse({ code: "8471.30.12", description: "Máquinas automáticas de processamento de dados" });
    assert.equal(result.success, true);
  });
});

describe("fiscalCfopSchema", () => {
  test("exige direction e scope", () => {
    const result = fiscalCfopSchema.safeParse({ code: "5.102", description: "Venda de mercadoria" });
    assert.equal(result.success, false);
  });

  test("aceita CFOP mínimo válido", () => {
    const result = fiscalCfopSchema.safeParse({
      code: "5.102", description: "Venda de mercadoria adquirida de terceiros", direction: "SAIDA", scope: "INTERNAL",
    });
    assert.equal(result.success, true);
  });

  test("rejeita scope fora do enum", () => {
    const result = fiscalCfopSchema.safeParse({
      code: "5.102", description: "X", direction: "SAIDA", scope: "NATIONAL",
    });
    assert.equal(result.success, false);
  });
});

describe("fiscalOperationNatureSchema", () => {
  test("aceita natureza mínima válida sem CFOP padrão", () => {
    const result = fiscalOperationNatureSchema.safeParse({ code: "VENDA", name: "Venda de mercadoria", direction: "SAIDA" });
    assert.equal(result.success, true);
  });

  test("defaultCfopId vazio é tratado como ausente", () => {
    const result = fiscalOperationNatureSchema.safeParse({ code: "VENDA", name: "Venda", direction: "SAIDA", defaultCfopId: "" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.defaultCfopId, undefined);
  });
});

describe("fiscalCstCodeSchema / fiscalCsosnCodeSchema", () => {
  test("CST exige taxType dentro do enum", () => {
    const result = fiscalCstCodeSchema.safeParse({ taxType: "ISS", code: "00", description: "Tributada integralmente" });
    assert.equal(result.success, false);
  });

  test("aceita CST válido", () => {
    const result = fiscalCstCodeSchema.safeParse({ taxType: "ICMS", code: "00", description: "Tributada integralmente" });
    assert.equal(result.success, true);
  });

  test("aceita CSOSN válido", () => {
    const result = fiscalCsosnCodeSchema.safeParse({ code: "101", description: "Tributada pelo Simples com permissão de crédito" });
    assert.equal(result.success, true);
  });
});

describe("setProductFiscalProfileSchema", () => {
  test("exige productId", () => {
    const result = setProductFiscalProfileSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita perfil mínimo válido, originCode default '0'", () => {
    const result = setProductFiscalProfileSchema.safeParse({ productId: uuid1 });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.originCode, "0");
  });

  test("rejeita originCode fora do intervalo 0-8", () => {
    const result = setProductFiscalProfileSchema.safeParse({ productId: uuid1, originCode: "9" });
    assert.equal(result.success, false);
  });

  test("aceita perfil completo", () => {
    const result = setProductFiscalProfileSchema.safeParse({
      productId: uuid1, ncmId: uuid2, originCode: "0",
      icmsCst: "00", pisCst: "01", cofinsCst: "01", ipiCst: "99",
      taxFramework: "Regime normal",
    });
    assert.equal(result.success, true);
  });
});

describe("createTaxRuleSchema", () => {
  test("exige name", () => {
    const result = createTaxRuleSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita regra mínima válida, priority default 0", () => {
    const result = createTaxRuleSchema.safeParse({ name: "ICMS padrão SP" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.priority, 0);
  });

  test("aceita regra com múltiplas dimensões de contexto", () => {
    const result = createTaxRuleSchema.safeParse({
      name: "ICMS interestadual", originUf: "SP", destinationUf: "RJ",
      taxRegime: "LUCRO_REAL", priority: 10,
    });
    assert.equal(result.success, true);
  });

  test("rejeita UF com tamanho diferente de 2", () => {
    const result = createTaxRuleSchema.safeParse({ name: "X", originUf: "SAO" });
    assert.equal(result.success, false);
  });
});

describe("addTaxRuleItemSchema", () => {
  test("exige taxType e rate", () => {
    const result = addTaxRuleItemSchema.safeParse({ taxType: "ICMS" });
    assert.equal(result.success, false);
  });

  test("aceita item mínimo válido, reductionPercentage default 0", () => {
    const result = addTaxRuleItemSchema.safeParse({ taxType: "ICMS", rate: 18 });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.reductionPercentage, 0);
  });

  test("rejeita rate negativa", () => {
    const result = addTaxRuleItemSchema.safeParse({ taxType: "ICMS", rate: -1 });
    assert.equal(result.success, false);
  });

  test("rejeita reductionPercentage acima de 100", () => {
    const result = addTaxRuleItemSchema.safeParse({ taxType: "ICMS", rate: 18, reductionPercentage: 150 });
    assert.equal(result.success, false);
  });
});

describe("createFiscalDocumentSchema", () => {
  const base = { fiscalEstablishmentId: uuid1, type: "NFE" as const, direction: "SAIDA" as const, operationNatureId: uuid2 };

  test("exige fiscalEstablishmentId/type/direction/operationNatureId", () => {
    const result = createFiscalDocumentSchema.safeParse({ type: "NFE", direction: "SAIDA" });
    assert.equal(result.success, false);
  });

  test("aceita documento mínimo válido", () => {
    const result = createFiscalDocumentSchema.safeParse(base);
    assert.equal(result.success, true);
  });

  test("rejeita type fora do enum", () => {
    const result = createFiscalDocumentSchema.safeParse({ ...base, type: "BOLETO" });
    assert.equal(result.success, false);
  });
});

describe("addFiscalDocumentItemSchema", () => {
  test("exige productId, quantity e unitPrice", () => {
    const result = addFiscalDocumentItemSchema.safeParse({ productId: uuid1 });
    assert.equal(result.success, false);
  });

  test("aceita item mínimo válido (NCM/CFOP resolvidos pelo backend)", () => {
    const result = addFiscalDocumentItemSchema.safeParse({ productId: uuid1, quantity: 10, unitPrice: 25.5 });
    assert.equal(result.success, true);
  });

  test("aceita item com NCM/CFOP explícitos", () => {
    const result = addFiscalDocumentItemSchema.safeParse({
      productId: uuid1, quantity: 1, unitPrice: 100, ncmCode: "8471.30.12", cfopCode: "5.102", originCode: "0",
    });
    assert.equal(result.success, true);
  });

  test("rejeita quantity zero ou negativa", () => {
    const result = addFiscalDocumentItemSchema.safeParse({ productId: uuid1, quantity: 0, unitPrice: 10 });
    assert.equal(result.success, false);
  });
});

describe("authorizeFiscalDocumentSchema / rejectFiscalDocumentSchema / cancelFiscalDocumentSchema", () => {
  test("autorização exige accessKey", () => {
    const result = authorizeFiscalDocumentSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("autorização aceita chave de acesso válida", () => {
    const result = authorizeFiscalDocumentSchema.safeParse({ accessKey: "3522...".padEnd(44, "0"), protocol: "123456789012345" });
    assert.equal(result.success, true);
  });

  test("rejeição aceita corpo vazio", () => {
    const result = rejectFiscalDocumentSchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("cancelamento aceita corpo vazio", () => {
    const result = cancelFiscalDocumentSchema.safeParse({});
    assert.equal(result.success, true);
  });
});

describe("registerFiscalDocumentEventSchema", () => {
  test("exige fiscalDocumentId e eventType", () => {
    const result = registerFiscalDocumentEventSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita os seis tipos de evento manual (Fase 9 adiciona INUTILIZATION/MANIFESTATION)", () => {
    for (const eventType of ["CONTINGENCY", "CORRECTION_LETTER", "OTHER", "DENIED", "INUTILIZATION", "MANIFESTATION"] as const) {
      const result = registerFiscalDocumentEventSchema.safeParse({ fiscalDocumentId: uuid1, eventType });
      assert.equal(result.success, true, `eventType ${eventType} deveria ser aceito`);
    }
  });

  test("rejeita tipo de evento automático (CREATED/READY) — bloqueio real fica na função RPC, mas o enum do schema já não inclui esses valores", () => {
    const created = registerFiscalDocumentEventSchema.safeParse({ fiscalDocumentId: uuid1, eventType: "CREATED" });
    const ready = registerFiscalDocumentEventSchema.safeParse({ fiscalDocumentId: uuid1, eventType: "READY" });
    assert.equal(created.success, false);
    assert.equal(ready.success, false);
  });
});

describe("createFiscalDocumentFromReceiptSchema / createFiscalDocumentFromSalesOrderSchema", () => {
  test("ambas exigem fiscalEstablishmentId e operationNatureId", () => {
    const receiptResult = createFiscalDocumentFromReceiptSchema.safeParse({});
    const orderResult = createFiscalDocumentFromSalesOrderSchema.safeParse({});
    assert.equal(receiptResult.success, false);
    assert.equal(orderResult.success, false);
  });

  test("aceitam payload mínimo válido", () => {
    const receiptResult = createFiscalDocumentFromReceiptSchema.safeParse({ fiscalEstablishmentId: uuid1, operationNatureId: uuid2 });
    const orderResult = createFiscalDocumentFromSalesOrderSchema.safeParse({ fiscalEstablishmentId: uuid1, operationNatureId: uuid2 });
    assert.equal(receiptResult.success, true);
    assert.equal(orderResult.success, true);
  });
});

// ============================================================ Fase 9 — Fiscal Operacional
describe("addFiscalDocumentReferenceSchema", () => {
  test("exige referencedDocumentId e referenceType", () => {
    const result = addFiscalDocumentReferenceSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita os seis tipos de referência", () => {
    for (const referenceType of ["RETURN", "COMPLEMENT", "REPLACEMENT", "EVENT_SOURCE", "TRANSFER_COUNTERPART", "OTHER"] as const) {
      const result = addFiscalDocumentReferenceSchema.safeParse({ referencedDocumentId: uuid1, referenceType });
      assert.equal(result.success, true, `referenceType ${referenceType} deveria ser aceito`);
    }
  });

  test("rejeita referenceType fora do enum", () => {
    const result = addFiscalDocumentReferenceSchema.safeParse({ referencedDocumentId: uuid1, referenceType: "CORRECTION" });
    assert.equal(result.success, false);
  });
});

describe("addFiscalDocumentPackageSchema", () => {
  test("exige packageNumber positivo", () => {
    const result = addFiscalDocumentPackageSchema.safeParse({ packageNumber: 0 });
    assert.equal(result.success, false);
  });

  test("aceita volume mínimo válido, quantity default 1", () => {
    const result = addFiscalDocumentPackageSchema.safeParse({ packageNumber: 1 });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.quantity, 1);
  });

  test("rejeita peso negativo", () => {
    const result = addFiscalDocumentPackageSchema.safeParse({ packageNumber: 1, grossWeight: -5 });
    assert.equal(result.success, false);
  });
});

describe("createFiscalDocumentReturnSchema", () => {
  test("exige fiscalEstablishmentId e operationNatureId", () => {
    const result = createFiscalDocumentReturnSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita payload mínimo válido", () => {
    const result = createFiscalDocumentReturnSchema.safeParse({ fiscalEstablishmentId: uuid1, operationNatureId: uuid2 });
    assert.equal(result.success, true);
  });
});
