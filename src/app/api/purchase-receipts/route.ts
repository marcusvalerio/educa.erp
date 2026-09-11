import { listPurchaseReceipts, createPurchaseReceipt } from "@/lib/api/purchasing-handlers";

export const GET = listPurchaseReceipts;
export const POST = createPurchaseReceipt;
