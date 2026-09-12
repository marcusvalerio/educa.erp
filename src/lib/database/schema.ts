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
