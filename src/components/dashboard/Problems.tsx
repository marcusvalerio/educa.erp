"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Feedback";
import { useSession } from "@/components/shell/SessionProvider";
import { cachedGet } from "@/lib/dashboard/client";
import { PROBLEMS, rankProblems, type ProblemDef, type ProblemResult, type Severity } from "@/lib/dashboard/problems";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";

// "O que precisa da minha atenção?" — só roda detectores cujas fontes o
// usuário pode ler; cada item leva à lista já filtrada onde ele age.

const SEVERITY: Record<Severity, { icon: typeof AlertTriangle; bar: string; text: string; label: string }> = {
  critical: { icon: AlertOctagon, bar: "bg-critical", text: "text-critical-fg", label: "Crítico" },
  danger: { icon: CircleAlert, bar: "bg-danger", text: "text-danger-fg", label: "Problema" },
  warning: { icon: AlertTriangle, bar: "bg-warning", text: "text-warning-fg", label: "Atenção" },
};

export function useProblems(modules?: string[]) {
  const { can, data } = useSession();
  const defs = useMemo(
    () => PROBLEMS.filter((p) => can(p.permission) && (!modules || modules.includes(p.module))),
    [can, modules]
  );
  const [state, setState] = useState<{ results: ProblemResult[]; failed: ProblemDef[]; loading: boolean }>({ results: [], failed: [], loading: true });
  const key = defs.map((d) => d.id).join(",");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ ...prev, loading: true }));
    const today = new Date();
    Promise.all(
      defs.map((def) =>
        cachedGet<Record<string, unknown>[]>(def.source)
          .then((rows) => ({ ok: true as const, def, result: def.compute(Array.isArray(rows) ? rows : [], today) }))
          .catch(() => ({ ok: false as const, def }))
      )
    ).then((outcomes) => {
      if (cancelled) return;
      setState({
        results: outcomes.flatMap((o) => (o.ok ? [{ ...o.def, ...o.result }] : [])),
        failed: outcomes.flatMap((o) => (o.ok ? [] : [o.def])),
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Módulos priorizados pelo contexto (setor/cargo/papel via dashboard context).
  const focusModules = useMemo(() => {
    const seen: string[] = [];
    for (const f of data?.focus ?? []) if (f.module_code && !seen.includes(f.module_code)) seen.push(f.module_code);
    return seen;
  }, [data]);

  return { ...state, checked: defs, ranked: rankProblems(state.results, focusModules) };
}

export function ProblemsPanel({ modules, title = "Precisa de atenção", description, limit = 8 }: { modules?: string[]; title?: string; description?: string; limit?: number }) {
  const { ranked, checked, failed, loading } = useProblems(modules);
  const clear = checked.filter((d) => !ranked.some((r) => r.id === d.id) && !failed.some((f) => f.id === d.id));

  return (
    <Panel>
      <PanelHeader
        title={title}
        description={description ?? "Pendências reais nos módulos que você acessa, ordenadas por gravidade e pelo seu foco."}
        actions={!loading && ranked.length > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{ranked.length} item(ns)</span> : undefined}
      />
      {loading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : checked.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum indicador de pendência disponível para o seu perfil.</p>
      ) : ranked.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-5">
          <CheckCircle2 size={18} className="shrink-0 text-success-fg" aria-hidden />
          <div>
            <p className="text-sm font-medium">Nada fora do esperado agora</p>
            <p className="text-xs text-muted-foreground">
              {checked.length} verificação(ões) sem pendências{failed.length > 0 ? ` · ${failed.length} indisponível(is)` : ""}.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {ranked.slice(0, limit).map((problem) => {
            const meta = SEVERITY[problem.severity];
            const Icon = meta.icon;
            return (
              <li key={problem.id}>
                <Link href={problem.href} className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring">
                  <span aria-hidden className={cn("absolute top-2 bottom-2 left-0 w-0.5 rounded-full", meta.bar)} />
                  <Icon size={16} className={cn("shrink-0", meta.text)} aria-label={meta.label} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{problem.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{problem.hint}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-md font-semibold tabular-nums">{formatInteger(problem.count)}</p>
                    {problem.amount !== undefined && problem.amount > 0 && <p className="text-2xs text-muted-foreground tabular-nums">{formatCurrencyBRL(problem.amount)}</p>}
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && ranked.length > 0 && (clear.length > 0 || failed.length > 0) && (
        <p className="border-t border-border px-4 py-2 text-xs text-subtle-foreground">
          {clear.length > 0 && <>Sem pendências: {clear.map((c) => c.label.toLowerCase()).slice(0, 4).join(", ")}{clear.length > 4 ? ` e mais ${clear.length - 4}` : ""}.</>}
          {failed.length > 0 && <> {failed.length} verificação(ões) indisponível(is) no momento.</>}
        </p>
      )}
    </Panel>
  );
}
