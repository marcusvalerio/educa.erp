"use client";

import { AuditLogList } from "@/components/resource/AuditLogList";

export default function AuditoriaPage() {
  return <AuditLogList title="Auditoria" description="Quem fez o quê, quando — operações e alterações registradas pelo banco." apiPath="/api/admin/audit" />;
}
