import { listProductionOperationLogs, logProductionOperation } from "@/lib/api/production-handlers";

export const GET = listProductionOperationLogs;
export const POST = logProductionOperation;
