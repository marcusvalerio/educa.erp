import { listStockTransfers, createTransfer } from "@/lib/api/inventory-handlers";

export const GET = listStockTransfers;
export const POST = createTransfer;
