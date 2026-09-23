"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Command as C } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

// Base de busca por teclado (cmdk): usada pelo Command Menu (Ctrl/⌘+K) e
// pelo Combobox. Uma única pele para as duas.

export const Command = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof C>>(function Command({ className, ...props }, ref) {
  return <C ref={ref} className={cn("flex h-full w-full flex-col overflow-hidden text-foreground", className)} {...props} />;
});

export const CommandInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof C.Input>>(function CommandInput(
  { className, ...props },
  ref
) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3">
      <Search size={15} className="shrink-0 text-subtle-foreground" aria-hidden />
      <C.Input
        ref={ref}
        className={cn("h-11 w-full bg-transparent text-sm outline-none placeholder:text-subtle-foreground", className)}
        {...props}
      />
    </div>
  );
});

export const CommandList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof C.List>>(function CommandList(
  { className, ...props },
  ref
) {
  return <C.List ref={ref} className={cn("max-h-[min(420px,60dvh)] overflow-y-auto overscroll-contain p-1", className)} {...props} />;
});

export const CommandEmpty = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof C.Empty>>(function CommandEmpty(props, ref) {
  return <C.Empty ref={ref} className="py-8 text-center text-sm text-muted-foreground" {...props} />;
});

export const CommandGroup = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof C.Group>>(function CommandGroup(
  { className, ...props },
  ref
) {
  return (
    <C.Group
      ref={ref}
      className={cn(
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs",
        "[&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle-foreground [&_[cmdk-group-heading]]:uppercase",
        className
      )}
      {...props}
    />
  );
});

export const CommandItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof C.Item>>(function CommandItem(
  { className, ...props },
  ref
) {
  return (
    <C.Item
      ref={ref}
      className={cn(
        "flex h-9 cursor-default items-center gap-2.5 rounded-sm px-2 text-sm outline-none select-none",
        "data-[selected=true]:bg-surface-hover data-[disabled=true]:opacity-45 [&_svg]:shrink-0 [&_svg]:text-subtle-foreground",
        className
      )}
      {...props}
    />
  );
});

export const CommandSeparator = C.Separator;
