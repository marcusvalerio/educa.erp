import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { formatCurrencyBRL, formatDate, formatDateTime } from "@/lib/format";
import { isOverdue } from "@/lib/list/query";
import { statusMeta, statusOptions, type StatusEntity } from "@/lib/status";
import type { ColumnDef, FilterDef } from "./types";

// Fábricas de coluna/filtro: cada tela declara O QUE mostrar; o COMO
// (alinhamento, dígitos tabulares, badge de status, CSV) é padronizado.

type Row = Record<string, unknown>;
type Opts<T> = Partial<Omit<ColumnDef<T>, "id" | "header">>;

const get = (row: Row, key: string) => row[key];

export function textCol<T extends Row>(key: string, header: string, opts: Opts<T> = {}): ColumnDef<T> {
  return { id: key, header, value: (row) => get(row, key), serverSortKey: key, ...opts };
}

export function codeCol<T extends Row>(key: string, header = "Código", opts: Opts<T> = {}): ColumnDef<T> {
  return { id: key, header, value: (row) => get(row, key), mono: true, mobile: "title", serverSortKey: key, width: "8rem", ...opts };
}

export function dateCol<T extends Row>(key: string, header: string, opts: Opts<T> & { overdueWhen?: (row: T) => boolean } = {}): ColumnDef<T> {
  const { overdueWhen, ...rest } = opts;
  return {
    id: key,
    header,
    value: (row) => get(row, key),
    exportValue: (row) => formatDate(get(row, key) as string | null),
    cell: (row) => {
      const value = get(row, key) as string | null;
      const late = overdueWhen ? overdueWhen(row) : false;
      return <span className={late ? "font-medium text-danger-fg" : undefined}>{formatDate(value)}</span>;
    },
    serverSortKey: key,
    width: "7.5rem",
    ...rest,
  };
}

export function dateTimeCol<T extends Row>(key: string, header: string, opts: Opts<T> = {}): ColumnDef<T> {
  return {
    id: key,
    header,
    value: (row) => get(row, key),
    exportValue: (row) => formatDateTime(get(row, key) as string | null),
    cell: (row) => formatDateTime(get(row, key) as string | null),
    serverSortKey: key,
    width: "9.5rem",
    ...opts,
  };
}

export function moneyCol<T extends Row>(key: string, header: string, opts: Opts<T> = {}): ColumnDef<T> {
  return {
    id: key,
    header,
    align: "right",
    value: (row) => Number(get(row, key) ?? 0),
    exportValue: (row) => (get(row, key) === null || get(row, key) === undefined ? "" : Number(get(row, key)).toFixed(2).replace(".", ",")),
    cell: (row) => formatCurrencyBRL(get(row, key) === null || get(row, key) === undefined ? null : Number(get(row, key))),
    serverSortKey: key,
    width: "8.5rem",
    ...opts,
  };
}

export function numberCol<T extends Row>(key: string, header: string, opts: Opts<T> & { digits?: number } = {}): ColumnDef<T> {
  const { digits = 2, ...rest } = opts;
  return {
    id: key,
    header,
    align: "right",
    value: (row) => (get(row, key) === null || get(row, key) === undefined ? null : Number(get(row, key))),
    cell: (row) => {
      const v = get(row, key);
      return v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: digits });
    },
    serverSortKey: key,
    width: "7rem",
    ...rest,
  };
}

export function statusCol<T extends Row>(entity: StatusEntity | undefined, key = "status", header = "Status", opts: Opts<T> = {}): ColumnDef<T> {
  return {
    id: key,
    header,
    value: (row) => get(row, key),
    exportValue: (row) => statusMeta(entity, get(row, key) as string).label,
    cell: (row) => <StatusBadge entity={entity} status={get(row, key) as string} />,
    mobile: "badge",
    serverSortKey: key,
    width: "10rem",
    ...opts,
  };
}

