import type { PageConfig } from "./types";
import { genDocumentosComerciais } from "../mock/generators";

const moduleLabel = "Comercial";
const moduleHref = "/comercial";
const STATUS_OPTIONS = ["Em aberto", "Aprovado", "Faturado", "Concluído", "Cancelado"];

export const comercial: Record<string, PageConfig> = {
  orcamentos: {
    moduleLabel,
    moduleHref,
    pageLabel: "Orçamentos",
    title: "Orçamentos",
    description: "Propostas comerciais em elaboração ou aguardando aprovação do cliente.",
    primaryActionLabel: "Novo orçamento",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "cliente", label: "Cliente", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "cliente", label: "Cliente" },
      { key: "data", label: "Data" },
      { key: "vendedor", label: "Vendedor" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genDocumentosComerciais(201, 18, "ORC"),
  },
  "pedidos-venda": {
    moduleLabel,
    moduleHref,
    pageLabel: "Pedidos de venda",
    title: "Pedidos de venda",
    description: "Pedidos confirmados pelos clientes, em processo de separação e faturamento.",
    primaryActionLabel: "Novo pedido",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "cliente", label: "Cliente", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "cliente", label: "Cliente" },
      { key: "data", label: "Data" },
      { key: "vendedor", label: "Vendedor" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genDocumentosComerciais(202, 20, "PED"),
  },
  faturamento: {
    moduleLabel,
    moduleHref,
    pageLabel: "Faturamento",
    title: "Faturamento",
    description: "Pedidos faturados e documentos gerados a partir das vendas concluídas.",
    primaryActionLabel: "Novo faturamento",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "cliente", label: "Cliente", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "cliente", label: "Cliente" },
      { key: "data", label: "Data" },
      { key: "vendedor", label: "Responsável" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genDocumentosComerciais(203, 16, "FAT"),
  },
};
