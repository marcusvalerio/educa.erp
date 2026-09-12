"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

type DropdownProps = {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
};

export function Dropdown({ trigger, children, align = "right", panelClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      // Ao fechar (Escape ou clique fora), devolve o foco ao botão que
      // abriu o menu — evita que o teclado "perca o lugar" na página.
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          ref={panelRef}
          role="menu"
          tabIndex={-1}
          className={clsx(
            "animate-scale-in absolute top-[calc(100%+8px)] z-40 min-w-[15rem] origin-top-right rounded-[10px] border border-border bg-surface shadow-elevated outline-none",
            align === "right" ? "right-0" : "left-0",
            panelClassName
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
