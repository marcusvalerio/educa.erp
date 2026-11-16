import { z } from "zod";

// Contrato ATLAS.ERP ↔ ORION.WMS (docs/INTEGRACAO-ATLAS-ORION.md, fixtures
// em docs/contrato/*.json). Schemas Zod do envelope comum (§3.3), dos
// payloads de cada tipo nos dois sentidos (§3.4, §3.6), das claims do
// launch token (§2.2) e da checagem de acesso (§2.7).
//
// Nada aqui autoriza coisa alguma: é a barreira de forma antes do banco.

const uuid = z.string().uuid();
const qty = z.number().finite().nonnegative();
const signedQty = z.number().finite();
const text = z.string();
const nText = z.string().nullable();
const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nDate = isoDate.nullable();

export const ORION_ROLES = ["admin", "supervisor", "operator", "auditor"] as const;
export const orionRoleSchema = z.enum(ORION_ROLES);

// ------------------------------------------------------------ envelope
export const envelopeSchema = z.looseObject({
  id: uuid,
  type: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  version: z.number().int().positive(),
  source: z.enum(["atlas", "orion"]),
  atlas_company_id: uuid,
  orion_company_id: uuid,
  aggregate: z.object({ type: z.string().min(1), id: uuid, sequence: z.number().int().positive() }),
  occurred_at: isoDateTime,
  payload: z.record(z.string(), z.unknown()),
});
export type OrionEnvelope = z.infer<typeof envelopeSchema>;

// ------------------------------------------------------------ ATLAS → ORION
const address = z.object({
  street: nText, number: nText, district: nText.optional(), city: nText, state: nText, zip_code: nText,
});

