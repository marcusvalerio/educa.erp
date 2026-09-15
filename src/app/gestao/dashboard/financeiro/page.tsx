"use client";

import { Landmark, Receipt, CreditCard, AlertTriangle, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatCurrencyBRL } from "@/lib/format";
import type { ReportFinanceResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ReportFinanceResult>[] = [
  { key: "cash_balance", label: "Saldo em caixa", format: (v) => formatCurrencyBRL(v as number), icon: Landmark, accent: "success" },
  { key: "accounts_receivable_open", label: "A receber (aberto)", format: (v) => formatCurrencyBRL(v as number), icon: Receipt, accent: "info" },
  { key: "accounts_payable_open", label: "A pagar (aberto)", format: (v) => formatCurrencyBRL(v as number), icon: CreditCard, accent: "warning" },
  { key: "overdue_receivable", label: "Recebíveis vencidos", format: (v) => formatCurrencyBRL(v as number), icon: AlertTriangle, accent: "danger" },
  { key: "overdue_payable", label: "Pagáveis vencidos", format: (v) => formatCurrencyBRL(v as number), icon: AlertTriangle, accent: "danger" },
  { key: "received_in_period", label: "Recebido no mês", format: (v) => formatCurrencyBRL(v as number), icon: ArrowUpCircle, accent: "success" },
  { key: "paid_in_period", label: "Pago no mês", format: (v) => formatCurrencyBRL(v as number), icon: ArrowDownCircle, accent: "neutral" },
];

export default function FinanceiroDashboardPage() {
  return (
    <ContextDashboard<ReportFinanceResult>
      pageLabel="Financeiro"
      title="Dashboard financeiro"
      description="Posição financeira do mês em curso — caixa, títulos abertos, vencidos e liquidações realizadas."
      apiPath="/api/reports/finance"
      fields={fields}
    />
  );
}
