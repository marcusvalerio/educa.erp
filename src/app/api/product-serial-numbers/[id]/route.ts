import { getSerialNumber, updateSerialNumber, deleteSerialNumber } from "@/lib/api/inventory-handlers";

export const GET = getSerialNumber;
export const PATCH = updateSerialNumber;
export const DELETE = deleteSerialNumber;
