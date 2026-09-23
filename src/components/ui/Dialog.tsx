"use client";

import type { ReactNode } from "react";
import { AlertDialog as AD, Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

// Diálogo modal acessível (foco preso, Esc fecha, título/descrição
// ligados por aria). Largura por tamanho, radius 8px, sombra de overlay.

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export function Dialog({ open, onOpenChange, title, description, children, footer, size = "md" }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <D.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-lg border border-border bg-surface shadow-dialog outline-none animate-pop-in",
            SIZES[size]
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <D.Title className="text-md font-semibold text-foreground">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</D.Description>
              )}
            </div>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar">
                <X size={16} />
              </Button>
            </D.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Confirmação de ação irreversível: foco inicial no "Cancelar".
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AD.Root open={open} onOpenChange={(next) => !next && !loading && onCancel()}>
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <AD.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-dialog outline-none animate-pop-in">
          <AD.Title className="text-md font-semibold text-foreground">{title}</AD.Title>
          <AD.Description className="mt-2 text-sm text-muted-foreground">{description}</AD.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AD.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                {cancelLabel}
              </Button>
            </AD.Cancel>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={loading}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
