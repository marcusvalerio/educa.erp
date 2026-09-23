"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Popover as P } from "radix-ui";
import { cn } from "@/lib/cn";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export const PopoverContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof P.Content>>(function PopoverContent(
  { className, align = "start", sideOffset = 6, ...props },
  ref
) {
  return (
    <P.Portal>
      <P.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-[60] rounded-lg border border-border bg-surface p-3 text-sm text-foreground shadow-popover outline-none animate-pop-in",
          className
        )}
        {...props}
      />
    </P.Portal>
  );
});
