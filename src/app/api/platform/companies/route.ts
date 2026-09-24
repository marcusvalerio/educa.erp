import { listPlatformCompanies } from "@/lib/api/platform-handlers";
import { createPlatformCompany } from "@/lib/api/onboarding-handlers";

export const GET = listPlatformCompanies;
export const POST = createPlatformCompany;
