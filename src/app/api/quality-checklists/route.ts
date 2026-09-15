import { listQualityChecklists, createQualityChecklist } from "@/lib/api/quality-handlers";

export const GET = listQualityChecklists;
export const POST = createQualityChecklist;
