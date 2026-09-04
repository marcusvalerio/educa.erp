import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";

type ModuleLandingProps = {
  label: string;
  description: string;
  items: { label: string; href: string; description: string }[];
};

export function ModuleLanding({ label, description, items }: ModuleLandingProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label }]} />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {label}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="group flex h-full flex-col justify-between gap-4 p-5 transition-colors hover:border-brand/40 hover:bg-brand-soft/30">
              <div>
                <h3 className="font-display text-base font-semibold text-ink">{item.label}</h3>
                <p className="mt-1.5 text-sm text-ink-muted">{item.description}</p>
              </div>
              <span className="flex items-center gap-1 text-sm font-medium text-brand">
                Acessar
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
