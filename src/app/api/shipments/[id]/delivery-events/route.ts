import { listDeliveryEvents, createDeliveryEvent } from "@/lib/api/logistics-handlers";

export const GET = listDeliveryEvents;
export const POST = createDeliveryEvent;
