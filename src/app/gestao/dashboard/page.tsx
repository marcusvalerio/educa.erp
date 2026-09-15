"use client";

import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";

export default function DashboardPage() {
  return <ExecutiveDashboard breadcrumb={[{ label: "Gestão", href: "/gestao" }, { label: "Dashboard" }]} />;
}
