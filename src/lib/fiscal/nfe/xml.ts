import { onlyDigits } from "./uf";

// XML da NF-e modelo 55, layout 4.00 (MOC/Portal Nacional da NF-e), na
// ordem de tags do schema. Modo ensino: tpAmb=2 (homologação), sem
// assinatura digital (não há certificado) — o restante segue o leiaute.

export type NfeAddress = {
  street: string;
  number: string;
  complement?: string;
  district: string;
  cityCode: string;
  cityName: string;
  uf: string;
  zip: string;
  phone?: string;
};

export type NfeParty = {
  document: string;
  name: string;
  tradeName?: string;
  stateRegistration?: string;
  email?: string;
  address: NfeAddress;
};

export type NfeTax = {
  type: "ICMS" | "ICMS_ST" | "IPI" | "PIS" | "COFINS" | "FCP" | "DIFAL" | "ISS" | "OTHER";
  cst?: string | null;
  csosn?: string | null;
  basis: number;
  rate: number;
  reduction: number;
  amount: number;
};

export type NfeItem = {
  code: string;
  description: string;
  ncm: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discount: number;
  freight: number;
  insurance: number;
  other: number;
  origin: string;
  taxes: NfeTax[];
  /** CST/CSOSN do perfil fiscal quando não há regra tributária para o item. */
  defaults: { icmsCst?: string | null; icmsCsosn?: string | null; pisCst?: string | null; cofinsCst?: string | null };
};

export type NfeInstallment = { number: string; dueDate: string; amount: number };

export type NfeInput = {
  accessKey: string;
  numericCode: string;
  ufCode: string;
  operationNature: string;
  series: number;
  number: number;
  issuedAt: Date;
  /** 0 = entrada, 1 = saída. */
  direction: 0 | 1;
  crt: 1 | 2 | 3 | 4;
  environment: 1 | 2;
  emitter: NfeParty;
  recipient: NfeParty;
  items: NfeItem[];
  freightMode: 0 | 1 | 2 | 3 | 4 | 9;
  carrier?: { document?: string; name: string; stateRegistration?: string; address?: string; city?: string; uf?: string } | null;
  volumes?: { quantity: number; species?: string; netWeight?: number; grossWeight?: number } | null;
  invoice?: { number: string; installments: NfeInstallment[] } | null;
  additionalInfo?: string;
  appVersion: string;
};

export type NfeTotals = {
  vBC: number; vICMS: number; vBCST: number; vST: number; vProd: number; vFrete: number; vSeg: number;
  vDesc: number; vIPI: number; vPIS: number; vCOFINS: number; vOutro: number; vNF: number; vTotTrib: number;
};

