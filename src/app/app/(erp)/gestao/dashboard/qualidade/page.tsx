import { Suspense } from "react";
import type { Metadata } from "next";
import { AreaDashboard } from "@/components/dashboard/AreaDashboard";

export const metadata: Metadata = { title: "Painel · Qualidade" };

export default function DashboardPage() {
  return (
    <Suspense>
      <AreaDashboard area="qualidade" />
    </Suspense>
  );
}
