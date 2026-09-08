import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export type StatStripItem = {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: LucideIcon;
};

export function StatStrip({ items }: { items: StatStripItem[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border rounded-xl border border-border bg-surface shadow-card sm:grid-cols-4 sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 px-4 py-3.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
            <item.icon size={15} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
              {item.label}
            </p>
            <div className="flex items-baseline gap-1.5">
              <p className="font-display text-[15px] font-semibold text-ink">{item.value}</p>
              <span
                className={clsx(
                  "flex items-center text-[11px] font-medium",
                  item.trend === "up" ? "text-success" : "text-danger"
                )}
              >
                {item.trend === "up" ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                {item.change}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
