import { createAdminDepartment, listAdminDepartments } from "@/lib/api/admin-handlers";

export const GET = listAdminDepartments;
export const POST = createAdminDepartment;