const companyUpserted = z.object({
  company: z.object({
    atlas_company_id: uuid, name: text, legal_name: nText, document: nText, email: nText, phone: nText,
    address: nText, city: nText, state: nText, zip_code: nText, status: text, updated_at: isoDateTime,
  }),
});
const companyDeactivated = z.object({
  atlas_company_id: uuid, reason: z.enum(["module_disabled", "company_suspended", "integration_disabled"]),
  mode: z.enum(["read_only"]), effective_at: isoDateTime,
});
const integrationActivated = z.object({
  stock_owner: z.enum(["atlas", "orion"]),
  sales_release_status: z.enum(["approved", "reserved"]),
  purchase_release_status: z.enum(["approved", "sent"]),
  production_release_status: z.enum(["planned", "released"]),
  require_invoice_before_ship: z.boolean(),
  warehouses: z.array(z.object({ atlas_warehouse_id: uuid, code: text, name: text, orion_warehouse_code: text })),
});
const userAccessGranted = z.object({
  atlas_user_id: uuid, email: z.string().email(), name: text, orion_role: orionRoleSchema,
  access_version: z.number().int().positive(), warehouses: z.array(text),
});
const userAccessRevoked = z.object({
  atlas_user_id: uuid, access_version: z.number().int().positive(),
  reason: z.enum(["revoked_by_company_admin", "user_inactive", "module_disabled", "company_suspended"]),
});
const unitUpserted = z.object({
  atlas_unit_id: uuid, code: text, name: text, base_unit_code: nText, factor_to_base: z.number().positive(), status: text,
});
const productUpserted = z.object({
  product: z.object({
    atlas_product_id: uuid, code: text, sku: nText, barcode: nText, name: text, description: nText, category: nText,
    unit: text, ncm: nText, weight_kg: z.number().nullable(), height_cm: z.number().nullable(), width_cm: z.number().nullable(),
    length_cm: z.number().nullable(), batch_controlled: z.boolean(), expiration_controlled: z.boolean(),
    serial_controlled: z.boolean(), status: text, updated_at: isoDateTime,
    packagings: z.array(z.object({ unit: text, quantity: z.number().positive(), barcode: nText })),
  }),
});
const productDeactivated = z.object({ atlas_product_id: uuid, code: text });
const customerUpserted = z.object({
  customer: z.object({
    atlas_customer_id: uuid, code: text, type: text, name: text, trade_name: nText, document: text,
    email: nText, phone: nText, address, status: text, updated_at: isoDateTime,
  }),
});
const supplierUpserted = z.object({
  supplier: z.object({
    atlas_supplier_id: uuid, code: text, name: text, document: text, email: nText, status: text, updated_at: isoDateTime,
  }),
});
const salesLine = z.object({
  atlas_line_id: uuid, line_no: z.number().int().positive(), atlas_product_id: uuid, product_code: text,
  unit: text, quantity: qty, lot_code: nText,
});
const salesOrderReleased = z.object({
  sales_order: z.object({
    atlas_sales_order_id: uuid, number: text, status: text, atlas_customer_id: uuid, customer_code: text,
    issue_date: isoDate, requested_ship_date: nDate, priority: text, atlas_warehouse_id: uuid.nullable(),
    shipping: z.object({ carrier_code: nText, freight_mode: nText, address }),
    export: z.record(z.string(), z.unknown()).nullable(), notes: nText, lines: z.array(salesLine),
  }),
});
const salesOrderUpdated = z.object({
  sales_order: z.object({
    atlas_sales_order_id: uuid, number: text, requested_ship_date: nDate, lines: z.array(salesLine),
  }),
  changed_fields: z.array(text),
});
const salesOrderLineCancelled = z.object({
  atlas_sales_order_id: uuid, number: text, atlas_line_id: uuid, cancelled_quantity: qty, reason: text,
});
const salesOrderCancelled = z.object({
  atlas_sales_order_id: uuid, number: text, reason: text, lines: z.array(z.unknown()).nullable(),
});
const salesInvoiceAuthorized = z.object({
  atlas_sales_order_id: uuid, number: text, atlas_fiscal_document_id: uuid, nfe_number: text, nfe_series: nText,
  access_key: z.string().regex(/^\d{44}$/), authorized_at: isoDateTime, orion_outbound_id: uuid.nullable(),
  lines: z.array(z.object({ atlas_line_id: uuid, quantity: qty, lot_code: nText })),
});
const purchaseOrderReleased = z.object({
  purchase_order: z.object({
    atlas_purchase_order_id: uuid, number: text, status: text, atlas_supplier_id: uuid, supplier_code: text,
    issue_date: isoDate, expected_date: nDate, atlas_warehouse_id: uuid.nullable(),
    import: z.record(z.string(), z.unknown()).nullable(),
    lines: z.array(z.object({
      atlas_line_id: uuid, line_no: z.number().int().positive(), atlas_product_id: uuid, product_code: text,
      unit: text, quantity: qty, unit_price: qty,
    })),
  }),
});
const purchaseOrderCancelled = z.object({ atlas_purchase_order_id: uuid, number: text, reason: text });
const productionOrderReleased = z.object({
  production_order: z.object({
    atlas_production_order_id: uuid, number: text, status: text, atlas_product_id: uuid, product_code: text,
    quantity: qty, unit: text, planned_date: nDate, output_lot_code: nText, atlas_warehouse_id: uuid.nullable(),
    components: z.array(z.object({
      atlas_material_id: uuid, line_no: z.number().int().positive(), atlas_product_id: uuid, product_code: text,
      unit: text, quantity: qty,
    })),
  }),
});
const productionOrderCancelled = z.object({ atlas_production_order_id: uuid, number: text, reason: text });
const stockInitialSnapshot = z.object({
  snapshot_id: uuid, taken_at: isoDateTime, chunk: z.number().int().positive(), chunks: z.number().int().positive(),
  atlas_warehouse_id: uuid, receiving_location: text,
  items: z.array(z.object({
    atlas_product_id: uuid, product_code: text, lot_code: nText, expiration_date: nDate, quantity: qty, unit_cost: qty,
  })).max(1000),
});

