import { Link2Off } from "lucide-react";

type RelatedItem = {
  label: string;
  sublabel?: string;
};

export function RelatedList({ title, items }: { title: string; items: RelatedItem[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">
        {title} <span className="text-ink-subtle/70">({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-ink-subtle">
          <Link2Off size={14} />
          Nenhum registro vinculado.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-hover/50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-ink">{item.label}</span>
              {item.sublabel && <span className="text-xs text-ink-subtle">{item.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
