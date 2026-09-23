import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "./Badge";

// Métrica compacta. Número em dígitos tabulares; variação calculada de
// verdade (nunca inventada) com o sentido de "bom" explícito: em custo,
// subir é ruim. Quando há destino, a métrica inteira vira link (drill-down).

export type Delta = {
  /** Variação percentual real; null = sem base de comparação. */
  pct: number | null;
  /** "up" é bom (receita) ou ruim (custo, atraso)? */
  goodWhen?: "up" | "down";
  label?: string;
};

type StatProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: Delta;
  tone?: Tone;
  href?: string;
  loading?: boolean;
  className?: string;
};

function deltaView(delta: Delta) {
  if (delta.pct === null || !Number.isFinite(delta.pct)) {
    return { icon: Minus, text: "sem base", className: "text-subtle-foreground" };
  }
  const rounded = Math.round(delta.pct * 10) / 10;
  if (rounded === 0) return { icon: Minus, text: "0%", className: "text-subtle-foreground" };
  const up = rounded > 0;
  const good = (delta.goodWhen ?? "up") === "up" ? up : !up;
  return {
    icon: up ? ArrowUpRight : ArrowDownRight,
    text: `${up ? "+" : ""}${rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`,
    className: good ? "text-success-fg" : "text-danger-fg",
  };
}

const TONE_BAR: Partial<Record<Tone, string>> = {
  warning: "before:bg-warning",
  danger: "before:bg-danger",
  critical: "before:bg-critical",
  success: "before:bg-success",
};

export function Stat({ label, value, hint, delta, tone = "neutral", href, loading, className }: StatProps) {
  const d = delta ? deltaView(delta) : null;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        {href && <ChevronRight size={14} className="shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
      {loading ? (
        <span className="mt-2 block h-6 w-24 animate-skeleton rounded-sm bg-muted" />
      ) : (
        <div className="mt-1 text-lg font-semibold tracking-tight text-foreground tabular-nums">{value}</div>
      )}
      {(d || hint) && !loading && (
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
          {d && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", d.className)}>
              <d.icon size={13} aria-hidden />
              {d.text}
            </span>
          )}
          {(delta?.label || hint) && <span className="text-subtle-foreground">{delta?.label ?? hint}</span>}
        </div>
      )}
    </>
  );
  const classes = cn(
    "group relative block min-w-0 bg-surface px-4 py-3",
    tone !== "neutral" && "before:absolute before:top-3 before:bottom-3 before:left-0 before:w-0.5 before:rounded-full",
    TONE_BAR[tone],
    href && "transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring",
    className
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** Faixa de métricas com divisórias (densa; não é uma grade de cards). */
export function StatStrip({ children, className, columns = 4 }: { children: ReactNode; className?: string; columns?: 2 | 3 | 4 | 5 | 6 }) {
  const cols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  }[columns];
  return (
    <div className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border", cols, className)}>
      {children}
    </div>
  );
}