export const atlasToOrionPayloads = {
  "company.upserted": companyUpserted,
  "company.deactivated": companyDeactivated,
  "integration.activated": integrationActivated,
  "user_access.granted": userAccessGranted,
  "user_access.revoked": userAccessRevoked,
  "unit.upserted": unitUpserted,
  "product.upserted": productUpserted,
  "product.deactivated": productDeactivated,
  "customer.upserted": customerUpserted,
  "supplier.upserted": supplierUpserted,
  "sales_order.released": salesOrderReleased,
  "sales_order.updated": salesOrderUpdated,
  "sales_order.line_cancelled": salesOrderLineCancelled,
  "sales_order.cancelled": salesOrderCancelled,
  "sales_invoice.authorized": salesInvoiceAuthorized,
  "purchase_order.released": purchaseOrderReleased,
  "purchase_order.cancelled": purchaseOrderCancelled,
  "production_order.released": productionOrderReleased,
  "production_order.cancelled": productionOrderCancelled,
  "stock.initial_snapshot": stockInitialSnapshot,
} as const;

// ------------------------------------------------------------ ORION → ATLAS
const lot = z.object({ lot_code: nText, quantity: qty, expiration_date: nDate.optional() });

const outboundAccepted = z.object({ code: text, atlas_sales_order_id: uuid, atlas_event_id: uuid.optional() });
const documentRejected = z.object({
  atlas_event_id: uuid, atlas_document_type: text, atlas_document_id: uuid,
  error: z.object({ code: text, message: text }),
});
const outboundPickingStarted = z.object({ code: text, atlas_sales_order_id: uuid, wave: nText.optional() });
const outboundReadyToInvoice = z.object({
  code: text, atlas_sales_order_id: uuid, gross_weight_kg: z.number().nullable(), net_weight_kg: z.number().nullable(),
  volumes: z.number().int().nonnegative().nullable(),
  lines: z.array(z.object({
    atlas_line_id: uuid, atlas_product_id: uuid, sku: text, quantity: qty, lots: z.array(lot), serials: z.array(text),
  })),
});
const outboundShipped = z.object({
  code: text, shipment: nText, atlas_sales_order_id: uuid, access_key: nText, carrier: nText, vehicle_plate: nText,
  shipped_at: isoDateTime,
  lines: z.array(z.object({
    atlas_line_id: uuid, atlas_product_id: uuid, sku: text, requested_qty: qty, shipped_qty: qty, lots: z.array(lot),
  })),
});
// origin "atlas": eco de sales_order.cancelled/line_cancelled do próprio ATLAS
// (§3.6) — o ATLAS registra o estado mas não repete o efeito de quantidade.
const cancelOrigin = z.enum(["atlas", "orion"]);
const outboundCancelled = z.object({
  code: text, atlas_sales_order_id: uuid, reason: nText, released_reservations: z.boolean(),
  origin: cancelOrigin.optional(), atlas_event_id: uuid.nullable().optional(),
});
const outboundLineCancelled = z.object({
  code: text, atlas_sales_order_id: uuid, atlas_line_id: uuid, sku: text, cancelled_qty: qty, reason: nText,
  origin: cancelOrigin.optional(), atlas_event_id: uuid.nullable().optional(),
});
// purchase_order_status (snake_case). purchaseOrderStatus (camelCase) é o nome
// antigo, aceito temporariamente enquanto houver ORION antigo em produção.
const receiptCompleted = z.object({
  code: text, atlas_purchase_order_id: uuid, purchase_order_status: nText.optional(),
  purchaseOrderStatus: nText.optional(), invoice_number: nText,
  invoice_access_key: nText, completed_at: isoDateTime,
  items: z.array(z.object({
    atlas_line_id: uuid, atlas_product_id: uuid, sku: text, expected_qty: qty, received_qty: qty, accepted_qty: qty,
    rejected_qty: qty, lots: z.array(z.object({ lot_code: nText, expiration_date: nDate, quantity: qty })),
  })),
});
const divergenceRegistered = z.object({
  code: text, receipt: text, atlas_purchase_order_id: uuid, kind: text, atlas_product_id: uuid, sku: text,
  expected_qty: qty, found_qty: qty,
});
const customerReturnCompleted = z.object({
  code: text, atlas_sales_order_id: uuid.nullable(), atlas_customer_id: uuid.nullable(), invoice_access_key: nText,
  items: z.array(z.object({
    atlas_product_id: uuid, sku: text, lot_code: nText, returned_qty: qty, restocked_qty: qty, scrapped_qty: qty, disposition: text,
  })),
});
const inventoryApproved = z.object({
  code: text, scope: text, approved_at: isoDateTime,
  adjustments: z.array(z.object({
    atlas_product_id: uuid, sku: text, lot_code: nText, orion_warehouse_code: text, expected_qty: qty, counted_qty: qty,
    delta: signedQty, reason: text,
  })),
});
const stockAdjusted = z.object({
  code: text, reason: text, notes: nText, approved_by: nText,
  items: z.array(z.object({ atlas_product_id: uuid, sku: text, lot_code: nText, orion_warehouse_code: text, delta: signedQty })),
});
const stockTransferred = z.object({
  code: text, from_orion_warehouse_code: text, to_orion_warehouse_code: text,
  from_atlas_warehouse_id: uuid.nullable(), to_atlas_warehouse_id: uuid.nullable(),
  items: z.array(z.object({ atlas_product_id: uuid, sku: text, lot_code: nText, quantity: qty })),
});
const productionMaterialsDelivered = z.object({
  code: text, atlas_production_order_id: uuid, order: text, delivery: nText, received_by: nText,
  items: z.array(z.object({ atlas_material_id: uuid, atlas_product_id: uuid, sku: text, lot_code: nText, quantity: qty })),
});
const productionLeftoversReturned = z.object({
  code: text, atlas_production_order_id: uuid, order: text, atlas_material_id: uuid, atlas_product_id: uuid, sku: text,
  lot_code: nText, quantity: qty, location: nText,
});
const productionOutputReceived = z.object({
  code: text, atlas_production_order_id: uuid, order: text, atlas_product_id: uuid, sku: text, lot_code: nText,
  expiration_date: nDate, quantity: qty, total_received: qty,
});
const importCleared = z.object({
  code: text, atlas_purchase_order_id: uuid,
  declaration: z.object({ type: text, number: text, cleared_at: isoDate }), origin_country: text,
  items: z.array(z.object({ atlas_product_id: uuid, sku: text, ncm: nText, lot_code: nText, quantity: qty })),
});
const exportPacked = z.object({
  code: text, atlas_sales_order_id: uuid, incoterm: text, destination_country: text, invoice: nText, due_number: nText,
  gross_weight_kg: z.number().nullable(), net_weight_kg: z.number().nullable(), volume_m3: z.number().nullable(),
  packages: z.array(z.object({
    number: z.number().int(), type: text, gross_weight_kg: z.number().nullable(),
    items: z.array(z.object({ atlas_product_id: uuid, sku: text, lot_code: nText, quantity: qty, ncm: nText, origin_country: nText })),
  })),
});
const stockBalanceSnapshot = z.object({
  snapshot_id: uuid, taken_at: isoDateTime, chunk: z.number().int().positive(), chunks: z.number().int().positive(),
  reason: z.enum(["daily_reconciliation", "initial_load", "on_demand"]), as_of_event_id: uuid.nullable(),
  items: z.array(z.object({
    atlas_product_id: uuid, sku: text, orion_warehouse_code: text, lot_code: nText, on_hand: qty, reserved: qty,
    blocked: qty, in_quarantine: qty,
  })),
});
const dockAppointmentCreated = z.record(z.string(), z.unknown());

