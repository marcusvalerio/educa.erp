import type { NextRequest } from "next/server";
import { ssoLaunch } from "@/lib/integrations/orion/server";

export const dynamic = "force-dynamic";
export const GET = (request: NextRequest) => ssoLaunch(request, true);
