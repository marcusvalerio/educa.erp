"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronsLeft, ChevronsRight, Sparkle, X } from "lucide-react";
import { NAV, moduleHref, childHref } from "@/lib/nav";

const COLLAPSE_STORAGE_KEY = "astra-sidebar-collapsed";

function isModuleActive(pathname: string, mod: (typeof NAV)[number]) {
  if (!mod.slug) return pathname === "/";
  return pathname === `/${mod.slug}` || pathname.startsWith(`/${mod.slug}/`);
}

// Inicializador preguiçoso (useState(() => ...)) em vez de ler no corpo
// de um efeito — mesmo padrão do ThemeProvider (src/components/theme/ThemeProvider.tsx),
// evita o cascading render que um setState direto no efeito causaria.
function initialCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [manualState, setManualState] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<boolean>(initialCollapsed);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Preferência não persiste nesta sessão, mas o toggle continua funcionando.
      }
      return next;
    });
  }

  const activeModuleSlug = NAV.find((m) => m.children.length && isModuleActive(pathname, m))?.slug;

  function isGroupOpen(slug: string) {
    if (collapsed) return false;
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
          "fixed inset-y-0 left-0 z-50 flex w-[17.5rem] flex-col bg-sidebar text-sidebar-ink transition-[transform,width] duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[4.5rem]" : "lg:w-[17.5rem]"
        )}
      >
        <div className={clsx("flex items-center gap-2 px-5 py-6", collapsed ? "lg:justify-center lg:px-0" : "justify-between")}>
          <Link href="/" className="flex items-center gap-2.5" title="EDUCA.ERP">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand text-white shadow-raised">
              <Sparkle size={16} strokeWidth={2.25} fill="currentColor" />
            </span>
            <span className={clsx("leading-none", collapsed && "lg:hidden")}>
              <span className="block text-[15px] font-semibold tracking-tight text-sidebar-ink whitespace-nowrap">
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
                      title={collapsed ? mod.label : undefined}
                      className={clsx(
                        "relative flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-150",
                        collapsed && "lg:justify-center lg:px-0",
                        active
                          ? "bg-sidebar-active text-white"
                          : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                      )}
                    >
                      {active && (
                        <span className="absolute top-1.5 bottom-1.5 left-0 w-[2.5px] rounded-full bg-brand-tint" />
                      )}
                      <Icon size={17} strokeWidth={1.75} className="shrink-0" />
                      <span className={clsx(collapsed && "lg:hidden")}>{mod.label}</span>
                    </Link>
                  </li>
                );
              }

              const open = isGroupOpen(mod.slug);

              return (
                <li key={mod.label}>
                  {collapsed ? (
                    <Link
                      href={moduleHref(mod)}
                      onClick={onClose}
                      title={mod.label}
                      className={clsx(
                        "relative flex w-full items-center justify-center rounded-[9px] px-0 py-2.5 text-[13.5px] font-medium transition-colors duration-150 lg:flex",
                        active
                          ? "bg-sidebar-active text-white"
                          : "text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                      )}
                    >
                      <Icon size={17} strokeWidth={1.75} className="shrink-0" />
                    </Link>
                  ) : (
                    <>
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
                        <Icon size={17} strokeWidth={1.75} className="shrink-0" />
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
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className={clsx(
            "hidden items-center gap-2 border-t border-sidebar-border px-5 py-3 text-[12px] font-medium text-sidebar-ink-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-ink lg:flex",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <ChevronsRight size={16} strokeWidth={1.75} /> : <ChevronsLeft size={16} strokeWidth={1.75} />}
          {!collapsed && <span>Recolher menu</span>}
        </button>

        <div className={clsx("flex items-center gap-2 border-t border-sidebar-border px-5 py-4", collapsed && "lg:justify-center lg:px-0")}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
          <span className={clsx("text-[11px] font-medium text-sidebar-ink-muted whitespace-nowrap", collapsed && "lg:hidden")}>
            ASTRA.ERP <span className="text-sidebar-ink-muted/60">· v1.0</span>
          </span>
        </div>
      </aside>
    </>
  );
}
