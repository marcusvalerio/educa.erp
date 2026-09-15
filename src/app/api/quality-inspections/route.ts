import { listQualityInspections, createQualityInspection } from "@/lib/api/quality-handlers";

export const GET = listQualityInspections;
export const POST = createQualityInspection;
