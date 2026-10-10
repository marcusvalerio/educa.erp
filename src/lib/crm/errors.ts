import { statusMeta, type StatusEntity } from "@/lib/status";

// Erros das funções SQL do CRM (0055, 0089) traduzidos para a resposta da API.
//
// Antes, só "permissão negada", "não encontrado" e "inválido/transição" eram
// reconhecidos pelo texto; as regras de estado (errcode P0001) e os
// parâmetros inválidos (22023) caíam no erro genérico 500 "Não foi possível
// concluir a operação" — o usuário não sabia o que fazer. A classificação é
// pelo código do PostgreSQL; a mensagem do banco (em português) é mantida,
// sem nome de função e sem código de situação.

export type CrmRpcFailure = { code: string; status: 403 | 404 | 409 | 422 | null; message: string };

const ENTITY_BY_HINT: [RegExp, StatusEntity][] = [
  [/oportunidade/i, "opportunities"],
  [/orçamento/i, "sales_quotes"],
  [/pedido/i, "sales_orders"],
  [/lead/i, "leads"],
];

/** "(status atual: WON)" → "(situação atual: Ganha)"; remove o nome de função "(fn_…)". */
export function crmUserMessage(message: string): string {
  const entity = ENTITY_BY_HINT.find(([re]) => re.test(message))?.[1];
  return message
    .replace(/\s*\((fn_[a-z_]+)\)/g, "")
    .replace(/\(status atual: ([A-Za-z_]+)\)/g, (_m, code: string) => `(situação atual: ${entity ? statusMeta(entity, code.toUpperCase()).label : code})`)
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function classifyCrmRpcError(error: { message?: string; code?: string }): CrmRpcFailure {
  const raw = error.message ?? "";
  const message = crmUserMessage(raw);
  switch (error.code) {
    case "42501":
      return { code: "FORBIDDEN", status: 403, message };
    case "P0002":
      return { code: "NOT_FOUND", status: 404, message };
    case "22023":
      return { code: "VALIDATION_ERROR", status: 422, message };
    case "23503":
      // FK composta (pipeline/estágio/lead de outra empresa ou inexistente).
      return { code: "INVALID_REFERENCE", status: 422, message: "Um dos registros informados não existe nesta empresa (pipeline, estágio, cliente, produto ou lead)." };
    case "P0001":
      // Regra de estado: conflito com a situação atual (409) ou dado que falta (422).
      return /status atual|já |aprovad|encerrad|fechad/i.test(raw)
        ? { code: "INVALID_STATUS_TRANSITION", status: 409, message }
        : { code: "BUSINESS_RULE", status: 422, message };
  }
  const lower = raw.toLowerCase();
  if (lower.includes("permissão negada")) return { code: "FORBIDDEN", status: 403, message };
  if (lower.includes("não encontrad")) return { code: "NOT_FOUND", status: 404, message };
  if (lower.includes("inválid") || lower.includes("transição")) return { code: "INVALID_STATUS_TRANSITION", status: 409, message };
  return { code: "DATABASE_ERROR", status: null, message };
}
