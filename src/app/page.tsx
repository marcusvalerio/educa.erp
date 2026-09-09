import { ClipboardList, PackageSearch, TrendingUp, Boxes, PackageCheck, Truck, Wallet, CircleDollarSign, FlaskConical } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { HeroStat } from "@/components/dashboard/HeroStat";
import { StatStrip, type StatStripItem } from "@/components/dashboard/StatStrip";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { OrdersBarChart } from "@/components/dashboard/OrdersBarChart";
import { StockDonut } from "@/components/dashboard/StockDonut";
import { KPI_DASHBOARD, genAtividadesRecentes } from "@/lib/mock/dashboard";

const [pedidos, compras, vendas, estoque, recebimentos, expedicoes, contasPagar, contasReceber] = KPI_DASHBOARD;

const secondaryItems: StatStripItem[] = [
  { label: pedidos.label, value: pedidos.value, change: pedidos.change, trend: pedidos.trend, icon: ClipboardList },
  { label: compras.label, value: compras.value, change: compras.change, trend: compras.trend, icon: PackageSearch },
  { label: estoque.label, value: estoque.value, change: estoque.change, trend: estoque.trend, icon: Boxes },
  { label: recebimentos.label, value: recebimentos.value, change: recebimentos.change, trend: recebimentos.trend, icon: PackageCheck },
  { label: expedicoes.label, value: expedicoes.value, change: expedicoes.change, trend: expedicoes.trend, icon: Truck },
  { label: contasPagar.label, value: contasPagar.value, change: contasPagar.change, trend: contasPagar.trend, icon: Wallet },
  { label: contasReceber.label, value: contasReceber.value, change: contasReceber.change, trend: contasReceber.trend, icon: CircleDollarSign },
];

export default function DashboardPage() {
  const atividades = genAtividadesRecentes(8);

  return (
    <div className="flex flex-col gap-7 animate-fade-in-up">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">
            Visão geral
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">
            Indicadores consolidados da operação — atualizado agora.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1.5 text-[11.5px] font-medium text-ink-subtle">
          <FlaskConical size={13} strokeWidth={1.75} />
          Dados simulados
        </span>
      </div>

      {/* Indicadores principais: uma métrica em destaque + as demais como
          parte de um único painel (sem repetir borda/sombra por item). */}
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
        <div className="xl:col-span-7">
          <StatStrip items={secondaryItems} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader
          eyebrow="Situação operacional"
          title="Desempenho financeiro e de estoque"
          description="Comparativo dos últimos 6 meses e distribuição atual do estoque"
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <RevenueChart />
          </div>
          <StockDonut />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader
          eyebrow="Atividade recente"
          title="Pedidos por status e últimas movimentações"
          description="Panorama do fluxo comercial e histórico das operações mais recentes"
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <OrdersBarChart />
          </div>
          <div className="xl:col-span-2">
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
    </div>
  );
}
