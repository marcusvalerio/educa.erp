"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { NAV_GROUP_LABELS, type NavGroupId, type NavSection } from "@/lib/nav";
import { isPathActive } from "@/lib/navigation/access";

// Sidebar única para os três ambientes. O que muda é a pele (variant) e o
// conteúdo (seções já filtradas por permissão pelo shell que a usa):
//   erp      — neutra, grupos de módulos com subitens
//   admin    — neutra + faixa "Administração da Empresa", lista plana
//   platform — Smoky Black constante + faixa bordô, lista plana

export type SidebarVariant = "erp" | "admin" | "platform";

type SidebarProps = {
  variant: SidebarVariant;
  sections: NavSection[];
  header: ReactNode;
  footer?: ReactNode;
  icons?: Record<string, LucideIcon>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

const SKIN = {
  erp: {
    root: "bg-sidebar text-sidebar-foreground border-sidebar-border",
    muted: "text-sidebar-muted",
    item: "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
    active: "bg-sidebar-active text-sidebar-foreground font-medium",
    rule: "border-sidebar-border",
  },
  admin: {
    root: "bg-sidebar text-sidebar-foreground border-sidebar-border",
    muted: "text-sidebar-muted",
    item: "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground",
    active: "bg-sidebar-active text-sidebar-foreground font-medium",
    rule: "border-sidebar-border",
  },
  platform: {
    root: "bg-platform text-platform-foreground border-platform-border",
    muted: "text-platform-muted",
    item: "text-platform-muted hover:bg-platform-hover hover:text-platform-foreground",
    active: "bg-platform-active text-platform-foreground font-medium",
    rule: "border-platform-border",
  },
} as const;

function ActiveBar({ variant }: { variant: SidebarVariant }) {
  return (
    <span
      aria-hidden
      className={cn("absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full", variant === "platform" ? "bg-platform-accent-fg" : "bg-accent")}
    />
  );
}

function NavContent({
  variant,
  sections,
  icons,
  collapsed,
  onNavigate,
}: {
  variant: SidebarVariant;
  sections: NavSection[];
  icons?: Record<string, LucideIcon>;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const skin = SKIN[variant];
  const [manual, setManual] = useState<Record<string, boolean>>({});

  // Ambientes administrativos: lista plana de itens da única seção.
  if (variant !== "erp") {
    const items = sections.flatMap((s) => s.items);
    return (
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = icons?.[item.href];
          // "Visão geral" (raiz do ambiente) só é ativa na própria raiz.
          const isRoot = item.href === sections[0]?.href;
          const active = isPathActive(pathname, item.href, isRoot);
          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                collapsed && "lg:justify-center lg:px-0",
                active ? skin.active : skin.item
              )}
            >
              {active && <ActiveBar variant={variant} />}
              {Icon && <Icon size={16} strokeWidth={1.75} className="shrink-0" />}
              <span className={cn("truncate", collapsed && "lg:sr-only")}>{item.label}</span>
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip content={item.label} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  const groups = (Object.keys(NAV_GROUP_LABELS) as NavGroupId[])
    .map((group) => ({ group, sections: sections.filter((s) => s.group === group) }))
    .filter((g) => g.sections.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ group, sections: groupSections }) => (
        <div key={group}>
          <p className={cn("mb-1 px-2.5 text-2xs font-medium tracking-wide uppercase", skin.muted, collapsed && "lg:sr-only")}>
            {NAV_GROUP_LABELS[group]}
          </p>
          <ul className="flex flex-col gap-0.5">
            {groupSections.map((section) => {
              const Icon = section.icon;
              const sectionActive = section.href === "/" ? pathname === "/" : isPathActive(pathname, section.href) || section.items.some((i) => isPathActive(pathname, i.href));
              const hasChildren = section.items.length > 0;
              const open = !collapsed && hasChildren && (manual[section.id] ?? sectionActive);

              if (!hasChildren || collapsed) {
                const link = (
                  <Link
                    href={section.href}
                    onClick={onNavigate}
                    aria-current={sectionActive && !hasChildren ? "page" : undefined}
                    className={cn(
                      "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                      collapsed && "lg:justify-center lg:px-0",
                      sectionActive ? skin.active : skin.item
                    )}
                  >
                    {sectionActive && <ActiveBar variant={variant} />}
                    <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                    <span className={cn("truncate", collapsed && "lg:sr-only")}>{section.label}</span>
                  </Link>
                );
                return <li key={section.id}>{collapsed ? <Tooltip content={section.label} side="right">{link}</Tooltip> : link}</li>;
              }

              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setManual((prev) => ({ ...prev, [section.id]: !open }))}
                    aria-expanded={open}
                    className={cn(
                      "relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                      sectionActive && !open ? skin.active : skin.item,
                      sectionActive && "text-sidebar-foreground"
                    )}
                  >
                    {sectionActive && !open && <ActiveBar variant={variant} />}
                    <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                    <span className="flex-1 truncate text-left">{section.label}</span>
                    <ChevronDown size={14} className={cn("shrink-0 opacity-60 transition-transform duration-200", open && "rotate-180")} />
                  </button>
                  <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <ul className="min-h-0 overflow-hidden" aria-hidden={!open}>
                      <li className={cn("mt-0.5 mb-1 ml-[18px] border-l pl-2", skin.rule)}>
                        <ul className="flex flex-col gap-px">
                          {section.items.map((item) => {
                            // Item raiz de uma seção (ex.: Painéis > Executivo = /gestao/dashboard)
                            // não pode ficar ativo em todas as subrotas.
                            const exact = section.items.some((other) => other !== item && isPathActive(other.href, item.href) && other.href !== item.href);
                            const active = isPathActive(pathname, item.href, exact);
                            return (
                              <li key={item.href}>
                                <Link
                                  href={item.href}
                                  onClick={onNavigate}
                                  tabIndex={open ? 0 : -1}
                                  aria-current={active ? "page" : undefined}
                                  className={cn(
                                    "flex h-7 items-center rounded-sm px-2 text-sm transition-colors",
                                    active ? skin.active : skin.item
                                  )}
                                >
                                  <span className="truncate">{item.label}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ variant, sections, header, footer, icons, collapsed, onToggleCollapsed, mobileOpen, onMobileOpenChange }: SidebarProps) {
  const skin = SKIN[variant];

  const body = (mobile: boolean) => (
    <>
      <div className={cn("flex h-14 shrink-0 items-center border-b px-3", skin.rule, collapsed && !mobile && "lg:justify-center lg:px-0")}>{header}</div>
      <nav aria-label="Navegação principal" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <NavContent variant={variant} sections={sections} icons={icons} collapsed={collapsed && !mobile} onNavigate={mobile ? () => onMobileOpenChange(false) : undefined} />
      </nav>
      {footer && <div className={cn("shrink-0 border-t px-2 py-2", skin.rule)}>{footer}</div>}
      {!mobile && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn("hidden h-9 shrink-0 items-center gap-2 border-t px-4 text-xs transition-colors lg:flex", skin.rule, skin.item, collapsed && "justify-center px-0")}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          {!collapsed && "Recolher"}
        </button>
      )}
    </>
  );

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 ease-out lg:flex",
          skin.root,
          collapsed ? "w-14" : "w-60"
        )}
      >
        {body(false)}
      </aside>
      <D.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in lg:hidden" />
          <D.Content className={cn("fixed inset-y-0 left-0 z-50 flex w-[min(19rem,86vw)] flex-col border-r shadow-dialog outline-none animate-slide-in-left lg:hidden", skin.root)}>
            <D.Title className="sr-only">Menu</D.Title>
            <D.Description className="sr-only">Navegação do sistema</D.Description>
            <D.Close className={cn("absolute top-3.5 right-3 rounded-md p-1", skin.item)} aria-label="Fechar menu">
              <X size={16} />
            </D.Close>
            {body(true)}
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
