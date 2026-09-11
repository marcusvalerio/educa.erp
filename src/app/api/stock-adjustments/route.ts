import { listStockAdjustments, createAdjustment } from "@/lib/api/inventory-handlers";

export const GET = listStockAdjustments;
export const POST = createAdjustment;