const r = (v: number, n = 2) => Math.round((v + Number.EPSILON) * 10 ** n) / 10 ** n;
export const dec = (v: number, n = 2) => r(Number(v) || 0, n).toFixed(n);

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Texto para XML: sem quebras/espaços duplos (o schema rejeita) e com escape. */
export const xmlText = (v: unknown, max = 60) =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max)
    .replace(/[&<>"']/g, (c) => ESC[c]);

const tag = (name: string, value: string | undefined | null) => (value === undefined || value === null || value === "" ? "" : `<${name}>${value}</${name}>`);

/** Data/hora com fuso de Brasília (UTC-3), como exige o leiaute. */
export function brDateTime(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.toISOString().slice(0, 19) + "-03:00";
}

function docTag(document: string) {
  const d = onlyDigits(document);
  return d.length === 11 ? tag("CPF", d) : tag("CNPJ", d);
}

function addressXml(group: string, a: NfeAddress) {
  return (
    `<${group}>` +
    tag("xLgr", xmlText(a.street)) +
    tag("nro", xmlText(a.number || "S/N", 60)) +
    tag("xCpl", xmlText(a.complement)) +
    tag("xBairro", xmlText(a.district)) +
    tag("cMun", a.cityCode) +
    tag("xMun", xmlText(a.cityName)) +
    tag("UF", a.uf.toUpperCase()) +
    tag("CEP", onlyDigits(a.zip).padStart(8, "0")) +
    "<cPais>1058</cPais><xPais>BRASIL</xPais>" +
    tag("fone", onlyDigits(a.phone).slice(0, 14) || undefined) +
    `</${group}>`
  );
}

const taxOf = (item: NfeItem, type: NfeTax["type"]) => item.taxes.find((t) => t.type === type);

/** Grupo ICMS conforme regime (CSOSN no Simples, CST no regime normal). */
function icmsXml(item: NfeItem, crt: NfeInput["crt"]) {
  const icms = taxOf(item, "ICMS");
  const orig = tag("orig", item.origin || "0");
  if (crt === 1 || crt === 4) {
    const csosn = icms?.csosn || item.defaults.icmsCsosn || "102";
    if (csosn === "101") {
      return `<ICMSSN101>${orig}<CSOSN>101</CSOSN><pCredSN>${dec(icms?.rate ?? 0, 4)}</pCredSN><vCredICMSSN>${dec(icms?.amount ?? 0)}</vCredICMSSN></ICMSSN101>`;
    }
    if (csosn === "900") {
      return `<ICMSSN900>${orig}<CSOSN>900</CSOSN><modBC>3</modBC><vBC>${dec(icms?.basis ?? 0)}</vBC><pICMS>${dec(icms?.rate ?? 0, 4)}</pICMS><vICMS>${dec(icms?.amount ?? 0)}</vICMS></ICMSSN900>`;
    }
    if (csosn === "500") return `<ICMSSN500>${orig}<CSOSN>500</CSOSN></ICMSSN500>`;
    const code = ["102", "103", "300", "400"].includes(csosn) ? csosn : "102";
    return `<ICMSSN102>${orig}<CSOSN>${code}</CSOSN></ICMSSN102>`;
  }
  const cst = (icms?.cst || item.defaults.icmsCst || (icms ? "00" : "41")).padStart(2, "0");
  const vals = (red?: boolean) =>
    `<modBC>3</modBC>${red ? `<pRedBC>${dec(icms?.reduction ?? 0, 4)}</pRedBC>` : ""}<vBC>${dec(icms?.basis ?? 0)}</vBC><pICMS>${dec(icms?.rate ?? 0, 4)}</pICMS><vICMS>${dec(icms?.amount ?? 0)}</vICMS>`;
  if (cst === "00") return `<ICMS00>${orig}<CST>00</CST>${vals()}</ICMS00>`;
  if (cst === "20") return `<ICMS20>${orig}<CST>20</CST>${vals(true)}</ICMS20>`;
  if (["40", "41", "50"].includes(cst)) return `<ICMS40>${orig}<CST>${cst}</CST></ICMS40>`;
  if (cst === "60") return `<ICMS60>${orig}<CST>60</CST></ICMS60>`;
  return `<ICMS90>${orig}<CST>90</CST>${vals()}</ICMS90>`;
}

/** PIS/COFINS: alíquota (01/02), não tributado (04–09) ou outras operações. */
function contribXml(group: "PIS" | "COFINS", item: NfeItem, crt: NfeInput["crt"]) {
  const t = taxOf(item, group);
  const def = group === "PIS" ? item.defaults.pisCst : item.defaults.cofinsCst;
  const cst = (t?.cst || def || (crt === 3 ? (t ? "01" : "07") : "49")).padStart(2, "0");
  const p = group === "PIS" ? "PIS" : "COFINS";
  const values = `<vBC>${dec(t?.basis ?? 0)}</vBC><p${p}>${dec(t?.rate ?? 0, 4)}</p${p}><v${p}>${dec(t?.amount ?? 0)}</v${p}>`;
  if (["01", "02"].includes(cst)) return `<${group}><${group}Aliq><CST>${cst}</CST>${values}</${group}Aliq></${group}>`;
  if (["04", "05", "06", "07", "08", "09"].includes(cst)) return `<${group}><${group}NT><CST>${cst}</CST></${group}NT></${group}>`;
  return `<${group}><${group}Outr><CST>${cst}</CST>${values}</${group}Outr></${group}>`;
}

function ipiXml(item: NfeItem) {
  const t = taxOf(item, "IPI");
  if (!t) return "";
  const cst = (t.cst || "50").padStart(2, "0");
  return `<IPI><cEnq>999</cEnq><IPITrib><CST>${cst}</CST><vBC>${dec(t.basis)}</vBC><pIPI>${dec(t.rate, 4)}</pIPI><vIPI>${dec(t.amount)}</vIPI></IPITrib></IPI>`;
}

/** Valor do produto (qCom × vUnCom) arredondado como na nota. */
const itemProd = (i: NfeItem) => r(i.grossAmount || i.quantity * i.unitPrice);

export function computeTotals(input: Pick<NfeInput, "items" | "crt">): NfeTotals {
  const t: NfeTotals = { vBC: 0, vICMS: 0, vBCST: 0, vST: 0, vProd: 0, vFrete: 0, vSeg: 0, vDesc: 0, vIPI: 0, vPIS: 0, vCOFINS: 0, vOutro: 0, vNF: 0, vTotTrib: 0 };
  for (const i of input.items) {
    t.vProd += itemProd(i);
    t.vFrete += r(i.freight);
    t.vSeg += r(i.insurance);
    t.vDesc += r(i.discount);
    t.vOutro += r(i.other);
    const icms = taxOf(i, "ICMS");
    // No Simples (CSOSN 101/102...) o ICMS não é destacado em vICMS, exceto 900.
    const icmsCounts = icms && (input.crt === 3 || icms.csosn === "900" || i.defaults.icmsCsosn === "900");
    if (icmsCounts) {
      t.vBC += r(icms.basis);
      t.vICMS += r(icms.amount);
    }
    const st = taxOf(i, "ICMS_ST");
    if (st) {
      t.vBCST += r(st.basis);
      t.vST += r(st.amount);
    }
    t.vIPI += r(taxOf(i, "IPI")?.amount ?? 0);
    t.vPIS += r(taxOf(i, "PIS")?.amount ?? 0);
    t.vCOFINS += r(taxOf(i, "COFINS")?.amount ?? 0);
    t.vTotTrib += i.taxes.reduce((a, x) => a + r(x.amount), 0);
  }
  for (const k of Object.keys(t) as (keyof NfeTotals)[]) t[k] = r(t[k]);
  t.vNF = r(t.vProd - t.vDesc + t.vST + t.vFrete + t.vSeg + t.vOutro + t.vIPI);
  return t;
}

/** Rateia um valor do cabeçalho (ex.: frete) entre os itens, proporcional ao valor; o último fecha a diferença. */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!total || !sum) return weights.map(() => 0);
  const parts = weights.map((w) => r((total * w) / sum));
  const diff = r(total - parts.reduce((a, b) => a + b, 0));
  parts[parts.length - 1] = r(parts[parts.length - 1] + diff);
  return parts;
}

