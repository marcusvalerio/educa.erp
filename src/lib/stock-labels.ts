// Rótulos de exibição das movimentações de estoque. O banco grava códigos
// técnicos (movement_type e reference_type); a tela de Movimentações mostra
// o rótulo e, para um código desconhecido, o próprio código — nunca vazio.

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  RECEIPT: "Entrada",
  ISSUE: "Saída",
  TRANSFER_IN: "Transferência (entrada)",
  TRANSFER_OUT: "Transferência (saída)",
  ADJUSTMENT_IN: "Ajuste (+)",
  ADJUSTMENT_OUT: "Ajuste (−)",
  RETURN_IN: "Devolução (entrada)",
  RETURN_OUT: "Devolução (saída)",
  PRODUCTION_IN: "Produção (entrada)",
  PRODUCTION_OUT: "Produção (consumo)",
  SCRAP: "Refugo",
  RESERVATION: "Reserva",
  RELEASE: "Liberação de reserva",
};

// Chaves em minúsculas: o banco usa as duas grafias (ex.: PURCHASE_RECEIPT
// e stock_reservation, MANUAL e manual).
const REFERENCE_TYPE_LABELS: Record<string, string> = {
  purchase_receipt: "Recebimento de compra",
  stock_reservation: "Reserva de pedido",
  stock_transfer: "Transferência entre locais",
  stock_adjustment: "Ajuste de estoque",
  stock_count: "Contagem de inventário",
  shipment: "Expedição",
  sales_order: "Pedido de venda",
  material_request: "Requisição de material",
  production_order: "Ordem de produção",
  production_scrap: "Refugo de produção",
  maintenance_order: "Ordem de manutenção",
  quality_inspection: "Inspeção de qualidade",
  manual: "Lançamento avulso",
};

export function movementTypeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return MOVEMENT_TYPE_LABELS[code] ?? code;
}

export function referenceTypeLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return REFERENCE_TYPE_LABELS[code.toLowerCase()] ?? code;
}

export const MOVEMENT_TYPE_OPTIONS: [string, string][] = Object.entries(MOVEMENT_TYPE_LABELS);
