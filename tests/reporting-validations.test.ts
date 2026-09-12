// Testes de validação (Zod) do domínio de Relatórios / BI Operacional
// (supabase/migrations/0048). Todos os 8 dashboards compartilham o
// mesmo contrato de entrada — periodRangeQuerySchema
// (src/lib/validations/controlling.ts) — por isso este arquivo cobre
// especificamente esse contrato do ponto de vista dos endpoints de
// relatório, além de documentar o que fica fora do alcance.
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0048, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_report_executive: reaproveita fn_controlling_kpis (Fase 11)
//     corretamente, sem recalcular a mesma coisa duas vezes
//   - fn_report_commercial: ticket médio, conversão de orçamento
//     (aprovados / total no período) calculados corretamente
//   - fn_report_inventory: produtos sem giro (saldo positivo sem ISSUE
//     no período) — consulta correlacionada correta
//   - fn_report_purchases: valor comprado derivado de
//     purchase_receipt_items (quantidade aceita × preço do pedido),
//     nunca do purchase_order isolado
//   - fn_report_production: soma de material_cost/produced_quantity/
//     scrap corretas por período
//   - fn_report_logistics: lead time médio só considerando expedições
//     já expedidas (shipped_at não nulo) — nenhum SLA inventado
//   - fn_report_finance: reaproveita v_cash_flow_summary (Financeiro
//     0035) sem duplicar a consulta
//   - fn_report_fiscal: impostos destacados só de documentos AUTHORIZED
//   - RBAC via has_permission em cada fn_report_* (uma permissão
//     distinta por domínio, seção 12.19)
//   - isolamento por company_id (nenhuma leitura cross-empresa)
//   - dashboards com dado vazio retornando 0/null, nunca erro nem
//     número fabricado
// Ver docs/REPORTING.md (aviso no topo, §13) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { periodRangeQuerySchema } from "@/lib/validations/controlling";

describe("periodRangeQuerySchema (contrato compartilhado pelos 8 dashboards de relatório)", () => {
  test("rejeita ausência de periodStart", () => {
    const result = periodRangeQuerySchema.safeParse({ periodEnd: "2026-01-31" });
    assert.equal(result.success, false);
  });

  test("rejeita ausência de periodEnd", () => {
    const result = periodRangeQuerySchema.safeParse({ periodStart: "2026-01-01" });
    assert.equal(result.success, false);
  });

  test("rejeita string vazia em qualquer um dos dois campos", () => {
    const start = periodRangeQuerySchema.safeParse({ periodStart: "", periodEnd: "2026-01-31" });
    const end = periodRangeQuerySchema.safeParse({ periodStart: "2026-01-01", periodEnd: "" });
    assert.equal(start.success, false);
    assert.equal(end.success, false);
  });

  test("aceita um período válido de um dia", () => {
    const result = periodRangeQuerySchema.safeParse({ periodStart: "2026-01-01", periodEnd: "2026-01-01" });
    assert.equal(result.success, true);
  });

  test("aceita um período de um ano inteiro", () => {
    const result = periodRangeQuerySchema.safeParse({ periodStart: "2026-01-01", periodEnd: "2026-12-31" });
    assert.equal(result.success, true);
  });
});
