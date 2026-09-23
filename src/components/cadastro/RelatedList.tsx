import { Link2Off } from "lucide-react";

type RelatedItem = { label: string; sublabel?: string };

// Relacionamentos do registro (ex.: motoristas de uma transportadora).
export function RelatedList({ title, items }: { title: string; items: RelatedItem[] }) {
  return (
    <section>
      <h3 className="mb-2 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">
        {title} <span className="tabular-nums">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-subtle-foreground">
          <Link2Off size={14} aria-hidden />
          Nenhum registro vinculado.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((item, i) => (
            <li key={`${item.label}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate font-medium text-foreground">{item.label}</span>
              {item.sublabel && <span className="shrink-0 text-xs text-subtle-foreground">{item.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