export const orionToAtlasPayloads = {
  "outbound.accepted": outboundAccepted,
  "document.rejected": documentRejected,
  "outbound.picking_started": outboundPickingStarted,
  "outbound.ready_to_invoice": outboundReadyToInvoice,
  "outbound.shipped": outboundShipped,
  "outbound.cancelled": outboundCancelled,
  "outbound.line_cancelled": outboundLineCancelled,
  "receipt.completed": receiptCompleted,
  "divergence.registered": divergenceRegistered,
  "customer_return.completed": customerReturnCompleted,
  "inventory.approved": inventoryApproved,
  "stock.adjusted": stockAdjusted,
  "stock.transferred": stockTransferred,
  "production.materials_delivered": productionMaterialsDelivered,
  "production.leftovers_returned": productionLeftoversReturned,
  "production.output_received": productionOutputReceived,
  "import.cleared": importCleared,
  "export.packed": exportPacked,
  "stock.balance_snapshot": stockBalanceSnapshot,
  "dock.appointment_created": dockAppointmentCreated,
} as const;

export type AtlasToOrionType = keyof typeof atlasToOrionPayloads;
export type OrionToAtlasType = keyof typeof orionToAtlasPayloads;

/** Capacidades anunciadas em GET /capabilities (§3.3): tipo → versões aceitas. */
export function capabilities(): { types: Record<string, number[]> } {
  return { types: Object.fromEntries(Object.keys(orionToAtlasPayloads).map((t) => [t, [1]])) };
}

