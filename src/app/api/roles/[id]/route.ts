import { getRole, updateRole, deleteRole } from "@/lib/api/rbac-handlers";

export const GET = getRole;
export const PATCH = updateRole;
export const DELETE = deleteRole;
