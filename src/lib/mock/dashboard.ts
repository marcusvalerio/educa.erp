import { seededRandom, int, code, pick, formatDate, recentDate } from "./rng";
import { EMPRESAS, PESSOAS } from "./pools";

export const MESES = ["Abr", "Mai", "Jun", "Jul", "Ago", "Set"];

const rnd = seededRandom(9001);

export const receitaMensal = MESES.map((mes) => ({
  mes,
  vendas: int(rnd, 380, 620) * 1000,
  compras: int(rnd, 210, 400) * 1000,
}));

export const pedidosPorStatus = [
  { status: "Em aberto", total: int(rnd, 30, 60) },
  { status: "Em separação", total: int(rnd, 20, 45) },
  { status: "Faturado", total: int(rnd, 60, 110) },
  { status: "Concluído", total: int(rnd, 140, 220) },
  { status: "Cancelado", total: int(rnd, 5, 18) },
];

export const estoquePorCategoria = [
  { categoria: "Matéria-prima", valor: 32 },
  { categoria: "Componentes", valor: 24 },
  { categoria: "Embalagens", valor: 16 },
  { categoria: "EPI", valor: 12 },
  { categoria: "Ferramentas", valor: 9 },
  { categoria: "Outros", valor: 7 },
];

export const KPI_DASHBOARD = [
  { label: "Pedidos no mês", value: "428", change: "+8,4%", trend: "up" as const },
  { label: "Compras no mês", value: "R$ 312.400,00", change: "+3,1%", trend: "up" as const },
  { label: "Vendas no mês", value: "R$ 587.900,00", change: "+11,6%", trend: "up" as const },
  { label: "Itens em estoque", value: "48.230", change: "-2,3%", trend: "down" as const },
  { label: "Recebimentos hoje", value: "14", change: "+2", trend: "up" as const },
  { label: "Expedições hoje", value: "21", change: "-1", trend: "down" as const },
  { label: "Contas a pagar", value: "R$ 154.230,00", change: "+5,2%", trend: "down" as const },
  { label: "Contas a receber", value: "R$ 289.610,00", change: "+9,4%", trend: "up" as const },
];

export function genAtividadesRecentes(n = 8) {
  const r = seededRandom(9002);
  const acoes = [
    { texto: "Pedido de venda faturado", modulo: "Comercial" },
    { texto: "Recebimento conferido no CD São Paulo", modulo: "Logística" },
    { texto: "Cotação aprovada", modulo: "Suprimentos" },
    { texto: "Conta a pagar liquidada", modulo: "Financeiro" },
    { texto: "NF-e autorizada", modulo: "Fiscal" },
    { texto: "Expedição concluída", modulo: "Logística" },
    { texto: "Novo cliente cadastrado", modulo: "Cadastros" },
    { texto: "Inventário com divergência identificada", modulo: "Logística" },
  ];
  return Array.from({ length: n }, (_, i) => {
    const a = acoes[i % acoes.length];
    return {
      codigo: code("AT", 100 + i, 3),
      descricao: a.texto,
      modulo: a.modulo,
      responsavel: pick(r, PESSOAS),
      referencia: pick(r, EMPRESAS),
      data: formatDate(recentDate(r, 6)),
    };
  });
}
