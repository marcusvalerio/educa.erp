"use client";

import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ContextMenu as CM, DropdownMenu as DM } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

// DropdownMenu e ContextMenu com a mesma pele (um único visual de menu).

const contentClass =
  "z-[60] min-w-44 overflow-hidden rounded-lg border border-border bg-surface p-1 text-sm text-foreground shadow-popover animate-pop-in";
const itemClass =
  "relative flex h-8 cursor-default items-center gap-2 rounded-sm px-2 outline-none select-none " +
  "data-[highlighted]:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:shrink-0 [&_svg]:text-subtle-foreground";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;

export const DropdownMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DM.Content>>(
  function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }, ref) {
    return (
      <DM.Portal>
        <DM.Content ref={ref} sideOffset={sideOffset} align={align} collisionPadding={8} className={cn(contentClass, className)} {...props} />
      </DM.Portal>
    );
  }
);

type ItemProps = ComponentPropsWithoutRef<typeof DM.Item> & { tone?: "default" | "danger"; shortcut?: string };

export const DropdownMenuItem = forwardRef<HTMLDivElement, ItemProps>(function DropdownMenuItem(
  { className, tone = "default", shortcut, children, ...props },
  ref
) {
  // Com asChild o Slot do Radix exige um único filho: o atalho não entra.
  return (
    <DM.Item ref={ref} className={cn(itemClass, tone === "danger" && "text-danger-fg [&_svg]:text-danger-fg", className)} {...props}>
      {props.asChild ? (
        children
      ) : (
        <>
          {children}
          {shortcut && <span className="ml-auto pl-4 text-2xs text-subtle-foreground">{shortcut}</span>}
        </>
      )}
    </DM.Item>
  );
});

export const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DM.CheckboxItem>>(
  function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
    return (
      <DM.CheckboxItem ref={ref} className={cn(itemClass, "pl-7", className)} {...props}>
        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
          <DM.ItemIndicator>
            <Check size={14} className="!text-foreground" />
          </DM.ItemIndicator>
        </span>
        {children}
      </DM.CheckboxItem>
    );
  }
);

export const DropdownMenuRadioGroup = DM.RadioGroup;

export const DropdownMenuRadioItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof DM.RadioItem>>(
  function DropdownMenuRadioItem({ className, children, ...props }, ref) {
    return (
      <DM.RadioItem ref={ref} className={cn(itemClass, "pl-7", className)} {...props}>
        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
          <DM.ItemIndicator>
            <span className="block h-1.5 w-1.5 rounded-full bg-foreground" />
          </DM.ItemIndicator>
        </span>
        {children}
      </DM.RadioItem>
    );
  }
);

export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <DM.Label className={cn("px-2 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-subtle-foreground uppercase", className)}>{children}</DM.Label>;
}

export function DropdownMenuSeparator() {
  return <DM.Separator className="-mx-1 my-1 h-px bg-border" />;
}

// ------------------------------------------------------------ ContextMenu
export const ContextMenu = CM.Root;
export const ContextMenuTrigger = CM.Trigger;

export const ContextMenuContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof CM.Content>>(
  function ContextMenuContent({ className, ...props }, ref) {
    return (
      <CM.Portal>
        <CM.Content ref={ref} collisionPadding={8} className={cn(contentClass, className)} {...props} />
      </CM.Portal>
    );
  }
);

export const ContextMenuItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof CM.Item> & { tone?: "default" | "danger" }>(
  function ContextMenuItem({ className, tone = "default", ...props }, ref) {
    return <CM.Item ref={ref} className={cn(itemClass, tone === "danger" && "text-danger-fg", className)} {...props} />;
  }
);

export function ContextMenuSeparator() {
  return <CM.Separator className="-mx-1 my-1 h-px bg-border" />;
}
