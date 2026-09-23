"use client";

import { AuditLogList } from "@/components/resource/AuditLogList";

export default function PlatformAuditPage() {
  return (
    <AuditLogList
      title="Auditoria da plataforma"
      description="Ações de governança da plataforma (ciclo de vida, módulos contratados, membros). Não inclui dados operacionais das empresas."
      apiPath="/api/platform/audit"
    />
  );
}
