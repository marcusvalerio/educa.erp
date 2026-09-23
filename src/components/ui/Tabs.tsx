"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Accordion as A, Tabs as T } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

// Abas de linha (sublinhado), roláveis horizontalmente no mobile.
export const Tabs = T.Root;

export const TabsList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof T.List>>(function TabsList(
  { className, ...props },
  ref
) {
  return (
    <T.List
      ref={ref}
      className={cn("flex h-9 items-end gap-4 overflow-x-auto border-b border-border [scrollbar-width:none]", className)}
      {...props}
    />
  );
});

export const TabsTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof T.Trigger>>(function TabsTrigger(
  { className, ...props },
  ref
) {
  return (
    <T.Trigger
      ref={ref}
      className={cn(
        "relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground",
        "transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        "data-[state=active]:border-foreground data-[state=active]:text-foreground",
        className
      )}
      {...props}
    />
  );
});

export const TabsContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof T.Content>>(function TabsContent(
  { className, ...props },
  ref
) {
  return <T.Content ref={ref} className={cn("pt-4 outline-none", className)} {...props} />;
});

// ------------------------------------------------------------ Accordion
export const Accordion = A.Root;

export const AccordionItem = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof A.Item>>(function AccordionItem(
  { className, ...props },
  ref
) {
  return <A.Item ref={ref} className={cn("border-b border-border last:border-b-0", className)} {...props} />;
});

export const AccordionTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof A.Trigger>>(
  function AccordionTrigger({ className, children, ...props }, ref) {
    return (
      <A.Header className="flex">
        <A.Trigger
          ref={ref}
          className={cn(
            "group flex flex-1 items-center justify-between gap-2 py-2.5 text-left text-sm font-medium text-foreground",
            "hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            className
          )}
          {...props}
        >
          {children}
          <ChevronDown size={15} className="shrink-0 text-subtle-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </A.Trigger>
      </A.Header>
    );
  }
);

export const AccordionContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof A.Content>>(
  function AccordionContent({ className, children, ...props }, ref) {
    return (
      <A.Content ref={ref} className="overflow-hidden text-sm" {...props}>
        <div className={cn("pb-3", className)}>{children}</div>
      </A.Content>
    );
  }
);
