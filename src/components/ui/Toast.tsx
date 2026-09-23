"use client";

import { useSyncExternalStore } from "react";
import { Toast as T } from "radix-ui";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

// Toasts: feedback de ação concluída/falha, anunciado a leitores de tela
// (Radix Toast). API imperativa simples: toast.success("Salvo").

type ToastTone = "success" | "danger" | "warning" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; description?: string };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function push(tone: ToastTone, title: string, description?: string) {
  items = [...items, { id: nextId++, tone, title, description }].slice(-4);
  emit();
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

export const toast = {
  success: (title: string, description?: string) => push("success", title, description),
  error: (title: string, description?: string) => push("danger", title, description),
  warning: (title: string, description?: string) => push("warning", title, description),
  info: (title: string, description?: string) => push("info", title, description),
};

const EMPTY: ToastItem[] = [];

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const ICONS: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success-fg" },
  danger: { icon: XCircle, className: "text-danger-fg" },
  warning: { icon: AlertTriangle, className: "text-warning-fg" },
  info: { icon: Info, className: "text-info-fg" },
};

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <T.Provider swipeDirection="right" duration={4500}>
      {list.map((item) => {
        const { icon: Icon, className } = ICONS[item.tone];
        return (
          <T.Root
            key={item.id}
            type={item.tone === "danger" ? "foreground" : "background"}
            onOpenChange={(open) => !open && dismiss(item.id)}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-popover animate-slide-in-right",
              "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:animate-fade-in"
            )}
          >
            <Icon size={16} className={cn("mt-0.5 shrink-0", className)} aria-hidden />
            <div className="min-w-0 flex-1">
              <T.Title className="text-sm font-medium text-foreground">{item.title}</T.Title>
              {item.description && <T.Description className="mt-0.5 text-xs text-muted-foreground">{item.description}</T.Description>}
            </div>
            <T.Close aria-label="Fechar" className="rounded-sm p-0.5 text-subtle-foreground hover:text-foreground">
              <X size={14} />
            </T.Close>
          </T.Root>
        );
      })}
      <T.Viewport className="fixed right-0 bottom-0 z-[80] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </T.Provider>
  );
}
