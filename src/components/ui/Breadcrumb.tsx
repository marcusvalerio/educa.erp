import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

export type Crumb = {
  label: string;
  href?: string;
};

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-ink-subtle">
      <Link href="/" className="flex items-center gap-1 transition-colors duration-150 hover:text-ink">
        <Home size={13} strokeWidth={1.75} />
      </Link>
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          <ChevronRight size={13} strokeWidth={1.75} className="text-ink-subtle/60" />
          {item.href ? (
            <Link href={item.href} className="transition-colors duration-150 hover:text-ink">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-ink-muted">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
