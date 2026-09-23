import { inRange, type DateRange } from "./periods";

// Fluxos do ERP para o diagrama Sankey (lógica pura, testada).
// Cada registro do período é contado UMA vez por estágio — o fluxo
// conserva volume (o que entra num nó sai dele), então o desenho nunca
// "cria" registros. Tons: neutro por padrão; perigo só onde há perda
// (cancelado/falha/refugo).

export type FlowNode = { name: string; tone?: "neutral" | "success" | "warning" | "danger"; href?: string };
export type FlowLink = { source: number; target: number; value: number };
export type Flow = { nodes: FlowNode[]; links: FlowLink[]; total: number };

type AnyRow = Record<string, unknown>;

const up = (v: unknown) => String(v ?? "").toLowerCase();

function build(nodes: FlowNode[], raw: Array<[number, number, number]>): Flow {
  const links = raw.filter(([, , value]) => value > 0).map(([source, target, value]) => ({ source, target, value }));
  // Remove nós sem nenhuma ligação (sem volume no período).
  const used = new Set(links.flatMap((l) => [l.source, l.target]));
  const map = new Map<number, number>();
  const kept: FlowNode[] = [];
  nodes.forEach((node, index) => {
    if (used.has(index)) {
      map.set(index, kept.length);
      kept.push(node);
    }
  });
  const total = raw.filter(([s]) => s === 0).reduce((acc, [, , v]) => acc + v, 0);
  return { nodes: kept, links: links.map((l) => ({ source: map.get(l.source)!, target: map.get(l.target)!, value: l.value })), total };
}

/** Pedido de venda -> situação atual -> entrega. */
export function buildOrderToDeliveryFlow(orders: AnyRow[], shipments: AnyRow[], range: DateRange): Flow {
  const inPeriod = orders.filter((o) => inRange(o.order_date as string, range));
  const delivered = new Set(
    shipments.filter((s) => ["delivered", "completed"].includes(up(s.status))).map((s) => String(s.sales_order_id))
  );
  const count = (statuses: string[]) => inPeriod.filter((o) => statuses.includes(up(o.status)));
  const approval = count(["draft", "pending_approval"]);
  const preparing = count(["approved", "reservation_pending", "reserved", "picking", "ready_to_ship"]);
  const shipped = count(["partially_shipped", "shipped", "completed"]);
  const cancelled = count(["cancelled"]);
  const shippedDelivered = shipped.filter((o) => delivered.has(String(o.id))).length;
  const nodes: FlowNode[] = [
    { name: "Pedidos do período", href: "/comercial/pedidos-venda" },
    { name: "Em aprovação", tone: "warning", href: "/comercial/pedidos-venda?view=aprovacao" },
    { name: "Em preparação", href: "/comercial/pedidos-venda?view=em-andamento" },
    { name: "Expedidos", href: "/logistica/expedicao" },
    { name: "Cancelados", tone: "danger", href: "/comercial/pedidos-venda?status=cancelled" },
    { name: "Entregues", tone: "success", href: "/logistica/transportes?view=entregues" },
    { name: "A caminho / sem baixa", href: "/logistica/transportes?view=transito" },
  ];
  return build(nodes, [
    [0, 1, approval.length],
    [0, 2, preparing.length],
    [0, 3, shipped.length],
    [0, 4, cancelled.length],
    [3, 5, shippedDelivered],
    [3, 6, shipped.length - shippedDelivered],
  ]);
}

/** Pedido de compra -> situação -> recebimento confirmado. */
export function buildProcureToReceiveFlow(orders: AnyRow[], receipts: AnyRow[], range: DateRange): Flow {
  const inPeriod = orders.filter((o) => inRange((o.issued_at ?? o.created_at) as string, range));
  const confirmed = new Set(receipts.filter((r) => up(r.status) === "confirmed").map((r) => String(r.purchase_order_id)));
  const count = (statuses: string[]) => inPeriod.filter((o) => statuses.includes(up(o.status)));
  const approval = count(["draft", "pending_approval"]);
  const open = count(["approved", "sent"]);
  const received = count(["partially_received", "received", "closed"]);
  const cancelled = count(["cancelled"]);
  const receivedConfirmed = received.filter((o) => confirmed.has(String(o.id))).length;
  const nodes: FlowNode[] = [
    { name: "Pedidos de compra", href: "/suprimentos/pedidos-compra" },
    { name: "Em aprovação", tone: "warning", href: "/suprimentos/pedidos-compra?view=aprovacao" },
    { name: "Aguardando fornecedor", href: "/suprimentos/pedidos-compra?status=sent" },
    { name: "Recebidos", href: "/logistica/recebimento" },
    { name: "Cancelados", tone: "danger", href: "/suprimentos/pedidos-compra?status=cancelled" },
    { name: "Entrada confirmada", tone: "success", href: "/logistica/recebimento?status=confirmed" },
    { name: "Em conferência", tone: "warning", href: "/logistica/recebimento?view=conferencia" },
  ];
  return build(nodes, [
    [0, 1, approval.length],
    [0, 2, open.length],
    [0, 3, received.length],
    [0, 4, cancelled.length],
    [3, 5, receivedConfirmed],
    [3, 6, received.length - receivedConfirmed],
  ]);
}

/** Ordem de produção -> situação -> resultado. */
export function buildProductionFlow(orders: AnyRow[], range: DateRange): Flow {
  const inPeriod = orders.filter((o) => inRange((o.planned_date ?? o.created_at) as string, range));
  const count = (statuses: string[]) => inPeriod.filter((o) => statuses.includes(up(o.status)));
  const planned = count(["draft", "planned", "released", "materials_reserved"]);
  const running = count(["in_progress", "on_hold"]);
  const done = count(["completed"]);
  const cancelled = count(["cancelled"]);
  const withScrap = done.filter((o) => Number(o.rejected_quantity) > 0).length;
  const nodes: FlowNode[] = [
    { name: "Ordens de produção", href: "/producao/ordens" },
    { name: "Planejadas", href: "/producao/ordens?status=planned" },
    { name: "Em produção", href: "/producao/ordens?view=producao" },
    { name: "Concluídas", href: "/producao/ordens?status=completed" },
    { name: "Canceladas", tone: "danger", href: "/producao/ordens?status=cancelled" },
    { name: "Sem refugo", tone: "success" },
    { name: "Com refugo", tone: "danger" },
  ];
  return build(nodes, [
    [0, 1, planned.length],
    [0, 2, running.length],
    [0, 3, done.length],
    [0, 4, cancelled.length],
    [3, 5, done.length - withScrap],
    [3, 6, withScrap],
  ]);
}