/** `<NFe>` sem assinatura (modo ensino). */
export function buildNfeXml(input: NfeInput): { xml: string; totals: NfeTotals } {
  const totals = computeTotals(input);
  const sameUf = input.emitter.address.uf.toUpperCase() === input.recipient.address.uf.toUpperCase();
  const recipientDoc = onlyDigits(input.recipient.document);
  const isPerson = recipientDoc.length === 11;
  const ie = onlyDigits(input.recipient.stateRegistration);
  const indIEDest = ie ? 1 : 9;
  const indFinal = isPerson || !ie ? 1 : 0;
  const issued = brDateTime(input.issuedAt);

  const ide =
    "<ide>" +
    tag("cUF", input.ufCode) +
    tag("cNF", input.numericCode) +
    tag("natOp", xmlText(input.operationNature)) +
    "<mod>55</mod>" +
    tag("serie", String(input.series)) +
    tag("nNF", String(input.number)) +
    tag("dhEmi", issued) +
    tag("dhSaiEnt", issued) +
    tag("tpNF", String(input.direction)) +
    tag("idDest", sameUf ? "1" : "2") +
    tag("cMunFG", input.emitter.address.cityCode) +
    "<tpImp>1</tpImp><tpEmis>1</tpEmis>" +
    tag("cDV", input.accessKey.slice(-1)) +
    tag("tpAmb", String(input.environment)) +
    "<finNFe>1</finNFe>" +
    tag("indFinal", String(indFinal)) +
    "<indPres>9</indPres><indIntermed>0</indIntermed><procEmi>0</procEmi>" +
    tag("verProc", xmlText(input.appVersion, 20)) +
    "</ide>";

  const emit =
    "<emit>" +
    docTag(input.emitter.document) +
    tag("xNome", xmlText(input.emitter.name)) +
    tag("xFant", xmlText(input.emitter.tradeName)) +
    addressXml("enderEmit", input.emitter.address) +
    tag("IE", onlyDigits(input.emitter.stateRegistration) || "ISENTO") +
    tag("CRT", String(input.crt)) +
    "</emit>";

  const dest =
    "<dest>" +
    docTag(input.recipient.document) +
    tag("xNome", xmlText(input.recipient.name)) +
    addressXml("enderDest", input.recipient.address) +
    tag("indIEDest", String(indIEDest)) +
    (indIEDest === 1 ? tag("IE", ie) : "") +
    tag("email", xmlText(input.recipient.email)) +
    "</dest>";

  const det = input.items
    .map((i, n) => {
      const vProd = itemProd(i);
      const prod =
        "<prod>" +
        tag("cProd", xmlText(i.code)) +
        "<cEAN>SEM GTIN</cEAN>" +
        tag("xProd", xmlText(i.description, 120)) +
        tag("NCM", onlyDigits(i.ncm).padStart(8, "0")) +
        tag("CFOP", onlyDigits(i.cfop)) +
        tag("uCom", xmlText(i.unit || "UN", 6)) +
        tag("qCom", dec(i.quantity, 4)) +
        tag("vUnCom", dec(i.unitPrice, 10)) +
        tag("vProd", dec(vProd)) +
        "<cEANTrib>SEM GTIN</cEANTrib>" +
        tag("uTrib", xmlText(i.unit || "UN", 6)) +
        tag("qTrib", dec(i.quantity, 4)) +
        tag("vUnTrib", dec(i.unitPrice, 10)) +
        (i.freight > 0 ? tag("vFrete", dec(i.freight)) : "") +
        (i.insurance > 0 ? tag("vSeg", dec(i.insurance)) : "") +
        (i.discount > 0 ? tag("vDesc", dec(i.discount)) : "") +
        (i.other > 0 ? tag("vOutro", dec(i.other)) : "") +
        "<indTot>1</indTot>" +
        "</prod>";
      const totTrib = i.taxes.reduce((a, x) => a + r(x.amount), 0);
      const imposto =
        "<imposto>" +
        tag("vTotTrib", dec(totTrib)) +
        `<ICMS>${icmsXml(i, input.crt)}</ICMS>` +
        ipiXml(i) +
        contribXml("PIS", i, input.crt) +
        contribXml("COFINS", i, input.crt) +
        "</imposto>";
      return `<det nItem="${n + 1}">${prod}${imposto}</det>`;
    })
    .join("");

  const t = totals;
  const total =
    "<total><ICMSTot>" +
    tag("vBC", dec(t.vBC)) +
    tag("vICMS", dec(t.vICMS)) +
    "<vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP>" +
    tag("vBCST", dec(t.vBCST)) +
    tag("vST", dec(t.vST)) +
    "<vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>" +
    tag("vProd", dec(t.vProd)) +
    tag("vFrete", dec(t.vFrete)) +
    tag("vSeg", dec(t.vSeg)) +
    tag("vDesc", dec(t.vDesc)) +
    "<vII>0.00</vII>" +
    tag("vIPI", dec(t.vIPI)) +
    "<vIPIDevol>0.00</vIPIDevol>" +
    tag("vPIS", dec(t.vPIS)) +
    tag("vCOFINS", dec(t.vCOFINS)) +
    tag("vOutro", dec(t.vOutro)) +
    tag("vNF", dec(t.vNF)) +
    tag("vTotTrib", dec(t.vTotTrib)) +
    "</ICMSTot></total>";

  const c = input.carrier;
  const v = input.volumes;
  const transp =
    "<transp>" +
    tag("modFrete", String(input.freightMode)) +
    (c
      ? "<transporta>" +
        (c.document ? docTag(c.document) : "") +
        tag("xNome", xmlText(c.name)) +
        tag("IE", onlyDigits(c.stateRegistration) || undefined) +
        tag("xEnder", xmlText(c.address)) +
        tag("xMun", xmlText(c.city)) +
        tag("UF", c.uf?.toUpperCase()) +
        "</transporta>"
      : "") +
    (v && v.quantity > 0
      ? "<vol>" +
        tag("qVol", String(v.quantity)) +
        tag("esp", xmlText(v.species || "VOLUME")) +
        (v.netWeight ? tag("pesoL", dec(v.netWeight, 3)) : "") +
        (v.grossWeight ? tag("pesoB", dec(v.grossWeight, 3)) : "") +
        "</vol>"
      : "") +
    "</transp>";

  const inv = input.invoice && input.invoice.installments.length > 0 ? input.invoice : null;
  const cobr = inv
    ? "<cobr><fat>" +
      tag("nFat", xmlText(inv.number)) +
      tag("vOrig", dec(t.vNF)) +
      "<vDesc>0.00</vDesc>" +
      tag("vLiq", dec(t.vNF)) +
      "</fat>" +
      inv.installments.map((d) => `<dup>${tag("nDup", xmlText(d.number))}${tag("dVenc", d.dueDate)}${tag("vDup", dec(d.amount))}</dup>`).join("") +
      "</cobr>"
    : "";

  const aPrazo = inv ? inv.installments.length > 1 || inv.installments[0].dueDate > issued.slice(0, 10) : false;
  const pag = `<pag><detPag><indPag>${aPrazo ? 1 : 0}</indPag><tPag>15</tPag>${tag("vPag", dec(t.vNF))}</detPag></pag>`;

  const infAdic = input.additionalInfo ? `<infAdic>${tag("infCpl", xmlText(input.additionalInfo, 5000))}</infAdic>` : "";

  const xml =
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${input.accessKey}" versao="4.00">` +
    ide +
    emit +
    dest +
    det +
    total +
    transp +
    cobr +
    pag +
    infAdic +
    "</infNFe></NFe>";
  return { xml, totals };
}

