import { Suspense } from "react";
import type { Metadata } from "next";
import { ModuleWorkspace } from "@/components/dashboard/ModuleWorkspace";

export const metadata: Metadata = { title: "Controladoria" };

export default function WorkspacePage() {
  return (
    <Suspense>
      <ModuleWorkspace section="gestao" />
    </Suspense>
  );
}
