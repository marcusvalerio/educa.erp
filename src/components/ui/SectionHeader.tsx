import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeader({ eyebrow, title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">{eyebrow}</p>
        )}
        <h3 className="font-display mt-0.5 text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-[12px] text-ink-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}
