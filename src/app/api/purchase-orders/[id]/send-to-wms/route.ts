import { sendToWms } from "@/lib/integrations/orion/server";

export const POST = sendToWms("purchase_order");
