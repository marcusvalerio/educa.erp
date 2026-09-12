// Testes de validação (Zod) do domínio Financeiro
// (src/lib/validations/finance.ts). Cobrem a camada de forma/tipo — a
// primeira barreira antes de qualquer chamada RPC.
//
// IMPORTANTE — o que NÃO está coberto aqui (30 cenários pedidos na
// etapa, a maioria regra de negócio real vivendo em
// supabase/migrations/0031-0035, só verificável contra um Postgres
// real — nenhum Supabase real foi tocado, por instrução explícita):
//   - fn_create_accounts_payable/fn_create_accounts_receivable:
//     validação de soma das parcelas fechando exatamente em
//     updated_amount (original - desconto + juros + multa)
//   - fn_generate_accounts_payable_from_purchase_receipt: cálculo do
//     valor a partir de accepted_quantity × unit_price, idempotência
//     (no máximo um título por recebimento), exigir recebimento
//     confirmado, parcelamento via payment_term_installments
//   - fn_generate_accounts_receivable_from_sales_order: fallback para
//     sales_orders.payment_terms_id, exigir pedido aprovado
//   - fn_pay_installment/fn_receive_installment: bloqueio de
//     pagamento/recebimento acima do saldo da parcela, concorrência
//     sob FOR UPDATE (dois pagamentos de 700 contra saldo de 1000),
//     recálculo de status do título (OPEN -> PARTIALLY_PAID -> PAID)
//   - fn_reverse_payment/fn_reverse_receipt: lançamento inverso sem
//     apagar o original, reversão do paid_amount/received_amount,
//     idempotência e bloqueio de estorno duplicado
//   - fn_cancel_accounts_payable/fn_cancel_accounts_receivable:
//     preservação de parcelas já pagas, bloqueio de novo
//     pagamento/recebimento após cancelamento
//   - fn_refresh_overdue_payables/fn_refresh_overdue_receivables:
//     transição OPEN/PARTIALLY_PAID -> OVERDUE só por vencimento
//   - fn_post_financial_transaction: saldo de financial_accounts
//     sempre sincronizado com o ledger, idempotency_key, corrida de
//     unique_violation
//   - fn_create_bank_reconciliation: auto-população de itens a partir
//     de financial_transactions do período
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id) em todas as 12 tabelas novas
//   - vocabulário ampliado de audit_logs.action (PAY/REVERSE/RECONCILE)
//   - precisão monetária real (numeric(16,4) no banco — os testes
//     abaixo só confirmam que o Zod aceita/coage números, não a
//     aritmética de ponto fixo do Postgres)
// Ver docs/FINANCE.md (aviso no topo, §14) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  financialCategorySchema,
  costCenterSchema,
  createFinancialAccountSchema,
  updateFinancialAccountSchema,
  createAccountsPayableSchema,
  generateAccountsPayableFromReceiptSchema,
  updateAccountsPayableSchema,
  cancelAccountsPayableSchema,
  createAccountsReceivableSchema,
  generateAccountsReceivableFromSalesOrderSchema,
  payInstallmentSchema,
  receiveInstallmentSchema,
  reversePaymentSchema,
  reverseReceiptSchema,
  createManualFinancialTransactionSchema,
  createBankReconciliationSchema,
  setReconciliationItemStatusSchema,
} from "@/lib/validations/finance";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";
const uuid3 = "33333333-3333-4333-8333-333333333333";

describe("financialCategorySchema", () => {
  test("exige código, nome e type", () => {
    const result = financialCategorySchema.safeParse({ code: "VENDAS", name: "Vendas" });
    assert.equal(result.success, false);
  });

  test("aceita categoria INCOME mínima válida", () => {
    const result = financialCategorySchema.safeParse({ code: "VENDAS", name: "Vendas", type: "INCOME" });
    assert.equal(result.success, true);
  });

  test("rejeita type fora do enum", () => {
    const result = financialCategorySchema.safeParse({ code: "X", name: "X", type: "NEUTRAL" });
    assert.equal(result.success, false);
  });

  test("parentId vazio é tratado como ausente", () => {
    const result = financialCategorySchema.safeParse({ code: "FRETES", name: "Fretes", type: "EXPENSE", parentId: "" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.parentId, undefined);
  });
});

describe("costCenterSchema", () => {
  test("exige código e nome", () => {
    const result = costCenterSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita centro de custo mínimo válido", () => {
    const result = costCenterSchema.safeParse({ code: "COML", name: "Comercial" });
    assert.equal(result.success, true);
  });
});

describe("createFinancialAccountSchema", () => {
  test("exige código, nome e type", () => {
    const result = createFinancialAccountSchema.safeParse({ code: "CX-01" });
    assert.equal(result.success, false);
  });

  test("aceita conta mínima válida, defaults openingBalance=0 e currencyCode=BRL", () => {
    const result = createFinancialAccountSchema.safeParse({ code: "CX-01", name: "Caixa", type: "CASH" });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.openingBalance, 0);
      assert.equal(result.data.currencyCode, "BRL");
    }
  });

  test("rejeita type fora do enum", () => {
    const result = createFinancialAccountSchema.safeParse({ code: "X", name: "X", type: "CRYPTO" });
    assert.equal(result.success, false);
  });

  test("aceita conta bancária completa", () => {
    const result = createFinancialAccountSchema.safeParse({
      code: "BCO-01", name: "Banco Principal", type: "BANK",
      bankName: "Banco X", bankAgency: "0001", bankAccountMasked: "****1234", openingBalance: 5000,
    });
    assert.equal(result.success, true);
  });
});

