import { listProductionOrders, createProductionOrder } from "@/lib/api/production-handlers";

export const GET = listProductionOrders;
export const POST = createProductionOrder;
