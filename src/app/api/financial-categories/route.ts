import { listFinancialCategories, createFinancialCategory } from "@/lib/api/finance-handlers";

export const GET = listFinancialCategories;
export const POST = createFinancialCategory;
