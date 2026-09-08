"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, Sparkle, X } from "lucide-react";
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
          className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px] animate-fade-in lg:hidden"
        />
      )}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col bg-sidebar text-sidebar-ink transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand text-white shadow-raised">
              <Sparkle size={16} strokeWidth={2.25} fill="currentColor" />
            </span>
            <span className="leading-none">
              <span className="block text-[15px] font-semibold tracking-tight text-sidebar-ink">
                ASTRA<span className="text-brand-tint">.</span>ERP
              </span>
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

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
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
                        "relative flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-150",
                        active
                          ? "bg-sidebar-active text-white"
                          : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                      )}
                    >
                      {active && (
                        <span className="absolute top-1.5 bottom-1.5 left-0 w-[2.5px] rounded-full bg-brand-tint" />
                      )}
                      <Icon size={17} strokeWidth={1.75} />
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
                      "relative flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-150",
                      active && !open
                        ? "bg-sidebar-active text-white"
                        : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                    )}
                    aria-expanded={open}
                  >
                    {active && !open && (
                      <span className="absolute top-1.5 bottom-1.5 left-0 w-[2.5px] rounded-full bg-brand-tint" />
                    )}
                    <Icon size={17} strokeWidth={1.75} />
                    <span className="flex-1 text-left">{mod.label}</span>
                    <ChevronDown
                      size={14}
                      strokeWidth={2}
                      className={clsx("transition-transform duration-200", open && "rotate-180")}
                    />
                  </button>
                  <div
                    className={clsx(
                      "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}
                  >
                    <div className="min-h-0">
                      <ul className="mt-0.5 mb-1 ml-[1.6rem] flex flex-col gap-0.5 border-l border-sidebar-border pl-3.5">
                        {mod.children.map((child) => {
                          const href = childHref(mod, child);
                          const childActive = pathname === href;
                          return (
                            <li key={child.slug}>
                              <Link
                                href={href}
                                onClick={onClose}
                                className={clsx(
                                  "block rounded-md px-2.5 py-[7px] text-[13px] transition-colors duration-150",
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
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2 border-t border-sidebar-border px-5 py-4">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="text-[11px] font-medium text-sidebar-ink-muted">
            ASTRA.ERP <span className="text-sidebar-ink-muted/60">· v1.0</span>
          </span>
        </div>
      </aside>
    </>
  );
}
