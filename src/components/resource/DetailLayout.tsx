"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";

// Padrão de página de detalhe: cabeçalho (código, título, status, ações),
// faixa de resumo, informações em grade e seções (itens, financeiro,
// operação, histórico). Sem dado, a seção diz isso — nunca inventa.

export function DetailHeader({
  backHref,
  backLabel,
  code,
  title,
  status,
  meta,
  actions,
}: {
  backHref: string;
  backLabel: string;
  code?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft size={13} aria-hidden />
        {backLabel}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {code && <p className="code text-xs text-muted-foreground">{code}</p>}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            {status}
          </div>
          {meta && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export type InfoItem = { label: string; value: ReactNode; mono?: boolean; wide?: boolean };

export function InfoGrid({ items, columns = 4 }: { items: InfoItem[]; columns?: 2 | 3 | 4 }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 p-4", cols)}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
          <dt className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">{item.label}</dt>
          <dd className={cn("mt-0.5 text-sm break-words text-foreground", item.mono && "code")}>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailSection({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Panel className={className}>
      <PanelHeader title={title} description={description} actions={actions} />
      {children}
    </Panel>
  );
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando registro">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-72" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function DetailError({ error, onRetry, backHref }: { error: string; onRetry: () => void; backHref: string }) {
  const notFound = /não encontrad|not found/i.test(error);
  return (
    <Panel>
      <EmptyState
        kind={notFound ? "no-results" : "error"}
        title={notFound ? "Registro não encontrado" : "Não foi possível carregar o registro"}
        description={notFound ? "Ele pode ter sido removido ou não pertence ao seu acesso." : error}
        onRetry={notFound ? undefined : onRetry}
        action={
          <Link href={backHref} className="text-sm font-medium text-foreground underline underline-offset-2">
            Voltar à lista
          </Link>
        }
      />
    </Panel>
  );
}

/** Tabela simples para seções de detalhe (itens, ordens relacionadas). */
export function MiniTable<T>({
  rows,
  columns,
  rowKey,
  empty,
}: {
  rows: T[];
  columns: Array<{ label: string; align?: "left" | "right"; cell: (row: T) => ReactNode; className?: string }>;
  rowKey: (row: T) => string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="px-4 py-5 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            {columns.map((c) => (
              <th key={c.label} scope="col" className={cn("h-8 px-4 text-2xs font-medium tracking-wide text-muted-foreground uppercase", c.align === "right" && "text-right")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="h-10 border-b border-border last:border-0 hover:bg-surface-hover">
              {columns.map((c) => (
                <td key={c.label} className={cn("px-4", c.align === "right" && "text-right tabular-nums", c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
