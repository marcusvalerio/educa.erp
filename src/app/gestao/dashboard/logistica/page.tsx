"use client";

import { Truck, PackageCheck, CheckCircle2, AlertTriangle, Navigation, ClipboardList, Clock } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatInteger } from "@/lib/format";
import type { ReportLogisticsResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ReportLogisticsResult>[] = [
  { key: "shipments_count", label: "Expedições no mês", format: (v) => formatInteger(v as number), icon: Truck, accent: "brand" },
  { key: "shipped_count", label: "Despachadas", format: (v) => formatInteger(v as number), icon: PackageCheck, accent: "info" },
  { key: "delivered_count", label: "Entregues", format: (v) => formatInteger(v as number), icon: CheckCircle2, accent: "success" },
  { key: "failed_count", label: "Falhas de entrega", format: (v) => formatInteger(v as number), icon: AlertTriangle, accent: "danger" },
  { key: "in_transit_count", label: "Em trânsito", format: (v) => formatInteger(v as number), icon: Navigation, accent: "info" },
  { key: "pick_lists_count", label: "Listas de separação", format: (v) => formatInteger(v as number), icon: ClipboardList, accent: "neutral" },
  {
    key: "average_lead_time_days",
    label: "Lead time médio (dias)",
    format: (v) => (v === null || v === undefined ? "—" : formatInteger(Math.round(v as number))),
    icon: Clock,
    accent: "warning",
  },
];

export default function LogisticaDashboardPage() {
  return (
    <ContextDashboard<ReportLogisticsResult>
      pageLabel="Logística"
      title="Dashboard de logística"
      description="Expedições do mês em curso — despacho, entrega, falhas e lead time médio."
      apiPath="/api/reports/logistics"
      fields={fields}
    />
  );
}
