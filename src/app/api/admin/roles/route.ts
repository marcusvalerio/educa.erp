import { createAdminRole, listAdminRoles } from "@/lib/api/admin-handlers";

export const GET = listAdminRoles;
export const POST = createAdminRole;
