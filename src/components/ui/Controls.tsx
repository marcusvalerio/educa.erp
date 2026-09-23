"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Avatar as Av, Checkbox as CB, Select as S, Separator as Sep, Switch as Sw } from "radix-ui";
import { Check, ChevronDown, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { fieldBase } from "./Input";

// ------------------------------------------------------------ Select
// Select nativo-equivalente (Radix): teclado, typeahead, leitor de tela.

export type SelectOption = { value: string; label: string; disabled?: boolean; hint?: string };

type SelectProps = {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
  "aria-describedby"?: string;
};

// Radix Select não aceita value "" — "limpar" usa um sentinela interno.
const NONE = "__none__";

export function Select({ value, onValueChange, options, placeholder = "Selecione", disabled, invalid, id, className, size = "md", ...aria }: SelectProps) {
  return (
    <S.Root value={value ? value : undefined} onValueChange={(v) => onValueChange(v === NONE ? "" : v)} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        className={cn(fieldBase, "flex items-center justify-between gap-2 px-2.5 text-left", size === "sm" ? "h-7 text-xs" : "h-8", className)}
      >
        <span className="truncate data-[placeholder]:text-subtle-foreground">
          <S.Value placeholder={<span className="text-subtle-foreground">{placeholder}</span>} />
        </span>
        <S.Icon>
          <ChevronDown size={14} className="text-subtle-foreground" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface shadow-popover animate-pop-in"
        >
          <S.Viewport className="p-1">
            {options.map((option) => (
              <S.Item
                key={option.value || NONE}
                value={option.value || NONE}
                disabled={option.disabled}
                className="relative flex h-8 cursor-default items-center gap-2 rounded-sm pr-2 pl-7 text-sm outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface-hover"
              >
                <S.ItemIndicator className="absolute left-2">
                  <Check size={14} />
                </S.ItemIndicator>
                <S.ItemText>{option.label}</S.ItemText>
                {option.hint && <span className="ml-auto text-2xs text-subtle-foreground">{option.hint}</span>}
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

// ------------------------------------------------------------ Checkbox
export const Checkbox = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof CB.Root>>(function Checkbox(
  { className, checked, ...props },
  ref
) {
  return (
    <CB.Root
      ref={ref}
      checked={checked}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border border-border-strong bg-surface",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "disabled:opacity-45",
        className
      )}
      {...props}
    >
      <CB.Indicator>{checked === "indeterminate" ? <Minus size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}</CB.Indicator>
    </CB.Root>
  );
});

// ------------------------------------------------------------ Switch
export const Switch = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof Sw.Root>>(function Switch({ className, ...props }, ref) {
  return (
    <Sw.Root
      ref={ref}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-border-strong transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-[state=checked]:bg-primary disabled:opacity-45",
        className
      )}
      {...props}
    >
      <Sw.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-surface shadow-popover transition-transform data-[state=checked]:translate-x-[18px]" />
    </Sw.Root>
  );
});

// ------------------------------------------------------------ Avatar
export function Avatar({ name, initials, className, tone = "default" }: { name: string; initials: string; className?: string; tone?: "default" | "platform" }) {
  return (
    <Av.Root
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xs font-semibold select-none",
        tone === "platform" ? "bg-platform-accent text-platform-foreground" : "bg-muted text-foreground",
        className
      )}
      aria-label={name}
    >
      <Av.Fallback delayMs={0}>{initials}</Av.Fallback>
    </Av.Root>
  );
}

export function Separator({ orientation = "horizontal", className }: { orientation?: "horizontal" | "vertical"; className?: string }) {
  return (
    <Sep.Root
      orientation={orientation}
      className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
    />
  );
}

// ------------------------------------------------------------ Segmented
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "sm",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode }>;
  label: string;
  size?: "xs" | "sm";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-surface-muted p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm font-medium transition-colors",
              size === "xs" ? "h-6 px-2 text-2xs" : "h-7 px-2.5 text-xs",
              active ? "bg-surface text-foreground shadow-[0_0_0_1px_var(--color-border)]" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
