"use client";

import { Factory, PlayCircle, CheckCircle2, XCircle, Boxes, Banknote, Trash2, ListChecks } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";
import type { ReportProductionResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ReportProductionResult>[] = [
  { key: "orders_count", label: "Ordens no mês", format: (v) => formatInteger(v as number), icon: ListChecks, accent: "brand" },
  { key: "open_orders", label: "Ordens abertas", format: (v) => formatInteger(v as number), icon: Factory, accent: "neutral" },
  { key: "in_progress_orders", label: "Em andamento", format: (v) => formatInteger(v as number), icon: PlayCircle, accent: "info" },
  { key: "completed_orders", label: "Concluídas", format: (v) => formatInteger(v as number), icon: CheckCircle2, accent: "success" },
  { key: "cancelled_orders", label: "Canceladas", format: (v) => formatInteger(v as number), icon: XCircle, accent: "danger" },
  { key: "produced_quantity", label: "Quantidade produzida", format: (v) => formatInteger(v as number), icon: Boxes, accent: "success" },
  { key: "consumed_material_cost", label: "Custo de material consumido", format: (v) => formatCurrencyBRL(v as number), icon: Banknote, accent: "warning" },
  { key: "scrap_quantity", label: "Refugo", format: (v) => formatInteger(v as number), icon: Trash2, accent: "danger" },
];

export default function ProducaoDashboardPage() {
  return (
    <ContextDashboard<ReportProductionResult>
      pageLabel="Produção"
      title="Dashboard de produção"
      description="Ordens de produção do mês em curso — status, quantidade produzida, custo de material e refugo."
      apiPath="/api/reports/production"
      fields={fields}
    />
  );
}
