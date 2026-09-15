"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiGet } from "@/lib/api-client";

// Fase 19 — Dashboards contextuais (Comercial/Estoque/Compras/Produção/
// Logística/Financeiro/Fiscal): todos os 7 reaproveitam este mesmo
// renderizador genérico sobre as funções de BI já existentes (Fase 12,
// fn_report_*) — nenhum dado fictício, nenhum componente de KPI
// duplicado por dashboard (mesmo cartão usado pelo Executivo em
// src/app/gestao/dashboard/page.tsx).

export type ContextDashboardField<T> = {
  key: keyof T;
  label: string;
  format: (value: T[keyof T]) => string;
  icon: LucideIcon;
  accent?: "brand" | "success" | "warning" | "info" | "danger" | "neutral";
};

const ACCENT_CLASSES: Record<string, string> = {
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-neutral-soft text-neutral",
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ContextDashboard<T extends Record<string, unknown>>({
  pageLabel,
  title,
  description,
  apiPath,
  fields,
}: {
  pageLabel: string;
  title: string;
  description: string;
  apiPath: string;
  fields: ContextDashboardField<T>[];
}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const params = new URLSearchParams({ periodStart: toIsoDate(firstOfMonth), periodEnd: toIsoDate(today) });
      try {
        const result = await apiGet<T | T[]>(`${apiPath}?${params.toString()}`);
        if (!cancelled) setData(Array.isArray(result) ? result[0] ?? null : result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar o dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [apiPath, reloadToken]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "Gestão", href: "/gestao" }, { label: "Relatórios", href: "/gestao/relatorios" }, { label: pageLabel }]} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">{title}</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">{description}</p>
        </div>
      </div>

      {error ? (
        <Card className="flex items-start gap-3 border-danger/30 bg-danger-soft p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-danger">Não foi possível carregar este dashboard</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{error}</p>
          </div>
          <Button variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
        </Card>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: fields.length }, (_, i) => (
            <Card key={i} className="p-5">
              <span className="animate-skeleton block h-3 w-20 rounded bg-border-strong/60" />
              <span className="animate-skeleton mt-3 block h-6 w-24 rounded bg-border-strong/60" />
            </Card>
          ))}
        </div>
      ) : !data ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-[13.5px] font-medium text-ink">Sem dados para o período</p>
          <p className="max-w-sm text-[13px] text-ink-subtle">Nenhum movimento encontrado neste mês para esta empresa.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fields.map((field) => {
            const Icon = field.icon;
            return (
              <Card key={String(field.key)} className="flex items-center gap-3 p-4">
                <span className={`flex h-9 w-9 items-center justify-center rounded-[9px] ${ACCENT_CLASSES[field.accent ?? "neutral"]}`}>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">{field.label}</p>
                  <p className="font-display text-lg font-semibold text-ink">{field.format(data[field.key])}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
