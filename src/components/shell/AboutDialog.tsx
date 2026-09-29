"use client";

import { Dialog } from "@/components/ui/Dialog";
import { buildInfo, PRODUCT_CREDIT, PRODUCT_DESCRIPTION } from "@/lib/brand";
import { BrandMark, ProductName } from "./Brand";

// "Sobre o ATLAS.ERP": informações do produto e do build. É o único ponto
// do ERP com a autoria — discreta, como a ficha técnica de um software.
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const build = buildInfo();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Sobre o ATLAS.ERP" size="sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-foreground">
          <BrandMark size={32} />
          <div>
            <p className="text-lg font-semibold tracking-title">
              <ProductName />
            </p>
            <p className="text-sm text-muted-foreground">{PRODUCT_DESCRIPTION}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Versão</dt>
          <dd className="code tabular-nums">{build.commit}</dd>
          {build.date && (
            <>
              <dt className="text-muted-foreground">Publicação</dt>
              <dd className="tabular-nums">{build.date.split("-").reverse().join("/")}</dd>
            </>
          )}
        </dl>
        <p className="border-t border-border-subtle pt-3 text-xs text-subtle-foreground">{PRODUCT_CREDIT}</p>
      </div>
    </Dialog>
  );
}
