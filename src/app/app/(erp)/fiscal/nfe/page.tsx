"use client";

import { FiscalDocumentsList } from "@/components/fiscal/FiscalDocumentsList";

export default function NfePage() {
  return <FiscalDocumentsList title="Notas fiscais eletrônicas (NF-e)" apiPath="/api/fiscal-documents?type=NFE" typeFilter={false} />;
}
