"use client";

import { ClipboardList, ShoppingBag, Banknote, PackageCheck, AlertTriangle, Truck } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";
import type { ReportPurchasesResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ReportPurchasesResult>[] = [
  { key: "requests_count", label: "Solicitações no mês", format: (v) => formatInteger(v as number), icon: ClipboardList, accent: "brand" },
  { key: "orders_count", label: "Pedidos de compra", format: (v) => formatInteger(v as number), icon: ShoppingBag, accent: "info" },
  { key: "orders_amount", label: "Valor comprado", format: (v) => formatCurrencyBRL(v as number), icon: Banknote, accent: "success" },
  { key: "receipts_count", label: "Recebimentos", format: (v) => formatInteger(v as number), icon: PackageCheck, accent: "info" },
  { key: "receipts_amount", label: "Valor recebido", format: (v) => formatCurrencyBRL(v as number), icon: Banknote, accent: "success" },
  { key: "divergent_receipt_items", label: "Itens com divergência", format: (v) => formatInteger(v as number), icon: AlertTriangle, accent: "danger" },
  { key: "suppliers_count", label: "Fornecedores ativos", format: (v) => formatInteger(v as number), icon: Truck, accent: "neutral" },
];

export default function ComprasDashboardPage() {
  return (
    <ContextDashboard<ReportPurchasesResult>
      pageLabel="Compras"
      title="Dashboard de compras"
      description="Solicitações, pedidos e recebimentos de compra do mês em curso, com divergências de conferência."
      apiPath="/api/reports/purchases"
      fields={fields}
    />
  );
}
