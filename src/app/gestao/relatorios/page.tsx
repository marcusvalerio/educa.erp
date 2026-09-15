"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BarChart3, Boxes, ClipboardList, Factory, Landmark, ReceiptText, ShoppingCart, Truck } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";

// Fase 19 — hub de relatórios: cada card leva a um dashboard real,
// sobre as funções de BI já existentes (fn_report_*, Fase 12, e
// fn_controlling_kpis, Fase 11) — nenhum link leva a uma tela vazia.
const REPORTS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/gestao/dashboard", label: "Executivo", description: "Visão consolidada da empresa no mês em curso.", icon: BarChart3 },
  { href: "/gestao/kpis", label: "KPIs gerenciais", description: "Margem, resultado, caixa e inadimplência.", icon: Landmark },
  { href: "/gestao/dashboard/comercial", label: "Comercial", description: "Pedidos, faturamento, clientes e conversão.", icon: ShoppingCart },
  { href: "/gestao/dashboard/estoque", label: "Estoque", description: "Saldo valorizado e movimentação do mês.", icon: Boxes },
  { href: "/gestao/dashboard/compras", label: "Compras", description: "Solicitações, pedidos e recebimentos.", icon: ClipboardList },
  { href: "/gestao/dashboard/producao", label: "Produção", description: "Ordens, quantidade produzida e refugo.", icon: Factory },
  { href: "/gestao/dashboard/logistica", label: "Logística", description: "Expedições, entregas e lead time.", icon: Truck },
  { href: "/financeiro/fluxo-caixa", label: "Financeiro", description: "Saldo, projeção e liquidações.", icon: Landmark },
  { href: "/gestao/dashboard/fiscal", label: "Fiscal", description: "Documentos, autorizações e impostos.", icon: ReceiptText },
];

export default function RelatoriosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "Gestão", href: "/gestao" }, { label: "Relatórios" }]} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">Relatórios</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">
            Relatórios gerenciais com dados reais, organizados por área da operação.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link key={report.href} href={report.href}>
              <Card className="group flex h-full flex-col gap-3 p-5 transition-shadow duration-150 hover:shadow-raised">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-brand-soft text-brand-ink">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <ArrowRight size={16} className="text-ink-subtle transition-transform duration-150 group-hover:translate-x-0.5" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{report.label}</p>
                  <p className="mt-1 text-[12.5px] text-ink-subtle">{report.description}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
