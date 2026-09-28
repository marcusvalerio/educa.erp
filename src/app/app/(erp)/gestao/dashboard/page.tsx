import { Suspense } from "react";
import type { Metadata } from "next";
import { AreaDashboard } from "@/components/dashboard/AreaDashboard";

export const metadata: Metadata = { title: "Painel executivo" };

export default function ExecutiveDashboardPage() {
  return (
    <Suspense>
      <AreaDashboard area="executivo" />
    </Suspense>
  );
}
