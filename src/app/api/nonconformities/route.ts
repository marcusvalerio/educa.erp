import { listNonconformities, createNonconformity } from "@/lib/api/quality-handlers";

export const GET = listNonconformities;
export const POST = createNonconformity;
