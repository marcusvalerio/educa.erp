"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Danfe } from "@/components/fiscal/Danfe";
import { useBreadcrumbTail } from "@/components/shell/Breadcrumbs";
import { parseNfeXml, type DanfeData } from "@/lib/fiscal/nfe/parse";

// DANFE montada a partir do XML autorizado guardado no banco.
export default function DanfePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DanfeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useBreadcrumbTail(data ? `NF-e ${data.number}` : "DANFE");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fiscal-documents/${id}/xml?inline=1`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.text();
        if (!res.ok) {
          const message = (() => {
            try {
              return (JSON.parse(body) as { error?: { message?: string } }).error?.message;
            } catch {
              return undefined;
            }
          })();
          throw new Error(message ?? "Não foi possível carregar o XML da nota.");
        }
        const parsed = parseNfeXml(new DOMParser().parseFromString(body, "application/xml"));
        if (!cancelled) setData(parsed);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Não foi possível carregar a nota."));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button asChild size="sm" variant="ghost">
          <Link href="/app/fiscal/notas-fiscais">
            <ArrowLeft size={14} aria-hidden /> Documentos fiscais
          </Link>
        </Button>
        <span className="flex-1" />
        <Button asChild size="sm" variant="secondary">
          <a href={`/api/fiscal-documents/${id}/xml`} download>
            <Download size={14} aria-hidden /> Baixar XML
          </a>
        </Button>
        <Button size="sm" onClick={() => window.print()} disabled={!data}>
          <Printer size={14} aria-hidden /> Imprimir / PDF
        </Button>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {!data && !error && <p className="text-sm text-muted-foreground">Carregando a DANFE...</p>}
      {data && (
        <div className="overflow-x-auto rounded-lg border border-border-subtle bg-white p-2 print:overflow-visible print:border-0 print:p-0">
          <Danfe data={data} />
        </div>
      )}
    </div>
  );
}
