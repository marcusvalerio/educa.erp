"use client";

import Link from "next/link";
import { Target, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";

// Pipeline comercial real (CRM, Fase 15) — nunca um "Pipeline" fictício
// de SalesOps: reaproveita a mesma pipeline/oportunidades já existentes
// em /crm/pipeline (fn_move_opportunity_stage), só resumidas aqui como
// widget do dashboard. "Valor total do pipeline" = soma real de
// estimated_value das oportunidades abertas.
export type PipelineStageSummary = { id: string; name: string; count: number; value: number };

export function PipelineOverview({
  stages,
  totalValue,
  loading,
  error,
}: {
  stages: PipelineStageSummary[];
  totalValue: number;
  loading: boolean;
  error: string | null;
}) {
  const maxValue = Math.max(1, ...stages.map((s) => s.value));

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Pipeline comercial</h3>
          <p className="text-[12px] text-ink-subtle">Oportunidades abertas por etapa</p>
        </div>
        <Link href="/crm/pipeline" className="flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand-hover">
          Ver pipeline <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-semibold tracking-tight text-ink">{loading ? "—" : formatCurrencyBRL(totalValue)}</span>
        <span className="text-[12px] text-ink-subtle">em oportunidades abertas</span>
      </div>

      <div className="mt-4 flex-1 space-y-3">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <span key={i} className="animate-skeleton block h-8 rounded-md bg-border-strong/60" />)
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Target size={20} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[12.5px] text-ink-subtle">{error}</p>
          </div>
        ) : stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Target size={20} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[13px] font-medium text-ink">Não há registros.</p>
            <p className="max-w-xs text-[12px] text-ink-subtle">Nenhuma oportunidade aberta no pipeline comercial.</p>
          </div>
        ) : (
          stages.map((stage) => (
            <div key={stage.id}>
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-ink">{stage.name}</span>
                <span className="text-ink-subtle">
                  {formatInteger(stage.count)} · {formatCurrencyBRL(stage.value)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.max(4, (stage.value / maxValue) * 100)}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
