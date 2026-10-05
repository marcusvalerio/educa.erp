// Regressão da rodada 2 do teste com 48 usuários em 7 empresas (parte sem
// banco). As regras do banco (migration 0081) estão em
// tests/rodada2-integridade-db.test.ts.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { humanizeErrorMessage, formatDbQuantity } from "@/lib/database/user-message";
import { receivableGenerationResult } from "@/lib/api/receivable-generation";

describe("rodada 2 — mensagens do banco para o usuário", () => {
  test("código de status vira o rótulo da tela (antes: 'status atual: picking')", () => {
    assert.equal(
      humanizeErrorMessage("Só é possível separar um pedido com reserva (status atual: picking)."),
      "Só é possível separar um pedido com reserva (situação atual: Em separação).",
    );
    assert.match(humanizeErrorMessage("Este pedido não tem reserva ativa para liberar (status atual: shipped)."), /situação atual: Expedido/);
    assert.match(humanizeErrorMessage("Pedido no status shipped não pode ser cancelado."), /na situação "Expedido"/);
  });

  test("R48-22: numeric(16,4) sem os zeros (antes: 'Reserva de 7.0000', 'saldo da parcela (670.0200)')", () => {
    assert.equal(humanizeErrorMessage("Reserva de 7.0000 excede o saldo disponível."), "Reserva de 7 excede o saldo disponível.");
    // R2-24: o valor da parcela agora sai em R$ (antes "(670,02)"); o objetivo do R48-22 — sem "670.0200" — continua.
    assert.equal(humanizeErrorMessage("Valor maior que o saldo da parcela (670.0200)."), "Valor maior que o saldo da parcela (R$ 670,02).");
    assert.equal(formatDbQuantity("1234.5000"), "1.234,5");
  });

  test("não estraga números que não são do banco (CNPJ, NCM, CFOP, códigos)", () => {
    const text = "CNPJ 25.386.045/0001-77, NCM 8471.30.12, CFOP 5.102, pedido PV-0436.";
    assert.equal(humanizeErrorMessage(text), text);
  });

  test("R48-17: sem UUID interno (antes: 'Item 77de70ac-…: quantidade a expedir (4.0000)')", () => {
    const out = humanizeErrorMessage("Item 77de70ac-1234-4abc-8def-0123456789ab: quantidade a expedir (4.0000) excede o saldo reservado disponível (0.0000).");
    assert.equal(out, "Um item do pedido: quantidade a expedir (4) excede o saldo reservado disponível (0).");
    assert.doesNotMatch(out, /[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  test("permissão por extenso, sem o código do catálogo", () => {
    assert.equal(
      humanizeErrorMessage("Permissão negada (sales_orders.reserve)."),
      "Você não tem permissão para esta ação (Pedidos de venda — Reservar).",
    );
    assert.equal(
      humanizeErrorMessage("Permissão negada (accounts_receivable.approve)."),
      "Você não tem permissão para esta ação (Contas a receber — Aprovar).",
    );
  });

  test("mensagem já boa passa intacta", () => {
    const ok = "O pedido PV-0805 já tem a separação SEP-0240 em aberto. Use essa separação (ou cancele-a antes de criar outra).";
    assert.equal(humanizeErrorMessage(ok), ok);
  });
});

describe("rodada 2 — R48-01: resposta da geração do título", () => {
  const row = { id: "a1", code: "CR-0236", status: "OPEN" };
  test("criado agora", () => {
    assert.deepEqual(receivableGenerationResult({ created: true, receivable: row, sales_order_code: "PV-1" }), { created: true, receivable: row, salesOrderCode: "PV-1" });
  });
  test("já existia (2ª chamada / 2ª pessoa)", () => {
    const r = receivableGenerationResult({ created: false, receivable: row });
    assert.equal(r.created, false);
    assert.equal(r.receivable?.code, "CR-0236");
  });
  test("formatos que a camada de RPC pode devolver", () => {
    assert.equal(receivableGenerationResult([{ created: true, receivable: row }]).receivable?.code, "CR-0236");
    assert.equal(receivableGenerationResult(JSON.stringify({ created: true, receivable: row })).created, true);
    assert.equal(receivableGenerationResult({ fn_generate_receivable_for_sales_order: { created: false, receivable: row } }).created, false);
  });
  test("resposta inválida não vira título fantasma", () => {
    assert.equal(receivableGenerationResult(null).receivable, null);
    assert.equal(receivableGenerationResult({ created: true }).receivable, null);
  });
});

describe("rodada 2 — índices únicos com mensagem própria", () => {
  test("número de documento de saída repetido (R2-08)", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    const e = translatePostgresError({ code: "23505", message: 'duplicate key value violates unique constraint "fiscal_documents_own_number_unique"', details: "Key (company_id, fiscal_establishment_id, COALESCE(model, '55'::text), COALESCE(series, '1'::text), number)=(…) already exists." });
    assert.equal(e.status, 409);
    assert.match(e.message, /número já foi usado/);
  });
  test("2º título ativo para o mesmo pedido (R48-01)", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    const e = translatePostgresError({ code: "23505", message: 'duplicate key value violates unique constraint "accounts_receivable_origin_active_unique"', details: "Key (company_id, origin_type, origin_id)=(…) already exists." });
    assert.match(e.message, /já tem conta a receber/);
  });
  test("2ª separação aberta para o mesmo pedido (R48-06)", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    const e = translatePostgresError({ code: "23505", message: 'duplicate key value violates unique constraint "pick_lists_open_per_order_unique"', details: "Key (company_id, sales_order_id)=(…) already exists." });
    assert.match(e.message, /separação em aberto/);
  });
  test("a NF-e duplicada da mesma origem continua com a mensagem de origem (R48-09)", async () => {
    const { translatePostgresError } = await import("@/lib/database/errors");
    const e = translatePostgresError({ code: "23505", message: 'duplicate key value violates unique constraint "fiscal_documents_source_unique"', details: "Key (company_id, source_type, source_id)=(…) already exists." });
    assert.match(e.message, /já foi gerado a partir desta origem/);
  });
});

describe("rodada 2 — fiscal simulado", () => {
  test("chave de acesso: DV módulo 11 e formatação", async () => {
    const { accessKeyCheckDigit, isValidAccessKey, formatAccessKey, isSimulatedProtocol } = await import("@/lib/fiscal/simulation");
    const base = "3126102297747700016455001000000000199762042";
    const key = base + String(accessKeyCheckDigit(base));
    assert.equal(isValidAccessKey(key), true);
    assert.equal(isValidAccessKey(base + String((accessKeyCheckDigit(base) + 1) % 10)), false);
    assert.equal(isValidAccessKey("123"), false);
    assert.equal(formatAccessKey(key).split(" ").length, 11);
    assert.equal(isSimulatedProtocol("SIMULACAO-261004151200001"), true);
    assert.equal(isSimulatedProtocol("135000000000001"), false);
  });
});

describe("rodada 2 — mensagens encontradas na reexecução da concorrência", () => {
  test("403 genérico da API sem o código da permissão", () => {
    assert.equal(
      humanizeErrorMessage("Você não tem permissão para esta operação (stock.adjust)."),
      "Você não tem permissão para esta operação (Estoque — Ajustar).",
    );
  });
  test("status sem assunto reconhecível não fica em inglês ('Paid')", () => {
    const out = humanizeErrorMessage("Parcela no status PAID não pode receber pagamentos.");
    assert.doesNotMatch(out, /Paid|PAID/);
    assert.match(out, /na situação "/);
  });
});

describe("rodada 2 — baixos da rodada 1", () => {
  test("R48-23: autor do convite do Owner legível na auditoria", async () => {
    const { auditActorLabel } = await import("@/lib/audit-labels");
    assert.equal(auditActorLabel("platform:OWNER:owner@atlaserp.test"), "Owner da plataforma (owner@atlaserp.test)");
    assert.equal(auditActorLabel("platform:system"), "Plataforma (rotina automática)");
    assert.equal(auditActorLabel("Wilson Uchoa"), "Wilson Uchoa");
    assert.equal(auditActorLabel(null), "—");
  });
  test("R48-31: menu da Logística em português", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../src/lib/nav.ts", import.meta.url), "utf8");
    assert.doesNotMatch(src, /label: "Picking"|label: "Packing"/);
    assert.match(src, /label: "Separação", href: "\/app\/logistica\/picking"/);
  });
});

describe("rodada 2 — R48-26: lista de usuários sem users.read", () => {
  test("o handler checa users.read antes de consultar (antes: 200 com o próprio registro)", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../src/lib/api/admin-handlers.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("export async function listAdminUsers"), src.indexOf("export async function", src.indexOf("export async function listAdminUsers") + 10));
    assert.match(body, /hasPermission\(companyId, "users\.read"\)\)\) throw forbiddenError\("users\.read"\)/);
    assert.ok(body.indexOf("users.read") < body.indexOf('.from("users")'), "a checagem vem antes da consulta");
  });
  test("o 403 chega ao usuário sem o código da permissão", () => {
    const out = humanizeErrorMessage("Você não tem permissão para esta operação (users.read).");
    assert.doesNotMatch(out, /users\.read/);
  });
});

