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
  purchase_unit_id: string | null;
  sale_unit_id: string | null;
  production_unit_id: string | null;
  product_segment: "RESALE" | "RAW_MATERIAL" | "FINISHED_GOOD" | "SERVICE" | null;
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
  description: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductBrandRow = {
  id: string;
  company_id: string;
  code: string | null;
  name: string;
  description: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type UnitType = "COUNT" | "WEIGHT" | "VOLUME" | "LENGTH" | "AREA" | "TIME" | "OTHER";

export type UnitRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  symbol: string | null;
  unit_type: UnitType | null;
  decimal_places: number;
  base_unit_id: string | null;
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
  product_id: string | null;
  factor: number;
  valid_from: string | null;
  valid_until: string | null;
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

export type CommercialStatus = "active" | "credit_hold" | "blocked";

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
  // ------------------------------------------------ Comercial (0019)
  default_sales_representative_id: string | null;
  default_price_list_id: string | null;
  default_payment_terms_id: string | null;
  segment: string | null;
  commercial_status: CommercialStatus;
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

// -------------------------------------------------------------- Comercial
// Espelha supabase/migrations/0019-0021. sales_representatives e
// price_lists/price_list_items são cadastros normais (CRUD via
// createTableRepository, como warehouses/product_lots). payment_terms
// precisa de validação atômica multi-linha (soma de percentuais = 100%)
// e por isso usa handlers dedicados, como purchase_quotes. sales_quotes/
// sales_orders são documentos transacionais (mesmo padrão de
// stock_transfers/purchase_orders) — só leitura pela API REST genérica,
// toda escrita via função RPC.

export type SalesRepresentativeRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  commission_percentage: number | null;
  notes: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type PriceListRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  valid_from: string | null;
  valid_until: string | null;
  priority: number;
  notes: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type PriceListItemRow = {
  id: string;
  company_id: string;
  price_list_id: string;
  product_id: string;
  unit_price: number;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type PaymentTermRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  installments_count: number;
  notes: string | null;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type PaymentTermInstallmentRow = {
  id: string;
  company_id: string;
  payment_term_id: string;
  installment_number: number;
  days_after: number;
  percentage: number;
  created_at: string;
};

export type SalesQuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "cancelled";

export type SalesQuoteRow = {
  id: string;
  company_id: string;
  code: string;
  customer_id: string;
  sales_representative_id: string | null;
  price_list_id: string | null;
  payment_terms_id: string | null;
  status: SalesQuoteStatus;
  issued_at: string;
  valid_until: string | null;
  discount: number;
  freight_cost: number;
  total_amount: number;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesQuoteItemRow = {
  id: string;
  company_id: string;
  quote_id: string;
  product_id: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  notes: string | null;
  created_at: string;
};

export type SalesOrderStatus =
  | "draft" | "pending_approval" | "approved" | "reservation_pending" | "reserved"
  | "picking" | "ready_to_ship" | "shipped" | "completed" | "cancelled";

export type SalesOrderRow = {
  id: string;
  company_id: string;
  code: string;
  customer_id: string;
  sales_representative_id: string | null;
  sales_quote_id: string | null;
  price_list_id: string | null;
  payment_terms_id: string | null;
  status: SalesOrderStatus;
  order_date: string;
  expected_delivery_at: string | null;
  discount: number;
  freight_cost: number;
  total_amount: number;
  delivery_zip_code: string | null;
  delivery_state: string | null;
  delivery_city: string | null;
  delivery_neighborhood: string | null;
  delivery_address: string | null;
  delivery_address_number: string | null;
  delivery_address_complement: string | null;
  carrier_id: string | null;
  fiscal_document_type: string | null;
  fiscal_document_number: string | null;
  fiscal_document_series: string | null;
  fiscal_access_key: string | null;
  fiscal_status: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesOrderItemRow = {
  id: string;
  company_id: string;
  order_id: string;
  product_id: string | null;
  description: string;
  unit: string | null;
  ordered_quantity: number;
  reserved_quantity: number;
  picked_quantity: number;
  shipped_quantity: number;
  cancelled_quantity: number;
  unit_price: number;
  discount: number;
  line_total: number;
  notes: string | null;
  created_at: string;
};

// ------------------------------------------------------ Logística/Expedição
// Espelha supabase/migrations/0023-0025. Todas documentos transacionais
// (mesmo padrão de stock_transfers/purchase_orders/sales_orders) — só
// leitura pela API REST genérica, toda escrita via função RPC.

export type PickListStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type PickListRow = {
  id: string;
  company_id: string;
  code: string;
  sales_order_id: string;
  warehouse_id: string;
  status: PickListStatus;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PickListItemStatus = "pending" | "picked" | "short" | "cancelled";
export type PickDivergenceType = "none" | "quantity" | "product" | "lot" | "serial";

export type PickListItemRow = {
  id: string;
  company_id: string;
  pick_list_id: string;
  sales_order_item_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  requested_quantity: number;
  picked_quantity: number;
  serial_numbers: string[] | null;
  status: PickListItemStatus;
  divergence_type: PickDivergenceType | null;
  divergence_notes: string | null;
  notes: string | null;
  created_at: string;
};

export type ShipmentStatus =
  | "draft" | "ready" | "picking" | "packed" | "ready_to_ship"
  | "shipped" | "in_transit" | "delivered" | "completed" | "cancelled";

export type ShipmentRow = {
  id: string;
  company_id: string;
  code: string;
  sales_order_id: string;
  customer_id: string;
  warehouse_id: string;
  pick_list_id: string | null;
  status: ShipmentStatus;
  carrier_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  delivery_zip_code: string | null;
  delivery_state: string | null;
  delivery_city: string | null;
  delivery_neighborhood: string | null;
  delivery_address: string | null;
  delivery_address_number: string | null;
  delivery_address_complement: string | null;
  expected_ship_date: string | null;
  shipped_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentItemRow = {
  id: string;
  company_id: string;
  shipment_id: string;
  sales_order_item_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  unit: string | null;
  lot_id: string | null;
  serial_numbers: string[] | null;
  weight: number | null;
  notes: string | null;
  created_at: string;
};

export type ShipmentPackageRow = {
  id: string;
  company_id: string;
  shipment_id: string;
  package_number: number;
  weight: number | null;
  height: number | null;
  width: number | null;
  length: number | null;
  tracking_code: string | null;
  notes: string | null;
  created_at: string;
};

export type DeliveryEventStatus = "out_for_delivery" | "delivered" | "failed" | "refused" | "absent" | "returned";
export type PodType = "signature" | "photo" | "document";

export type DeliveryEventRow = {
  id: string;
  company_id: string;
  shipment_id: string;
  status: DeliveryEventStatus;
  occurred_at: string;
  recorded_by: string | null;
  recipient_name: string | null;
  recipient_document: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  pod_type: PodType | null;
  pod_reference: string | null;
  created_at: string;
};

// ------------------------------------------------------------ Produção/PCP
// Espelha supabase/migrations/0026-0030. work_centers/production_routings/
// production_routing_operations são "cadastro" (CRUD direto via RLS,
// sem função dedicada). product_boms/production_orders e tudo que
// deriva deles são documentos transacionais — só leitura pela API REST
// genérica, toda escrita via função RPC.

export type ProductionType = "purchased" | "manufactured" | "both";

export type WorkCenterType = "machine" | "line" | "cell" | "sector";

export type WorkCenterRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: WorkCenterType;
  description: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type ProductionRoutingStatus = "draft" | "active" | "obsolete";

export type ProductionRoutingRow = {
  id: string;
  company_id: string;
  code: string;
  product_id: string | null;
  name: string;
  description: string | null;
  status: ProductionRoutingStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionRoutingOperationRow = {
  id: string;
  company_id: string;
  routing_id: string;
  sequence: number;
  name: string;
  description: string | null;
  work_center_id: string | null;
  planned_time_minutes: number | null;
  notes: string | null;
  created_at: string;
};

export type ProductBomStatus = "draft" | "active" | "obsolete";

export type ProductBomRow = {
  id: string;
  company_id: string;
  code: string;
  product_id: string;
  version: number;
  status: ProductBomStatus;
  reference_quantity: number;
  unit_id: string;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductBomItemRow = {
  id: string;
  company_id: string;
  bom_id: string;
  component_product_id: string;
  quantity: number;
  unit_id: string;
  scrap_percentage: number;
  sequence: number;
  is_optional: boolean;
  notes: string | null;
  created_at: string;
};

export type ProductionOrderPriority = "low" | "medium" | "high" | "urgent";

export type ProductionOrderStatus =
  | "draft" | "planned" | "released" | "materials_reserved"
  | "in_progress" | "completed" | "cancelled" | "on_hold";

export type ProductionOrderRow = {
  id: string;
  company_id: string;
  code: string;
  product_id: string;
  bom_id: string;
  planned_quantity: number;
  produced_quantity: number;
  rejected_quantity: number;
  unit_id: string;
  source_warehouse_id: string;
  consumption_location_id: string;
  target_warehouse_id: string;
  output_location_id: string;
  priority: ProductionOrderPriority;
  status: ProductionOrderStatus;
  planned_date: string | null;
  started_at: string | null;
  finished_at: string | null;
  responsible_user_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionOrderMaterialStatus = "pending" | "partial" | "reserved" | "consumed" | "short" | "cancelled";

export type ProductionOrderMaterialRow = {
  id: string;
  company_id: string;
  production_order_id: string;
  bom_item_id: string | null;
  component_product_id: string;
  planned_quantity: number;
  reserved_quantity: number;
  consumed_quantity: number;
  returned_quantity: number;
  scrapped_quantity: number;
  unit_id: string;
  lot_id: string | null;
  serial_numbers: string[] | null;
  scrap_percentage: number;
  status: ProductionOrderMaterialStatus;
  notes: string | null;
  created_at: string;
};

export type ProductionScrapRow = {
  id: string;
  company_id: string;
  production_order_id: string;
  material_id: string | null;
  product_id: string;
  quantity: number;
  unit_id: string;
  reason: string;
  lot_id: string | null;
  stock_movement_issue_id: string | null;
  idempotency_key: string | null;
  recorded_by: string | null;
  occurred_at: string;
  created_at: string;
};

export type ProductionOperationLogRow = {
  id: string;
  company_id: string;
  production_order_id: string;
  routing_operation_id: string | null;
  work_center_id: string | null;
  operator_user_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  produced_quantity: number;
  rejected_quantity: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

// -------------------------------------------------------------- Financeiro
// Espelha supabase/migrations/0031-0035. financial_categories/
// cost_centers são "cadastro" (CRUD direto via RLS). financial_accounts
// nasce via fn_create_financial_account (current_balance sempre
// sincronizado), mas aceita PATCH direto para campos não-financeiros.
// accounts_payable/accounts_receivable e tudo que deriva deles são
// documentos transacionais — só leitura pela API REST genérica, toda
// escrita via função RPC.

export type FinancialCategoryType = "INCOME" | "EXPENSE";

export type FinancialCategoryRow = {
  id: string;
  company_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  type: FinancialCategoryType;
  description: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type CostCenterRow = {
  id: string;
  company_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialAccountType = "CASH" | "BANK" | "DIGITAL" | "OTHER";

export type FinancialAccountRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  type: FinancialAccountType;
  bank_name: string | null;
  bank_agency: string | null;
  bank_account_masked: string | null;
  opening_balance: number;
  current_balance: number;
  currency_code: string;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountsPayableOriginType = "manual" | "purchase_receipt";
export type AccountsPayableStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export type AccountsPayableRow = {
  id: string;
  company_id: string;
  code: string;
  supplier_id: string;
  description: string;
  category_id: string | null;
  cost_center_id: string | null;
  origin_type: AccountsPayableOriginType;
  origin_id: string | null;
  document_reference: string | null;
  original_amount: number;
  discount: number;
  interest: number;
  penalty: number;
  updated_amount: number;
  status: AccountsPayableStatus;
  issue_date: string;
  due_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountsPayableInstallmentRow = {
  id: string;
  company_id: string;
  payable_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: AccountsPayableStatus;
  settled_at: string | null;
  created_at: string;
};

export type AccountsReceivableOriginType = "manual" | "sales_order";
export type AccountsReceivableStatus = "OPEN" | "PARTIALLY_RECEIVED" | "RECEIVED" | "OVERDUE" | "CANCELLED";

export type AccountsReceivableRow = {
  id: string;
  company_id: string;
  code: string;
  customer_id: string;
  description: string;
  category_id: string | null;
  cost_center_id: string | null;
  origin_type: AccountsReceivableOriginType;
  origin_id: string | null;
  document_reference: string | null;
  original_amount: number;
  discount: number;
  interest: number;
  penalty: number;
  updated_amount: number;
  status: AccountsReceivableStatus;
  issue_date: string;
  due_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountsReceivableInstallmentRow = {
  id: string;
  company_id: string;
  receivable_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  received_amount: number;
  status: AccountsReceivableStatus;
  settled_at: string | null;
  created_at: string;
};

export type FinancialTransactionType = "CREDIT" | "DEBIT";

export type FinancialTransactionRow = {
  id: string;
  company_id: string;
  financial_account_id: string;
  type: FinancialTransactionType;
  amount: number;
  occurred_at: string;
  reference_type: string | null;
  reference_id: string | null;
  category_id: string | null;
  cost_center_id: string | null;
  description: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
};

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "PIX" | "CARD" | "BOLETO" | "OTHER";
export type SettlementStatus = "CONFIRMED" | "REVERSED";

export type PaymentRow = {
  id: string;
  company_id: string;
  code: string;
  installment_id: string;
  financial_account_id: string;
  amount: number;
  paid_at: string;
  method: PaymentMethod;
  status: SettlementStatus;
  reference: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
};

export type ReceiptRow = {
  id: string;
  company_id: string;
  code: string;
  installment_id: string;
  financial_account_id: string;
  amount: number;
  received_at: string;
  method: PaymentMethod;
  status: SettlementStatus;
  reference: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  created_at: string;
};

export type BankReconciliationStatus = "in_progress" | "completed";

export type BankReconciliationRow = {
  id: string;
  company_id: string;
  code: string;
  financial_account_id: string;
  period_start: string;
  period_end: string;
  status: BankReconciliationStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BankReconciliationItemStatus = "reconciled" | "unreconciled" | "divergent";

export type BankReconciliationItemRow = {
  id: string;
  company_id: string;
  reconciliation_id: string;
  financial_transaction_id: string;
  status: BankReconciliationItemStatus;
  notes: string | null;
  created_at: string;
};

export type CashFlowSummaryRow = {
  company_id: string;
  current_balance_total: number;
  open_receivable_total: number;
  open_payable_total: number;
};

export type CashFlowProjectionRow = {
  company_id: string;
  due_date: string;
  direction: "INFLOW" | "OUTFLOW";
  amount: number;
};

// ----------------------------------------------------------------- Fiscal
// Espelha supabase/migrations/0036-0040. fiscal_establishments/
// fiscal_ncms/fiscal_cfops/fiscal_operation_natures/fiscal_cst_codes/
// fiscal_csosn_codes são "cadastro" (CRUD direto via RLS).
// product_fiscal_profiles/tax_rules/fiscal_documents e tudo que deriva
// deles são documentos transacionais — só leitura pela API REST
// genérica, toda escrita via função RPC.

export type TaxRegime = "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL" | "MEI";

export type FiscalEstablishmentRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  cnpj: string;
  state_registration: string | null;
  municipal_registration: string | null;
  tax_regime: TaxRegime;
  address: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type FiscalNcmRow = {
  id: string;
  company_id: string;
  code: string;
  description: string;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type FiscalCfopDirection = "ENTRADA" | "SAIDA";
export type FiscalCfopScope = "INTERNAL" | "INTERSTATE" | "FOREIGN";

export type FiscalCfopRow = {
  id: string;
  company_id: string;
  code: string;
  description: string;
  direction: FiscalCfopDirection;
  scope: FiscalCfopScope;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type FiscalOperationNatureRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  direction: FiscalCfopDirection;
  default_cfop_id: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type FiscalCstTaxType = "ICMS" | "IPI" | "PIS" | "COFINS";

export type FiscalCstCodeRow = {
  id: string;
  company_id: string;
  tax_type: FiscalCstTaxType;
  code: string;
  description: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type FiscalCsosnCodeRow = {
  id: string;
  company_id: string;
  code: string;
  description: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type GoodsOriginCode = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export type ProductFiscalProfileRow = {
  id: string;
  company_id: string;
  product_id: string;
  ncm_id: string | null;
  origin_code: GoodsOriginCode;
  icms_cst: string | null;
  icms_csosn: string | null;
  pis_cst: string | null;
  cofins_cst: string | null;
  ipi_cst: string | null;
  tax_framework: string | null;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "obsolete";
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type TaxRuleStatus = "draft" | "active" | "inactive";

export type TaxRuleRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  product_id: string | null;
  ncm_id: string | null;
  origin_code: GoodsOriginCode | null;
  cfop_id: string | null;
  operation_nature_id: string | null;
  origin_uf: string | null;
  destination_uf: string | null;
  tax_regime: TaxRegime | null;
  customer_id: string | null;
  supplier_id: string | null;
  priority: number;
  valid_from: string;
  valid_until: string | null;
  status: TaxRuleStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaxType = "ICMS" | "ICMS_ST" | "IPI" | "PIS" | "COFINS" | "ISS" | "FCP" | "DIFAL" | "OTHER";

export type TaxRuleItemRow = {
  id: string;
  company_id: string;
  tax_rule_id: string;
  tax_type: TaxType;
  cst: string | null;
  csosn: string | null;
  rate: number;
  reduction_percentage: number;
  notes: string | null;
  created_at: string;
};

export type FiscalDocumentType = "NFE" | "NFCE" | "NFSE" | "CTE" | "MDFE" | "OTHER";
export type FiscalDocumentStatus = "DRAFT" | "CALCULATED" | "READY" | "AUTHORIZED" | "CANCELLED" | "DENIED" | "REJECTED" | "CONTINGENCY";
export type FiscalDocumentSourceType = "purchase_receipt" | "sales_order" | "shipment" | "manual" | "return" | "transfer_out" | "transfer_in";
export type FiscalDocumentFreightMode = "EMITENTE" | "DESTINATARIO" | "TERCEIROS" | "SEM_FRETE" | "OTHER";
export type FiscalDocumentEnvironment = "PRODUCTION" | "HOMOLOGATION";

export type FiscalDocumentRow = {
  id: string;
  company_id: string;
  fiscal_establishment_id: string;
  code: string;
  number: number | null;
  series: string | null;
  model: string | null;
  type: FiscalDocumentType;
  direction: FiscalCfopDirection;
  status: FiscalDocumentStatus;
  issue_date: string;
  operation_date: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  operation_nature_id: string;
  access_key: string | null;
  protocol: string | null;
  receipt_number: string | null;
  rejection_reason: string | null;
  return_code: string | null;
  xml_storage_reference: string | null;
  source_type: FiscalDocumentSourceType | null;
  source_id: string | null;
  carrier_id: string | null;
  vehicle_id: string | null;
  freight_amount: number;
  insurance_amount: number;
  other_expenses_amount: number;
  discount_amount: number;
  products_amount: number;
  taxes_amount: number;
  total_amount: number;
  freight_mode: FiscalDocumentFreightMode | null;
  gross_weight: number | null;
  net_weight: number | null;
  volumes_quantity: number | null;
  environment: FiscalDocumentEnvironment;
  service: string | null;
  return_message: string | null;
  authorized_at: string | null;
  xml_sent_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FiscalDocumentItemRow = {
  id: string;
  company_id: string;
  fiscal_document_id: string;
  product_id: string;
  description: string;
  ncm_id: string | null;
  ncm_code: string;
  ncm_description: string | null;
  cfop_id: string | null;
  cfop_code: string;
  origin_code: GoodsOriginCode;
  quantity: number;
  unit: string | null;
  unit_price: number;
  discount: number;
  freight_amount: number;
  insurance_amount: number;
  other_expenses: number;
  gross_amount: number;
  total_amount: number;
  source_reference_type: string | null;
  source_reference_id: string | null;
  notes: string | null;
  created_at: string;
};

export type FiscalDocumentItemTaxRow = {
  id: string;
  company_id: string;
  fiscal_document_item_id: string;
  tax_type: TaxType;
  cst: string | null;
  csosn: string | null;
  calculation_basis: number;
  rate: number;
  reduction_percentage: number;
  amount: number;
  withheld: boolean;
  modality: string | null;
  source_tax_rule_id: string | null;
  notes: string | null;
  created_at: string;
};

export type FiscalDocumentEventType =
  | "CREATED" | "CALCULATED" | "READY" | "AUTHORIZED" | "CANCELLED" | "REJECTED"
  | "DENIED" | "CONTINGENCY" | "CORRECTION_LETTER" | "INUTILIZATION" | "MANIFESTATION" | "OTHER";

export type FiscalDocumentEventRow = {
  id: string;
  company_id: string;
  fiscal_document_id: string;
  event_type: FiscalDocumentEventType;
  occurred_at: string;
  protocol: string | null;
  status_code: string | null;
  message: string | null;
  payload_reference: string | null;
  created_by: string | null;
  created_at: string;
};

export type FiscalDocumentReferenceType =
  | "RETURN" | "COMPLEMENT" | "REPLACEMENT" | "EVENT_SOURCE" | "TRANSFER_COUNTERPART" | "OTHER";

export type FiscalDocumentReferenceRow = {
  id: string;
  company_id: string;
  fiscal_document_id: string;
  referenced_document_id: string;
  reference_type: FiscalDocumentReferenceType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type FiscalDocumentPackageRow = {
  id: string;
  company_id: string;
  fiscal_document_id: string;
  package_number: number;
  quantity: number;
  species: string | null;
  brand_mark: string | null;
  numbering: string | null;
  gross_weight: number | null;
  net_weight: number | null;
  created_at: string;
};

export type CostMethod = "MOVING_AVERAGE" | "FIFO" | "STANDARD";

export type CostMovementType =
  | "RECEIPT" | "ISSUE" | "TRANSFER_OUT" | "TRANSFER_IN" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT"
  | "RETURN_IN" | "RETURN_OUT" | "PRODUCTION_IN" | "PRODUCTION_OUT" | "SCRAP";

export type CostMovementRow = {
  id: string;
  company_id: string;
  stock_movement_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  movement_type: CostMovementType;
  cost_method: CostMethod;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  average_cost_before: number;
  average_cost_after: number;
  source_type: string | null;
  source_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type ProductCostBalanceRow = {
  id: string;
  company_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  quantity: number;
  total_value: number;
  average_unit_cost: number;
  updated_at: string;
};

export type InventoryValuationRow = {
  company_id: string;
  product_id: string;
  location_id: string;
  lot_id: string | null;
  quantity: number;
  unit_cost: number;
  total_value: number;
};

export type ProductStandardCostRow = {
  id: string;
  company_id: string;
  product_id: string;
  cost: number;
  version: number;
  valid_from: string;
  valid_until: string | null;
  status: "active" | "obsolete";
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

// ============================================================ Fase 11 — Controladoria Gerencial
export type CompetencePeriodStatus = "OPEN" | "CLOSING" | "CLOSED" | "REOPENED";

export type FinancialCompetencePeriodRow = {
  id: string;
  company_id: string;
  code: string;
  period_start: string;
  period_end: string;
  status: CompetencePeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CostAllocationSourceType = "manual" | "accounts_payable" | "financial_transaction";
export type CostAllocationCriterion = "PERCENTAGE" | "FIXED_VALUE" | "QUANTITY" | "REVENUE" | "COST" | "HEADCOUNT" | "AREA";

export type CostAllocationRow = {
  id: string;
  company_id: string;
  code: string;
  source_type: CostAllocationSourceType;
  source_id: string | null;
  competence_period_id: string | null;
  total_amount: number;
  criterion: CostAllocationCriterion;
  status: "applied" | "cancelled";
  description: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type CostAllocationItemRow = {
  id: string;
  company_id: string;
  allocation_id: string;
  cost_center_id: string;
  percentage: number | null;
  amount: number;
  notes: string | null;
  created_at: string;
};

export type BudgetHeaderRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  period_start: string;
  period_end: string;
  status: "draft" | "approved" | "closed";
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetItemRow = {
  id: string;
  company_id: string;
  budget_header_id: string;
  cost_center_id: string | null;
  financial_category_id: string | null;
  planned_amount: number;
  notes: string | null;
  created_at: string;
};

export type BudgetVsActualRow = {
  cost_center_id: string | null;
  financial_category_id: string | null;
  planned_amount: number;
  actual_amount: number;
  variance_amount: number;
};

export type DreGerencialResult = {
  gross_revenue: number;
  deductions: number;
  net_revenue: number;
  cmv: number;
  gross_profit: number;
  operating_expenses: number;
  operating_result: number;
  financial_result: number;
  managerial_result: number;
};

export type ControllingKpisResult = DreGerencialResult & {
  gross_margin_pct: number | null;
  accounts_receivable_open: number;
  accounts_payable_open: number;
  cash_balance: number;
  overdue_receivable: number;
  average_ticket: number | null;
};

export type ResultByCostCenterRow = {
  cost_center_id: string;
  cost_center_code: string;
  cost_center_name: string;
  revenue: number;
  expense: number;
  allocated_cost: number;
  result: number;
};

export type IndustrialCostSummaryRow = {
  production_order_id: string;
  production_order_code: string;
  product_id: string;
  material_cost: number;
  produced_quantity: number;
  unit_cost: number;
};

export type ForecastBucketRow = {
  bucket: "REALIZED_REVENUE" | "REALIZED_EXPENSE" | "COMMITTED_REVENUE" | "COMMITTED_EXPENSE";
  amount: number;
};

export type SalesOrderItemMarginRow = {
  sales_order_item_id: string;
  sales_order_id: string;
  company_id: string;
  customer_id: string;
  sales_representative_id: string | null;
  order_date: string;
  product_id: string | null;
  revenue_amount: number;
  cost_amount: number;
  margin_amount: number;
};

export type MarginByProductRow = { product_id: string | null; revenue: number; cost: number; margin: number; margin_pct: number | null };
export type MarginByCustomerRow = { customer_id: string; revenue: number; cost: number; margin: number; margin_pct: number | null };
export type MarginByOrderRow = { sales_order_id: string; customer_id: string; revenue: number; cost: number; margin: number; margin_pct: number | null };

// ============================================================ Fase 12 — Relatórios / BI Operacional
export type ReportExecutiveResult = {
  gross_revenue: number;
  net_revenue: number;
  gross_margin_pct: number | null;
  cmv: number;
  operating_expenses: number;
  managerial_result: number;
  accounts_receivable_open: number;
  accounts_payable_open: number;
  cash_balance: number;
  inventory_value: number;
  open_sales_orders: number;
  open_shipments: number;
  open_production_orders: number;
};

export type ReportCommercialResult = {
  orders_count: number;
  orders_amount: number;
  average_ticket: number | null;
  customers_count: number;
  cancelled_orders: number;
  pending_orders: number;
  quote_conversion_pct: number | null;
};

export type ReportInventoryResult = {
  total_quantity: number;
  total_value: number;
  receipts_count: number;
  issues_count: number;
  transfers_count: number;
  adjustments_count: number;
  reservations_active: number;
  products_without_movement: number;
};

export type ReportPurchasesResult = {
  requests_count: number;
  orders_count: number;
  orders_amount: number;
  receipts_count: number;
  receipts_amount: number;
  divergent_receipt_items: number;
  suppliers_count: number;
};

export type ReportProductionResult = {
  orders_count: number;
  open_orders: number;
  in_progress_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  produced_quantity: number;
  consumed_material_cost: number;
  scrap_quantity: number;
};

export type ReportLogisticsResult = {
  shipments_count: number;
  shipped_count: number;
  delivered_count: number;
  failed_count: number;
  in_transit_count: number;
  pick_lists_count: number;
  average_lead_time_days: number | null;
};

export type ReportFinanceResult = {
  cash_balance: number;
  accounts_receivable_open: number;
  accounts_payable_open: number;
  overdue_receivable: number;
  overdue_payable: number;
  received_in_period: number;
  paid_in_period: number;
};

export type ReportFiscalResult = {
  documents_count: number;
  entradas_count: number;
  saidas_count: number;
  authorized_count: number;
  rejected_count: number;
  cancelled_count: number;
  pending_count: number;
  taxes_amount: number;
};

// ============================================================ Fase 13 — Cadastros Mestres Avançados
export type ProductAttributeInputType = "TEXT" | "NUMBER" | "BOOLEAN" | "SELECT";

export type ProductAttributeRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  input_type: ProductAttributeInputType;
  status: DbStatus;
  created_at: string;
  updated_at: string;
};

export type ProductAttributeValueRow = {
  id: string;
  company_id: string;
  attribute_id: string;
  value: string;
  status: DbStatus;
  created_at: string;
};

export type ProductAttributeAssignmentRow = {
  id: string;
  company_id: string;
  product_id: string;
  attribute_id: string;
  value_id: string | null;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  created_at: string;
  updated_at: string;
};

export type PartyType = "customer" | "supplier" | "carrier";
export type PartyAddressType = "billing" | "delivery" | "invoicing" | "commercial" | "correspondence" | "main";
export type PartyContactType = "commercial" | "financial" | "technical" | "other";

export type PartyAddressRow = {
  id: string;
  company_id: string;
  party_type: PartyType;
  party_id: string;
  address_type: PartyAddressType;
  is_primary: boolean;
  zip_code: string | null;
  state: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  notes: string | null;
  status: DbStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PartyContactRow = {
  id: string;
  company_id: string;
  party_type: PartyType;
  party_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  contact_type: PartyContactType;
  is_primary: boolean;
  notes: string | null;
  status: DbStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ============================================================ Fase 14 — Configuração e Parametrização
export type SettingValueType = "STRING" | "INTEGER" | "DECIMAL" | "BOOLEAN" | "DATE" | "JSON";

export type SystemSettingRow = {
  id: string;
  company_id: string | null;
  establishment_id: string | null;
  module: string;
  key: string;
  value_type: SettingValueType;
  value_string: string | null;
  value_integer: number | null;
  value_decimal: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_json: Record<string, unknown> | null;
  description: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: DbStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentType = "SALES_ORDER" | "PURCHASE_ORDER" | "FISCAL_DOCUMENT" | "TRANSFER" | "SHIPMENT" | "OTHER";

export type DocumentSequenceRow = {
  id: string;
  company_id: string;
  establishment_id: string | null;
  document_type: DocumentType;
  series_code: string;
  description: string | null;
  prefix: string | null;
  current_number: number;
  padding: number;
  status: DbStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NextDocumentNumberResult = {
  sequence_id: string;
  number: number;
  formatted_number: string;
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
