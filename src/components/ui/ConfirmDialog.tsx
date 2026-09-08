"use client";

import { createPortal } from "react-dom";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "./Button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loadingLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "info";
  loading?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  loadingLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        aria-label="Fechar"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] animate-fade-in"
      />
      <div className="animate-scale-in relative w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-elevated">
        <div className="flex items-start gap-3">
          <span
            className={
              tone === "danger"
                ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-danger-soft text-danger"
                : "flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] bg-info-soft text-info"
            }
          >
            {tone === "danger" ? <AlertTriangle size={18} strokeWidth={1.75} /> : <Info size={18} strokeWidth={1.75} />}
          </span>
          <div>
            <h3 className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">{title}</h3>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">{description}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          {onConfirm && (
            <Button
              onClick={onConfirm}
              disabled={loading}
              className={tone === "danger" ? "bg-danger hover:bg-danger/90 shadow-none" : ""}
            >
              {loading ? (loadingLabel ?? "Aguarde...") : confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