describe("rodada 2 — R2-22: trilha de auditoria da empresa sem audit_logs.read", () => {
  test("o handler checa audit_logs.read antes de consultar (antes: 200 com lista vazia)", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../src/lib/api/admin-handlers.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("export async function listAdminAudit"), src.indexOf("export async function", src.indexOf("export async function listAdminAudit") + 10));
    assert.match(body, /hasPermission\(companyId, "audit_logs\.read"\)\)\) throw forbiddenError\("audit_logs\.read"\)/);
    assert.ok(body.indexOf("audit_logs.read") < body.indexOf('.from("audit_logs")'), "a checagem vem antes da consulta");
  });
});

describe("rodada 2 — R2-23: permissão por extenso também para códigos fora do padrão recurso.ação", () => {
  // Os 28 códigos do catálogo cujo prefixo difere do recurso (consulta no banco local).
  const codes = [
    "audit_logs.read", "brands.create", "categories.read", "controlling.budget.create", "controlling.budget.view",
    "controlling.forecast.view", "inventory.valuation.view", "roles.manage", "roles.read", "settings.company.update",
    "settings.company.view", "settings.establishment.update", "unit_conversions.create", "units.read", "controlling.period.manage",
  ];
  for (const code of codes) {
    test(code, () => {
      const out = humanizeErrorMessage(`Você não tem permissão para esta operação (${code}).`);
      assert.doesNotMatch(out, /[a-z]_[a-z]|\b(Audit|Brands|Categories|Controlling|Inventory|Roles|Settings|Units?|Company|Establishment|Budget|Forecast|Valuation|Period|Logs)\b/, out);
    });
  }
});

