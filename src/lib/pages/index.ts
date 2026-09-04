import { cadastros } from "./cadastros";
import { comercial } from "./comercial";
import { suprimentos } from "./suprimentos";
import { logistica } from "./logistica";
import { financeiro } from "./financeiro";
import { fiscal } from "./fiscal";
import { gestao } from "./gestao";
import { configuracoes } from "./configuracoes";
import type { PageConfig } from "./types";

export type { PageConfig } from "./types";

const MODULES: Record<string, Record<string, PageConfig>> = {
  cadastros,
  comercial,
  suprimentos,
  logistica,
  financeiro,
  fiscal,
  gestao,
  configuracoes,
};

export function getPageConfig(moduleSlug: string, pageSlug: string): PageConfig | undefined {
  return MODULES[moduleSlug]?.[pageSlug];
}
