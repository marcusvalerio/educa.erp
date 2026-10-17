import type { LookupSource } from "./FormDialog";

// Fontes de listas usadas pelos formulários (cadastros devolvem entidades
// mapeadas: codigo/descricao/status "Ativo"; domínio devolve linhas do banco).

type Row = Record<string, unknown>;
const ativo = (r: Row) => r.status === undefined || r.status === "Ativo" || r.status === "active";
const s = (v: unknown) => (typeof v === "string" ? v : "");

export const SOURCES = {
  products: { path: "/api/products", filter: ativo, label: (r: Row) => `${s(r.codigo)} — ${s(r.descricao)}` } as LookupSource,
  locations: {
    path: "/api/warehouse-locations",
    filter: ativo,
    label: (r: Row) => [s(r.codigoLocal), s(r.descricao)].filter(Boolean).join(" — ") || String(r.id),
  } as LookupSource,
  warehouses: { path: "/api/warehouses", filter: ativo, nameField: "name" } as LookupSource,
  suppliers: { path: "/api/suppliers", filter: ativo, label: (r: Row) => s(r.razaoSocial) || s(r.nomeFantasia) || String(r.id) } as LookupSource,
  customers: { path: "/api/customers", filter: ativo, label: (r: Row) => s(r.nome) || String(r.id) } as LookupSource,
  costCenters: { path: "/api/cost-centers", filter: ativo, label: (r: Row) => [s(r.code), s(r.name)].filter(Boolean).join(" — ") } as LookupSource,
  financialCategories: { path: "/api/financial-categories", filter: ativo, label: (r: Row) => [s(r.code), s(r.name)].filter(Boolean).join(" — ") } as LookupSource,
  financialAccounts: { path: "/api/financial-accounts", filter: ativo, label: (r: Row) => s(r.name) || String(r.id) } as LookupSource,
  assets: { path: "/api/assets", filter: (r: Row) => !["DECOMMISSIONED", "INACTIVE"].includes(String(r.status ?? "")), label: (r: Row) => [s(r.code), s(r.description)].filter(Boolean).join(" — ") || String(r.id) } as LookupSource,
  projects: { path: "/api/projects", filter: (r: Row) => !["COMPLETED", "CANCELLED"].includes(String(r.status ?? "")), label: (r: Row) => [s(r.code), s(r.name)].filter(Boolean).join(" — ") || String(r.id) } as LookupSource,
  maintenancePlans: { path: "/api/maintenance-plans", filter: (r: Row) => (r.status ?? "active") === "active", label: (r: Row) => [s(r.code), s(r.description)].filter(Boolean).join(" — ") || String(r.id) } as LookupSource,
  assetCategories: { path: "/api/asset-categories", filter: (r: Row) => (r.status ?? "active") === "active", label: (r: Row) => [s(r.code), s(r.name)].filter(Boolean).join(" — ") } as LookupSource,
  assetLocations: { path: "/api/asset-locations", filter: (r: Row) => (r.status ?? "active") === "active", label: (r: Row) => [s(r.code), s(r.name)].filter(Boolean).join(" — ") } as LookupSource,
  checklists: { path: "/api/quality-checklists", filter: (r: Row) => (r.status ?? "active") === "active", label: (r: Row) => [s(r.code), s(r.name)].filter(Boolean).join(" — ") } as LookupSource,
  inspections: { path: "/api/quality-inspections", label: (r: Row) => s(r.code) || String(r.id) } as LookupSource,
  nonconformities: { path: "/api/nonconformities", filter: (r: Row) => !["CLOSED", "CANCELLED"].includes(String(r.status ?? "")), label: (r: Row) => [s(r.code), s(r.description)].filter(Boolean).join(" — ") } as LookupSource,
  projectTasks: { path: "/api/project-tasks", filter: (r: Row) => !["DONE", "CANCELLED"].includes(String(r.status ?? "")), label: (r: Row) => [s(r.code), s(r.name)].filter(Boolean).join(" — ") } as LookupSource,
  serviceOrders: { path: "/api/service-orders", filter: (r: Row) => !["COMPLETED", "CANCELLED"].includes(String(r.status ?? "")), label: (r: Row) => [s(r.code), s(r.title)].filter(Boolean).join(" — ") } as LookupSource,
  purchaseRequests: { path: "/api/purchase-requests", filter: (r: Row) => ["approved", "partially_ordered"].includes(String(r.status ?? "").toLowerCase()), label: (r: Row) => s(r.code) || String(r.id) } as LookupSource,
  ncms: { path: "/api/fiscal-ncms", filter: (r: Row) => (r.status ?? "active") === "active", label: (r: Row) => [s(r.code), s(r.description)].filter(Boolean).join(" — ") } as LookupSource,
  cfops: { path: "/api/fiscal-cfops", filter: (r: Row) => (r.status ?? "active") === "active", label: (r: Row) => [s(r.code), s(r.description)].filter(Boolean).join(" — ") } as LookupSource,
  depots: { path: "/api/warehouses", filter: ativo, label: (r: Row) => [s(r.codigo), s(r.nome)].filter(Boolean).join(" — ") || String(r.id) } as LookupSource,
  users: { path: "/api/users", filter: ativo, label: (r: Row) => s(r.nome) || s(r.email) || String(r.id) } as LookupSource,
};

/** Preço do cadastro do produto para preencher o item. */
export const costOf = (r: Row) => (Number(r.precoCusto) > 0 ? String(r.precoCusto) : "");
export const priceOf = (r: Row) => (Number(r.precoVenda) > 0 ? String(r.precoVenda) : "");
