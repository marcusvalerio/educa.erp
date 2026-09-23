"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { fieldBase } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./Command";
import type { SelectOption } from "./Controls";

// Seleção com busca para listas longas (clientes, produtos, setores...).
type ComboboxProps = {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
};

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado.",
  disabled,
  invalid,
  clearable = true,
  id,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          aria-describedby={aria["aria-describedby"]}
          disabled={disabled}
          className={cn(fieldBase, "flex h-8 items-center justify-between gap-2 px-2.5 text-left", className)}
        >
          <span className={cn("truncate", !selected && "text-subtle-foreground")}>{selected?.label ?? placeholder}</span>
          <span className="flex items-center gap-1">
            {clearable && selected && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Limpar seleção"
                onClick={(event) => {
                  event.stopPropagation();
                  onValueChange("");
                }}
                className="rounded-xs p-0.5 text-subtle-foreground hover:text-foreground"
              >
                <X size={12} />
              </span>
            )}
            <ChevronsUpDown size={14} className="text-subtle-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.hint ?? ""} ${option.value}`}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check size={14} className={cn(option.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option.label}</span>
                  {option.hint && <span className="ml-auto text-2xs text-subtle-foreground">{option.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
