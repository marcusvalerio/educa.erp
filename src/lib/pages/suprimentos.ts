import type { PageConfig } from "./types";
import { genDocumentosCompra, genAgendamentos } from "../mock/generators";

const moduleLabel = "Suprimentos";
const moduleHref = "/suprimentos";
const STATUS_OPTIONS = ["Em cotação", "Aprovado", "Enviado", "Recebido", "Cancelado"];

export const suprimentos: Record<string, PageConfig> = {
  "solicitacao-compra": {
    moduleLabel,
    moduleHref,
    pageLabel: "Solicitação de compra",
    title: "Solicitação de compra",
    description: "Solicitações internas de compra encaminhadas pelas áreas da empresa.",
    primaryActionLabel: "Nova solicitação",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "fornecedor", label: "Fornecedor sugerido", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "fornecedor", label: "Fornecedor sugerido" },
      { key: "data", label: "Data" },
      { key: "comprador", label: "Solicitante" },
      { key: "valor", label: "Valor estimado", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genDocumentosCompra(301, 16, "SOL"),
  },
  cotacoes: {
    moduleLabel,
    moduleHref,
    pageLabel: "Cotações",
    title: "Cotações",
    description: "Cotações de preços enviadas a fornecedores para comparação e aprovação.",
    primaryActionLabel: "Nova cotação",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "fornecedor", label: "Fornecedor", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "data", label: "Data" },
      { key: "comprador", label: "Comprador" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genDocumentosCompra(302, 18, "COT"),
  },
  "pedidos-compra": {
    moduleLabel,
    moduleHref,
    pageLabel: "Pedidos de compra",
    title: "Pedidos de compra",
    description: "Pedidos de compra formalizados e enviados aos fornecedores selecionados.",
    primaryActionLabel: "Novo pedido de compra",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "fornecedor", label: "Fornecedor", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "data", label: "Data" },
      { key: "comprador", label: "Comprador" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genDocumentosCompra(303, 18, "PC"),
  },
  agendamentos: {
    moduleLabel,
    moduleHref,
    pageLabel: "Agendamentos",
    title: "Agendamento de entrega",
    description: "Janelas de recebimento agendadas com fornecedores e transportadoras.",
    primaryActionLabel: "Novo agendamento",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "fornecedor", label: "Fornecedor", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Confirmado", "Aguardando confirmação", "Reagendado", "Concluído"] },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "fornecedor", label: "Fornecedor" },
      { key: "transportadora", label: "Transportadora" },
      { key: "dataPrevista", label: "Data prevista" },
      { key: "janela", label: "Janela" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genAgendamentos(304),
  },
};
