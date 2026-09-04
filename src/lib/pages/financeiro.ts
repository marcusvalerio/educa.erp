import type { PageConfig } from "./types";
import { genFinanceiro } from "../mock/generators";
import { CENTROS_CUSTO } from "../mock/pools";

const moduleLabel = "Financeiro";
const moduleHref = "/financeiro";
const STATUS_OPTIONS = ["Em aberto", "Pago", "Vencido", "Agendado"];

export const financeiro: Record<string, PageConfig> = {
  "contas-pagar": {
    moduleLabel,
    moduleHref,
    pageLabel: "Contas a pagar",
    title: "Contas a pagar",
    description: "Obrigações financeiras da empresa junto a fornecedores e prestadores.",
    primaryActionLabel: "Nova conta a pagar",
    filters: [
      { key: "documento", label: "Documento", type: "text" },
      { key: "favorecido", label: "Favorecido", type: "text" },
      { key: "centroCusto", label: "Centro de custo", type: "select", options: [...CENTROS_CUSTO] },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "documento", label: "Documento" },
      { key: "favorecido", label: "Favorecido" },
      { key: "vencimento", label: "Vencimento" },
      { key: "centroCusto", label: "Centro de custo" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genFinanceiro(501, 20, "CP"),
  },
  "contas-receber": {
    moduleLabel,
    moduleHref,
    pageLabel: "Contas a receber",
    title: "Contas a receber",
    description: "Valores a receber de clientes referentes a vendas e serviços faturados.",
    primaryActionLabel: "Nova conta a receber",
    filters: [
      { key: "documento", label: "Documento", type: "text" },
      { key: "favorecido", label: "Cliente", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "documento", label: "Documento" },
      { key: "favorecido", label: "Cliente" },
      { key: "vencimento", label: "Vencimento" },
      { key: "centroCusto", label: "Centro de custo" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genFinanceiro(502, 20, "CR"),
  },
  "fluxo-caixa": {
    moduleLabel,
    moduleHref,
    pageLabel: "Fluxo de caixa",
    title: "Fluxo de caixa",
    description: "Movimentações financeiras consolidadas de entradas e saídas de caixa.",
    primaryActionLabel: "Novo lançamento",
    filters: [
      { key: "documento", label: "Documento", type: "text" },
      { key: "favorecido", label: "Favorecido", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "documento", label: "Lançamento" },
      { key: "favorecido", label: "Favorecido" },
      { key: "vencimento", label: "Data" },
      { key: "centroCusto", label: "Centro de custo" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genFinanceiro(503, 18, "FC"),
  },
  "centro-custos": {
    moduleLabel,
    moduleHref,
    pageLabel: "Centro de custos",
    title: "Centro de custos",
    description: "Estrutura de centros de custo utilizada para apuração e rateio de despesas.",
    primaryActionLabel: "Novo centro de custo",
    filters: [
      { key: "favorecido", label: "Responsável", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    ],
    columns: [
      { key: "documento", label: "Código" },
      { key: "favorecido", label: "Responsável" },
      { key: "centroCusto", label: "Centro de custo" },
      { key: "valor", label: "Orçamento mensal", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genFinanceiro(504, 12, "CC"),
  },
};
