import { listWorkflows, createWorkflow } from "@/lib/api/workflow-handlers";

export const GET = listWorkflows;
export const POST = createWorkflow;
