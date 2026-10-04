// Mensagens do banco escritas para o usuário, mas com resíduos técnicos:
// código de status ("status atual: picking"), código de permissão
// ("Permissão negada (sales_orders.reserve)"), UUID de item e números do
// numeric(16,4) ("7.0000"). A API passa toda mensagem de erro por aqui antes
// de responder (src/lib/api/response.ts). Rodada 2 do teste com 48 usuários.
import { ACTION_LABELS, RESOURCE_LABELS, actionLabel, resourceLabel } from "@/lib/permission-labels";
import { STATUS_REGISTRY, statusMeta, type StatusEntity } from "@/lib/status";

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

// Assunto citado na mensagem → entidade do registro de status (mais específico primeiro).
const SUBJECTS: [RegExp, StatusEntity][] = [
  [/pedido de compra/i, "purchase_orders"],
  [/solicitação de compra/i, "purchase_requests"],
  [/cotação/i, "purchase_quotes"],
  [/recebimento de compra/i, "purchase_receipts"],
  [/orçamento/i, "sales_quotes"],
  [/separa(ção|r)|lista de separação/i, "pick_lists"],
  [/expedi(ção|r)|entrega/i, "shipments"],
  [/documento fiscal|nf-e|\bnota\b|documento/i, "fiscal_documents"],
  [/conta a pagar|título a pagar/i, "accounts_payable"],
  [/conta a receber|título a receber|título/i, "accounts_receivable"],
  [/parcela/i, "accounts_payable"],
  [/transferência/i, "stock_transfers"],
  [/inventário|contagem/i, "stock_counts"],
  [/requisição de material/i, "material_requests"],
  [/ordem de produção/i, "production_orders"],
  [/pedido/i, "sales_orders"],
];

const hasCode = (entity: StatusEntity, code: string) =>
  Object.prototype.hasOwnProperty.call(STATUS_REGISTRY[entity], code.trim().toUpperCase());

/** Rótulo da situação: prefere a entidade citada na mensagem que conhece o código. */
function labelFor(message: string, code: string): string {
  const cited = SUBJECTS.map(([re, entity]) => ({ entity, at: message.search(re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.entity);
  const owner =
    cited.find((entity) => hasCode(entity, code)) ??
    (Object.keys(STATUS_REGISTRY) as StatusEntity[]).find((entity) => hasCode(entity, code));
  return statusMeta(owner ?? cited[0], code).label;
}

/** "1234.5000" → "1.234,5"; "7.0000" → "7"; "670.0200" → "670,02". */
export function formatDbQuantity(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function permissionText(code: string): string {
  const dot = code.indexOf(".");
  if (dot < 0) return code;
  // Códigos de 3 partes ("settings.company.update", "controlling.period.manage"):
  // procura a divisão recurso/ação que existe nos dois mapas (R2-23).
  const parts = code.split(".");
  for (let i = 1; i < parts.length; i++) {
    const res = parts.slice(0, i).join("_");
    const act = parts.slice(i).join(".");
    if (RESOURCE_LABELS[res] && ACTION_LABELS[act]) return `${RESOURCE_LABELS[res]} — ${ACTION_LABELS[act]}`;
  }
  const resource = code.slice(0, dot);
  const action = code.slice(dot + 1);
  return `${resourceLabel(resource)} — ${actionLabel(action)}`;
}

export function humanizeErrorMessage(message: string): string {
  if (!message) return message;
  let text = message;

  // Permissão por extenso, sem o código do catálogo.
  text = text.replace(/Permiss(ã|a)o negada \(([a-z0-9_.]+)\)\.?/gi, (_m, _a, code: string) =>
    `Você não tem permissão para esta ação (${permissionText(code)}).`,
  );
  // 403 da própria API: "Você não tem permissão para esta operação (stock.adjust)."
  text = text.replace(/(n(ã|a)o tem permiss(ã|a)o para esta (opera(ç|c)(ã|a)o|a(ç|c)(ã|a)o)) \(([a-z0-9_]+\.[a-z0-9_.]+)\)/gi, (_m, head: string, ...rest: string[]) =>
    `${head} (${permissionText(rest[rest.length - 3])})`,
  );

  // Código de status -> rótulo da tela.
  const subject = text;
  text = text.replace(/\(status atual: ([A-Za-z_]+)\)/g, (_m, code: string) => `(situação atual: ${labelFor(subject, code)})`);
  text = text.replace(/\bno status ([A-Za-z_]+)\b/g, (_m, code: string) => `na situação "${labelFor(subject, code)}"`);

  // "Item <uuid>:" -> sem identificador interno; demais UUIDs também saem.
  text = text.replace(new RegExp(`Item ${UUID.source}:\\s*`, "gi"), "Um item do pedido: ");
  text = text.replace(UUID, "(registro)");

  // numeric(16,4) do banco: 7.0000 -> 7; 670.0200 -> 670,02.
  text = text.replace(/(?<![\d.,])(\d+)\.(\d{4})(?![\d])/g, (_m, i: string, d: string) => formatDbQuantity(`${i}.${d}`));
  // Quantidade inteira grande depois de "solicitado/disponível/reservado"
  // (R2-20: "disponível 2.672 …, solicitado 99999"): mesmo formato.
  text = text.replace(/\b(solicitad[oa]s?|disponíve(?:l|is)|reservad[oa]s?) (\d{4,})(?!\d|[.,]\d)/gi, (_m, word: string, n: string) => `${word} ${formatDbQuantity(n)}`);

  return text;
}
