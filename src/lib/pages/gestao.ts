import type { PageConfig } from "./types";
import { genRelatorios, genAuditoria } from "../mock/generators";

const moduleLabel = "Gestão";
const moduleHref = "/gestao";

const KPI_ROWS = [
  { indicador: "OTIF (On Time In Full)", valorAtual: "94,2%", meta: "95%", tendencia: "Estável", status: "Atenção" },
  { indicador: "Giro de estoque", valorAtual: "6,8x", meta: "7x", tendencia: "Alta", status: "Ativo" },
  { indicador: "Ticket médio de vendas", valorAtual: "R$ 4.280,00", meta: "R$ 4.000,00", tendencia: "Alta", status: "Ativo" },
  { indicador: "Custo logístico / faturamento", valorAtual: "8,4%", meta: "8%", tendencia: "Queda", status: "Atenção" },
  { indicador: "Acuracidade de inventário", valorAtual: "98,1%", meta: "99%", tendencia: "Estável", status: "Ativo" },
  { indicador: "Prazo médio de entrega", valorAtual: "3,4 dias", meta: "3 dias", tendencia: "Estável", status: "Atenção" },
  { indicador: "Inadimplência", valorAtual: "2,1%", meta: "2%", tendencia: "Queda", status: "Ativo" },
];

export const gestao: Record<string, PageConfig> = {
  kpis: {
    moduleLabel,
    moduleHref,
    pageLabel: "KPIs",
    title: "KPIs",
    description: "Indicadores-chave de desempenho consolidados das áreas comercial, logística e financeira.",
    primaryActionLabel: "Novo indicador",
    filters: [
      { key: "indicador", label: "Indicador", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Ativo", "Atenção"] },
    ],
    columns: [
      { key: "indicador", label: "Indicador" },
      { key: "valorAtual", label: "Valor atual", align: "right" },
      { key: "meta", label: "Meta", align: "right" },
      { key: "tendencia", label: "Tendência", align: "center" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: KPI_ROWS,
  },
  relatorios: {
    moduleLabel,
    moduleHref,
    pageLabel: "Relatórios",
    title: "Relatórios",
    description: "Relatórios gerenciais disponíveis para exportação e análise das operações.",
    primaryActionLabel: "Gerar relatório",
    filters: [
      { key: "relatorio", label: "Relatório", type: "text" },
      { key: "categoria", label: "Categoria", type: "select", options: ["Comercial", "Logística", "Financeiro", "Suprimentos", "Gestão"] },
      { key: "status", label: "Status", type: "select", options: ["Disponível", "Processando"] },
    ],
    columns: [
      { key: "codigo", label: "Código" },
      { key: "relatorio", label: "Relatório" },
      { key: "categoria", label: "Categoria" },
      { key: "geradoEm", label: "Gerado em" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genRelatorios(701),
  },
  // "dashboard" foi removido deste config (Fase 19): a tela em
  // src/app/gestao/dashboard/page.tsx agora é um componente dedicado
  // que busca dados REAIS de fn_report_executive via /api/reports/
  // executive, nunca mais o KPI_ROWS fabricado que vivia aqui.
  auditoria: {
    moduleLabel,
    moduleHref,
    pageLabel: "Auditoria",
    title: "Auditoria",
    description: "Histórico de operações e ações realizadas pelos usuários no sistema.",
    primaryActionLabel: "Exportar auditoria",
    filters: [
      { key: "usuario", label: "Usuário", type: "text" },
      { key: "modulo", label: "Módulo", type: "select", options: ["Comercial", "Suprimentos", "Logística", "Financeiro", "Fiscal", "Cadastros"] },
      { key: "status", label: "Status", type: "select", options: ["Concluído", "Falhou"] },
    ],
    columns: [
      { key: "codigo", label: "Código" },
      { key: "usuario", label: "Usuário" },
      { key: "acao", label: "Ação" },
      { key: "modulo", label: "Módulo" },
      { key: "data", label: "Data" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genAuditoria(702),
  },
};
