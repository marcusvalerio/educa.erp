import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  convertUnitQuantitySchema,
  productAttributeSchema,
  productAttributeValueSchema,
  assignProductAttributeSchema,
  partyAddressSchema,
  partyContactSchema,
} from "@/lib/validations/master-data";

// Handlers das estruturas novas de Cadastros Mestres Avançados
// (supabase/migrations/0049-0051, Fase 13). units/product_categories/
// product_brands/unit_conversions/products continuam servidos pelo
// factory genérico já existente (src/lib/api/handlers.ts) — não
// duplicados aqui.

async function requireAccess(permissionCode: string): Promise<{ companyId: string }> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  const allowed = await hasPermission(ctx.companyId, permissionCode);
  if (!allowed) throw forbiddenError(permissionCode);
  return { companyId: ctx.companyId };
}

function firstIssueMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

async function parseBody<T>(request: NextRequest, schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } }): Promise<T> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
  const parsed = schema.safeParse(body);
  if (!parsed.success || !parsed.data) throw validationError(firstIssueMessage(parsed.error!));
  return parsed.data;
}

function rpcError(error: { message?: string; code?: string }): ApiError {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("permissão negada")) return new ApiError("FORBIDDEN", error.message ?? "", 403);
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------- unit conversion
export async function convertUnitQuantity(request: NextRequest) {
  try {
    await requireAccess("unit_conversions.read");
    const body = await parseBody(request, convertUnitQuantitySchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_convert_unit_quantity", {
      p_company_id: ctx.companyId,
      p_from_unit_id: body.fromUnitId,
      p_to_unit_id: body.toUnitId,
      p_quantity: body.quantity,
      p_product_id: body.productId ?? null,
      p_reference_date: body.referenceDate || null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: { convertedQuantity: data } });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------- product_attributes
export async function listProductAttributes(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("product_attributes.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("product_attributes").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("name");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProductAttribute(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("product_attributes.create");
    const body = await parseBody(request, productAttributeSchema);
    const { data, error } = await createAdminClient().from("product_attributes").insert({
      company_id: companyId,
      code: body.code,
      name: body.name,
      input_type: body.inputType,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateProductAttribute(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("product_attributes.update");
    const { id } = await context.params;
    const body = await parseBody(request, productAttributeSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { inputType, ...rest } = body;
    const { data, error } = await createAdminClient().from("product_attributes")
      .update({ ...rest, ...(inputType !== undefined ? { input_type: inputType } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Atributo de produto");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listProductAttributeValues(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("product_attributes.view");
    const { searchParams } = new URL(request.url);
    const attributeId = searchParams.get("attributeId");
    let query = createAdminClient().from("product_attribute_values").select("*").eq("company_id", companyId);
    if (attributeId) query = query.eq("attribute_id", attributeId);
    const { data, error } = await query.order("value");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProductAttributeValue(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("product_attributes.create");
    const body = await parseBody(request, productAttributeValueSchema);
    const { data, error } = await createAdminClient().from("product_attribute_values").insert({
      company_id: companyId,
      attribute_id: body.attributeId,
      value: body.value,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listProductAttributeAssignments(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("product_attributes.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    let query = createAdminClient().from("product_attribute_assignments").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query;
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function assignProductAttribute(request: NextRequest) {
  try {
    await requireAccess("product_attributes.update");
    const body = await parseBody(request, assignProductAttributeSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_assign_product_attribute", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_attribute_id: body.attributeId,
      p_value_id: body.valueId ?? null,
      p_value_text: body.valueText ?? null,
      p_value_number: body.valueNumber ?? null,
      p_value_boolean: body.valueBoolean ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ party_addresses
export async function listPartyAddresses(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("party_addresses.view");
    const { searchParams } = new URL(request.url);
    const partyType = searchParams.get("partyType");
    const partyId = searchParams.get("partyId");
    let query = createAdminClient().from("party_addresses").select("*").eq("company_id", companyId);
    if (partyType) query = query.eq("party_type", partyType);
    if (partyId) query = query.eq("party_id", partyId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPartyAddress(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("party_addresses.create");
    const body = await parseBody(request, partyAddressSchema);
    const { data, error } = await createAdminClient().from("party_addresses").insert({
      company_id: companyId,
      party_type: body.partyType,
      party_id: body.partyId,
      address_type: body.addressType,
      zip_code: body.zipCode ?? null,
      state: body.state ?? null,
      city: body.city ?? null,
      neighborhood: body.neighborhood ?? null,
      address: body.address ?? null,
      address_number: body.addressNumber ?? null,
      address_complement: body.addressComplement ?? null,
      notes: body.notes ?? null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updatePartyAddress(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("party_addresses.update");
    const { id } = await context.params;
    const body = await parseBody(request, partyAddressSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { partyType, partyId, addressType, zipCode, addressNumber, addressComplement, ...rest } = body;
    const { data, error } = await createAdminClient().from("party_addresses")
      .update({
        ...rest,
        ...(partyType !== undefined ? { party_type: partyType } : {}),
        ...(partyId !== undefined ? { party_id: partyId } : {}),
        ...(addressType !== undefined ? { address_type: addressType } : {}),
        ...(zipCode !== undefined ? { zip_code: zipCode } : {}),
        ...(addressNumber !== undefined ? { address_number: addressNumber } : {}),
        ...(addressComplement !== undefined ? { address_complement: addressComplement } : {}),
      })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Endereço");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function setPrimaryPartyAddress(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("party_addresses.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_set_primary_party_address", { p_address_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------------- party_contacts
export async function listPartyContacts(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("party_contacts.view");
    const { searchParams } = new URL(request.url);
    const partyType = searchParams.get("partyType");
    const partyId = searchParams.get("partyId");
    let query = createAdminClient().from("party_contacts").select("*").eq("company_id", companyId);
    if (partyType) query = query.eq("party_type", partyType);
    if (partyId) query = query.eq("party_id", partyId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPartyContact(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("party_contacts.create");
    const body = await parseBody(request, partyContactSchema);
    const { data, error } = await createAdminClient().from("party_contacts").insert({
      company_id: companyId,
      party_type: body.partyType,
      party_id: body.partyId,
      name: body.name,
      role: body.role ?? null,
      phone: body.phone ?? null,
      email: body.email || null,
      contact_type: body.contactType ?? "commercial",
      notes: body.notes ?? null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updatePartyContact(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("party_contacts.update");
    const { id } = await context.params;
    const body = await parseBody(request, partyContactSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { partyType, partyId, contactType, ...rest } = body;
    const { data, error } = await createAdminClient().from("party_contacts")
      .update({
        ...rest,
        ...(partyType !== undefined ? { party_type: partyType } : {}),
        ...(partyId !== undefined ? { party_id: partyId } : {}),
        ...(contactType !== undefined ? { contact_type: contactType } : {}),
      })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Contato");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function setPrimaryPartyContact(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("party_contacts.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_set_primary_party_contact", { p_contact_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
