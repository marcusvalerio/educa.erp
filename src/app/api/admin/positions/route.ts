import { createAdminPosition, listAdminPositions } from "@/lib/api/admin-handlers";

export const GET = listAdminPositions;
export const POST = createAdminPosition;
