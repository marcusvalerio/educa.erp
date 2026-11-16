import { runOutbox } from "@/lib/integrations/orion/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = runOutbox;
export const POST = runOutbox;