describe("updateFinancialAccountSchema", () => {
  test("aceita atualização de campos não-financeiros", () => {
    const result = updateFinancialAccountSchema.safeParse({ name: "Caixa Central", status: "inactive" });
    assert.equal(result.success, true);
  });

  test("descarta opening_balance/current_balance mesmo se presentes no payload", () => {
    const result = updateFinancialAccountSchema.safeParse({ name: "Caixa", openingBalance: 999, currentBalance: 999 } as Record<string, unknown>);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal((result.data as Record<string, unknown>).openingBalance, undefined);
      assert.equal((result.data as Record<string, unknown>).currentBalance, undefined);
    }
  });
});

describe("createAccountsPayableSchema", () => {
  const base = {
    supplierId: uuid1,
    description: "Compra de insumos",
    originalAmount: 1000,
    installments: [{ dueDate: "2026-01-10", amount: 1000 }],
  };

  test("exige ao menos uma parcela", () => {
    const result = createAccountsPayableSchema.safeParse({ ...base, installments: [] });
    assert.equal(result.success, false);
  });

  test("aceita título mínimo válido com 1 parcela", () => {
    const result = createAccountsPayableSchema.safeParse(base);
    assert.equal(result.success, true);
  });

  test("aceita múltiplas parcelas", () => {
    const result = createAccountsPayableSchema.safeParse({
      ...base,
      installments: [{ dueDate: "2026-01-10", amount: 500 }, { dueDate: "2026-02-10", amount: 500 }],
    });
    assert.equal(result.success, true);
  });

  test("rejeita originalAmount zero ou negativo", () => {
    const result = createAccountsPayableSchema.safeParse({ ...base, originalAmount: 0 });
    assert.equal(result.success, false);
  });

  test("rejeita parcela com amount zero", () => {
    const result = createAccountsPayableSchema.safeParse({ ...base, installments: [{ dueDate: "2026-01-10", amount: 0 }] });
    assert.equal(result.success, false);
  });

  test("aceita desconto/juros/multa opcionais", () => {
    const result = createAccountsPayableSchema.safeParse({ ...base, discount: 50, interest: 10, penalty: 5 });
    assert.equal(result.success, true);
  });

  test("aceita categoria e centro de custo opcionais", () => {
    const result = createAccountsPayableSchema.safeParse({ ...base, categoryId: uuid2, costCenterId: uuid3 });
    assert.equal(result.success, true);
  });
});

describe("generateAccountsPayableFromReceiptSchema", () => {
  test("aceita corpo vazio (gera à vista, sem condição)", () => {
    const result = generateAccountsPayableFromReceiptSchema.safeParse({});
    assert.equal(result.success, true);
  });

  test("aceita condição de pagamento explícita", () => {
    const result = generateAccountsPayableFromReceiptSchema.safeParse({ paymentTermsId: uuid2, dueDateBase: "2026-01-01" });
    assert.equal(result.success, true);
  });
});

describe("updateAccountsPayableSchema / cancelAccountsPayableSchema", () => {
  test("aceita atualização parcial", () => {
    const result = updateAccountsPayableSchema.safeParse({ notes: "Renegociado com fornecedor" });
    assert.equal(result.success, true);
  });

  test("cancelamento aceita corpo vazio", () => {
    const result = cancelAccountsPayableSchema.safeParse({});
    assert.equal(result.success, true);
  });
});

