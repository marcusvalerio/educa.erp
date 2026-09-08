export function TableSkeleton({ columns = 6, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full min-w-[720px] text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-sunken/50">
            {Array.from({ length: columns }, (_, i) => (
              <th key={i} className="px-4 py-3">
                <span className="animate-skeleton block h-2.5 w-16 rounded bg-border-strong/70" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="border-b border-border last:border-0">
              {Array.from({ length: columns }, (_, c) => (
                <td key={c} className="px-4 py-3.5">
                  <span
                    className="animate-skeleton block h-2.5 rounded bg-border-strong/60"
                    style={{
                      width: c === 0 ? "70%" : `${45 + ((r * 13 + c * 7) % 40)}%`,
                      animationDelay: `${(r * columns + c) * 30}ms`,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
