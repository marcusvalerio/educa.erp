import { assignAdminUserRole, revokeAdminUserRole } from "@/lib/api/admin-handlers";

export const POST = assignAdminUserRole;
export const DELETE = revokeAdminUserRole;
