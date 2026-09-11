import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEV_ACTOR_LABEL } from "./constants";
import { ApiError, blockedByDependentsError, notFoundError, translatePostgresError } from "./errors";
import type { AuditLogRow } from "./schema";
import type { BaseEntity, StatusCadastro } from "@/lib/cadastros/types";

export type DependentCheck<Entity> = {
  table: string;
  column: string;
  matchValue: (entity: Entity) => string;
  message: string;
};

export type ListParams = {
  search?: string;
  status?: StatusCadastro;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: "asc" | "desc";
  // Filtros exatos adicionais por coluna (ex.: { product_id: "<uuid>" }
  // para listar product_suppliers/product_barcodes/product_variants de
  // um produto). Mecanismo genérico único, reutilizável por qualquer
  // tabela filha futura sem precisar de um método dedicado por relação.
  filters?: Record<string, string>;
};

export type ListResult<Entity> = {
  data: Entity[];
  total: number;
  page: number;
  pageSize: number;
};

// Identifica quem está fazendo a operação, para auditoria. userId vem do
// cadastro em public.users vinculado ao usuário autenticado (Supabase
// Auth) — nulo apenas quando não há usuário real associado (scripts
// internos), caso em que actorLabel deve ser um rótulo documentado como
// DEV_ACTOR_LABEL, nunca um usuário disfarçado.
export type ActorContext = {
  userId: string | null;
  actorLabel: string;
};

const DEFAULT_ACTOR: ActorContext = { userId: null, actorLabel: DEV_ACTOR_LABEL };

export type TableConfig<Entity extends BaseEntity, Row extends { id: string; status: string }> = {
  table: string;
  entityLabel: string;
  searchColumns: string[];
  defaultSort: string;
  fromRow: (row: Row) => Entity;
  toRowFields: (data: Partial<Entity>) => Partial<Row>;
  labelOf: (entity: Entity) => string;
  dependents?: DependentCheck<Entity>[];
};

function statusToDb(status: StatusCadastro): "active" | "inactive" {
  return status === "Ativo" ? "active" : "inactive";
}

async function writeAuditLog(
  companyId: string,
  actor: ActorContext,
  entry: Omit<AuditLogRow, "id" | "created_at" | "company_id" | "user_id" | "actor_label">
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_logs").insert({
    company_id: companyId,
    user_id: actor.userId,
    actor_label: actor.actorLabel,
    ...entry,
  });
  if (error) {
    // A auditoria não deve derrubar a operação principal do usuário —
    // registramos o problema no log do servidor para investigação.
    console.error("[audit_logs] falha ao gravar auditoria:", error.message);
  }
}

// `companyId` é sempre explícito e vem do contexto do usuário autenticado
// resolvido em src/lib/auth/context.ts — nunca de uma constante fixa nem
// de um valor enviado pelo cliente. Isso é o que torna o isolamento por
// empresa real também na camada de aplicação (além do RLS no banco).
export function createTableRepository<Entity extends BaseEntity, Row extends { id: string; status: string }>(
  config: TableConfig<Entity, Row>
) {
  const supabase = () => createAdminClient();

  async function list(companyId: string, params: ListParams = {}): Promise<ListResult<Entity>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 200));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const sortColumn = params.sort ?? config.defaultSort;

    let query = supabase()
      .from(config.table)
      .select("*", { count: "exact" })
      .eq("company_id", companyId);

    if (params.status) {
      query = query.eq("status", statusToDb(params.status));
    }
    if (params.filters) {
      for (const [column, value] of Object.entries(params.filters)) {
        query = query.eq(column, value);
      }
    }
    if (params.search && params.search.trim() && config.searchColumns.length > 0) {
      const term = params.search.trim().replace(/[%_]/g, "");
      query = query.or(config.searchColumns.map((col) => `${col}.ilike.%${term}%`).join(","));
    }

    query = query.order(sortColumn, { ascending: params.order !== "desc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw translatePostgresError(error);

    return {
      data: ((data ?? []) as Row[]).map(config.fromRow),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async function get(companyId: string, id: string): Promise<Entity | null> {
    const { data, error } = await supabase()
      .from(config.table)
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) return null;
    return config.fromRow(data as Row);
  }

  async function create(companyId: string, input: Partial<Entity>, actor: ActorContext = DEFAULT_ACTOR): Promise<Entity> {
    const fields = config.toRowFields(input);
    const { data, error } = await supabase()
      .from(config.table)
      .insert({ ...fields, company_id: companyId } as Record<string, unknown>)
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);

    const entity = config.fromRow(data as Row);
    await writeAuditLog(companyId, actor, {
      entity: config.entityLabel,
      entity_id: entity.id,
      action: "CREATE",
      old_data: null,
      new_data: entity as unknown as Record<string, unknown>,
    });
    return entity;
  }

  async function update(
    companyId: string,
    id: string,
    patch: Partial<Entity>,
    actor: ActorContext = DEFAULT_ACTOR
  ): Promise<Entity> {
    const before = await get(companyId, id);
    if (!before) throw notFoundError(config.entityLabel);

    const fields = config.toRowFields(patch);
    const { data, error } = await supabase()
      .from(config.table)
      .update(fields as Record<string, unknown>)
      .eq("company_id", companyId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);

    const entity = config.fromRow(data as Row);
    const statusChanged = before.status !== entity.status;
    await writeAuditLog(companyId, actor, {
      entity: config.entityLabel,
      entity_id: entity.id,
      action: statusChanged ? (entity.status === "Ativo" ? "ACTIVATE" : "INACTIVATE") : "UPDATE",
      old_data: before as unknown as Record<string, unknown>,
      new_data: entity as unknown as Record<string, unknown>,
    });
    return entity;
  }

  async function toggleStatus(companyId: string, id: string, actor: ActorContext = DEFAULT_ACTOR): Promise<Entity> {
    const current = await get(companyId, id);
    if (!current) throw notFoundError(config.entityLabel);
    const nextStatus: StatusCadastro = current.status === "Ativo" ? "Inativo" : "Ativo";
    return update(companyId, id, { status: nextStatus } as Partial<Entity>, actor);
  }

  async function checkDependents(companyId: string, entity: Entity): Promise<string | null> {
    if (!config.dependents) return null;
    for (const dep of config.dependents) {
      const { count, error } = await supabase()
        .from(dep.table)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq(dep.column, dep.matchValue(entity));
      if (error) throw translatePostgresError(error);
      if ((count ?? 0) > 0) return dep.message;
    }
    return null;
  }

  async function remove(companyId: string, id: string, actor: ActorContext = DEFAULT_ACTOR): Promise<void> {
    const current = await get(companyId, id);
    if (!current) throw notFoundError(config.entityLabel);

    const blockedReason = await checkDependents(companyId, current);
    if (blockedReason) throw blockedByDependentsError(blockedReason);

    const { error } = await supabase()
      .from(config.table)
      .delete()
      .eq("company_id", companyId)
      .eq("id", id);
    if (error) throw translatePostgresError(error);

    await writeAuditLog(companyId, actor, {
      entity: config.entityLabel,
      entity_id: current.id,
      action: "DELETE",
      old_data: current as unknown as Record<string, unknown>,
      new_data: null,
    });
  }

  return { list, get, create, update, toggleStatus, remove };
}

export { ApiError };
