import {
  ClipboardList,
  PackageSearch,
  TrendingUp,
  Boxes,
  PackageCheck,
  Truck,
  Wallet,
  CircleDollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { DataTable } from "@/components/ui/DataTable";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { OrdersBarChart } from "@/components/dashboard/OrdersBarChart";
import { StockDonut } from "@/components/dashboard/StockDonut";
import { KPI_DASHBOARD, genAtividadesRecentes } from "@/lib/mock/dashboard";

const ICONS: LucideIcon[] = [
  ClipboardList,
  PackageSearch,
  TrendingUp,
  Boxes,
  PackageCheck,
  Truck,
  Wallet,
  CircleDollarSign,
];

const ACCENTS: Array<"brand" | "success" | "warning" | "info" | "danger"> = [
  "brand",
  "info",
  "success",
  "brand",
  "info",
  "warning",
  "danger",
  "success",
];

export default function DashboardPage() {
  const atividades = genAtividadesRecentes(8);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Visão geral
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Indicadores consolidados da operação. Todos os valores exibidos são simulados para fins
          de demonstração.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPI_DASHBOARD.map((kpi, i) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            change={kpi.change}
            trend={kpi.trend}
            icon={ICONS[i]}
            accent={ACCENTS[i]}
          />
        ))}
      </div>

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
            <h3 className="font-display text-base font-semibold text-ink">Atividades recentes</h3>
            <p className="text-xs text-ink-subtle">Últimas operações registradas nos módulos</p>
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
