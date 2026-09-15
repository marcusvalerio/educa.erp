import { listWorkflowInstances, startWorkflowInstance } from "@/lib/api/workflow-handlers";

export const GET = listWorkflowInstances;
export const POST = startWorkflowInstance;
