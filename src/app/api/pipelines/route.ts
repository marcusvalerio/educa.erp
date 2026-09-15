import { listPipelines, createPipeline } from "@/lib/api/crm-handlers";

export const GET = listPipelines;
export const POST = createPipeline;
