import { createAdminBranch, listAdminBranches } from "@/lib/api/admin-handlers";

export const GET = listAdminBranches;
export const POST = createAdminBranch;
