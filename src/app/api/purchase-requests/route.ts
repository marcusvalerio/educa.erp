import { listPurchaseRequests, createPurchaseRequest } from "@/lib/api/purchasing-handlers";

export const GET = listPurchaseRequests;
export const POST = createPurchaseRequest;
