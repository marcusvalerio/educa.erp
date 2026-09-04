import type { Row } from "../mock/generators";

export type ColumnAlign = "left" | "right" | "center";

export type ColumnConfig = {
  key: string;
  label: string;
  render?: "status" | "text";
  align?: ColumnAlign;
};

export type FilterConfig =
  | { key: string; label: string; type: "text"; placeholder?: string }
  | { key: string; label: string; type: "select"; options: string[] };

export type PageConfig = {
  moduleLabel: string;
  moduleHref: string;
  pageLabel: string;
  title: string;
  description: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  filters: FilterConfig[];
  columns: ColumnConfig[];
  rows: Row[];
  emptyHint?: string;
};
