import { z } from "zod";

// Validação server-side do domínio Financeiro
// (supabase/migrations/0031-0035). Mesmo espírito de
// src/lib/validations/{inventory,purchasing,commercial,logistics,
// production}.ts: valida forma e tipos antes de chamar a função RPC
// correspondente — a regra de negócio real (saldo nunca negativo além
// do permitido, pagamento/recebimento nunca acima do saldo da parcela,
// idempotência, concorrência) vive no banco.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const positiveAmount = z.coerce.number().positive("O valor deve ser maior que zero.");
const nonNegativeAmount = z.coerce.number().min(0, "O valor não pode ser negativo.");
const optionalDateString = z.string().trim().optional();

// --------------------------------------------------- Categorias/Centros de custo
export const financialCategorySchema = z.object({
  code: z.string().trim().min(1, "Informe o código da categoria."),
  name: z.string().trim().min(1, "Informe o nome da categoria."),
  type: z.enum(["INCOME", "EXPENSE"]),
  parentId: optionalUuid,
  description: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const costCenterSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do centro de custo."),
  name: z.string().trim().min(1, "Informe o nome do centro de custo."),
  parentId: optionalUuid,
  notes: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// ------------------------------------------------------------ Contas financeiras
export const createFinancialAccountSchema = z.object({
  code: z.string().trim().min(1, "Informe o código da conta."),
  name: z.string().trim().min(1, "Informe o nome da conta."),
  type: z.enum(["CASH", "BANK", "DIGITAL", "OTHER"]),
  openingBalance: z.coerce.number().optional().default(0),
  bankName: z.string().trim().optional(),
  bankAgency: z.string().trim().optional(),
  bankAccountMasked: z.string().trim().optional(),
  currencyCode: z.string().trim().length(3).optional().default("BRL"),
  notes: z.string().trim().optional(),
});

// opening_balance/current_balance nunca editáveis — de propósito fora
// deste schema (strip automático do Zod para chaves desconhecidas).
export const updateFinancialAccountSchema = z.object({
  name: z.string().trim().min(1).optional(),
  bankName: z.string().trim().optional(),
  bankAgency: z.string().trim().optional(),
  bankAccountMasked: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  notes: z.string().trim().optional(),
});

// ----------------------------------------------------------------- Parcelas
const installmentSchema = z.object({
  dueDate: z.string().trim().min(1, "Informe o vencimento da parcela."),
  amount: positiveAmount,
});

// ------------------------------------------------------------- Contas a pagar
export const createAccountsPayableSchema = z.object({
  supplierId: uuidField("Selecione o fornecedor."),
  description: z.string().trim().min(1, "Informe a descrição do título."),
  originalAmount: positiveAmount,
  installments: z.array(installmentSchema).min(1, "O título precisa de ao menos uma parcela."),
  categoryId: optionalUuid,
  costCenterId: optionalUuid,
  discount: nonNegativeAmount.optional().default(0),
  interest: nonNegativeAmount.optional().default(0),
  penalty: nonNegativeAmount.optional().default(0),
  issueDate: optionalDateString,
  documentReference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const generateAccountsPayableFromReceiptSchema = z.object({
  categoryId: optionalUuid,
  costCenterId: optionalUuid,
  paymentTermsId: optionalUuid,
  issueDate: optionalDateString,
  dueDateBase: optionalDateString,
  description: z.string().trim().optional(),
});

export const updateAccountsPayableSchema = z.object({
  description: z.string().trim().min(1).optional(),
  categoryId: optionalUuid,
  costCenterId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const cancelAccountsPayableSchema = z.object({
  reason: z.string().trim().optional(),
});

// ---------------------------------------------------------- Contas a receber
export const createAccountsReceivableSchema = z.object({
  customerId: uuidField("Selecione o cliente."),
  description: z.string().trim().min(1, "Informe a descrição do título."),
  originalAmount: positiveAmount,
  installments: z.array(installmentSchema).min(1, "O título precisa de ao menos uma parcela."),
  categoryId: optionalUuid,
  costCenterId: optionalUuid,
  discount: nonNegativeAmount.optional().default(0),
  interest: nonNegativeAmount.optional().default(0),
  penalty: nonNegativeAmount.optional().default(0),
  issueDate: optionalDateString,
  documentReference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const generateAccountsReceivableFromSalesOrderSchema = z.object({
  categoryId: optionalUuid,
  costCenterId: optionalUuid,
  paymentTermsId: optionalUuid,
  issueDate: optionalDateString,
  dueDateBase: optionalDateString,
  description: z.string().trim().optional(),
});

export const updateAccountsReceivableSchema = z.object({
  description: z.string().trim().min(1).optional(),
  categoryId: optionalUuid,
  costCenterId: optionalUuid,
  notes: z.string().trim().optional(),
});

export const cancelAccountsReceivableSchema = z.object({
  reason: z.string().trim().optional(),
});

// --------------------------------------------------- Pagamentos/Recebimentos
export const payInstallmentSchema = z.object({
  financialAccountId: uuidField("Selecione a conta financeira."),
  amount: positiveAmount,
  method: z.enum(["CASH", "BANK_TRANSFER", "PIX", "CARD", "BOLETO", "OTHER"]),
  paidAt: optionalDateString,
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export const receiveInstallmentSchema = z.object({
  financialAccountId: uuidField("Selecione a conta financeira."),
  amount: positiveAmount,
  method: z.enum(["CASH", "BANK_TRANSFER", "PIX", "CARD", "BOLETO", "OTHER"]),
  receivedAt: optionalDateString,
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export const reverseReceiptSchema = z.object({
  reason: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

// ----------------------------------------------------- Movimentação manual
export const createManualFinancialTransactionSchema = z.object({
  financialAccountId: uuidField("Selecione a conta financeira."),
  type: z.enum(["CREDIT", "DEBIT"]),
  amount: positiveAmount,
  categoryId: optionalUuid,
  costCenterId: optionalUuid,
  description: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

// ------------------------------------------------------- Conciliação bancária
export const createBankReconciliationSchema = z.object({
  financialAccountId: uuidField("Selecione a conta financeira."),
  periodStart: z.string().trim().min(1, "Informe o início do período."),
  periodEnd: z.string().trim().min(1, "Informe o fim do período."),
  notes: z.string().trim().optional(),
});

export const setReconciliationItemStatusSchema = z.object({
  status: z.enum(["reconciled", "unreconciled", "divergent"]),
  notes: z.string().trim().optional(),
});
