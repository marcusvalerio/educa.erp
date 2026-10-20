// NF-e de ensino: chave de acesso, XML 4.00, código de barras e totais.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mod11, buildAccessKey, isValidAccessKey, isValidCnpj, isValidCpf, numericCode, formatAccessKey } from "@/lib/fiscal/nfe/access-key";
import { buildNfeXml, wrapNfeProc, computeTotals, apportion, protocolNumber, brDateTime, xmlText, validateNfeInput, type NfeInput, type NfeItem } from "@/lib/fiscal/nfe/xml";
import { CODE128_PATTERNS, code128cValues, code128cBars } from "@/lib/fiscal/nfe/code128";
import { formatDocument, formatNfeNumber, splitBrDateTime } from "@/lib/fiscal/nfe/format";
import { ufCode } from "@/lib/fiscal/nfe/uf";

describe("chave de acesso", () => {
  test("dígito verificador módulo 11 do exemplo do manual (DV 5)", () => {
    assert.equal(mod11("5206043300991100250655012000000780026730161"), "5");
  });

  test("monta 44 dígitos na ordem do leiaute e valida", () => {
    const key = buildAccessKey({ cUF: "35", issuedAt: new Date("2026-10-19T15:00:00Z"), cnpj: "11.222.333/0001-81", series: 1, number: 123, numericCode: "12345678" });
    assert.equal(key.length, 44);
    assert.equal(key.slice(0, 2), "35");
    assert.equal(key.slice(2, 6), "2610");
    assert.equal(key.slice(6, 20), "11222333000181");
    assert.equal(key.slice(20, 22), "55");
    assert.equal(key.slice(22, 25), "001");
    assert.equal(key.slice(25, 34), "000000123");
    assert.equal(key.slice(34, 35), "1");
    assert.equal(key.slice(35, 43), "12345678");
    assert.ok(isValidAccessKey(key));
    assert.ok(!isValidAccessKey(key.slice(0, 43) + String((Number(key[43]) + 1) % 10)));
    assert.equal(formatAccessKey(key).split(" ").length, 11);
  });

  test("código numérico estável e diferente do número da nota", () => {
    assert.equal(numericCode("abc", 1), numericCode("abc", 1));
    assert.equal(numericCode("abc", 1).length, 8);
    const n = Number(numericCode("x", 0));
    assert.notEqual(numericCode("x", n), String(n).padStart(8, "0"));
  });

  test("CNPJ e CPF com dígitos verificadores", () => {
    assert.ok(isValidCnpj("11.222.333/0001-81"));
    assert.ok(!isValidCnpj("11.222.333/0001-82"));
    assert.ok(!isValidCnpj("00000000000000"));
    assert.ok(isValidCpf("529.982.247-25"));
    assert.ok(!isValidCpf("529.982.247-24"));
  });

  test("código da UF", () => {
    assert.equal(ufCode("sp"), "35");
    assert.equal(ufCode("XX"), null);
  });
});

describe("código de barras CODE-128C", () => {
  test("todos os símbolos têm 11 módulos (parada 13)", () => {
    assert.equal(CODE128_PATTERNS.length, 107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = p.split("").reduce((a, c) => a + Number(c), 0);
      assert.equal(sum, i === 106 ? 13 : 11, `símbolo ${i}`);
    });
  });

  test("verificador: início C + pares ponderados, módulo 103", () => {
    // 105 + 12·1 + 34·2 = 185 → 185 % 103 = 82
    assert.deepEqual(code128cValues("1234"), [105, 12, 34, 82, 106]);
  });

  test("chave de 44 dígitos vira 22 pares + início, verificador e parada", () => {
    const key = "5206043300991100250655012000000780026730161" + "5";
    const values = code128cValues(key);
    assert.equal(values.length, 25);
    const { bars, width } = code128cBars(key);
    assert.ok(bars.length > 0);
    // 24 símbolos × 11 + parada 13 + 20 de zona de silêncio
    assert.equal(width, 24 * 11 + 13 + 20);
  });
});

function item(over: Partial<NfeItem> = {}): NfeItem {
  return {
    code: "P001", description: "Caneta azul", ncm: "96081000", cfop: "5102", unit: "UN",
    quantity: 10, unitPrice: 2.5, grossAmount: 25, discount: 0, freight: 0, insurance: 0, other: 0,
    origin: "0", taxes: [], defaults: {}, ...over,
  };
}

function input(over: Partial<NfeInput> = {}): NfeInput {
  const issuedAt = new Date("2026-10-19T15:00:00Z");
  const accessKey = buildAccessKey({ cUF: "35", issuedAt, cnpj: "11222333000181", series: 1, number: 7, numericCode: "00000042" });
  return {
    accessKey, numericCode: "00000042", ufCode: "35", operationNature: "Venda de mercadoria", series: 1, number: 7, issuedAt,
    direction: 1, crt: 1, environment: 2,
    emitter: { document: "11222333000181", name: "Escola & Cia <Ensino>", stateRegistration: "123456789", address: { street: "Rua A", number: "10", district: "Centro", cityCode: "3550308", cityName: "São Paulo", uf: "SP", zip: "01001-000" } },
    recipient: { document: "52998224725", name: "Maria", address: { street: "Rua B", number: "", district: "Bairro", cityCode: "3304557", cityName: "Rio de Janeiro", uf: "RJ", zip: "20000000" } },
    items: [item()], freightMode: 9, appVersion: "ATLAS.ERP 1.0", ...over,
  };
}

