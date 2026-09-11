import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { tablesByEntity } from "@/lib/database/repositories";
import type { EntityRoute } from "@/lib/database/repositories";
import { schemasByEntity } from "@/lib/validations/cadastros";
import { ApiError, notFoundError, unauthorizedError, forbiddenError, validationError } from "@/lib/database/errors";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import type { ActorContext } from "@/lib/database/table";
import { jsonError } from "./response";
import type { StatusCadastro } from "@/lib/cadastros/types";

// Handlers genéricos reutilizados pelas rotas de cadastro
// (src/app/api/<recurso>/route.ts e .../[id]/route.ts) — cada arquivo
// de rota só precisa informar qual entidade representa. Mantém o padrão
// REST consistente: GET (lista/busca), POST (cria), GET/:id (detalhe),
// PATCH/:id (atualiza — inclui ativar/inativar), DELETE/:id (exclusão
// controlada, bloqueada quando há vínculos).
//
// Toda operação passa por requireAccess(): exige um usuário autenticado
// (Supabase Auth -> public.users) e a permissão RBAC correspondente ao
// módulo/ação antes de tocar o repositório. Isso é reforço em camada de
// aplicação — o RLS no banco (migration 0006) é a barreira real e
// independente da API; nenhuma das duas depende só da outra.

const PERMISSION_MODULE: Record<EntityRoute, string> = {
  products: "products",
  customers: "customers",
  suppliers: "suppliers",
  carriers: "carriers",
  drivers: "drivers",
  vehicles: "vehicles",
  users: "users",
  "warehouse-locations": "warehouse_locations",
  "product-categories": "product_categories",
  "product-brands": "product_brands",
  units: "units",
  "unit-conversions": "unit_conversions",
  "product-suppliers": "product_suppliers",
  warehouses: "warehouses",
  "product-lots": "product_lots",
  "sales-representatives": "sales_representatives",
  "price-lists": "price_lists",
  // Itens de tabela de preço reaproveitam as permissões de price_lists
  // (editar uma tabela inclui editar seus itens) — não existe um
  // permissions.price_list_items.* separado, de propósito.
  "price-list-items": "price_lists",
};

function firstIssueMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

type Access = { companyId: string; actor: ActorContext };

async function requireAccess(entity: EntityRoute, action: "read" | "create" | "update" | "delete"): Promise<Access> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();

  const permissionCode = `${PERMISSION_MODULE[entity]}.${action}`;
  const allowed = await hasPermission(ctx.companyId, permissionCode);
  if (!allowed) throw forbiddenError(permissionCode);

  return { companyId: ctx.companyId, actor: { userId: ctx.appUserId, actorLabel: ctx.actorLabel } };
}

export function createCollectionHandlers(entity: EntityRoute) {
  const table = tablesByEntity[entity];
  const schema = schemasByEntity[entity];

  async function GET(request: NextRequest) {
    try {
      const { companyId } = await requireAccess(entity, "read");
      const { searchParams } = new URL(request.url);
      const statusParam = searchParams.get("status");
      // productId/priceListId filtram tabelas filhas (ex.: product-suppliers,
      // price-list-items) sem precisar de um método dedicado por relação —
      // ver ListParams.filters.
      const productIdParam = searchParams.get("productId");
      const priceListIdParam = searchParams.get("priceListId");
      const filters: Record<string, string> = {};
      if (productIdParam) filters.product_id = productIdParam;
      if (priceListIdParam) filters.price_list_id = priceListIdParam;
      const result = await table.list(companyId, {
        search: searchParams.get("search") ?? undefined,
        status: statusParam === "Ativo" || statusParam === "Inativo" ? (statusParam as StatusCadastro) : undefined,
        page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
        pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
        sort: searchParams.get("sort") ?? undefined,
        order: searchParams.get("order") === "desc" ? "desc" : searchParams.get("order") === "asc" ? "asc" : undefined,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });
      return NextResponse.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: result.page, pageSize: result.pageSize },
      });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function POST(request: NextRequest) {
    try {
      const { companyId, actor } = await requireAccess(entity, "create");
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
      const created = await table.create(companyId, parsed.data as never, actor);
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (error) {
      return jsonError(error);
    }
  }

  return { GET, POST };
}

type RouteContext = { params: Promise<{ id: string }> };

export function createItemHandlers(entity: EntityRoute) {
  const table = tablesByEntity[entity];
  const schema = schemasByEntity[entity];

  async function GET(_request: NextRequest, context: RouteContext) {
    try {
      const { companyId } = await requireAccess(entity, "read");
      const { id } = await context.params;
      const item = await table.get(companyId, id);
      if (!item) throw notFoundError(entity);
      return NextResponse.json({ success: true, data: item });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function PATCH(request: NextRequest, context: RouteContext) {
    try {
      const { companyId, actor } = await requireAccess(entity, "update");
      const { id } = await context.params;
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
      const parsed = schema.partial().safeParse(body);
      if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
      if (Object.keys(parsed.data).length === 0) throw validationError("Nenhum dado para atualizar.");
      const updated = await table.update(companyId, id, parsed.data as never, actor);
      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
      const { companyId, actor } = await requireAccess(entity, "delete");
      const { id } = await context.params;
      await table.remove(companyId, id, actor);
      return NextResponse.json({ success: true, data: null });
    } catch (error) {
      return jsonError(error);
    }
  }

  return { GET, PATCH, DELETE };
}

export { ApiError };
