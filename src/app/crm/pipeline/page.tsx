"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCcw } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { apiGet, apiSend } from "@/lib/api-client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL } from "@/lib/format";
import type { OpportunityRow, PipelineRow, PipelineStageRow } from "@/lib/database/schema";

type PipelineWithStages = PipelineRow & { pipeline_stages: PipelineStageRow[] };

// Fase 19 — Pipeline em Kanban, dados reais de /api/pipelines e
// /api/opportunities. Mover de estágio chama fn_move_opportunity_stage
// (via /api/opportunities/[id]/move-stage) — nunca um update direto de
// stage_id (mesma regra de negócio reforçada no backend, Fase 15).
// Simplificação assumida por tempo: mover por botão anterior/próximo em
// vez de arrastar-e-soltar — mesma função de backend por trás.
export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [movingId, setMovingId] = useState<string | null>(null);
  const customers = useIdNameLookup("/api/customers");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [pipelinesData, opportunitiesData] = await Promise.all([
          apiGet<PipelineWithStages[]>("/api/pipelines"),
          apiGet<OpportunityRow[]>("/api/opportunities?status=OPEN"),
        ]);
        if (cancelled) return;
        setPipelines(pipelinesData);
        setOpportunities(opportunitiesData);
        if (pipelinesData.length > 0) setSelectedPipelineId((prev) => prev ?? pipelinesData[0].id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar o pipeline.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const stages = useMemo(
    () => (selectedPipeline ? [...selectedPipeline.pipeline_stages].sort((a, b) => a.sequence - b.sequence) : []),
    [selectedPipeline]
  );

  async function moveOpportunity(opportunityId: string, stageId: string) {
    setMovingId(opportunityId);
    try {
      const updated = await apiSend<OpportunityRow>(`/api/opportunities/${opportunityId}/move-stage`, "POST", { stageId });
      setOpportunities((prev) => prev.map((opp) => (opp.id === opportunityId ? updated : opp)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível mover a oportunidade de estágio.");
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "CRM", href: "/crm" }, { label: "Pipeline" }]} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">Pipeline</h1>
            <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">Oportunidades abertas agrupadas por estágio — mover o cartão avança/retrocede o estágio real no backend.</p>
          </div>
          {pipelines.length > 1 && (
            <select
              value={selectedPipelineId ?? ""}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:border-brand/40 focus:outline-none focus:ring-[3px] focus:ring-brand/12"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error ? (
        <Card className="flex items-start gap-3 border-danger/30 bg-danger-soft p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-danger">Não foi possível carregar o pipeline</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{error}</p>
          </div>
          <Button variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
        </Card>
      ) : loading ? (
        <TableSkeleton columns={4} rows={5} />
      ) : !selectedPipeline ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-[13.5px] font-medium text-ink">Nenhum pipeline cadastrado</p>
          <p className="max-w-sm text-[13px] text-ink-subtle">Cadastre um pipeline e seus estágios para visualizar o funil de oportunidades.</p>
        </Card>
      ) : stages.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <p className="text-[13.5px] font-medium text-ink">Este pipeline ainda não tem estágios</p>
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage, stageIndex) => {
            const stageOpportunities = opportunities.filter((opp) => opp.stage_id === stage.id);
            const totalValue = stageOpportunities.reduce((sum, opp) => sum + opp.estimated_value, 0);
            return (
              <div key={stage.id} className="flex w-72 shrink-0 flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[12.5px] font-semibold text-ink">
                    {stage.name} <span className="text-ink-subtle">({stageOpportunities.length})</span>
                  </p>
                  <p className="text-[11.5px] text-ink-subtle">{formatCurrencyBRL(totalValue)}</p>
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface-sunken/40 p-2" style={{ minHeight: 80 }}>
                  {stageOpportunities.length === 0 && <p className="p-3 text-center text-[12px] text-ink-subtle">Sem oportunidades</p>}
                  {stageOpportunities.map((opp) => {
                    const previousStage = stages[stageIndex - 1];
                    const nextStage = stages[stageIndex + 1];
                    const isMoving = movingId === opp.id;
                    return (
                      <Card key={opp.id} className="p-3">
                        <p className="text-[13px] font-medium text-ink">{opp.title}</p>
                        <p className="mt-0.5 text-[12px] text-ink-subtle">{opp.customer_id ? customers.get(opp.customer_id) ?? opp.customer_id : "Sem cliente"}</p>
                        <p className="mt-1.5 text-[13px] font-semibold text-brand-ink">{formatCurrencyBRL(opp.estimated_value)}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <button
                            disabled={!previousStage || isMoving}
                            onClick={() => previousStage && moveOpportunity(opp.id, previousStage.id)}
                            aria-label="Mover para estágio anterior"
                            className="inline-flex items-center justify-center rounded-md p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-30"
                          >
                            <ChevronLeft size={15} />
                          </button>
                          <span className="text-[11px] text-ink-subtle">{opp.probability}%</span>
                          <button
                            disabled={!nextStage || isMoving}
                            onClick={() => nextStage && moveOpportunity(opp.id, nextStage.id)}
                            aria-label="Mover para próximo estágio"
                            className="inline-flex items-center justify-center rounded-md p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-30"
                          >
                            <ChevronRight size={15} />
                          </button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
