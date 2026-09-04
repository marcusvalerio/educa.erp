"use client";

import { createPortal } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "info";
  onConfirm?: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        aria-label="Fechar"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span
            className={
              tone === "danger"
                ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"
                : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info"
            }
          >
            {tone === "danger" ? <AlertTriangle size={19} /> : <Info size={19} />}
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
            <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {onConfirm && (
            <Button
              onClick={onConfirm}
              className={tone === "danger" ? "bg-danger hover:bg-danger/90 shadow-danger/20" : ""}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
