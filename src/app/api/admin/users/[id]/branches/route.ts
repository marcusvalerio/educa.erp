import { grantAdminUserBranch, revokeAdminUserBranch } from "@/lib/api/admin-handlers";

export const POST = grantAdminUserBranch;
export const DELETE = revokeAdminUserBranch;
