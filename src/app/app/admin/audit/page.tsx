"use client";

import { AuditLogList } from "@/components/resource/AuditLogList";

export default function AdminAuditPage() {
  return (
    <AuditLogList
      title="Auditoria da empresa"
      description="Alterações de acesso, estrutura e cadastros registradas pelo banco para esta empresa."
      apiPath="/api/admin/audit"
    />
  );
}
