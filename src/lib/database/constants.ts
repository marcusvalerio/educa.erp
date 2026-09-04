// Empresa semente utilizada enquanto o ERP opera em modo mono-empresa
// (sem autenticação). Corresponde à linha inserida em supabase/seed.sql.
// Na Fase 3, a empresa passará a ser resolvida a partir do usuário
// autenticado em vez desta constante fixa.
export const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// Identificador de sistema/desenvolvimento usado em audit_logs.actor_label
// enquanto não existe usuário autenticado (Fase 3). Documentado
// explicitamente para não ser confundido com um usuário real.
export const DEV_ACTOR_LABEL = "dev-system";

export const TABLE_NAMES = {
  companies: "companies",
  products: "products",
  customers: "customers",
  suppliers: "suppliers",
  carriers: "carriers",
  drivers: "drivers",
  vehicles: "vehicles",
  users: "users",
  warehouseLocations: "warehouse_locations",
  auditLogs: "audit_logs",
} as const;
