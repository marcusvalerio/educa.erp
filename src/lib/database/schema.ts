// Tipos das linhas das tabelas do Supabase (snake_case), espelhando as
// migrations em supabase/migrations/. Usados apenas na camada de acesso
// a dados (src/lib/database) — o resto da aplicação continua falando a
// linguagem dos tipos existentes em src/lib/cadastros/types.ts.

export type DbStatus = "active" | "inactive";

export type ProductRow = {
  id: string;
  company_id: string;
  code: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  unit: string;
  ncm: string | null;
  weight: number | null;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  minimum_stock: number | null;
  maximum_stock: number | null;
  reorder_point: number | null;
  supplier_id: string | null;
  category_id: string | null;
  brand_id: string | null;
  default_location_code: string | null;
  batch_controlled: boolean;
  expiration_controlled: boolean;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type CustomerRow = {
  id: string;
  company_id: string;
  code: string;
  type: "individual" | "company";
  name: string;
  trade_name: string | null;
  document: string;
  state_registration: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  zip_code: string | null;
  state: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  credit_limit: number | null;
  payment_terms: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type SupplierRow = {
  id: string;
  company_id: string;
  code: string;
  type: "individual" | "company";
  legal_name: string;
  trade_name: string | null;
  document: string;
  state_registration: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  zip_code: string | null;
  state: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  average_delivery_days: number | null;
  payment_terms: string | null;
  supplier_category: string | null;
  notes: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type CarrierRow = {
  id: string;
  company_id: string;
  code: string;
  legal_name: string;
  trade_name: string | null;
  document: string;
  state_registration: string | null;
  email: string | null;
  phone: string | null;
  responsible_name: string | null;
  zip_code: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  transport_type: string | null;
  coverage_region: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type DriverRow = {
  id: string;
  company_id: string;
  code: string;
  carrier_id: string | null;
  name: string;
  document: string;
  rg: string | null;
  cnh_number: string;
  cnh_category: string;
  cnh_expiration: string | null;
  phone: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type VehicleRow = {
  id: string;
  company_id: string;
  code: string;
  carrier_id: string | null;
  driver_id: string | null;
  plate: string;
  renavam: string | null;
  brand: string | null;
  model: string;
  year: number | null;
  type: string | null;
  cargo_capacity_kg: number | null;
  max_weight_kg: number | null;
  fuel_type: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type UserRow = {
  id: string;
  company_id: string;
  code: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  login: string;
  role: string | null;
  department: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type WarehouseLocationRow = {
  id: string;
  company_id: string;
  code: string;
  name: string | null;
  warehouse: string | null;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  level: string | null;
  position: string | null;
  location_type: string | null;
  capacity: number | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductCategoryRow = {
  id: string;
  company_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  path: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductBrandRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type UnitRow = {
  code: string;
  name: string;
  created_at: string;
};

export type ProductSupplierRow = {
  id: string;
  company_id: string;
  product_id: string;
  supplier_id: string;
  supplier_sku: string | null;
  cost: number | null;
  lead_time_days: number | null;
  is_preferred: boolean;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductPriceRow = {
  id: string;
  company_id: string;
  product_id: string;
  price_type: "cost" | "sale" | "minimum";
  amount: number;
  currency: string;
  valid_from: string;
  valid_to: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductUnitRow = {
  id: string;
  company_id: string;
  product_id: string;
  unit_code: string;
  conversion_factor: number;
  barcode: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type AuditLogRow = {
  id: string;
  company_id: string | null;
  user_id: string | null;
  actor_label: string;
  entity: string;
  entity_id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "ACTIVATE" | "INACTIVATE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};
