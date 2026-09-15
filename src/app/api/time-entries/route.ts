import { listTimeEntries, createTimeEntry } from "@/lib/api/projects-services-handlers";

export const GET = listTimeEntries;
export const POST = createTimeEntry;
