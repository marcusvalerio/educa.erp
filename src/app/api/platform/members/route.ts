import { listPlatformMembers, upsertPlatformMember } from "@/lib/api/platform-handlers";

export const GET = listPlatformMembers;
export const POST = upsertPlatformMember;
