"use client";

import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";

// Fase 19 — a home ("/", item "Dashboard" da sidebar) é a MESMA tela
// real de /gestao/dashboard, nunca um segundo dashboard com dados
// fabricados (o antigo KPI_DASHBOARD/genAtividadesRecentes mock desta
// página foi removido — ver docs/UI.md).
export default function HomePage() {
  return <ExecutiveDashboard breadcrumb={[{ label: "Dashboard" }]} />;
}
