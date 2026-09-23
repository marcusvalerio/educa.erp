import { Suspense } from "react";
import type { Metadata } from "next";
import { AreaDashboard } from "@/components/dashboard/AreaDashboard";

export const metadata: Metadata = { title: "Painel · Produção" };

export default function DashboardPage() {
  return (
    <Suspense>
      <AreaDashboard area="producao" />
    </Suspense>
  );
}
