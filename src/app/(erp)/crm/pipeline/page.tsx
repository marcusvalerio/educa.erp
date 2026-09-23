"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { apiGet, apiSend } from "@/lib/api-client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL } from "@/lib/format";
import type { OpportunityRow, PipelineRow, PipelineStageRow } from "@/lib/database/schema";

type PipelineWithStages = PipelineRow & { pipeline_stages: PipelineStageRow[] };

// Pipeline em colunas, com dados reais de /api/pipelines e
// /api/opportunities. Mover de estágio chama fn_move_opportunity_stage
// (/api/opportunities/[id]/move-stage) — nunca um update direto.
export default function PipelinePage() {
  const { can } = useSession();
  const canMove = can("opportunities.move_stage");
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [movingId, setMovingId] = useState<string | null>(null);
  const customers = useIdNameLookup("/api/customers");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    Promise.all([apiGet<PipelineWithStages[]>("/api/pipelines"), apiGet<OpportunityRow[]>("/api/opportunities?status=OPEN")])
      .then(([pipelinesData, opportunitiesData]) => {
        if (cancelled) return;
        setPipelines(pipelinesData);
        setOpportunities(opportunitiesData);
        if (pipelinesData.length > 0) setSelectedPipelineId((prev) => prev || pipelinesData[0].id);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Não foi possível carregar o pipeline."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const stages = useMemo(() => (selectedPipeline ? [...selectedPipeline.pipeline_stages].sort((a, b) => a.sequence - b.sequence) : []), [selectedPipeline]);

  async function moveOpportunity(opportunity: OpportunityRow, stage: PipelineStageRow) {
    setMovingId(opportunity.id);
    try {
      const updated = await apiSend<OpportunityRow>(`/api/opportunities/${opportunity.id}/move-stage`, "POST", { stageId: stage.id });
      setOpportunities((prev) => prev.map((opp) => (opp.id === opportunity.id ? updated : opp)));
      toast.success(`"${opportunity.title}" movida para ${stage.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível mover a oportunidade.");
    } finally {
      setMovingId(null);
    }
  }

  const openTotal = opportunities.filter((o) => stages.some((s) => s.id === o.stage_id)).reduce((sum, o) => sum + Number(o.estimated_value || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pipeline"
        description="Oportunidades abertas por estágio. Mover um cartão registra a mudança de estágio no CRM."
        meta={selectedPipeline ? <span className="tabular-nums">Em aberto: {formatCurrencyBRL(openTotal)}</span> : undefined}
        actions={
          pipelines.length > 1 ? (
            <Select aria-label="Pipeline" value={selectedPipelineId} onValueChange={setSelectedPipelineId} options={pipelines.map((p) => ({ value: p.id, label: p.name }))} className="w-56" />
          ) : undefined
        }
      />

      {error ? (
        <EmptyState kind="error" title="Não foi possível carregar o pipeline" description={error} onRetry={() => setReloadToken((n) => n + 1)} />
      ) : loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-72 shrink-0" />
          ))}
        </div>
      ) : !selectedPipeline ? (
        <EmptyState title="Nenhum pipeline cadastrado" description="Cadastre um pipeline e seus estágios para acompanhar o funil de oportunidades." />
      ) : stages.length === 0 ? (
        <EmptyState title="Este pipeline ainda não tem estágios" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" role="list" aria-label={`Estágios de ${selectedPipeline.name}`}>
          {stages.map((stage, stageIndex) => {
            const cards = opportunities.filter((opp) => opp.stage_id === stage.id);
            const total = cards.reduce((sum, opp) => sum + Number(opp.estimated_value || 0), 0);
            const previousStage = stages[stageIndex - 1];
            const nextStage = stages[stageIndex + 1];
            return (
              <section key={stage.id} role="listitem" aria-label={stage.name} className="flex w-72 shrink-0 flex-col rounded-md border border-border bg-surface-muted">
                <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <h2 className="truncate text-sm font-semibold">
                    {stage.name} <span className="font-normal text-subtle-foreground tabular-nums">{cards.length}</span>
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatCurrencyBRL(total)}</span>
                </header>
                <ul className="flex min-h-20 flex-col gap-2 p-2">
                  {cards.length === 0 && <li className="p-3 text-center text-xs text-subtle-foreground">Sem oportunidades</li>}
                  {cards.map((opp) => {
                    const busy = movingId === opp.id;
                    return (
                      <li key={opp.id} className="rounded-md border border-border bg-surface p-3" aria-busy={busy}>
                        <p className="text-sm font-medium">{opp.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{opp.customer_id ? customers.get(opp.customer_id) ?? "Cliente não encontrado" : "Sem cliente"}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold tabular-nums">{formatCurrencyBRL(opp.estimated_value)}</span>
                          <span className="text-2xs text-subtle-foreground tabular-nums">{opp.probability}% de chance</span>
                        </div>
                        {canMove && (previousStage || nextStage) && (
                          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                            <Button variant="ghost" size="icon-sm" disabled={!previousStage || busy} onClick={() => previousStage && moveOpportunity(opp, previousStage)} aria-label={previousStage ? `Mover para ${previousStage.name}` : "Primeiro estágio"}>
                              <ChevronLeft size={15} />
                            </Button>
                            <span className="text-2xs text-subtle-foreground">Mover</span>
                            <Button variant="ghost" size="icon-sm" disabled={!nextStage || busy} onClick={() => nextStage && moveOpportunity(opp, nextStage)} aria-label={nextStage ? `Mover para ${nextStage.name}` : "Último estágio"}>
                              <ChevronRight size={15} />
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
