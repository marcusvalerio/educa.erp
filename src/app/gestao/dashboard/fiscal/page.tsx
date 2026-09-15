"use client";

import { FileText, ArrowDownCircle, ArrowUpCircle, CheckCircle2, XCircle, Ban, Clock, Banknote } from "lucide-react";
import { ContextDashboard, type ContextDashboardField } from "@/components/resource/ContextDashboard";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";
import type { ReportFiscalResult } from "@/lib/database/schema";

const fields: ContextDashboardField<ReportFiscalResult>[] = [
  { key: "documents_count", label: "Documentos no mês", format: (v) => formatInteger(v as number), icon: FileText, accent: "brand" },
  { key: "entradas_count", label: "Entradas", format: (v) => formatInteger(v as number), icon: ArrowDownCircle, accent: "info" },
  { key: "saidas_count", label: "Saídas", format: (v) => formatInteger(v as number), icon: ArrowUpCircle, accent: "info" },
  { key: "authorized_count", label: "Autorizados", format: (v) => formatInteger(v as number), icon: CheckCircle2, accent: "success" },
  { key: "rejected_count", label: "Rejeitados", format: (v) => formatInteger(v as number), icon: XCircle, accent: "danger" },
  { key: "cancelled_count", label: "Cancelados", format: (v) => formatInteger(v as number), icon: Ban, accent: "neutral" },
  { key: "pending_count", label: "Pendentes", format: (v) => formatInteger(v as number), icon: Clock, accent: "warning" },
  { key: "taxes_amount", label: "Impostos no mês", format: (v) => formatCurrencyBRL(v as number), icon: Banknote, accent: "warning" },
];

export default function FiscalDashboardPage() {
  return (
    <ContextDashboard<ReportFiscalResult>
      pageLabel="Fiscal"
      title="Dashboard fiscal"
      description="Documentos fiscais do mês em curso — entradas, saídas, autorizações e impostos apurados."
      apiPath="/api/reports/fiscal"
      fields={fields}
    />
  );
}
