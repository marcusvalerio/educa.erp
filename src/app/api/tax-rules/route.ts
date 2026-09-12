import { listTaxRules, createTaxRule } from "@/lib/api/fiscal-handlers";

export const GET = listTaxRules;
export const POST = createTaxRule;
