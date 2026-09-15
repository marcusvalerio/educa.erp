"use client";

import { Boxes, Wallet, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, SlidersHorizontal, Lock, AlertTriangle } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";
import type { ReportInventoryResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ReportInventoryResult>[] = [
  { key: "total_quantity", label: "Quantidade em estoque", format: (v) => formatInteger(v as number), icon: Boxes, accent: "brand" },
  { key: "total_value", label: "Valor em estoque", format: (v) => formatCurrencyBRL(v as number), icon: Wallet, accent: "success" },
  { key: "receipts_count", label: "Recebimentos no mês", format: (v) => formatInteger(v as number), icon: ArrowDownCircle, accent: "info" },
  { key: "issues_count", label: "Saídas no mês", format: (v) => formatInteger(v as number), icon: ArrowUpCircle, accent: "info" },
  { key: "transfers_count", label: "Transferências", format: (v) => formatInteger(v as number), icon: ArrowLeftRight, accent: "neutral" },
  { key: "adjustments_count", label: "Ajustes", format: (v) => formatInteger(v as number), icon: SlidersHorizontal, accent: "warning" },
  { key: "reservations_active", label: "Reservas ativas", format: (v) => formatInteger(v as number), icon: Lock, accent: "neutral" },
  { key: "products_without_movement", label: "Produtos sem movimento", format: (v) => formatInteger(v as number), icon: AlertTriangle, accent: "danger" },
];

export default function EstoqueDashboardPage() {
  return (
    <ContextDashboard<ReportInventoryResult>
      pageLabel="Estoque"
      title="Dashboard de estoque"
      description="Posição de estoque e movimentação do mês em curso — recebimentos, saídas, transferências e ajustes."
      apiPath="/api/reports/inventory"
      fields={fields}
    />
  );
}
