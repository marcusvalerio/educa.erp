"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { fiscalSetupSteps, type FiscalSetupStatus } from "@/lib/fiscal/setup";

// Orientação para chegar à primeira NF-e: o que já está pronto e o que falta,
// com base nos cadastros reais da empresa. Some quando tudo está pronto.
export function FiscalSetupPanel() {
  const { can } = useSession();
  const allowed = can("fiscal_documents.view");
  const res = useCached<FiscalSetupStatus | null>("/api/fiscal-setup", allowed);
  if (!allowed) return null;
  if (res.loading) {
    return (
      <Panel>
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Panel>
    );
  }
  if (res.error || !res.data) {
    return (
      <Panel>
        <EmptyState compact kind="error" title="Preparação fiscal indisponível" description={res.error ?? undefined} onRetry={res.reload} />
      </Panel>
    );
  }
  const steps = fiscalSetupSteps(res.data);
  const pending = steps.filter((s) => !s.done).length;
  if (pending === 0) return null;
  return (
    <Panel>
      <PanelHeader
        title="Preparação para a primeira NF-e"
        description="O que a empresa precisa ter cadastrado para gerar a NF-e de um pedido."
        actions={<span className="text-xs text-muted-foreground tabular-nums">{pending} pendente(s)</span>}
      />
      <ol className="divide-y divide-border-subtle">
        {steps.map((step) => {
          const Icon = step.done ? CheckCircle2 : CircleDashed;
          const body = (
            <>
              <Icon size={16} className={step.done ? "mt-0.5 shrink-0 text-success-fg" : "mt-0.5 shrink-0 text-warning-fg"} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {step.label}
                  <span className="sr-only">{step.done ? " — pronto" : " — pendente"}</span>
                </p>
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              </div>
              {step.href && <ArrowRight size={14} className="mt-0.5 shrink-0 text-subtle-foreground" aria-hidden />}
            </>
          );
          return (
            <li key={step.id}>
              {step.href ? (
                <Link href={step.href} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-hover">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-4 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
