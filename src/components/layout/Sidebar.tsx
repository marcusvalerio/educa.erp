"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, Boxes, X } from "lucide-react";
import { NAV, moduleHref, childHref } from "@/lib/nav";

function isModuleActive(pathname: string, mod: (typeof NAV)[number]) {
  if (!mod.slug) return pathname === "/";
  return pathname === `/${mod.slug}` || pathname.startsWith(`/${mod.slug}/`);
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [manualState, setManualState] = useState<Record<string, boolean>>({});

  const activeModuleSlug = NAV.find((m) => m.children.length && isModuleActive(pathname, m))?.slug;

  function isGroupOpen(slug: string) {
    return manualState[slug] ?? slug === activeModuleSlug;
  }

  function toggleGroup(slug: string) {
    setManualState((prev) => ({ ...prev, [slug]: !isGroupOpen(slug) }));
  }

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[1px] lg:hidden"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-ink transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-5 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
              <Boxes size={18} />
            </span>
            <span className="font-display leading-tight">
              <span className="block text-[15px] font-semibold text-sidebar-ink">Educa ERP</span>
              <span className="block text-[11px] text-sidebar-ink-muted">Logística &amp; Gestão</span>
            </span>
          </Link>
          <button
            aria-label="Fechar menu"
            onClick={onClose}
            className="rounded-md p-1.5 text-sidebar-ink-muted hover:bg-sidebar-hover lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-0.5">
            {NAV.map((mod) => {
              const Icon = mod.icon;
              const active = isModuleActive(pathname, mod);

              if (mod.children.length === 0) {
                return (
                  <li key={mod.label}>
                    <Link
                      href={moduleHref(mod)}
                      onClick={onClose}
                      className={clsx(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-active text-white"
                          : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                      )}
                    >
                      <Icon size={17} />
                      {mod.label}
                    </Link>
                  </li>
                );
              }

              const open = isGroupOpen(mod.slug);

              return (
                <li key={mod.label}>
                  <button
                    onClick={() => toggleGroup(mod.slug)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active && !open
                        ? "bg-sidebar-active text-white"
                        : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                    )}
                    aria-expanded={open}
                  >
                    <Icon size={17} />
                    <span className="flex-1 text-left">{mod.label}</span>
                    <ChevronDown
                      size={15}
                      className={clsx("transition-transform", open && "rotate-180")}
                    />
                  </button>
                  {open && (
                    <ul className="mt-0.5 mb-1 ml-[1.65rem] flex flex-col gap-0.5 border-l border-sidebar-border pl-3.5">
                      {mod.children.map((child) => {
                        const href = childHref(mod, child);
                        const childActive = pathname === href;
                        return (
                          <li key={child.slug}>
                            <Link
                              href={href}
                              onClick={onClose}
                              className={clsx(
                                "block rounded-md px-2.5 py-2 text-[13.5px] transition-colors",
                                childActive
                                  ? "bg-sidebar-active font-medium text-white"
                                  : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                              )}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border px-5 py-4 text-[11px] text-sidebar-ink-muted">
          Fase 1 — Estrutura inicial dos módulos
        </div>
      </aside>
    </>
  );
}
