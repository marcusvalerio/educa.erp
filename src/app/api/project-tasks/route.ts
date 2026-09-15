import { listProjectTasks, createProjectTask } from "@/lib/api/projects-services-handlers";

export const GET = listProjectTasks;
export const POST = createProjectTask;
