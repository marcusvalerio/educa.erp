import { listBoms, createBom } from "@/lib/api/production-handlers";

export const GET = listBoms;
export const POST = createBom;
