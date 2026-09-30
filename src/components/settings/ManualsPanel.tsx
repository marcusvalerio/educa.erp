import { BookOpen, Download, ExternalLink } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { buttonClasses } from "@/components/ui/Button";
import type { Manual } from "@/lib/manuals";

// Lista dos manuais em PDF (fonte: docs/manual/pdf, publicada pelo build).
export function ManualsPanel({ manuals, description }: { manuals: Manual[]; description?: string }) {
  return (
    <Panel>
      <PanelHeader title="Manuais" description={description ?? "Documentação oficial do ATLAS.ERP em PDF."} icon={<BookOpen size={15} aria-hidden />} />
      <ul className="divide-y divide-border-subtle">
        {manuals.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{m.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
              <p className="mt-1 text-xs text-subtle-foreground">PDF · {m.audience}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <a className={buttonClasses("secondary", "sm")} href={m.href} target="_blank" rel="noopener">
                <ExternalLink size={14} aria-hidden /> Abrir
              </a>
              <a className={buttonClasses("ghost", "sm")} href={m.href} download={m.file} aria-label={`Baixar ${m.title}`}>
                <Download size={14} aria-hidden /> Baixar
              </a>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