describe("XML NF-e 4.00", () => {
  test("estrutura, ordem e campos essenciais", () => {
    const { xml, totals } = buildNfeXml(input());
    assert.match(xml, /^<NFe xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe"><infNFe Id="NFe\d{44}" versao="4\.00">/);
    const order = ["<ide>", "<emit>", "<dest>", '<det nItem="1">', "<total>", "<transp>", "<pag>"].map((t) => xml.indexOf(t));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every((i) => i >= 0));
    assert.match(xml, /<tpAmb>2<\/tpAmb>/);
    assert.match(xml, /<idDest>2<\/idDest>/, "SP → RJ é interestadual");
    assert.match(xml, /<CPF>52998224725<\/CPF>/);
    assert.match(xml, /<indIEDest>9<\/indIEDest>/);
    assert.match(xml, /<indFinal>1<\/indFinal>/);
    assert.match(xml, /<nro>S\/N<\/nro>/);
    assert.match(xml, /<xNome>Escola &amp; Cia &lt;Ensino&gt;<\/xNome>/);
    assert.match(xml, /<ICMSSN102><orig>0<\/orig><CSOSN>102<\/CSOSN><\/ICMSSN102>/);
    assert.match(xml, /<PISOutr><CST>49<\/CST>/);
    assert.match(xml, /<vUnCom>2\.5000000000<\/vUnCom>/);
    assert.match(xml, /<qCom>10\.0000<\/qCom>/);
    assert.match(xml, /<dhEmi>2026-10-19T12:00:00-03:00<\/dhEmi>/);
    assert.equal(totals.vNF, 25);
    assert.match(xml, /<vNF>25\.00<\/vNF>/);
    assert.equal(xml.slice(xml.indexOf("<cDV>") + 5, xml.indexOf("</cDV>")), input().accessKey.slice(-1));
  });

  test("regime normal: ICMS por dentro não soma; IPI e ST somam ao total", () => {
    const taxes = [
      { type: "ICMS" as const, cst: "00", basis: 100, rate: 18, reduction: 0, amount: 18 },
      { type: "PIS" as const, cst: "01", basis: 100, rate: 1.65, reduction: 0, amount: 1.65 },
      { type: "COFINS" as const, cst: "01", basis: 100, rate: 7.6, reduction: 0, amount: 7.6 },
      { type: "IPI" as const, cst: "50", basis: 100, rate: 10, reduction: 0, amount: 10 },
    ];
    const data = input({ crt: 3, items: [item({ quantity: 1, unitPrice: 100, grossAmount: 100, taxes })] });
    const { xml, totals } = buildNfeXml(data);
    assert.equal(totals.vICMS, 18);
    assert.equal(totals.vIPI, 10);
    assert.equal(totals.vNF, 110);
    assert.match(xml, /<ICMS00><orig>0<\/orig><CST>00<\/CST><modBC>3<\/modBC><vBC>100\.00<\/vBC><pICMS>18\.0000<\/pICMS><vICMS>18\.00<\/vICMS><\/ICMS00>/);
    assert.match(xml, /<PISAliq><CST>01<\/CST><vBC>100\.00<\/vBC><pPIS>1\.6500<\/pPIS><vPIS>1\.65<\/vPIS><\/PISAliq>/);
    assert.match(xml, /<IPI><cEnq>999<\/cEnq><IPITrib><CST>50<\/CST>/);
    // IPI vem entre ICMS e PIS no grupo imposto
    assert.ok(xml.indexOf("<IPI>") > xml.indexOf("<ICMS>") && xml.indexOf("<IPI>") < xml.indexOf("<PIS>"));
  });

  test("desconto e frete entram no total", () => {
    const t = computeTotals({ crt: 1, items: [item({ discount: 5, freight: 3.33 }), item({ freight: 6.67 })] });
    assert.equal(t.vProd, 50);
    assert.equal(t.vNF, 50 - 5 + 10);
  });

  test("rateio do frete fecha o total no último item", () => {
    const parts = apportion(10, [1, 1, 1]);
    assert.deepEqual(parts, [3.33, 3.33, 3.34]);
    assert.deepEqual(apportion(0, [1, 2]), [0, 0]);
  });

  test("fatura, duplicatas e pagamento a prazo", () => {
    const { xml } = buildNfeXml(input({ invoice: { number: "PV-001", installments: [{ number: "001", dueDate: "2026-11-18", amount: 12.5 }, { number: "002", dueDate: "2026-12-18", amount: 12.5 }] } }));
    assert.match(xml, /<cobr><fat><nFat>PV-001<\/nFat><vOrig>25\.00<\/vOrig><vDesc>0\.00<\/vDesc><vLiq>25\.00<\/vLiq><\/fat><dup><nDup>001<\/nDup><dVenc>2026-11-18<\/dVenc><vDup>12\.50<\/vDup><\/dup>/);
    assert.match(xml, /<indPag>1<\/indPag><tPag>15<\/tPag>/);
    assert.ok(xml.indexOf("<cobr>") < xml.indexOf("<pag>"));
  });

  test("nfeProc com protocolo de autorização", () => {
    const data = input();
    const { xml } = buildNfeXml(data);
    const proc = wrapNfeProc(xml, { accessKey: data.accessKey, protocol: protocolNumber("35", data.issuedAt, data.accessKey), receivedAt: data.issuedAt, digestValue: "abc=", environment: 2, appVersion: "ATLAS.ERP" });
    assert.match(proc, /^<\?xml version="1\.0" encoding="UTF-8"\?><nfeProc xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe" versao="4\.00"><NFe/);
    assert.match(proc, /<cStat>100<\/cStat><xMotivo>Autorizado o uso da NF-e<\/xMotivo>/);
    assert.match(proc, /<nProt>13526\d{10}<\/nProt>/);
  });

  test("texto: sem quebra de linha, com escape e limite", () => {
    assert.equal(xmlText("a\n b  c", 60), "a b c");
    assert.equal(xmlText("x".repeat(80), 60).length, 60);
    assert.equal(brDateTime(new Date("2026-01-01T02:00:00Z")), "2025-12-31T23:00:00-03:00");
  });
});

describe("máscaras da DANFE", () => {
  test("documentos, número e data", () => {
    assert.equal(formatDocument("11222333000181"), "11.222.333/0001-81");
    assert.equal(formatDocument("52998224725"), "529.982.247-25");
    assert.equal(formatNfeNumber(7), "000.000.007");
    assert.deepEqual(splitBrDateTime("2026-10-19T12:00:00-03:00"), { date: "19/10/2026", time: "12:00:00" });
  });
});

describe("conferência antes de emitir", () => {
  test("dados corretos passam", () => {
    assert.deepEqual(validateNfeInput(input({ items: [item({ cfop: "6102" })] })), []);
  });
  test("CFOP interno para outra UF, NCM curto e bairro vazio são apontados", () => {
    const data = input({ items: [item({ cfop: "5102", ncm: "9608" })] });
    data.recipient.address.district = "";
    data.recipient.address.cityCode = "";
    const msgs = validateNfeInput(data).join(" | ");
    assert.match(msgs, /CFOP 5102 é de operação dentro do estado/);
    assert.match(msgs, /NCM precisa ter 8 dígitos/);
    assert.match(msgs, /Destinatário: informe o bairro/);
    assert.match(msgs, /Destinatário: município sem código IBGE/);
  });
  test("modo ensino: CNPJ/CPF com dígito verificador errado passa; quantidade errada não", () => {
    const data = input({ items: [item({ cfop: "6102" })] });
    data.emitter.document = "11.222.333/0001-82";
    data.recipient.document = "12.345.678/0001-00";
    assert.deepEqual(validateNfeInput(data), []);
    data.recipient.document = "123.456.789-00";
    assert.deepEqual(validateNfeInput(data), []);
    data.emitter.document = "1122233300018";
    data.recipient.document = "12345";
    const msgs = validateNfeInput(data).join(" | ");
    assert.match(msgs, /Emitente: o CNPJ precisa ter 14 números \(tem 13\)/);
    assert.match(msgs, /Destinatário: informe o CNPJ \(14 números\) ou o CPF \(11 números\).*tem 5/);
  });
});

describe("código de barras: leitura de volta", () => {
  test("as barras desenhadas decodificam para a mesma chave", () => {
    const key = buildAccessKey({ cUF: "35", issuedAt: new Date("2026-10-19T15:00:00Z"), cnpj: "11222333000181", series: 1, number: 7, numericCode: "00000042" });
    const { bars, width } = code128cBars(key);
    // Reconstrói a sequência de módulos (1 = barra) e corta em símbolos de 11 módulos.
    const modules = new Array(width).fill(0);
    for (const [x, w] of bars) for (let i = 0; i < w; i++) modules[x + i] = 1;
    const body = modules.slice(10, width - 10);
    const symbols: number[] = [];
    for (let pos = 0; pos + 11 <= body.length - 13; pos += 11) {
      const chunk = body.slice(pos, pos + 11);
      const widths: number[] = [];
      let run = 1;
      for (let i = 1; i <= chunk.length; i++) {
        if (i < chunk.length && chunk[i] === chunk[i - 1]) run++;
        else {
          widths.push(run);
          run = 1;
        }
      }
      symbols.push(CODE128_PATTERNS.indexOf(widths.join("")));
    }
    assert.equal(symbols[0], 105);
    const pairs = symbols.slice(1, -1).map((v) => String(v).padStart(2, "0")).join("");
    assert.equal(pairs, key);
  });
});