describe("rodada 2 — R2-24: valores em dinheiro das mensagens da parcela em R$", () => {
  test("recebimento maior que o saldo (mensagem real do r7)", () => {
    const out = humanizeErrorMessage("Recebimento (999999) excede o saldo da parcela (670.0200).");
    assert.match(out, /Recebimento \(R\$\s999\.999,00\) excede o saldo da parcela \(R\$\s670,02\)/);
  });
  test("pagamento e soma das parcelas", () => {
    assert.match(humanizeErrorMessage("Pagamento (1500.5) excede o saldo da parcela (100.0000)."), /\(R\$\s1\.500,50\).*\(R\$\s100,00\)/);
    assert.match(humanizeErrorMessage("A soma das parcelas (90) não corresponde ao valor atualizado do título (100)."), /parcelas \(R\$\s90,00\).*título \(R\$\s100,00\)/);
  });
});

describe("rodada 2 — R2-25: origem do documento simulado quando o usuário não vê o código", () => {
  test("Fiscal sem acesso a recebimentos: diz que há origem, sem inventar o código (antes: '—')", async () => {
    const { simulatedOriginLabel } = await import("@/lib/fiscal/simulated-document");
    assert.equal(simulatedOriginLabel("purchase_receipt", "REC-0007"), "Recebimento de compra REC-0007");
    assert.equal(simulatedOriginLabel("sales_order", "PV-0001"), "Pedido de venda PV-0001");
    assert.match(simulatedOriginLabel("purchase_receipt", null), /^Recebimento de compra \(código visível só para quem acessa Recebimentos\)$/);
    assert.equal(simulatedOriginLabel(null, null), "—");
  });
  test("a tela usa a função (não volta ao '—' fixo)", async () => {
    for (const page of ["[id]/documento-simulado/page.tsx", "[id]/page.tsx"]) {
      const src = (await import("node:fs")).readFileSync(new URL(`../src/app/app/(erp)/fiscal/notas-fiscais/${page}`, import.meta.url), "utf8");
      assert.match(src, /simulatedOriginLabel\(d\.sourceType, d\.sourceCode\)/, page);
    }
  });
});