export type ValidationIssue = { path: string; issue: string };

/** Valida um envelope ORION → ATLAS: envelope + payload do tipo. */
export function parseInboundEnvelope(input: unknown):
  | { ok: true; envelope: OrionEnvelope }
  | { ok: false; code: "invalid_envelope" | "validation_failed"; message: string; details: ValidationIssue[] } {
  const env = envelopeSchema.safeParse(input);
  if (!env.success) {
    return { ok: false, code: "invalid_envelope", message: "Envelope inválido.", details: issues(env.error, "") };
  }
  if (env.data.source !== "orion") {
    return { ok: false, code: "invalid_envelope", message: "source deve ser 'orion'.", details: [{ path: "source", issue: "invalid_value" }] };
  }
  const schema = orionToAtlasPayloads[env.data.type as OrionToAtlasType];
  if (!schema) {
    return { ok: false, code: "validation_failed", message: `Tipo não suportado: ${env.data.type}.`, details: [{ path: "type", issue: "unsupported_type" }] };
  }
  if (env.data.version !== 1) {
    return { ok: false, code: "validation_failed", message: `Versão ${env.data.version} não suportada para ${env.data.type}.`, details: [{ path: "version", issue: "unsupported_version" }] };
  }
  const payload = schema.safeParse(env.data.payload);
  if (!payload.success) {
    const details = issues(payload.error, "payload");
    return { ok: false, code: "validation_failed", message: details.map((d) => `${d.path}: ${d.issue}`).join("; "), details };
  }
  return { ok: true, envelope: env.data };
}

