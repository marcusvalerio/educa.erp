import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";

export type AuditRow = {
  id: string;
  actor_label: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Diferença campo a campo de um evento de auditoria (antes -> depois).
export function AuditDiff({ row }: { row: AuditRow }) {
  const keys = Array.from(new Set([...Object.keys(row.old_data ?? {}), ...Object.keys(row.new_data ?? {})])).sort();
  const changed = keys.filter((key) => show(row.old_data?.[key]) !== show(row.new_data?.[key]));
  return (
    <section className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Data</dt>
          <dd className="tabular-nums">{formatDateTime(row.created_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Registro</dt>
          <dd className="code text-xs break-all">{row.entity_id ?? "—"}</dd>
        </div>
      </dl>
      <h3 className="text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Alterações</h3>
      {changed.length === 0 ? (
        <p className="text-sm text-subtle-foreground">Sem diferença de campos registrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted text-left text-2xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="px-3 py-2 font-medium">Campo</th>
                <th scope="col" className="px-3 py-2 font-medium">Antes</th>
                <th scope="col" className="px-3 py-2 font-medium">Depois</th>
              </tr>
            </thead>
            <tbody>
              {changed.map((key) => (
                <tr key={key} className="border-t border-border align-top">
                  <td className="code px-3 py-2 text-xs">{key}</td>
                  <td className={cn("px-3 py-2 break-all text-muted-foreground")}>{show(row.old_data?.[key])}</td>
                  <td className="px-3 py-2 break-all">{show(row.new_data?.[key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
