import { listFinancialTransactions, createManualFinancialTransaction } from "@/lib/api/finance-handlers";

export const GET = listFinancialTransactions;
export const POST = createManualFinancialTransaction;