function issues(error: z.ZodError, prefix: string): ValidationIssue[] {
  return error.issues.map((i) => ({
    path: [prefix, ...i.path.map((p) => (typeof p === "number" ? `[${p}]` : String(p)))].filter(Boolean).join(".").replace(/\.\[/g, "["),
    issue: i.code,
  }));
}

// ------------------------------------------------------------ SSO e acesso
export const launchTokenClaimsSchema = z.object({
  iss: z.string().url(),
  aud: z.literal("orion-wms"),
  sub: uuid,
  iat: z.number().int(),
  nbf: z.number().int(),
  exp: z.number().int(),
  jti: uuid,
  atlas_company_id: uuid,
  orion_company_id: uuid,
  email: z.string().email(),
  name: z.string().min(1),
  orion_role: orionRoleSchema,
  access_version: z.number().int().positive(),
  warehouses: z.array(z.string()).optional(),
  return_to: z.string().regex(/^\/(?!\/)[^\\\s]*$/),
  state: z.string().min(1).max(256).optional(),
}).refine((c) => c.exp - c.iat === 60, { message: "exp - iat deve ser 60" });
export type LaunchTokenClaims = z.infer<typeof launchTokenClaimsSchema>;

export const launchTokenHeaderSchema = z.object({ alg: z.literal("ES256"), typ: z.literal("JWT"), kid: z.string().min(1) });

export const accessCheckResponseSchema = z.discriminatedUnion("active", [
  z.object({
    atlas_user_id: uuid, atlas_company_id: uuid, active: z.literal(true), orion_role: orionRoleSchema,
    access_version: z.number().int().positive(), email: z.string().email(), name: z.string(), warehouses: z.array(z.string()),
    checked_at: isoDateTime,
  }),
  z.object({
    atlas_user_id: uuid, atlas_company_id: uuid, active: z.literal(false),
    reason: z.enum(["company_suspended", "module_disabled", "user_inactive", "access_revoked"]),
    access_version: z.number().int().nonnegative(), checked_at: isoDateTime,
  }),
]);

export const eventResponseSchema = z.union([
  z.object({ status: z.literal("accepted"), event_id: uuid, duplicate: z.boolean() }),
  z.object({ status: z.literal("ignored"), event_id: uuid, duplicate: z.boolean() }),
  z.object({
    status: z.literal("rejected"), event_id: uuid.nullable(),
    error: z.object({
      code: z.string(), message: z.string(), retryable: z.boolean(),
      expected_sequence: z.number().int().optional(),
      details: z.array(z.object({ path: z.string(), issue: z.string() })).optional(),
    }),
  }),
]);

// ------------------------------------------------------------ vínculo e lote (s2s.links.*, s2s.events-batch.*)
/** Corpo de POST {ORION}/api/atlas/v1/links (credencial de instalação, §3.4/§6.1). */
export const linkRequestSchema = z.object({
  atlas_company_id: uuid,
  atlas_url: z.string().url().nullable().optional(),
  key_id: z.string().min(3).max(120),
  secret: z.string().min(32).max(200),
  company: z.looseObject({
    name: z.string().min(1).max(200), legal_name: nText.optional(), document: nText.optional(), email: nText.optional(),
    phone: nText.optional(), address: nText.optional(), city: nText.optional(), state: nText.optional(), zip_code: nText.optional(),
  }),
  admin: z.object({ atlas_user_id: uuid, email: z.string().email(), name: z.string().min(1).max(120) }).nullable().optional(),
  previous_secret_hours: z.number().int().min(0).max(168).optional(),
});
export type OrionLinkRequest = z.infer<typeof linkRequestSchema>;
/** Resposta de POST /links: 201 (criado) ou 200 (atualizado/rotacionado). */
export const linkResponseSchema = z.object({
  status: z.enum(["activating", "active", "suspended", "disabled"]),
  atlas_company_id: uuid,
  orion_company_id: uuid,
  key_id: z.string().min(3),
});
/** POST …/events/batch (os dois lados): até 500 envelopes da mesma empresa, em ordem. */
export const batchRequestSchema = z.object({ events: z.array(z.unknown()).min(1).max(500) });
export const batchResponseSchema = z.object({
  status: z.literal("processed"),
  results: z.array(z.object({ http_status: z.number().int(), body: z.record(z.string(), z.unknown()) })),
});

export const jwksSchema = z.object({
  keys: z.array(z.object({
    kty: z.literal("EC"), crv: z.literal("P-256"), kid: z.string().min(1), use: z.literal("sig"), alg: z.literal("ES256"),
    x: z.string().min(1), y: z.string().min(1),
  }).strict()).min(1),
});

// ------------------------------------------------------------ telas
export const orionConfigSchema = z.object({
  salesReleaseStatus: z.enum(["approved", "reserved"]),
  purchaseReleaseStatus: z.enum(["approved", "sent"]),
  productionReleaseStatus: z.enum(["planned", "released"]),
  autoSend: z.boolean(),
  requireInvoiceBeforeShip: z.boolean(),
});
export const orionWarehouseMapSchema = z.object({
  warehouseId: uuid,
  orionWarehouseCode: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,40}$/, "Código ORION: letras, números, ponto, hífen ou sublinhado (até 40)."),
});
export const orionGrantAccessSchema = z.object({
  userId: uuid,
  orionRole: orionRoleSchema,
  warehouses: z.array(z.string().trim().min(1)).max(100).default([]),
});
export const orionLinkSchema = z.object({
  orionUrl: z.string().trim().url("URL do ORION inválida.").refine((u) => /^https?:\/\//.test(u), "Use http(s)."),
});
export const orionDiscardSchema = z.object({ reason: z.string().trim().min(3, "Informe o motivo do descarte.").max(500) });
