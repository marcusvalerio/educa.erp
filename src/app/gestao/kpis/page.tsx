"use client";

import { Percent, Banknote, Landmark, Receipt, CreditCard, AlertTriangle, TrendingUp, Wallet } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatCurrencyBRL, formatPercent } from "@/lib/format";
import type { ControllingKpisResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ControllingKpisResult>[] = [
  { key: "gross_margin_pct", label: "Margem bruta", format: (v) => formatPercent(v as number | null), icon: Percent, accent: "info" },
  { key: "operating_result", label: "Resultado operacional", format: (v) => formatCurrencyBRL(v as number), icon: TrendingUp, accent: "success" },
  { key: "managerial_result", label: "Resultado gerencial", format: (v) => formatCurrencyBRL(v as number), icon: Wallet, accent: "success" },
  { key: "cash_balance", label: "Saldo em caixa", format: (v) => formatCurrencyBRL(v as number), icon: Landmark, accent: "brand" },
  { key: "accounts_receivable_open", label: "A receber (aberto)", format: (v) => formatCurrencyBRL(v as number), icon: Receipt, accent: "info" },
  { key: "accounts_payable_open", label: "A pagar (aberto)", format: (v) => formatCurrencyBRL(v as number), icon: CreditCard, accent: "warning" },
  { key: "overdue_receivable", label: "Recebíveis vencidos", format: (v) => formatCurrencyBRL(v as number), icon: AlertTriangle, accent: "danger" },
  { key: "average_ticket", label: "Ticket médio", format: (v) => formatCurrencyBRL(v as number | null), icon: Banknote, accent: "neutral" },
];

export default function KpisPage() {
  return (
    <ContextDashboard<ControllingKpisResult>
      pageLabel="KPIs"
      title="KPIs gerenciais"
      description="Indicadores consolidados de controladoria do mês em curso — margem, resultado, caixa e inadimplência."
      apiPath="/api/controlling/kpis"
      fields={fields}
    />
  );
}
