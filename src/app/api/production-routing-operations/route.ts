import { listProductionRoutingOperations, createProductionRoutingOperation } from "@/lib/api/production-handlers";

export const GET = listProductionRoutingOperations;
export const POST = createProductionRoutingOperation;
