// Testes de validação (Zod) do domínio de Controladoria Gerencial
// (src/lib/validations/controlling.ts). Cobrem a camada de forma/tipo
// — a primeira barreira antes de qualquer chamada RPC.
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0045-0047, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_open_competence_period/fn_close_competence_period/
//     fn_reopen_competence_period: workflow OPEN->CLOSING->CLOSED,
//     REOPENED exigindo justificativa, idempotência por guarda de status
//   - fn_assert_competence_period_open: bloqueio de alteração gerencial
//     retroativa em período CLOSED
//   - fn_create_cost_allocation: soma de percentuais fechando em
//     EXATAMENTE 100, soma de valores fechando em EXATAMENTE
//     total_amount (último item absorvendo arredondamento), nunca
//     altera accounts_payable/financial_transactions original
//   - fn_cancel_cost_allocation: nunca apaga, nunca cancela duas vezes
//   - fn_create_budget/fn_approve_budget/fn_close_budget: workflow
//     draft->approved->closed
//   - fn_get_budget_vs_actual: agregação correta de realizado por
//     categoria/centro de custo dentro do período do orçamento
//   - fn_get_dre_gerencial: CMV vindo de cost_movements (Fase 10, nunca
//     recalculado), receita de accounts_receivable (nunca sales_orders
//     diretamente), consolidação correta das linhas da DRE
//   - fn_controlling_kpis/fn_result_by_cost_center/
//     fn_industrial_cost_summary/fn_controlling_forecast/
//     fn_margin_by_product/fn_margin_by_customer/fn_margin_by_order:
//     agregações corretas por período
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id) em todas as 5 tabelas novas
//   - auditoria de fechamento/reabertura/rateio/aprovação de orçamento
//   - precisão monetária real (numeric no banco)
// Ver docs/CONTROLLING.md (aviso no topo, §15) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  periodRangeQuerySchema,
  openCompetencePeriodSchema,
  reopenCompetencePeriodSchema,
  createCostAllocationSchema,
  cancelCostAllocationSchema,
  createBudgetSchema,
} from "@/lib/validations/controlling";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("periodRangeQuerySchema", () => {
  test("exige periodStart e periodEnd", () => {
    const result = periodRangeQuerySchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita datas válidas", () => {
    const result = periodRangeQuerySchema.safeParse({ periodStart: "2026-01-01", periodEnd: "2026-01-31" });
    assert.equal(result.success, true);
  });
});

describe("openCompetencePeriodSchema", () => {
  test("exige code, periodStart e periodEnd", () => {
    const result = openCompetencePeriodSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita período mínimo válido", () => {
    const result = openCompetencePeriodSchema.safeParse({ code: "2026-01", periodStart: "2026-01-01", periodEnd: "2026-01-31" });
    assert.equal(result.success, true);
  });
});

describe("reopenCompetencePeriodSchema", () => {
  test("exige justificativa não vazia", () => {
    const result = reopenCompetencePeriodSchema.safeParse({ reason: "" });
    assert.equal(result.success, false);
  });

  test("aceita justificativa válida", () => {
    const result = reopenCompetencePeriodSchema.safeParse({ reason: "Ajuste de rateio identificado após o fechamento." });
    assert.equal(result.success, true);
  });
});

describe("createCostAllocationSchema", () => {
  test("exige totalAmount, criterion e ao menos um item", () => {
    const result = createCostAllocationSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("rejeita totalAmount não positivo", () => {
    const result = createCostAllocationSchema.safeParse({
      totalAmount: 0, criterion: "PERCENTAGE", items: [{ costCenterId: uuid1, percentage: 100 }],
    });
    assert.equal(result.success, false);
  });

  test("aceita rateio PERCENTAGE com múltiplos itens", () => {
    const result = createCostAllocationSchema.safeParse({
      totalAmount: 10000,
      criterion: "PERCENTAGE",
      items: [
        { costCenterId: uuid1, percentage: 50 },
        { costCenterId: uuid2, percentage: 50 },
      ],
    });
    assert.equal(result.success, true);
  });

  test("aceita rateio FIXED_VALUE com amount por item", () => {
    const result = createCostAllocationSchema.safeParse({
      totalAmount: 10000,
      criterion: "FIXED_VALUE",
      items: [
        { costCenterId: uuid1, amount: 7000 },
        { costCenterId: uuid2, amount: 3000 },
      ],
    });
    assert.equal(result.success, true);
  });

  test("rejeita criterion fora do vocabulário", () => {
    const result = createCostAllocationSchema.safeParse({
      totalAmount: 100, criterion: "MAGIC", items: [{ costCenterId: uuid1, percentage: 100 }],
    });
    assert.equal(result.success, false);
  });

  test("rejeita percentual fora de 0-100", () => {
    const result = createCostAllocationSchema.safeParse({
      totalAmount: 100, criterion: "PERCENTAGE", items: [{ costCenterId: uuid1, percentage: 150 }],
    });
    assert.equal(result.success, false);
  });
});

describe("cancelCostAllocationSchema", () => {
  test("aceita corpo vazio (reason opcional)", () => {
    const result = cancelCostAllocationSchema.safeParse({});
    assert.equal(result.success, true);
  });
});

describe("createBudgetSchema", () => {
  test("exige name, período e ao menos um item", () => {
    const result = createBudgetSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita orçamento mínimo válido", () => {
    const result = createBudgetSchema.safeParse({
      name: "Orçamento 2026",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      items: [{ plannedAmount: 5000 }],
    });
    assert.equal(result.success, true);
  });

  test("rejeita plannedAmount negativo", () => {
    const result = createBudgetSchema.safeParse({
      name: "Orçamento 2026",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      items: [{ plannedAmount: -100 }],
    });
    assert.equal(result.success, false);
  });
});
