"use client";

import type { ReactNode } from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/cn";

export const TooltipProvider = T.Provider;

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  disabled?: boolean;
  className?: string;
};

export function Tooltip({ content, children, side = "top", align = "center", disabled, className }: TooltipProps) {
  if (disabled || !content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "z-[70] max-w-xs rounded-sm bg-foreground px-2 py-1 text-xs text-background shadow-popover animate-fade-in",
            className
          )}
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
