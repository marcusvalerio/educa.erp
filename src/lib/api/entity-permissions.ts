// Permissão RBAC exigida por cada rota genérica de cadastro
// (src/lib/api/handlers.ts). Fica fora do handler (sem "server-only") para
// que os testes de banco confiram o MESMO mapa contra o catálogo real de
// permissões e contra as policies de RLS (tests/permissoes-produtos-db.test.ts).
import type { EntityRoute } from "@/lib/database/repositories";

export type EntityAction = "read" | "create" | "update" | "delete";

export const PERMISSION_MODULE: Record<EntityRoute, string> = {
  products: "products",
  customers: "customers",
  suppliers: "suppliers",
  carriers: "carriers",
  drivers: "drivers",
  vehicles: "vehicles",
  users: "users",
  "warehouse-locations": "warehouse_locations",
  // Categorias e marcas usam o vocabulário do catálogo (categories.*,
  // brands.*), o mesmo das policies de RLS desde a 0076/0091.
  "product-categories": "categories",
  "product-brands": "brands",
  units: "units",
  "unit-conversions": "unit_conversions",
  // Fornecedores do produto seguem o produto: consultar exige
  // products.read; vincular/editar/remover é editar o produto (ver
  // PERMISSION_ACTION e a 0091).
  "product-suppliers": "products",
  warehouses: "warehouses",
  "product-lots": "product_lots",
  "sales-representatives": "sales_representatives",
  "price-lists": "price_lists",
  // Itens de tabela de preço reaproveitam as permissões de price_lists
  // (editar uma tabela inclui editar seus itens) — não existe um
  // permissions.price_list_items.* separado, de propósito.
  "price-list-items": "price_lists",
};

// Ações que não seguem <módulo>.<ação> literalmente.
export const PERMISSION_ACTION: Partial<Record<EntityRoute, Partial<Record<"read" | "create" | "update" | "delete", string>>>> = {
  "product-suppliers": { create: "update", delete: "update" },
  // Incluir ou remover item é editar a tabela de preço (o mesmo que a RLS de
  // price_list_items exige). Antes a API pedia price_lists.create/.delete e,
  // com o cliente administrativo, aceitava quem só podia criar tabelas.
  "price-list-items": { create: "update", delete: "update" },
};

export function entityPermissionCode(entity: EntityRoute, action: EntityAction): string {
  return `${PERMISSION_MODULE[entity]}.${PERMISSION_ACTION[entity]?.[action] ?? action}`;
}
