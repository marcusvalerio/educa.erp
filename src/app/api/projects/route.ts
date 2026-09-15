import { listProjects, createProject } from "@/lib/api/projects-services-handlers";

export const GET = listProjects;
export const POST = createProject;
