"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { ArrowRight, Building2, Landmark, Monitor, Moon, Sun } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/Command";
import { Kbd } from "@/components/ui/Feedback";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { NavSection } from "@/lib/nav";

// Command Menu (Ctrl/⌘+K): navegação por teclado entre as páginas que o
// usuário PODE acessar (a lista chega já filtrada por permissão) e ações
// de ambiente (trocar de área administrativa, tema). Não busca registros
// de negócio: isso fica nas listas, que já usam a busca das próprias APIs.

type CommandMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: NavSection[];
  environmentLinks?: Array<{ label: string; href: string; kind: "erp" | "admin" | "platform" }>;
};

export function CommandMenu({ open, onOpenChange, sections, environmentLinks = [] }: CommandMenuProps) {
  const router = useRouter();
  const { setPreference } = useTheme();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const groups = useMemo(
    () =>
      sections.map((section) => ({
        section,
        items: section.items.length > 0 ? section.items : [{ label: section.label, href: section.href, keywords: [] as string[] }],
      })),
    [sections]
  );

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[70] bg-overlay animate-fade-in" />
        <D.Content className="fixed top-[12dvh] left-1/2 z-[70] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-dialog outline-none animate-pop-in">
          <D.Title className="sr-only">Ir para</D.Title>
          <D.Description className="sr-only">Busque uma página ou ação pelo nome.</D.Description>
          <Command loop>
            <CommandInput placeholder="Ir para página, módulo ou ação..." autoFocus />
            <CommandList>
              <CommandEmpty>Nada encontrado com esse termo.</CommandEmpty>
              {groups.map(({ section, items }) => {
                const Icon = section.icon;
                return (
                  <CommandGroup key={section.id} heading={section.label}>
                    {items.map((item) => (
                      <CommandItem
                        key={item.href}
                        value={`${section.label} ${item.label} ${(item.keywords ?? []).join(" ")} ${item.href}`}
                        onSelect={() => go(item.href)}
                      >
                        <Icon size={15} />
                        <span className="truncate">{item.label}</span>
                        <span className="ml-auto truncate font-mono text-2xs text-subtle-foreground">{item.href}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
              {environmentLinks.length > 0 && (
                <>
                  <CommandSeparator className="my-1 h-px bg-border" />
                  <CommandGroup heading="Ambientes">
                    {environmentLinks.map((link) => (
                      <CommandItem key={link.href} value={`ambiente ${link.label}`} onSelect={() => go(link.href)}>
                        {link.kind === "platform" ? <Landmark size={15} /> : link.kind === "admin" ? <Building2 size={15} /> : <ArrowRight size={15} />}
                        {link.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              <CommandSeparator className="my-1 h-px bg-border" />
              <CommandGroup heading="Aparência">
                <CommandItem value="tema claro light" onSelect={() => { setPreference("light"); onOpenChange(false); }}>
                  <Sun size={15} /> Tema claro
                </CommandItem>
                <CommandItem value="tema escuro dark" onSelect={() => { setPreference("dark"); onOpenChange(false); }}>
                  <Moon size={15} /> Tema escuro
                </CommandItem>
                <CommandItem value="tema sistema system" onSelect={() => { setPreference("system"); onOpenChange(false); }}>
                  <Monitor size={15} /> Seguir o sistema
                </CommandItem>
              </CommandGroup>
            </CommandList>
            <div className="flex items-center justify-end gap-3 border-t border-border px-3 py-2 text-2xs text-subtle-foreground">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
              <span className="flex items-center gap-1"><Kbd>Enter</Kbd> abrir</span>
              <span className="flex items-center gap-1"><Kbd>Esc</Kbd> fechar</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
