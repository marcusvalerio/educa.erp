import { Suspense } from "react";
import type { Metadata } from "next";
import { AreaDashboard } from "@/components/dashboard/AreaDashboard";

export const metadata: Metadata = { title: "Painel · Financeiro" };

export default function DashboardPage() {
  return (
    <Suspense>
      <AreaDashboard area="financeiro" />
    </Suspense>
  );
}
