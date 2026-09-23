"use client";

import { useRouter } from "next/navigation";
import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { Flow, FlowNode } from "@/lib/dashboard/flows";

// Diagrama de fluxo nativo (Sankey) dos processos do ERP. Nós neutros;
// perda (cancelado/falha/refugo) em tom de problema, conclusão em sucesso.
// Clicar num nó leva à lista correspondente (drill-down).

const TONE_FILL: Record<NonNullable<FlowNode["tone"]>, string> = {
  neutral: "var(--color-chart-1)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

type NodeRenderProps = { x: number; y: number; width: number; height: number; index: number; payload: FlowNode & { value: number } };

export function FlowSankey({ flow, height = 260 }: { flow: Flow; height?: number }) {
  const router = useRouter();
  const data = { nodes: flow.nodes.map((n) => ({ ...n })), links: flow.links.map((l) => ({ ...l })) };

  function NodeShape({ x, y, width, height: h, payload }: NodeRenderProps) {
    const isRight = x > 240;
    const tone = payload.tone ?? "neutral";
    return (
      <Layer>
        <Rectangle
          x={x}
          y={y}
          width={width}
          height={Math.max(h, 2)}
          radius={2}
          fill={TONE_FILL[tone]}
          style={{ cursor: payload.href ? "pointer" : "default" }}
          onClick={() => payload.href && router.push(payload.href)}
        />
        <text
          x={isRight ? x - 6 : x + width + 6}
          y={y + h / 2}
          textAnchor={isRight ? "end" : "start"}
          dominantBaseline="middle"
          className="fill-foreground text-xs"
          style={{ cursor: payload.href ? "pointer" : "default" }}
          onClick={() => payload.href && router.push(payload.href)}
        >
          {payload.name}
          <tspan className="fill-muted-foreground" dx={6} fontWeight={600}>
            {Number(payload.value).toLocaleString("pt-BR")}
          </tspan>
        </text>
      </Layer>
    );
  }

  const summary = flow.links
    .map((l) => `${flow.nodes[l.source]?.name} → ${flow.nodes[l.target]?.name}: ${l.value}`)
    .join("; ");

  return (
    <div style={{ height }} role="img" aria-label={`Fluxo: ${summary}`}>
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={data}
          nodeWidth={10}
          nodePadding={18}
          linkCurvature={0.5}
          iterations={32}
          margin={{ top: 8, right: 150, bottom: 8, left: 8 }}
          node={(props: NodeRenderProps) => <NodeShape {...props} />}
          link={{ stroke: "var(--color-chart-2)", strokeOpacity: 0.28 }}
        >
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              return (
                <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-popover">
                  <span className="text-muted-foreground">{String(item.name ?? "")}</span>{" "}
                  <span className="font-semibold text-foreground tabular-nums">{Number(item.value).toLocaleString("pt-BR")}</span>
                </div>
              );
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