describe("createAccountsReceivableSchema", () => {
  test("exige customerId", () => {
    const result = createAccountsReceivableSchema.safeParse({
      description: "Venda", originalAmount: 100, installments: [{ dueDate: "2026-01-01", amount: 100 }],
    });
    assert.equal(result.success, false);
  });

  test("aceita título com parcelamento 30/60/90", () => {
    const result = createAccountsReceivableSchema.safeParse({
      customerId: uuid1,
      description: "Venda a prazo",
      originalAmount: 9000,
      installments: [
        { dueDate: "2026-02-01", amount: 3000 },
        { dueDate: "2026-03-01", amount: 3000 },
        { dueDate: "2026-04-01", amount: 3000 },
      ],
    });
    assert.equal(result.success, true);
  });
});

describe("generateAccountsReceivableFromSalesOrderSchema", () => {
  test("aceita corpo vazio (usa payment_terms do pedido)", () => {
    const result = generateAccountsReceivableFromSalesOrderSchema.safeParse({});
    assert.equal(result.success, true);
  });
});

describe("payInstallmentSchema", () => {
  test("exige financialAccountId, amount e method", () => {
    const result = payInstallmentSchema.safeParse({ amount: 100 });
    assert.equal(result.success, false);
  });

  test("aceita pagamento mínimo válido", () => {
    const result = payInstallmentSchema.safeParse({ financialAccountId: uuid1, amount: 400, method: "PIX" });
    assert.equal(result.success, true);
  });

  test("rejeita method fora do enum", () => {
    const result = payInstallmentSchema.safeParse({ financialAccountId: uuid1, amount: 100, method: "CRYPTO" });
    assert.equal(result.success, false);
  });

  test("rejeita amount zero ou negativo", () => {
    const result = payInstallmentSchema.safeParse({ financialAccountId: uuid1, amount: 0, method: "CASH" });
    assert.equal(result.success, false);
  });

  test("aceita idempotencyKey e referência do comprovante", () => {
    const result = payInstallmentSchema.safeParse({
      financialAccountId: uuid1, amount: 100, method: "BOLETO", reference: "comprovante-001.pdf", idempotencyKey: "pay-attempt-1",
    });
    assert.equal(result.success, true);
  });
});

describe("receiveInstallmentSchema", () => {
  test("aceita recebimento mínimo válido", () => {
    const result = receiveInstallmentSchema.safeParse({ financialAccountId: uuid1, amount: 3000, method: "BANK_TRANSFER" });
    assert.equal(result.success, true);
  });
});

describe("reversePaymentSchema / reverseReceiptSchema", () => {
  test("aceita corpo vazio", () => {
    const resultPayment = reversePaymentSchema.safeParse({});
    const resultReceipt = reverseReceiptSchema.safeParse({});
    assert.equal(resultPayment.success, true);
    assert.equal(resultReceipt.success, true);
  });

  test("aceita motivo e idempotencyKey", () => {
    const result = reversePaymentSchema.safeParse({ reason: "Pagamento duplicado por erro", idempotencyKey: "reverse-1" });
    assert.equal(result.success, true);
  });
});

describe("createManualFinancialTransactionSchema", () => {
  test("exige financialAccountId, type e amount", () => {
    const result = createManualFinancialTransactionSchema.safeParse({ amount: 50 });
    assert.equal(result.success, false);
  });

  test("aceita movimentação manual válida", () => {
    const result = createManualFinancialTransactionSchema.safeParse({
      financialAccountId: uuid1, type: "DEBIT", amount: 25.5, description: "Taxa bancária",
    });
    assert.equal(result.success, true);
  });

  test("rejeita type fora do enum CREDIT/DEBIT", () => {
    const result = createManualFinancialTransactionSchema.safeParse({ financialAccountId: uuid1, type: "TRANSFER", amount: 10 });
    assert.equal(result.success, false);
  });
});

describe("createBankReconciliationSchema", () => {
  test("exige financialAccountId, periodStart e periodEnd", () => {
    const result = createBankReconciliationSchema.safeParse({ financialAccountId: uuid1 });
    assert.equal(result.success, false);
  });

  test("aceita conciliação mínima válida", () => {
    const result = createBankReconciliationSchema.safeParse({
      financialAccountId: uuid1, periodStart: "2026-01-01", periodEnd: "2026-01-31",
    });
    assert.equal(result.success, true);
  });
});

describe("setReconciliationItemStatusSchema", () => {
  test("exige status dentro do enum", () => {
    const result = setReconciliationItemStatusSchema.safeParse({ status: "approved" });
    assert.equal(result.success, false);
  });

  test("aceita cada um dos três status", () => {
    for (const status of ["reconciled", "unreconciled", "divergent"] as const) {
      const result = setReconciliationItemStatusSchema.safeParse({ status });
      assert.equal(result.success, true, `status ${status} deveria ser aceito`);
    }
  });
});
