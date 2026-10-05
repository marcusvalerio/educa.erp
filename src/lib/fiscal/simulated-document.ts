// Dados do documento fiscal SIMULADO (tela /fiscal/notas-fiscais/:id/documento-simulado).
// Montado pela API a partir do documento, do estabelecimento, do parceiro
// (cliente na saída, fornecedor na entrada), dos itens, impostos e eventos.

export type SimulatedParty = {
  name: string | null;
  document: string | null;
  stateRegistration: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
};

export type SimulatedItem = {
  id: string;
  description: string | null;
  ncmCode: string | null;
  cfopCode: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
};

export type SimulatedTax = { taxType: string; base: number; rate: number; amount: number };

export type SimulatedEvent = { type: string; message: string | null; protocol: string | null; at: string };

export type SimulatedDocumentPayload = {
  id: string;
  code: string;
  type: string;
  model: string | null;
  series: string | null;
  number: number | null;
  direction: "ENTRADA" | "SAIDA";
  status: string;
  environment: string;
  issueDate: string | null;
  accessKey: string | null;
  protocol: string | null;
  authorizedAt: string | null;
  simulated: boolean;
  operationNature: string | null;
  issuer: SimulatedParty;
  /** Destinatário (cliente) na saída; remetente (fornecedor) na entrada. */
  partner: SimulatedParty & { role: "destinatario" | "remetente" };
  items: SimulatedItem[];
  taxes: SimulatedTax[];
  totals: { products: number; discount: number; freight: number; insurance: number; other: number; taxes: number; total: number };
  events: SimulatedEvent[];
  sourceType: string | null;
  sourceCode: string | null;
};

/**
 * Texto da "Origem" no documento simulado. Sem permissão para ler o
 * recebimento/pedido o código vem nulo: antes a tela mostrava "—", como se o
 * documento não tivesse origem (R2-25). Agora diz o tipo e por que o código
 * não aparece, sem revelá-lo.
 */
export function simulatedOriginLabel(sourceType: string | null | undefined, sourceCode: string | null | undefined): string {
  if (!sourceType) return "—";
  const [label, area] = sourceType === "purchase_receipt" ? ["Recebimento de compra", "Recebimentos"] : sourceType === "sales_order" ? ["Pedido de venda", "Pedidos de venda"] : ["Documento de origem", "o documento de origem"];
  return sourceCode ? `${label} ${sourceCode}` : `${label} (código visível só para quem acessa ${area})`;
}
