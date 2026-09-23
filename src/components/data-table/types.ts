import type { ReactNode } from "react";

export type ColumnDef<T> = {
  id: string;
  header: string;
  /** Valor bruto (busca, ordenação, CSV). */
  value?: (row: T) => unknown;
  /** Renderização da célula; padrão = value formatado como texto. */
  cell?: (row: T) => ReactNode;
  /** Texto para CSV quando difere do valor bruto (ex.: nome do cliente). */
  exportValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** Campo aceito pela API em ?sort= (modo servidor). Ausente = ordena só localmente. */
  serverSortKey?: string;
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Largura mínima/fixa (ex.: "7rem"). */
  width?: string;
  /** Destaque da linha no mobile: title = título do card, meta = linha secundária. */
  mobile?: "title" | "meta" | "badge" | "hidden";
  /** Aparece em fonte mono (códigos, documentos). */
  mono?: boolean;
};

export type FilterDef<T> = {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Nome do parâmetro aceito pela API (filtro no servidor). */
  serverParam?: string;
  /** Filtro local, quando a API não filtra (ou em modo cliente). */
  predicate?: (row: T, value: string) => boolean;
  /** Visões de trabalho (drill-down): ex. "atrasados". Exibidas como abas rápidas. */
  kind?: "select" | "view";
};

export type Density = "compact" | "comfortable";
