import { listMaterialRequests, createMaterialRequest } from "@/lib/api/inventory-handlers";

export const GET = listMaterialRequests;
export const POST = createMaterialRequest;
