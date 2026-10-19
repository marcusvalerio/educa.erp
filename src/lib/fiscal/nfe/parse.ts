// Lê o XML autorizado (nfeProc) para montar a DANFE — a DANFE é sempre
// uma representação do XML, nunca de dados soltos do banco.

export type DanfeParty = {
  document: string;
  name: string;
  tradeName: string;
  ie: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  zip: string;
  phone: string;
};

export type DanfeItem = {
  code: string;
  description: string;
  ncm: string;
  cst: string;
  cfop: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  total: string;
  icmsBase: string;
  icmsValue: string;
  ipiValue: string;
  icmsRate: string;
  ipiRate: string;
};

export type DanfeData = {
  accessKey: string;
  number: string;
  series: string;
  direction: string;
  environment: string;
  operationNature: string;
  issuedAt: string;
  exitAt: string;
  crt: string;
  protocol: string;
  protocolAt: string;
  emitter: DanfeParty;
  recipient: DanfeParty;
  totals: Record<"vBC" | "vICMS" | "vBCST" | "vST" | "vProd" | "vFrete" | "vSeg" | "vDesc" | "vOutro" | "vIPI" | "vNF" | "vTotTrib" | "vPIS" | "vCOFINS", string>;
  freightMode: string;
  carrier: { document: string; name: string; ie: string; address: string; city: string; uf: string } | null;
  volumes: { quantity: string; species: string; brand: string; numbering: string; gross: string; net: string } | null;
  installments: { number: string; due: string; value: string }[];
  items: DanfeItem[];
  additionalInfo: string;
};

type El = Element | null | undefined;

const child = (el: El, name: string): Element | null => {
  if (!el) return null;
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
};
const path = (el: El, ...names: string[]): Element | null => names.reduce<Element | null>((acc, n) => child(acc, n), el ?? null);
const text = (el: El, ...names: string[]) => (path(el, ...names)?.textContent ?? "").trim();
const first = (root: Document | Element, name: string): Element | null => root.getElementsByTagNameNS("*", name)[0] ?? null;

function party(el: El, addressGroup: string): DanfeParty {
  const a = child(el, addressGroup);
  return {
    document: text(el, "CNPJ") || text(el, "CPF"),
    name: text(el, "xNome"),
    tradeName: text(el, "xFant"),
    ie: text(el, "IE"),
    street: text(a, "xLgr"),
    number: text(a, "nro"),
    complement: text(a, "xCpl"),
    district: text(a, "xBairro"),
    city: text(a, "xMun"),
    uf: text(a, "UF"),
    zip: text(a, "CEP"),
    phone: text(a, "fone"),
  };
}

/** Primeiro grupo filho (ICMS00, ICMSSN102, IPITrib...). */
const group = (el: El) => (el ? (el.children[0] ?? null) : null);

export function parseNfeXml(doc: Document): DanfeData {
  const inf = first(doc, "infNFe");
  if (!inf) throw new Error("XML sem o grupo infNFe.");
  const ide = child(inf, "ide");
  const emit = child(inf, "emit");
  const dest = child(inf, "dest");
  const tot = path(inf, "total", "ICMSTot");
  const transp = child(inf, "transp");
  const transporta = child(transp, "transporta");
  const vol = child(transp, "vol");
  const prot = first(doc, "infProt");

  const items: DanfeItem[] = Array.from(inf.children)
    .filter((c) => c.localName === "det")
    .map((det) => {
      const prod = child(det, "prod");
      const imposto = child(det, "imposto");
      const icms = group(child(imposto, "ICMS"));
      const ipiTrib = child(child(imposto, "IPI"), "IPITrib");
      const orig = text(icms, "orig");
      return {
        code: text(prod, "cProd"),
        description: text(prod, "xProd"),
        ncm: text(prod, "NCM"),
        cst: orig + (text(icms, "CSOSN") || text(icms, "CST")),
        cfop: text(prod, "CFOP"),
        unit: text(prod, "uCom"),
        quantity: text(prod, "qCom"),
        unitPrice: text(prod, "vUnCom"),
        total: text(prod, "vProd"),
        icmsBase: text(icms, "vBC") || "0.00",
        icmsValue: text(icms, "vICMS") || "0.00",
        ipiValue: text(ipiTrib, "vIPI") || "0.00",
        icmsRate: text(icms, "pICMS") || "0.00",
        ipiRate: text(ipiTrib, "pIPI") || "0.00",
      };
    });

  const tv = (n: string) => text(tot, n) || "0.00";
  const id = inf.getAttribute("Id") ?? "";
  return {
    accessKey: text(prot, "chNFe") || id.replace(/^NFe/, ""),
    number: text(ide, "nNF"),
    series: text(ide, "serie"),
    direction: text(ide, "tpNF"),
    environment: text(ide, "tpAmb"),
    operationNature: text(ide, "natOp"),
    issuedAt: text(ide, "dhEmi"),
    exitAt: text(ide, "dhSaiEnt"),
    crt: text(emit, "CRT"),
    protocol: text(prot, "nProt"),
    protocolAt: text(prot, "dhRecbto"),
    emitter: party(emit, "enderEmit"),
    recipient: party(dest, "enderDest"),
    totals: {
      vBC: tv("vBC"), vICMS: tv("vICMS"), vBCST: tv("vBCST"), vST: tv("vST"), vProd: tv("vProd"), vFrete: tv("vFrete"),
      vSeg: tv("vSeg"), vDesc: tv("vDesc"), vOutro: tv("vOutro"), vIPI: tv("vIPI"), vNF: tv("vNF"), vTotTrib: tv("vTotTrib"),
      vPIS: tv("vPIS"), vCOFINS: tv("vCOFINS"),
    },
    freightMode: text(transp, "modFrete"),
    carrier: transporta
      ? { document: text(transporta, "CNPJ") || text(transporta, "CPF"), name: text(transporta, "xNome"), ie: text(transporta, "IE"), address: text(transporta, "xEnder"), city: text(transporta, "xMun"), uf: text(transporta, "UF") }
      : null,
    volumes: vol ? { quantity: text(vol, "qVol"), species: text(vol, "esp"), brand: text(vol, "marca"), numbering: text(vol, "nVol"), gross: text(vol, "pesoB"), net: text(vol, "pesoL") } : null,
    installments: Array.from(child(inf, "cobr")?.children ?? [])
      .filter((c) => c.localName === "dup")
      .map((d) => ({ number: text(d, "nDup"), due: text(d, "dVenc"), value: text(d, "vDup") })),
    items,
    additionalInfo: text(inf, "infAdic", "infCpl"),
  };
}

export const FREIGHT_LABEL: Record<string, string> = {
  "0": "0 - Emitente",
  "1": "1 - Destinatário",
  "2": "2 - Terceiros",
  "3": "3 - Próprio rem.",
  "4": "4 - Próprio dest.",
  "9": "9 - Sem frete",
};
