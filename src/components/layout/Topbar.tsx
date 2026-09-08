"use client";

import { Menu, Search, Bell } from "lucide-react";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md sm:px-6">
      <button
        aria-label="Abrir menu"
        onClick={onMenuClick}
        className="rounded-md p-2 text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink lg:hidden"
      >
        <Menu size={19} strokeWidth={1.75} />
      </button>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search
          size={15}
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
        />
        <input
          type="text"
          placeholder="Buscar em todo o sistema..."
          className="w-full rounded-lg border border-transparent bg-surface-hover/70 py-2 pr-3 pl-9 text-[13px] text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-brand/40 focus:bg-surface focus:outline-none focus:ring-[3px] focus:ring-brand/12"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          aria-label="Notificações"
          className="relative rounded-md p-2 text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink active:scale-95"
        >
          <Bell size={18} strokeWidth={1.75} />
          <span className="absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full bg-brand ring-2 ring-surface" />
        </button>
        <div className="mx-1.5 h-6 w-px bg-border" />
        <button className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1.5 transition-colors duration-150 hover:bg-surface-hover">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink">
            AR
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-[13px] font-medium text-ink">Ana Ribeiro</span>
            <span className="block text-[11.5px] text-ink-subtle">Administradora</span>
          </span>
        </button>
      </div>
    </header>
  );
}
