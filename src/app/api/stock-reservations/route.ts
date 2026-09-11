import { listStockReservations, createReservation } from "@/lib/api/inventory-handlers";

export const GET = listStockReservations;
export const POST = createReservation;
