"use client";

import { useState } from "react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, statusFilter, enumFilter } from "@/components/data-table/columns";
import type { FilterDef } from "@/components/data-table/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { invalidateCache } from "@/lib/dashboard/client";
import { IssueNfeButton, NfeOutputLinks } from "@/components/fiscal/NfeActions";
import type { FiscalDocumentRow } from "@/lib/database/schema";

const PENDING = ["DRAFT", "CALCULATED", "READY", "AUTHORIZING", "CONTINGENCY"];

// Visões: saídas (notas que a empresa emite na venda) e entradas (notas dos
// fornecedores, lançadas no recebimento da compra). "Pendentes" vale só
// para as saídas: a nota de entrada já foi autorizada pelo fornecedor.
const VIEWS: FilterDef<FiscalDocumentRow> = {
  id: "view",
  label: "Visão",
  kind: "view",
  options: [
    { value: "saidas", label: "Saídas (vendas)" },
    { value: "entradas", label: "Entradas (compras)" },
    { value: "pendentes", label: "Saídas pendentes de autorização" },
    { value: "rejeitadas", label: "Rejeitadas / denegadas" },
  ],
  predicate: (row, value) => {
    const st = String(row.status ?? "").toUpperCase();
    if (value === "saidas") return row.direction === "SAIDA";
    if (value === "entradas") return row.direction === "ENTRADA";
    if (value === "pendentes") return row.direction === "SAIDA" && PENDING.includes(st);
    if (value === "rejeitadas") return ["REJECTED", "DENIED"].includes(st);
    return true;
  },
};

/** "NF do fornecedor nº 123 série 1 — chave ..." gravado no lançamento da entrada. */
function supplierInvoice(row: FiscalDocumentRow): string | undefined {
  const m = /NF do fornecedor([^—]*)/.exec(String(row.notes ?? ""));
  return m && m[1].trim() ? `NF do fornecedor ${m[1].trim()}` : undefined;
}

export function FiscalDocumentsList({ title, apiPath, typeFilter = true }: { title: string; apiPath: string; typeFilter?: boolean }) {
  const customers = useIdNameLookup("/api/customers");
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");
  const party = (row: FiscalDocumentRow) => (row.direction === "ENTRADA" ? suppliers.get(String(row.supplier_id ?? "")) : customers.get(String(row.customer_id ?? ""))) ?? undefined;
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/fiscal-documents");
    setRefresh((n) => n + 1);
  };

  return (
    <ResourceListPage<FiscalDocumentRow>
      title={title}
      description="Saídas: notas que a empresa emite nas vendas. Entradas: notas dos fornecedores, lançadas ao confirmar o recebimento da compra."
      apiPath={apiPath}
      refreshToken={refresh}
      searchPlaceholder="Buscar documento, número, cliente ou fornecedor..."
      columns={[
        codeCol<FiscalDocumentRow>("code", "Documento"),
        textCol<FiscalDocumentRow>("direction", "Entrada/Saída", { width: "7rem", cell: (row) => (row.direction === "ENTRADA" ? "Entrada" : "Saída") }),
        textCol<FiscalDocumentRow>("type", "Tipo", { width: "5rem" }),
        textCol<FiscalDocumentRow>("number", "Número", { align: "right", mono: true, cell: (row) => (row.number ? String(row.number) : row.direction === "ENTRADA" ? "do fornecedor" : "—") }),
        textCol<FiscalDocumentRow>("customer_id", "Cliente / fornecedor", { mobile: "meta", cell: (row) => party(row) ?? "—" }),
        dateCol<FiscalDocumentRow>("issue_date", "Emissão", { mobile: "meta" }),
        moneyCol<FiscalDocumentRow>("total_amount", "Total", { mobile: "meta" }),
        statusCol<FiscalDocumentRow>("fiscal_documents"),
      ]}
      filters={[
        VIEWS,
        statusFilter<FiscalDocumentRow>("fiscal_documents", "status", { server: true }),
        ...(typeFilter ? [enumFilter<FiscalDocumentRow>("type", "Tipo", [["NFE", "NF-e"], ["NFCE", "NFC-e"], ["NFSE", "NFS-e"], ["CTE", "CT-e"], ["MDFE", "MDF-e"], ["OTHER", "Outro"]], { server: "type" })] : []),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => [row.direction === "ENTRADA" ? "Entrada" : "Saída", party(row), row.direction === "ENTRADA" ? supplierInvoice(row) : undefined].filter(Boolean).join(" · "),
        badges: (row) => <StatusBadge entity="fiscal_documents" status={row.status} />,
        actions: (row) => {
          const st = String(row.status ?? "").toUpperCase();
          if (st === "AUTHORIZED") return <div className="flex flex-wrap gap-2"><NfeOutputLinks documentId={row.id} /></div>;
          if (row.type === "NFE" && row.direction === "SAIDA" && ["DRAFT", "CALCULATED", "READY"].includes(st)) return <IssueNfeButton documentId={row.id} onDone={reload} />;
          return null;
        },
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