describe("rodada 2 — R2-17: soma das parcelas ≠ total é validação (422), não conflito (409)", () => {
  test("o mapeamento do Financeiro trata a soma das parcelas antes do 409", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../src/lib/api/finance-handlers.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("function rpcError"), src.indexOf("type RouteContext"));
    assert.match(fn, /soma das parcelas"\)\) return new ApiError\("VALIDATION_ERROR", error\.message \?\? "", 422\)/);
    assert.ok(fn.indexOf("soma das parcelas") < fn.indexOf("INVALID_STATUS_TRANSITION"));
    assert.doesNotMatch(fn, /não corresponde/);
  });
});

describe("rodada 2 — R2-18: ação nova da trilha tem rótulo", () => {
  test("SUBMIT aparece como 'Envio para aprovação'", async () => {
    const src = (await import("node:fs")).readFileSync(new URL("../src/lib/status.ts", import.meta.url), "utf8");
    assert.match(src, /SUBMIT: S\("Envio para aprovação"/);
  });
});

describe("rodada 2 — R2-19: NF-e do pedido diz se criou ou se já existia", () => {
  const doc = { id: "d1", code: "DF-0159", status: "DRAFT" };
  test("criada agora / já existia / formatos da RPC / resposta inválida", async () => {
    const { fiscalGenerationResult } = await import("@/lib/api/fiscal-generation");
    assert.deepEqual(fiscalGenerationResult({ created: true, document: doc, sales_order_code: "PV-1" }), { created: true, document: doc, salesOrderCode: "PV-1" });
    assert.equal(fiscalGenerationResult({ created: false, document: doc }).created, false);
    assert.equal(fiscalGenerationResult([{ created: true, document: doc }]).document?.code, "DF-0159");
    assert.equal(fiscalGenerationResult({ fn_generate_fiscal_document_for_sales_order: { created: false, document: doc } }).created, false);
    assert.equal(fiscalGenerationResult(null).document, null);
    assert.equal(fiscalGenerationResult({ created: true }).document, null);
  });
});

describe("rodada 2 — R2-20: números da mensagem de saldo no mesmo formato", () => {
  test("disponível e solicitado com separador de milhar", () => {
    assert.equal(
      humanizeErrorMessage("Saldo insuficiente: disponível 2672.0000 em estoque, solicitado 99999."),
      "Saldo insuficiente: disponível 2.672 em estoque, solicitado 99.999.",
    );
    // não mexe em códigos/anos nem em números já formatados
    const keep = "Pedido PV-1234 de 2026, solicitado 12, disponível 1.500.";
    assert.equal(humanizeErrorMessage(keep), keep);
  });
});

describe("rodada 2 — R48-31 (resíduo): títulos das telas sem '(picking)'/'(packing)'", () => {
  test("Separação e Embalagem", async () => {
    const fs = await import("node:fs");
    for (const f of ["picking", "packing"]) {
      const page = fs.readFileSync(new URL(`../src/app/app/(erp)/logistica/${f}/page.tsx`, import.meta.url), "utf8");
      assert.doesNotMatch(page, /title="[^"]*\((picking|packing)\)"/);
    }
  });
});