export type NfeProtocol = { accessKey: string; protocol: string; receivedAt: Date; digestValue: string; environment: 1 | 2; appVersion: string };

/** `<nfeProc>`: NF-e + protocolo de autorização (arquivo que o destinatário recebe). */
export function wrapNfeProc(nfeXml: string, p: NfeProtocol): string {
  const prot =
    '<protNFe versao="4.00"><infProt>' +
    tag("tpAmb", String(p.environment)) +
    tag("verAplic", xmlText(p.appVersion, 20)) +
    tag("chNFe", p.accessKey) +
    tag("dhRecbto", brDateTime(p.receivedAt)) +
    tag("nProt", p.protocol) +
    tag("digVal", p.digestValue) +
    "<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>" +
    "</infProt></protNFe>";
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${nfeXml}${prot}</nfeProc>`;
}

/** Número de protocolo (15 dígitos): tipo do autorizador + cUF + ano + sequencial. */
export function protocolNumber(ufCode: string, at: Date, seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 33) ^ seed.charCodeAt(i)) >>> 0;
  return "1" + ufCode.padStart(2, "0") + String(at.getUTCFullYear() % 100).padStart(2, "0") + String(h).padStart(10, "0").slice(-10);
}

/**
 * Conferência antes de emitir, nos moldes das rejeições da SEFAZ e dos
 * limites do schema. Devolve mensagens em linguagem de usuário.
 */
export function validateNfeInput(input: NfeInput, checks: { isValidCnpj: (v: string) => boolean; isValidCpf: (v: string) => boolean }): string[] {
  const problems: string[] = [];
  const min2 = (v: string | undefined) => xmlText(v).length >= 2;
  const addr = (who: string, a: NfeAddress) => {
    if (!min2(a.street)) problems.push(`${who}: informe o endereço (logradouro).`);
    if (!min2(a.district)) problems.push(`${who}: informe o bairro (mínimo 2 letras).`);
    if (!min2(a.cityName)) problems.push(`${who}: informe a cidade.`);
    if (!/^\d{7}$/.test(a.cityCode)) problems.push(`${who}: município sem código IBGE — confira o CEP.`);
    if (!/^[A-Z]{2}$/.test(a.uf.toUpperCase())) problems.push(`${who}: informe a UF.`);
    if (onlyDigits(a.zip).length !== 8) problems.push(`${who}: CEP precisa ter 8 dígitos.`);
  };
  const emitDoc = onlyDigits(input.emitter.document);
  if (!checks.isValidCnpj(emitDoc)) problems.push("Emitente: CNPJ inválido (confira os dígitos verificadores).");
  if (!min2(input.emitter.name)) problems.push("Emitente: informe a razão social.");
  const ie = onlyDigits(input.emitter.stateRegistration);
  if (ie && (ie.length < 2 || ie.length > 14)) problems.push("Emitente: inscrição estadual com tamanho inválido.");
  addr("Emitente", input.emitter.address);

  const destDoc = onlyDigits(input.recipient.document);
  if (destDoc.length === 11 ? !checks.isValidCpf(destDoc) : !checks.isValidCnpj(destDoc)) problems.push("Destinatário: CPF/CNPJ inválido.");
  if (!min2(input.recipient.name)) problems.push("Destinatário: informe o nome.");
  addr("Destinatário", input.recipient.address);

  if (input.items.length === 0) problems.push("A nota precisa de ao menos um item.");
  const interstate = input.emitter.address.uf.toUpperCase() !== input.recipient.address.uf.toUpperCase();
  input.items.forEach((i, n) => {
    const label = `Item ${n + 1} (${xmlText(i.description, 40)})`;
    if (onlyDigits(i.ncm).length !== 8) problems.push(`${label}: NCM precisa ter 8 dígitos.`);
    const cfop = onlyDigits(i.cfop);
    if (cfop.length !== 4) problems.push(`${label}: CFOP precisa ter 4 dígitos.`);
    else if (input.direction === 1 && interstate && cfop[0] === "5") problems.push(`${label}: CFOP ${cfop} é de operação dentro do estado, mas o cliente é de outra UF (use 6xxx).`);
    else if (input.direction === 1 && !interstate && cfop[0] === "6") problems.push(`${label}: CFOP ${cfop} é interestadual, mas o cliente é da mesma UF (use 5xxx).`);
    if (!(i.quantity > 0)) problems.push(`${label}: quantidade precisa ser maior que zero.`);
    if (!(i.unitPrice >= 0)) problems.push(`${label}: valor unitário inválido.`);
    if (!min2(i.description)) problems.push(`Item ${n + 1}: descrição muito curta.`);
  });
  return problems;
}
