import { listUserRoles, assignUserRole, revokeUserRole } from "@/lib/api/rbac-handlers";

export const GET = listUserRoles;
export const POST = assignUserRole;
export const DELETE = revokeUserRole;
