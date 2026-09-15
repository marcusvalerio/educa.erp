"use client";

import { ShoppingCart, Banknote, Users, XCircle, Clock, Percent, Receipt } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import type { ReportCommercialResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ReportCommercialResult>[] = [
  { key: "orders_count", label: "Pedidos no mês", format: (v) => formatInteger(v as number), icon: ShoppingCart, accent: "brand" },
  { key: "orders_amount", label: "Faturamento", format: (v) => formatCurrencyBRL(v as number), icon: Banknote, accent: "success" },
  { key: "average_ticket", label: "Ticket médio", format: (v) => formatCurrencyBRL(v as number | null), icon: Receipt, accent: "info" },
  { key: "customers_count", label: "Clientes ativos", format: (v) => formatInteger(v as number), icon: Users, accent: "neutral" },
  { key: "pending_orders", label: "Pedidos pendentes", format: (v) => formatInteger(v as number), icon: Clock, accent: "warning" },
  { key: "cancelled_orders", label: "Pedidos cancelados", format: (v) => formatInteger(v as number), icon: XCircle, accent: "danger" },
  { key: "quote_conversion_pct", label: "Conversão de orçamento", format: (v) => formatPercent(v as number | null), icon: Percent, accent: "info" },
];

export default function ComercialDashboardPage() {
  return (
    <ContextDashboard<ReportCommercialResult>
      pageLabel="Comercial"
      title="Dashboard comercial"
      description="Indicadores comerciais do mês em curso — pedidos, faturamento, clientes e conversão de orçamentos."
      apiPath="/api/reports/commercial"
      fields={fields}
    />
  );
}
