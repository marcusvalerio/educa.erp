import { Suspense } from "react";
import type { Metadata } from "next";
import { ModuleWorkspace } from "@/components/dashboard/ModuleWorkspace";

export const metadata: Metadata = { title: "Projetos e Serviços" };

export default function WorkspacePage() {
  return (
    <Suspense>
      <ModuleWorkspace section="projetos" />
    </Suspense>
  );
}
