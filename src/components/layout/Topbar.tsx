"use client";

import { Menu, Search, Bell } from "lucide-react";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-sm sm:px-6">
      <button
        aria-label="Abrir menu"
        onClick={onMenuClick}
        className="rounded-md p-2 text-ink-muted hover:bg-surface-hover lg:hidden"
      >
        <Menu size={20} />
      </button>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" />
        <input
          type="text"
          placeholder="Buscar em todo o sistema..."
          className="w-full rounded-lg border border-border-strong bg-surface-hover/60 py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button
          aria-label="Notificações"
          className="relative rounded-md p-2 text-ink-muted hover:bg-surface-hover hover:text-ink"
        >
          <Bell size={19} />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
        </button>
        <div className="mx-1 h-6 w-px bg-border" />
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-hover">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">
            AR
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-medium text-ink">Ana Ribeiro</span>
            <span className="block text-xs text-ink-subtle">Administradora</span>
          </span>
        </div>
      </div>
    </header>
  );
}
