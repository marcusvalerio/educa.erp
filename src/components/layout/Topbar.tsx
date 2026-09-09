"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, Bell, ChevronDown, LogOut, Settings, UserCircle } from "lucide-react";
import clsx from "clsx";
import { Dropdown } from "@/components/ui/Dropdown";
import { NAV, childHref } from "@/lib/nav";

type SearchHit = { label: string; moduleLabel: string; href: string };

const SEARCH_INDEX: SearchHit[] = NAV.flatMap((mod) =>
  mod.children.map((child) => ({ label: child.label, moduleLabel: mod.label, href: childHref(mod, child) }))
);

type Notification = {
  id: string;
  title: string;
  description: string;
  time: string;
  read: boolean;
};

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    title: "CNH próxima do vencimento",
    description: "Motorista com CNH vencendo em 12 dias — revise o cadastro.",
    time: "há 12 min",
    read: false,
  },
  {
    id: "n2",
    title: "Novo fornecedor cadastrado",
    description: "Um fornecedor foi adicionado e está pendente de revisão.",
    time: "há 1 h",
    read: false,
  },
  {
    id: "n3",
    title: "Estoque baixo",
    description: "Um item de estoque atingiu o ponto de reposição.",
    time: "ontem",
    read: true,
  },
];

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const inputRef = useRef<HTMLInputElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(
      (item) => item.label.toLowerCase().includes(q) || item.moduleLabel.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  const searchOpen = searchFocused && query.trim().length > 0;

  function goToResult(href: string) {
    setQuery("");
    setSearchFocused(false);
    inputRef.current?.blur();
    router.push(href);
  }

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

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
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              inputRef.current?.blur();
            } else if (e.key === "Enter" && results[0]) {
              goToResult(results[0].href);
            }
          }}
          placeholder="Buscar em todo o sistema..."
          role="combobox"
          aria-expanded={searchOpen}
          aria-controls="global-search-results"
          className="w-full rounded-lg border border-transparent bg-surface-hover/70 py-2 pr-3 pl-9 text-[13px] text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-brand/40 focus:bg-surface focus:outline-none focus:ring-[3px] focus:ring-brand/12"
        />
        {searchOpen && (
          <div
            id="global-search-results"
            role="listbox"
            className="animate-scale-in absolute top-[calc(100%+8px)] left-0 z-40 w-full min-w-[18rem] origin-top rounded-[10px] border border-border bg-surface p-1.5 shadow-elevated"
          >
            {results.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">
                Nenhuma página encontrada para “{query}”.
              </p>
            ) : (
              results.map((hit) => (
                // onMouseDown (não onClick) evita a corrida com o onBlur do input.
                <button
                  key={hit.href}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    goToResult(hit.href);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left text-[13px] text-ink transition-colors duration-100 hover:bg-surface-hover"
                >
                  <span className="font-medium">{hit.label}</span>
                  <span className="text-[11.5px] text-ink-subtle">{hit.moduleLabel}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Dropdown
          align="right"
          trigger={({ toggle }) => (
            <button
              aria-label="Notificações"
              onClick={toggle}
              className="relative rounded-md p-2 text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink active:scale-95"
            >
              <Bell size={18} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full bg-brand ring-2 ring-surface" />
              )}
            </button>
          )}
        >
          {() => (
            <div className="w-80">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-[13px] font-semibold text-ink">Notificações</p>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[12px] font-medium text-brand transition-colors duration-150 hover:text-brand-hover"
                  >
                    Marcar como lidas
                  </button>
                )}
              </div>
              <ul className="max-h-80 overflow-y-auto py-1">
                {notifications.map((n) => (
                  <li key={n.id} className="border-b border-border last:border-0">
                    <div className="flex gap-2.5 px-4 py-3">
                      <span
                        className={clsx(
                          "mt-1.5 h-[6px] w-[6px] shrink-0 rounded-full",
                          n.read ? "bg-transparent" : "bg-brand"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-ink">{n.title}</p>
                        <p className="mt-0.5 text-[12px] text-ink-subtle">{n.description}</p>
                        <p className="mt-1 text-[11px] text-ink-subtle/80">{n.time}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Dropdown>

        <div className="mx-1.5 h-6 w-px bg-border" />

        <Dropdown
          align="right"
          trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              className={clsx(
                "flex items-center gap-2 rounded-lg py-1 pr-2 pl-1.5 transition-colors duration-150 hover:bg-surface-hover",
                open && "bg-surface-hover"
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink">
                AR
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-[13px] font-medium text-ink">Ana Ribeiro</span>
                <span className="block text-[11.5px] text-ink-subtle">Administradora</span>
              </span>
              <ChevronDown
                size={14}
                strokeWidth={2}
                className={clsx("hidden text-ink-subtle transition-transform duration-150 sm:block", open && "rotate-180")}
              />
            </button>
          )}
        >
          {(close) => (
            <div className="w-56 p-1.5">
              <div className="px-3 py-2">
                <p className="text-[13px] font-medium text-ink">Ana Ribeiro</p>
                <p className="text-[12px] text-ink-subtle">ana.ribeiro@astraerp.com.br</p>
              </div>
              <div className="my-1 h-px bg-border" />
              <Link
                href="/configuracoes/empresa"
                onClick={close}
                className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] text-ink transition-colors duration-100 hover:bg-surface-hover"
              >
                <UserCircle size={16} strokeWidth={1.75} className="text-ink-subtle" />
                Minha conta
              </Link>
              <Link
                href="/configuracoes/aparencia"
                onClick={close}
                className="flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] text-ink transition-colors duration-100 hover:bg-surface-hover"
              >
                <Settings size={16} strokeWidth={1.75} className="text-ink-subtle" />
                Preferências
              </Link>
              <div className="my-1 h-px bg-border" />
              <button
                disabled
                title="Autenticação ainda não implementada no ASTRA.ERP"
                className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] text-ink-subtle/60 cursor-not-allowed"
              >
                <LogOut size={16} strokeWidth={1.75} />
                Sair
              </button>
            </div>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
