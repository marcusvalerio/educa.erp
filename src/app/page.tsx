import { ClipboardList, PackageSearch, TrendingUp, Boxes, PackageCheck, Truck, Wallet, CircleDollarSign } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { DataTable } from "@/components/ui/DataTable";
import { HeroStat } from "@/components/dashboard/HeroStat";
import { StatStrip, type StatStripItem } from "@/components/dashboard/StatStrip";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { OrdersBarChart } from "@/components/dashboard/OrdersBarChart";
import { StockDonut } from "@/components/dashboard/StockDonut";
import { KPI_DASHBOARD, genAtividadesRecentes } from "@/lib/mock/dashboard";

const [pedidos, compras, vendas, estoque, recebimentos, expedicoes, contasPagar, contasReceber] = KPI_DASHBOARD;

const secondaryStats: { kpi: (typeof KPI_DASHBOARD)[number]; icon: typeof ClipboardList; accent: "brand" | "success" | "warning" | "info" | "danger" }[] = [
  { kpi: pedidos, icon: ClipboardList, accent: "brand" },
  { kpi: compras, icon: PackageSearch, accent: "info" },
  { kpi: estoque, icon: Boxes, accent: "brand" },
];

const stripItems: StatStripItem[] = [
  { label: recebimentos.label, value: recebimentos.value, change: recebimentos.change, trend: recebimentos.trend, icon: PackageCheck },
  { label: expedicoes.label, value: expedicoes.value, change: expedicoes.change, trend: expedicoes.trend, icon: Truck },
  { label: contasPagar.label, value: contasPagar.value, change: contasPagar.change, trend: contasPagar.trend, icon: Wallet },
  { label: contasReceber.label, value: contasReceber.value, change: contasReceber.change, trend: contasReceber.trend, icon: CircleDollarSign },
];

export default function DashboardPage() {
  const atividades = genAtividadesRecentes(8);

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up">
      <div>
        <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">
          Visão geral
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          Indicadores consolidados da operação. Todos os valores exibidos são simulados para fins
          de demonstração.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <HeroStat
            label={vendas.label}
            value={vendas.value}
            change={vendas.change}
            trend={vendas.trend}
            icon={<TrendingUp size={20} strokeWidth={1.75} />}
            caption="vs. mês anterior"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:col-span-7">
          {secondaryStats.map(({ kpi, icon, accent }) => (
            <StatCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              change={kpi.change}
              trend={kpi.trend}
              icon={icon}
              accent={accent}
            />
          ))}
        </div>
      </div>

      <StatStrip items={stripItems} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueChart />
        </div>
        <StockDonut />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <OrdersBarChart />
        </div>
        <div className="flex flex-col gap-3 xl:col-span-2">
          <div>
            <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Atividades recentes</h3>
            <p className="text-[12px] text-ink-subtle">Últimas operações registradas nos módulos</p>
          </div>
          <DataTable
            columns={[
              { key: "descricao", label: "Atividade" },
              { key: "modulo", label: "Módulo" },
              { key: "responsavel", label: "Responsável" },
              { key: "data", label: "Data", align: "right" },
            ]}
            rows={atividades}
          />
        </div>
      </div>
    </div>
  );
}