export function refCol<T extends Row>(key: string, header: string, lookup: Map<string, string>, opts: Opts<T> = {}): ColumnDef<T> {
  const label = (row: T) => {
    const id = get(row, key) as string | null;
    if (!id) return null;
    return lookup.get(id) ?? null;
  };
  return {
    id: key,
    header,
    value: (row) => label(row) ?? "",
    exportValue: (row) => label(row) ?? "",
    cell: (row) => {
      const id = get(row, key) as string | null;
      if (!id) return "—";
      const name = lookup.get(id);
      // Sem o nome resolvido (sem permissão no cadastro ou ainda carregando):
      // mostra um identificador curto, nunca um nome inventado.
      return name ?? <span className="code text-xs text-subtle-foreground">{id.slice(0, 8)}</span>;
    },
    ...opts,
  };
}

export function boolCol<T extends Row>(key: string, header: string, labels: [string, string] = ["Sim", "Não"], opts: Opts<T> = {}): ColumnDef<T> {
  return {
    id: key,
    header,
    value: (row) => (get(row, key) ? labels[0] : labels[1]),
    cell: (row) => (get(row, key) ? <Badge tone="neutral">{labels[0]}</Badge> : <span className="text-subtle-foreground">{labels[1]}</span>),
    width: "6rem",
    ...opts,
  };
}

// ------------------------------------------------------------ filtros
export function statusFilter<T extends Row>(entity: StatusEntity, key = "status", opts: { server?: boolean; label?: string } = {}): FilterDef<T> {
  return {
    id: key,
    label: opts.label ?? "Status",
    options: statusOptions(entity),
    serverParam: opts.server ? key : undefined,
    predicate: (row, value) => String(get(row, key) ?? "").toUpperCase() === value.toUpperCase(),
  };
}

/** Visão "vencidos/atrasados": data passada e status ainda em aberto. */
export function overdueView<T extends Row>(dateKey: string, openStatuses: string[], label = "Atrasados"): FilterDef<T> {
  const open = new Set(openStatuses.map((s) => s.toUpperCase()));
  return {
    id: "view",
    label: "Visão",
    kind: "view",
    options: [{ value: "atrasados", label }],
    predicate: (row, value) =>
      value === "atrasados" && open.has(String(get(row, "status") ?? "").toUpperCase()) && isOverdue(get(row, dateKey) as string | null),
  };
}

export function isRowOverdue(row: Row, dateKey: string, openStatuses: string[]): boolean {
  const open = new Set(openStatuses.map((s) => s.toUpperCase()));
  return open.has(String(row.status ?? "").toUpperCase()) && isOverdue(row[dateKey] as string | null);
}

export function enumFilter<T extends Row>(
  key: string,
  label: string,
  options: Array<[string, string]>,
  opts: { server?: string } = {}
): FilterDef<T> {
  return {
    id: key,
    label,
    options: options.map(([value, text]) => ({ value, label: text })),
    serverParam: opts.server,
    predicate: (row, value) => String(get(row, key) ?? "").toUpperCase() === value.toUpperCase(),
  };
}

/** Visões por conjunto de status (ex.: "Em aberto" = OPEN + IN_ANALYSIS). */
export function statusViews<T extends Row>(views: Array<{ value: string; label: string; statuses: string[] }>): FilterDef<T> {
  return {
    id: "view",
    label: "Visão",
    kind: "view",
    options: views.map((v) => ({ value: v.value, label: v.label })),
    predicate: (row, value) => {
      const view = views.find((v) => v.value === value);
      if (!view) return true;
      return view.statuses.map((s) => s.toUpperCase()).includes(String(get(row, "status") ?? "").toUpperCase());
    },
  };
}

/** Combina várias visões num único seletor (atraso + conjuntos de status). */
export function combineViews<T extends Row>(...defs: FilterDef<T>[]): FilterDef<T> {
  return {
    id: "view",
    label: "Visão",
    kind: "view",
    options: defs.flatMap((d) => d.options),
    predicate: (row, value) => {
      const owner = defs.find((d) => d.options.some((o) => o.value === value));
      return owner?.predicate ? owner.predicate(row, value) : true;
    },
  };
}
