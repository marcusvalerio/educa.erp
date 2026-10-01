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
  /** Métrica dominante da faixa (uma por tela): número maior, leitura primeiro. */
  lead?: boolean;
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

export function Stat({ label, value, hint, delta, tone = "neutral", href, loading, className, lead = false }: StatProps) {
  const d = delta ? deltaView(delta) : null;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-muted-foreground", lead ? "text-sm font-medium" : "text-xs")}>{label}</span>
        {href && <ChevronRight size={14} className="shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
      {loading ? (
        <span className={cn("block animate-skeleton rounded-sm bg-muted", lead ? "mt-3 h-9 w-40" : "mt-2 h-7 w-24")} />
      ) : (
        <div className={cn("font-semibold text-foreground tabular-nums", lead ? "mt-2 text-3xl tracking-display" : "mt-1.5 text-xl tracking-title")}>{value}</div>
      )}
      {(d || hint) && !loading && (
        <div className={cn("flex flex-wrap items-center gap-x-1.5 text-xs", lead ? "mt-2" : "mt-1")}>
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
    "group relative block min-w-0 bg-surface",
    lead ? "px-5 py-4" : "px-4 py-4",
    tone !== "neutral" && "before:absolute before:top-4 before:bottom-4 before:left-0 before:w-0.5 before:rounded-full",
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

/**
 * Faixa de métricas com divisórias (densa; não é uma grade de cards).
 * `lead`: a primeira métrica ocupa a largura de duas — a hierarquia da faixa
 * fica explícita (use junto de <Stat lead />).
 */
export function StatStrip({ children, className, columns = 4, lead = false }: { children: ReactNode; className?: string; columns?: 2 | 3 | 4 | 5 | 6; lead?: boolean }) {
  const cols = lead
    ? {
        2: "sm:grid-cols-2",
        3: "sm:grid-cols-3",
        4: "sm:grid-cols-3 lg:grid-cols-5 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-3 lg:[&>*:first-child]:col-span-2",
        5: "sm:grid-cols-3 lg:grid-cols-6 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-3 lg:[&>*:first-child]:col-span-2",
        6: "sm:grid-cols-3 lg:grid-cols-7 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-3 lg:[&>*:first-child]:col-span-2",
      }[columns]
    : {
        2: "sm:grid-cols-2",
        3: "sm:grid-cols-3",
        4: "sm:grid-cols-2 lg:grid-cols-4",
        5: "sm:grid-cols-3 lg:grid-cols-5",
        6: "sm:grid-cols-3 lg:grid-cols-6",
      }[columns];
  // Divisória por célula (não gap sobre fundo): quando a última linha não
  // fecha, a sobra fica em branco, não uma célula cinza.
  return (
    <div className={cn("surface overflow-hidden", className)}>
      <div className={cn("-mr-px -mb-px grid grid-cols-2 *:border-r *:border-b *:border-border-subtle", cols)}>{children}</div>
    </div>
  );
}
