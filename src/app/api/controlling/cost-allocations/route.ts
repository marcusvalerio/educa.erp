import { listCostAllocations, createCostAllocation } from "@/lib/api/controlling-handlers";

export const GET = listCostAllocations;
export const POST = createCostAllocation;
