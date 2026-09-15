import "server-only";

import { tablesByEntity } from "@/lib/database/repositories";
import type { ActorContext } from "@/lib/database/table";
import { IMPORT_ENTITIES, type ImportableEntity } from "./registry";

// Persistência da importação (Fase 21, seção 21.7) — separado de
// registry.ts (puro) porque toca tablesByEntity/banco diretamente.

export type PersistResult = { success: true; entityId: string; created: boolean } | { success: false; message: string };

// Idempotência: procura por naturalKeyColumn antes de criar. Se
// existir, ATUALIZA (nunca duplica); a importação nunca remove/
// sobrescreve um registro fora do valor explicitamente enviado.
export async function persistImportRow(
  entityType: ImportableEntity,
  companyId: string,
  data: Record<string, unknown>,
  naturalKey: string,
  actor: ActorContext
): Promise<PersistResult> {
  const config = IMPORT_ENTITIES[entityType];
  const table = tablesByEntity[entityType];

  try {
    const existing = await table.list(companyId, { filters: { [config.naturalKeyColumn]: naturalKey }, pageSize: 1 });
    if (existing.data.length > 0) {
      const current = existing.data[0] as { id: string };
      const updated = await table.update(companyId, current.id, data as never, actor);
      return { success: true, entityId: (updated as { id: string }).id, created: false };
    }

    const created = await table.create(companyId, data as never, actor);
    return { success: true, entityId: (created as { id: string }).id, created: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Não foi possível gravar o registro." };
  }
}
