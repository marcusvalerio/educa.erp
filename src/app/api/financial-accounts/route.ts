import { listFinancialAccounts, createFinancialAccount } from "@/lib/api/finance-handlers";

export const GET = listFinancialAccounts;
export const POST = createFinancialAccount;
