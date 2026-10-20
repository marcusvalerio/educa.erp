import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFoundError, translatePostgresError, validationError } from "@/lib/database/errors";
import { buildAccessKey, numericCode } from "./nfe/access-key";
import { onlyDigits, ufCode } from "./nfe/uf";
import { apportion, buildNfeXml, protocolNumber, validateNfeInput, wrapNfeProc, type NfeInput, type NfeItem, type NfeTax } from "./nfe/xml";

// Monta os dados da NF-e de ensino a partir do banco (sempre filtrando
// pela empresa da sessão) e gera o XML autorizado. Quem grava é a função
// fn_issue_fiscal_document_education, chamada com a sessão do usuário.

export const APP_VERSION = "ATLAS.ERP 1.0";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => Number(v ?? 0) || 0;

// ------------------------------------------------------------ município (IBGE)
const ibgeCache = new Map<string, string | null>();

const normalizeCity = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const ufCities = new Map<string, Map<string, string>>();

/** Código IBGE pelo nome da cidade na UF (API de localidades do IBGE). */
async function cityCodeFromName(city: string, uf: string): Promise<string | null> {
  const key = uf.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(key) || !city.trim()) return null;
  let map = ufCities.get(key);
  if (!map) {
    try {
      const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios`, { signal: AbortSignal.timeout(6000), cache: "force-cache" });
      const list = (await res.json().catch(() => null)) as { id: number; nome: string }[] | null;
      if (!Array.isArray(list) || list.length === 0) return null;
      map = new Map(list.map((m) => [normalizeCity(m.nome), String(m.id)]));
      ufCities.set(key, map);
    } catch {
      return null;
    }
  }
  return map.get(normalizeCity(city)) ?? null;
}

/**
 * Código IBGE do município: pelo CEP (ViaCEP) e, sem resposta, pelo nome
 * da cidade na UF (IBGE). Nulo quando nenhum dos dois encontra.
 */
export async function cityCode(cep: string, city: string, uf: string): Promise<string | null> {
  const digits = onlyDigits(cep);
  if (digits.length === 8) {
    const cached = ibgeCache.get(digits);
    if (cached) return cached;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: AbortSignal.timeout(5000), cache: "force-cache" });
      const body = (await res.json().catch(() => null)) as { ibge?: string; erro?: boolean } | null;
      const code = body && !body.erro && /^\d{7}$/.test(body.ibge ?? "") ? body.ibge! : null;
      if (code) {
        ibgeCache.set(digits, code);
        return code;
      }
    } catch {
      /* cai para o IBGE */
    }
  }
  return cityCodeFromName(city, uf);
}

function crtOf(regime: string): NfeInput["crt"] {
  if (regime === "MEI") return 4;
  if (regime === "SIMPLES_NACIONAL") return 1;
  return 3;
}

const FREIGHT_MODE: Record<string, NfeInput["freightMode"]> = { EMITENTE: 0, DESTINATARIO: 1, TERCEIROS: 2, SEM_FRETE: 9 };

async function one(table: string, companyId: string, id: unknown): Promise<Row | null> {
  if (!id) return null;
  const { data, error } = await createAdminClient().from(table).select("*").eq("company_id", companyId).eq("id", String(id)).maybeSingle();
  if (error) throw translatePostgresError(error);
  return (data as Row) ?? null;
}

async function many(table: string, companyId: string, column: string, values: unknown[]): Promise<Row[]> {
  if (values.length === 0) return [];
  const { data, error } = await createAdminClient().from(table).select("*").eq("company_id", companyId).in(column, values.map(String));
  if (error) throw translatePostgresError(error);
  return (data as Row[]) ?? [];
}

export type NfeDraft = { input: NfeInput; problems: string[]; document: Row };

/** Lê documento, emitente, destinatário, itens e impostos e monta a NF-e. */
export async function loadNfe(companyId: string, documentId: string, issuedAt: Date): Promise<NfeDraft> {
  const document = await one("fiscal_documents", companyId, documentId);
  if (!document) throw notFoundError("Documento fiscal");
  if (document.type !== "NFE") throw validationError("O modo ensino emite só NF-e (modelo 55).");
  if (document.direction !== "SAIDA") throw validationError("O modo ensino emite só notas de saída.");

  const [establishment, nature, customer, carrier] = await Promise.all([
    one("fiscal_establishments", companyId, document.fiscal_establishment_id),
    one("fiscal_operation_natures", companyId, document.operation_nature_id),
    one("customers", companyId, document.customer_id),
    one("carriers", companyId, document.carrier_id),
  ]);
  if (!establishment) throw validationError("Cadastre o estabelecimento emitente em Fiscal › Configuração.");
  if (!customer) throw validationError("A nota precisa de um cliente.");

  const items = await many("fiscal_document_items", companyId, "fiscal_document_id", [documentId]);
  items.sort((a, b) => s(a.created_at).localeCompare(s(b.created_at)));
  const [taxes, products, profiles, packages] = await Promise.all([
    many("fiscal_document_item_taxes", companyId, "fiscal_document_item_id", items.map((i) => i.id)),
    many("products", companyId, "id", [...new Set(items.map((i) => i.product_id))]),
    many("product_fiscal_profiles", companyId, "product_id", [...new Set(items.map((i) => i.product_id))]),
    many("fiscal_document_packages", companyId, "fiscal_document_id", [documentId]),
  ]);
  const productById = new Map(products.map((p) => [s(p.id), p]));
  const profileByProduct = new Map(profiles.filter((p) => p.status === "active").map((p) => [s(p.product_id), p]));

  // Frete/seguro/outras do cabeçalho: rateados entre os itens (o total da nota é a soma dos itens).
  const weights = items.map((i) => n(i.gross_amount) || n(i.quantity) * n(i.unit_price));
  const itemsHaveFreight = items.some((i) => n(i.freight_amount) > 0);
  const freight = itemsHaveFreight ? items.map((i) => n(i.freight_amount)) : apportion(n(document.freight_amount), weights);
  const insurance = items.some((i) => n(i.insurance_amount) > 0) ? items.map((i) => n(i.insurance_amount)) : apportion(n(document.insurance_amount), weights);
  const other = items.some((i) => n(i.other_expenses) > 0) ? items.map((i) => n(i.other_expenses)) : apportion(n(document.other_expenses_amount), weights);

  const nfeItems: NfeItem[] = items.map((i, idx) => {
    const product = productById.get(s(i.product_id));
    const profile = profileByProduct.get(s(i.product_id));
    const itemTaxes: NfeTax[] = taxes
      .filter((t) => s(t.fiscal_document_item_id) === s(i.id))
      .map((t) => ({ type: s(t.tax_type) as NfeTax["type"], cst: (t.cst as string) ?? null, csosn: (t.csosn as string) ?? null, basis: n(t.calculation_basis), rate: n(t.rate), reduction: n(t.reduction_percentage), amount: n(t.amount) }));
    return {
      code: s(product?.code) || s(i.product_id).slice(0, 8),
      description: s(i.description),
      ncm: s(i.ncm_code),
      cfop: s(i.cfop_code),
      unit: s(i.unit) || "UN",
      quantity: n(i.quantity),
      unitPrice: n(i.unit_price),
      grossAmount: n(i.gross_amount),
      discount: n(i.discount),
      freight: freight[idx],
      insurance: insurance[idx],
      other: other[idx],
      origin: s(i.origin_code) || "0",
      taxes: itemTaxes,
      defaults: { icmsCst: (profile?.icms_cst as string) ?? null, icmsCsosn: (profile?.icms_csosn as string) ?? null, pisCst: (profile?.pis_cst as string) ?? null, cofinsCst: (profile?.cofins_cst as string) ?? null },
    };
  });

  const [emitCity, destCity] = await Promise.all([
    cityCode(s(establishment.zip_code), s(establishment.city), s(establishment.state)),
    cityCode(s(customer.zip_code), s(customer.city), s(customer.state)),
  ]);
  const uf = ufCode(s(establishment.state));
  const number = n(document.number);
  const series = Number(onlyDigits(document.series) || "1");
  const cnf = numericCode(s(document.id), number);
  const accessKey = uf && number ? buildAccessKey({ cUF: uf, issuedAt, cnpj: s(establishment.cnpj), series, number, numericCode: cnf }) : "0".repeat(44);

  // Fatura/duplicatas: contas a receber geradas do pedido de venda.
  let invoice: NfeInput["invoice"] = null;
  if (document.source_type === "sales_order" && document.source_id) {
    const order = await one("sales_orders", companyId, document.source_id);
    const { data: receivables } = await createAdminClient().from("accounts_receivable").select("id, code").eq("company_id", companyId).eq("origin_type", "sales_order").eq("origin_id", s(document.source_id)).neq("status", "CANCELLED");
    const ids = (receivables ?? []).map((r: Row) => r.id);
    const installments = await many("accounts_receivable_installments", companyId, "receivable_id", ids);
    installments.sort((a, b) => s(a.due_date).localeCompare(s(b.due_date)) || n(a.installment_number) - n(b.installment_number));
    if (installments.length > 0) {
      invoice = {
        number: s(order?.code) || String(number),
        installments: installments.map((p, k) => ({ number: String(k + 1).padStart(3, "0"), dueDate: s(p.due_date).slice(0, 10), amount: n(p.amount) })),
      };
    }
  }

  const volumesQty = packages.reduce((a, p) => a + n(p.quantity), 0) || n(document.volumes_quantity);
  const crt = crtOf(s(establishment.tax_regime));
  const info = [
    crt === 1 || crt === 4 ? "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI." : "",
    "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO PARA FINS DE ENSINO - SEM VALOR FISCAL.",
    s(document.notes),
  ].filter(Boolean);

  const input: NfeInput = {
    accessKey,
    numericCode: cnf,
    ufCode: uf ?? "",
    // Na nota vai só o nome da operação (sem o "(dentro do estado)" do cadastro).
    operationNature: s(nature?.name).replace(/\s*\(.*\)\s*$/, "") || "Venda de mercadoria",
    series,
    number,
    issuedAt,
    direction: 1,
    crt,
    environment: 2,
    emitter: {
      document: s(establishment.cnpj),
      name: s(establishment.name),
      stateRegistration: s(establishment.state_registration),
      address: { street: s(establishment.address), number: s(establishment.address_number), district: s(establishment.neighborhood), cityCode: emitCity ?? "", cityName: s(establishment.city), uf: s(establishment.state).toUpperCase(), zip: s(establishment.zip_code) },
    },
    recipient: {
      document: s(customer.document),
      name: s(customer.name),
      stateRegistration: s(customer.state_registration),
      email: s(customer.email),
      address: { street: s(customer.address), number: s(customer.address_number), complement: s(customer.address_complement), district: s(customer.neighborhood), cityCode: destCity ?? "", cityName: s(customer.city), uf: s(customer.state).toUpperCase(), zip: s(customer.zip_code), phone: s(customer.phone || customer.mobile_phone) },
    },
    items: nfeItems,
    freightMode: FREIGHT_MODE[s(document.freight_mode)] ?? (n(document.freight_amount) > 0 ? 0 : 9),
    carrier: carrier ? { document: s(carrier.document), name: s(carrier.legal_name), stateRegistration: s(carrier.state_registration), address: s(carrier.address), city: s(carrier.city), uf: s(carrier.state) } : null,
    volumes: volumesQty > 0 ? { quantity: volumesQty, species: s(packages[0]?.species) || "VOLUME", netWeight: n(document.net_weight), grossWeight: n(document.gross_weight) } : null,
    invoice,
    additionalInfo: info.join(" "),
    appVersion: APP_VERSION,
  };

  const problems = validateNfeInput(input);
  if (!uf) problems.unshift("Emitente: informe a UF do estabelecimento.");
  return { input, problems, document };
}

/** XML autorizado (nfeProc) e protocolo, prontos para gravar. */
export function authorizeXml(input: NfeInput, receivedAt: Date) {
  const { xml, totals } = buildNfeXml(input);
  const digestValue = createHash("sha1").update(xml, "utf8").digest("base64");
  const protocol = protocolNumber(input.ufCode, receivedAt, input.accessKey);
  const proc = wrapNfeProc(xml, { accessKey: input.accessKey, protocol, receivedAt, digestValue, environment: input.environment, appVersion: APP_VERSION });
  return { proc, protocol, totals };
}
