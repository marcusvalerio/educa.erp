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
  default_location_code: string | null;
  batch_controlled: boolean;
  expiration_controlled: boolean;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  cost_price: number | null;
  sale_price: number | null;
  min_price: number | null;
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
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductBrandRow = {
  id: string;
  company_id: string;
  name: string;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type UnitRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  fractionable: boolean;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type UnitConversionRow = {
  id: string;
  company_id: string;
  from_unit_id: string;
  to_unit_id: string;
  factor: number;
  status: DbStatus;
  created_at: string;
  updated_at: string;
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

export type LocationPurpose = "STOCK" | "OPERATIONAL_WAREHOUSE" | "PRODUCTION" | "QUARANTINE" | "TRANSIT";

export type WarehouseLocationRow = {
  id: string;
  company_id: string;
  code: string;
  name: string | null;
  warehouse: string | null;
  purpose: LocationPurpose;
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

// ---------------------------------------------------------- Estoque/WMS
// Espelha supabase/migrations/0008-0012. warehouses e product_lots são
// cadastros normais (status active/inactive, CRUD via createTableRepository).
// product_serial_numbers tem vocabulário de status próprio (ciclo de vida
// do item serializado). stock_balances/stock_movements/stock_transfers(+items)/
// stock_reservations(+items)/stock_adjustments(+items)/stock_counts(+items)
// são só leitura pela API REST genérica — toda escrita passa pelas funções
// SECURITY DEFINER (fn_receive_stock, fn_ship_transfer, fn_post_adjustment
// etc.), chamadas via RPC (ver src/app/api/stock-*).

export type WarehouseRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: "standard" | "virtual";
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductLotRow = {
  id: string;
  company_id: string;
  product_id: string;
  lot_number: string;
  manufactured_at: string | null;
  expires_at: string | null;
  supplier_id: string | null;
  notes: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type SerialStatus = "in_stock" | "reserved" | "shipped" | "returned" | "scrapped";

export type ProductSerialNumberRow = {
  id: string;
  company_id: string;
  product_id: string;
  serial_number: string;
  status: SerialStatus;
  current_location_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StockBalanceRow = {
  id: string;
  company_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  on_hand: number;
  reserved: number;
  available: number;
  updated_at: string;
};

export type MovementType =
  | "RECEIPT"
  | "ISSUE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "RETURN_IN"
  | "RETURN_OUT"
  | "PRODUCTION_IN"
  | "PRODUCTION_OUT"
  | "RESERVATION"
  | "RELEASE";

export type StockMovementRow = {
  id: string;
  company_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
};

export type TransferStatus = "draft" | "in_transit" | "completed" | "cancelled";

export type StockTransferRow = {
  id: string;
  company_id: string;
  code: string;
  from_location_id: string;
  to_location_id: string;
  status: TransferStatus;
  notes: string | null;
  created_by: string | null;
  shipped_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StockTransferItemRow = {
  id: string;
  company_id: string;
  transfer_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  created_at: string;
};

export type ReservationStatus = "active" | "released" | "consumed" | "cancelled";

export type StockReservationRow = {
  id: string;
  company_id: string;
  code: string;
  location_id: string;
  status: ReservationStatus;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  released_at: string | null;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StockReservationItemRow = {
  id: string;
  company_id: string;
  reservation_id: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  created_at: string;
};

export type AdjustmentStatus = "draft" | "posted" | "cancelled";

export type StockAdjustmentRow = {
  id: string;
  company_id: string;
  code: string;
  location_id: string;
  reason_code: string;
  notes: string | null;
  status: AdjustmentStatus;
  created_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StockAdjustmentItemRow = {
  id: string;
  company_id: string;
  adjustment_id: string;
  product_id: string;
  lot_id: string | null;
  quantity_delta: number;
  unit_cost: number | null;
  created_at: string;
};

export type CountStatus = "counting" | "closed" | "cancelled";

export type StockCountRow = {
  id: string;
  company_id: string;
  code: string;
  warehouse_id: string;
  status: CountStatus;
  notes: string | null;
  created_by: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CountItemStatus = "pending" | "counted";

export type StockCountItemRow = {
  id: string;
  company_id: string;
  count_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  expected_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  status: CountItemStatus;
  created_at: string;
};

export type MaterialRequestStatus = "requested" | "delivered" | "cancelled";

export type MaterialRequestRow = {
  id: string;
  company_id: string;
  code: string;
  from_location_id: string;
  to_location_id: string;
  status: MaterialRequestStatus;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
  requested_by: string | null;
  delivered_by: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialRequestItemRow = {
  id: string;
  company_id: string;
  request_id: string;
  product_id: string;
  lot_id: string | null;
  quantity_requested: number;
  quantity_delivered: number | null;
  created_at: string;
};

// ------------------------------------------------------ Compras/Suprimentos
// Espelha supabase/migrations/0014-0018. Todas as tabelas são
// documentos transacionais (mesmo padrão de stock_transfers/
// stock_reservations/material_requests): só leitura pela API REST
// genérica, toda escrita via função RPC (src/app/api/purchase-*).
// Não usam BaseEntity/StatusCadastro em português — não são cadastros.

export type PurchasePriority = "low" | "medium" | "high" | "urgent";
export type PurchaseRequestStatus =
  | "draft" | "requested" | "approved" | "rejected" | "cancelled"
  | "partially_ordered" | "ordered" | "completed";

export type PurchaseRequestRow = {
  id: string;
  company_id: string;
  code: string;
  requested_by: string | null;
  department: string | null;
  priority: PurchasePriority;
  status: PurchaseRequestStatus;
  justification: string | null;
  requested_at: string;
  needed_by: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseRequestItemRow = {
  id: string;
  company_id: string;
  request_id: string;
  product_id: string | null;
  description: string;
  unit: string | null;
  quantity_requested: number;
  quantity_approved: number | null;
  notes: string | null;
  created_at: string;
};

export type PurchaseQuoteStatus = "draft" | "sent" | "closed" | "cancelled";

export type PurchaseQuoteRow = {
  id: string;
  company_id: string;
  code: string;
  purchase_request_id: string | null;
  status: PurchaseQuoteStatus;
  notes: string | null;
  created_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseQuoteSupplierStatus = "invited" | "responded" | "selected" | "rejected";

export type PurchaseQuoteSupplierRow = {
  id: string;
  company_id: string;
  quote_id: string;
  supplier_id: string;
  status: PurchaseQuoteSupplierStatus;
  payment_terms: string | null;
  freight_cost: number | null;
  delivery_days: number | null;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseQuoteItemRow = {
  id: string;
  company_id: string;
  quote_supplier_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  notes: string | null;
  created_at: string;
};

export type PurchaseOrderStatus =
  | "draft" | "pending_approval" | "approved" | "sent"
  | "partially_received" | "received" | "closed" | "cancelled";

export type PurchaseOrderRow = {
  id: string;
  company_id: string;
  code: string;
  supplier_id: string;
  purchase_request_id: string | null;
  purchase_quote_id: string | null;
  status: PurchaseOrderStatus;
  issued_at: string;
  expected_delivery_at: string | null;
  payment_terms: string | null;
  freight_cost: number;
  discount: number;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderItemRow = {
  id: string;
  company_id: string;
  order_id: string;
  product_id: string | null;
  description: string;
  unit: string | null;
  ordered_quantity: number;
  received_quantity: number;
  cancelled_quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  notes: string | null;
  created_at: string;
};

export type PurchaseReceiptStatus = "draft" | "confirmed" | "rejected";

export type PurchaseReceiptRow = {
  id: string;
  company_id: string;
  code: string;
  purchase_order_id: string;
  supplier_id: string;
  received_at: string;
  received_by: string | null;
  status: PurchaseReceiptStatus;
  notes: string | null;
  document_type: string | null;
  document_number: string | null;
  document_series: string | null;
  access_key: string | null;
  document_issued_at: string | null;
  document_value: number | null;
  created_at: string;
  updated_at: string;
};

export type ReceiptConferenceStatus = "pending" | "matched" | "divergent";
export type ReceiptDivergenceType = "none" | "quantity" | "product" | "lot" | "expiration" | "quality" | "other";

export type PurchaseReceiptItemRow = {
  id: string;
  company_id: string;
  receipt_id: string;
  purchase_order_item_id: string;
  product_id: string;
  quantity_received: number;
  unit: string | null;
  destination_location_id: string;
  lot_id: string | null;
  lot_number: string | null;
  expires_at: string | null;
  serial_numbers: string[] | null;
  accepted_quantity: number;
  rejected_quantity: number;
  conference_status: ReceiptConferenceStatus;
  divergence_type: ReceiptDivergenceType | null;
  divergence_notes: string | null;
  notes: string | null;
  created_at: string;
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
