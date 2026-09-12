import { listSettings, upsertSetting } from "@/lib/api/settings-handlers";

export const GET = listSettings;
export const POST = upsertSetting;
