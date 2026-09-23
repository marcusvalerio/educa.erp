"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Crumb } from "@/lib/navigation/access";

// Breadcrumb global do shell. As páginas de registro acrescentam o próprio
// nome ("PV-000123") com useBreadcrumbTail — o resto vem do registro de
// navegação, sem cada página remontar a trilha.

type TailCtx = { tail: Crumb[]; setTail: (tail: Crumb[]) => void };
const BreadcrumbTailCtx = createContext<TailCtx | null>(null);

export function BreadcrumbTailProvider({ children }: { children: React.ReactNode }) {
  const [tail, setTail] = useState<Crumb[]>([]);
  return <BreadcrumbTailCtx.Provider value={{ tail, setTail }}>{children}</BreadcrumbTailCtx.Provider>;
}

export function useBreadcrumbTail(...crumbs: Array<Crumb | string | null | undefined>) {
  const ctx = useContext(BreadcrumbTailCtx);
  const serialized = JSON.stringify(crumbs.filter(Boolean).map((c) => (typeof c === "string" ? { label: c } : c)));
  useEffect(() => {
    if (!ctx) return;
    ctx.setTail(JSON.parse(serialized) as Crumb[]);
    return () => ctx.setTail([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}

export function useBreadcrumbTailValue(): Crumb[] {
  return useContext(BreadcrumbTailCtx)?.tail ?? [];
}

export function Breadcrumbs({ items, className, tone = "default" }: { items: Crumb[]; className?: string; tone?: "default" | "platform" }) {
  return (
    <nav aria-label="Trilha de navegação" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className={cn("flex min-w-0 items-center gap-1", !last && "hidden sm:flex")}>
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className={cn(
                    "truncate transition-colors",
                    tone === "platform" ? "text-platform-muted hover:text-platform-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last ? "font-medium" : "", tone === "platform" ? "text-platform-foreground" : "text-foreground")}
                >
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight size={13} className="shrink-0 text-subtle-foreground" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
