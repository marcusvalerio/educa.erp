"use client";

import { FiscalDocumentsList } from "@/components/fiscal/FiscalDocumentsList";

export default function NotasFiscaisPage() {
  return <FiscalDocumentsList title="Documentos fiscais" apiPath="/api/fiscal-documents" />;
}
