import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { tablesByEntity } from "@/lib/database/repositories";
import type { EntityRoute } from "@/lib/database/repositories";
import { schemasByEntity } from "@/lib/validations/cadastros";
import { ApiError, notFoundError, validationError } from "@/lib/database/errors";
import { DEV_ACTOR_LABEL } from "@/lib/database/constants";
import { jsonError } from "./response";
import type { StatusCadastro } from "@/lib/cadastros/types";

// Handlers genéricos reutilizados pelas 8 rotas de cadastro
// (src/app/api/<recurso>/route.ts e .../[id]/route.ts) — cada arquivo
// de rota só precisa informar qual entidade representa. Mantém o padrão
// REST consistente: GET (lista/busca), POST (cria), GET/:id (detalhe),
// PATCH/:id (atualiza — inclui ativar/inativar), DELETE/:id (exclusão
// controlada, bloqueada quando há vínculos).

function firstIssueMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

export function createCollectionHandlers(entity: EntityRoute) {
  const table = tablesByEntity[entity];
  const schema = schemasByEntity[entity];

  async function GET(request: NextRequest) {
    try {
      const { searchParams } = new URL(request.url);
      const statusParam = searchParams.get("status");
      const filters: Record<string, string> | undefined = table.filterParams
        ? Object.fromEntries(
            Object.entries(table.filterParams)
              .map(([param, column]) => [column, searchParams.get(param)])
              .filter((entry): entry is [string, string] => Boolean(entry[1]))
          )
        : undefined;
      const result = await table.list({
        search: searchParams.get("search") ?? undefined,
        status: statusParam === "Ativo" || statusParam === "Inativo" ? (statusParam as StatusCadastro) : undefined,
        page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
        pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined,
        sort: searchParams.get("sort") ?? undefined,
        order: searchParams.get("order") === "desc" ? "desc" : searchParams.get("order") === "asc" ? "asc" : undefined,
        filters: filters && Object.keys(filters).length > 0 ? filters : undefined,
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
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
      const created = await table.create(parsed.data as never, DEV_ACTOR_LABEL);
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
      const { id } = await context.params;
      const item = await table.get(id);
      if (!item) throw notFoundError(entity);
      return NextResponse.json({ success: true, data: item });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function PATCH(request: NextRequest, context: RouteContext) {
    try {
      const { id } = await context.params;
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
      const parsed = schema.partial().safeParse(body);
      if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
      if (Object.keys(parsed.data).length === 0) throw validationError("Nenhum dado para atualizar.");
      const updated = await table.update(id, parsed.data as never, DEV_ACTOR_LABEL);
      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      return jsonError(error);
    }
  }

  async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
      const { id } = await context.params;
      await table.remove(id, DEV_ACTOR_LABEL);
      return NextResponse.json({ success: true, data: null });
    } catch (error) {
      return jsonError(error);
    }
  }

  return { GET, PATCH, DELETE };
}

export { ApiError };
