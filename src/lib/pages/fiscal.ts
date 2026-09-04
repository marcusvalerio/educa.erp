import type { PageConfig } from "./types";
import { genFiscalDocs, genNcm, genCfop, genImpostos } from "../mock/generators";

const moduleLabel = "Fiscal";
const moduleHref = "/fiscal";
const STATUS_FISCAL = ["Autorizada", "Pendente", "Cancelada", "Rejeitada"];

export const fiscal: Record<string, PageConfig> = {
  "notas-fiscais": {
    moduleLabel,
    moduleHref,
    pageLabel: "Notas fiscais",
    title: "Notas fiscais",
    description: "Documentos fiscais emitidos e recebidos nas operações da empresa (dados simulados).",
    primaryActionLabel: "Nova nota fiscal",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "destinatario", label: "Destinatário", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_FISCAL },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "serie", label: "Série", align: "center" },
      { key: "destinatario", label: "Destinatário" },
      { key: "data", label: "Data" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genFiscalDocs(601, 20, "NF"),
  },
  nfe: {
    moduleLabel,
    moduleHref,
    pageLabel: "NF-e",
    title: "NF-e",
    description: "Notas fiscais eletrônicas simuladas — a emissão real será integrada em fase futura.",
    primaryActionLabel: "Nova NF-e",
    filters: [
      { key: "numero", label: "Número", type: "text" },
      { key: "destinatario", label: "Destinatário", type: "text" },
      { key: "status", label: "Status", type: "select", options: STATUS_FISCAL },
    ],
    columns: [
      { key: "numero", label: "Número" },
      { key: "serie", label: "Série", align: "center" },
      { key: "destinatario", label: "Destinatário" },
      { key: "data", label: "Data de emissão" },
      { key: "valor", label: "Valor", align: "right" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genFiscalDocs(602, 18, "NFE"),
  },
  ncm: {
    moduleLabel,
    moduleHref,
    pageLabel: "NCM",
    title: "NCM",
    description: "Tabela de classificação fiscal de mercadorias utilizada nos cadastros de produtos.",
    primaryActionLabel: "Novo NCM",
    filters: [
      { key: "codigo", label: "Código", type: "text" },
      { key: "descricao", label: "Descrição", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Ativo", "Revisão pendente"] },
    ],
    columns: [
      { key: "codigo", label: "Código" },
      { key: "descricao", label: "Descrição" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genNcm(),
  },
  cfop: {
    moduleLabel,
    moduleHref,
    pageLabel: "CFOP",
    title: "CFOP",
    description: "Códigos fiscais de operações e prestações utilizados na emissão de documentos.",
    primaryActionLabel: "Novo CFOP",
    filters: [
      { key: "codigo", label: "Código", type: "text" },
      { key: "tipo", label: "Tipo", type: "select", options: ["Entrada", "Saída"] },
      { key: "status", label: "Status", type: "select", options: ["Ativo", "Revisão pendente"] },
    ],
    columns: [
      { key: "codigo", label: "Código" },
      { key: "descricao", label: "Descrição" },
      { key: "tipo", label: "Tipo" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genCfop(),
  },
  impostos: {
    moduleLabel,
    moduleHref,
    pageLabel: "Impostos",
    title: "Impostos",
    description: "Tributos e alíquotas padrão configurados para as operações fiscais simuladas.",
    primaryActionLabel: "Novo imposto",
    filters: [
      { key: "imposto", label: "Imposto", type: "text" },
      { key: "esfera", label: "Esfera", type: "select", options: ["Federal", "Estadual", "Municipal"] },
    ],
    columns: [
      { key: "imposto", label: "Imposto" },
      { key: "aliquotaPadrao", label: "Alíquota padrão", align: "right" },
      { key: "esfera", label: "Esfera" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genImpostos(),
  },
};
