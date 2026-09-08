"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function Drawer({ open, onClose, title, subtitle, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        aria-label="Fechar painel"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] animate-fade-in"
      />
      <div className="animate-slide-in-right relative flex h-full w-full max-w-xl flex-col bg-surface shadow-elevated">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2 className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          <button
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-subtle transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
