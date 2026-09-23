"use client";

import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

// Painel lateral (detalhe rápido, formulário, filtros no mobile). No
// mobile ocupa a largura toda; em telas largas, larguras fixas.

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
  size?: "sm" | "md" | "lg";
};

const SIZES = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };

export function Drawer({ open, onClose, title, subtitle, meta, children, footer, side = "right", size = "md" }: DrawerProps) {
  return (
    <D.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <D.Content
          className={cn(
            "fixed inset-y-0 z-50 flex w-full flex-col border-border bg-surface shadow-dialog outline-none",
            side === "right" ? "right-0 border-l animate-slide-in-right" : "left-0 border-r animate-slide-in-left",
            SIZES[size]
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <D.Title className="truncate text-md font-semibold text-foreground">{title}</D.Title>
              {subtitle ? (
                <D.Description className="mt-0.5 text-sm text-muted-foreground">{subtitle}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : "Painel"}</D.Description>
              )}
              {meta && <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div>}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar painel">
                <X size={16} />
              </Button>
            </D.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
