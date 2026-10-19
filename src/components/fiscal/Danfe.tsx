"use client";

import { code128cBars } from "@/lib/fiscal/nfe/code128";
import { formatAccessKey } from "@/lib/fiscal/nfe/access-key";
import { formatBrDecimal, formatCep, formatDocument, formatNfeNumber, splitBrDateTime } from "@/lib/fiscal/nfe/format";
import { FREIGHT_LABEL, type DanfeData } from "@/lib/fiscal/nfe/parse";

// DANFE (Documento Auxiliar da NF-e) retrato, nos blocos e rótulos do
// Manual de Orientação do Contribuinte: canhoto, emitente, chave com código
// de barras, destinatário, fatura, cálculo do imposto, transportador,
// produtos, ISSQN e dados adicionais. Medidas em mm para a impressão A4.

const CSS = `
.danfe{width:200mm;margin:0 auto;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:7pt;line-height:1.15;position:relative}
.danfe *{box-sizing:border-box}
.danfe .row{display:flex;width:100%}
.danfe .box{border:0.5pt solid #000;padding:0.6mm 1mm;min-height:7mm;overflow:hidden;margin:-0.25pt 0 0 -0.25pt}
.danfe .lbl{display:block;font-size:5pt;text-transform:uppercase;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.danfe .val{display:block;font-size:7.5pt;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:3.2mm}
.danfe .num{text-align:right}
.danfe .sec{font-size:6pt;font-weight:bold;text-transform:uppercase;margin:1.4mm 0 0.3mm}
.danfe .grow{flex:1 1 0;min-width:0}
.danfe table{width:100%;border-collapse:collapse;table-layout:fixed}
.danfe th{font-size:5pt;font-weight:normal;text-transform:uppercase;border:0.5pt solid #000;padding:0.4mm 0.5mm;text-align:center;line-height:1.1}
.danfe td{font-size:6.5pt;border-left:0.5pt solid #000;border-right:0.5pt solid #000;padding:0.4mm 0.6mm;vertical-align:top}
.danfe tbody tr:last-child td{border-bottom:0.5pt solid #000}
.danfe td.n{text-align:right;white-space:nowrap}
.danfe td.c{text-align:center;white-space:nowrap}
.danfe .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2}
.danfe .wm span{font-size:42pt;font-weight:bold;color:rgba(0,0,0,0.12);transform:rotate(-35deg);white-space:nowrap;letter-spacing:2pt}
.danfe .homolog{border:0.5pt solid #000;text-align:center;font-weight:bold;font-size:7pt;padding:1mm;margin-bottom:1mm}
.danfe .cut{border-top:0.6pt dashed #000;margin:1.6mm 0}
@media print{
  @page{size:A4 portrait;margin:5mm}
  body *{visibility:hidden !important}
  .danfe,.danfe *{visibility:visible !important}
  .danfe{position:absolute;left:0;top:0;width:200mm}
}
`;

function Box({ label, value, width, num, grow, style }: { label: string; value?: React.ReactNode; width?: string; num?: boolean; grow?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`box${grow ? " grow" : ""}`} style={{ ...(width ? { width, flex: `0 0 ${width}` } : {}), ...style }}>
      <span className="lbl">{label}</span>
      <span className={`val${num ? " num" : ""}`}>{value ?? ""}</span>
    </div>
  );
}

function Barcode({ value }: { value: string }) {
  if (!/^\d{44}$/.test(value)) return null;
  const { bars, width } = code128cBars(value);
  return (
    <svg viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" style={{ width: "100%", height: "11mm", display: "block" }} aria-label={`Código de barras da chave ${value}`} role="img">
      <rect x="0" y="0" width={width} height="40" fill="#fff" />
      {bars.map(([x, w]) => (
        <rect key={x} x={x} y="0" width={w} height="40" fill="#000" />
      ))}
    </svg>
  );
}

const money = (v: string) => formatBrDecimal(v, 2);
const qty = (v: string) => formatBrDecimal(v, 4);
/** Valor unitário com a precisão do XML (2 a 4 casas). */
const unitPrice = (v: string) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const date = (v: string) => splitBrDateTime(v).date;
const time = (v: string) => splitBrDateTime(v).time;
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);

export function Danfe({ data }: { data: DanfeData }) {
  const e = data.emitter;
  const d = data.recipient;
  const t = data.totals;
  const homolog = data.environment === "2";
  const simples = data.crt === "1" || data.crt === "4";
  const nfNumber = formatNfeNumber(data.number);
  const series = data.series.padStart(3, "0");

  return (
    <div className="danfe">
      <style>{CSS}</style>
      {homolog && (
        <div className="wm" aria-hidden>
          <span>SEM VALOR FISCAL</span>
        </div>
      )}

      {/* Canhoto */}
      <div className="row">
        <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
          <div className="box" style={{ minHeight: "6mm" }}>
            <span className="lbl" style={{ whiteSpace: "normal" }}>
              Recebemos de {e.name} os produtos/serviços constantes da nota fiscal indicada ao lado. Emissão: {date(data.issuedAt)} · Valor total: R$ {money(t.vNF)} · Destinatário: {d.name}
            </span>
          </div>
          <div className="row">
            <Box label="Data de recebimento" width="40mm" />
            <Box label="Identificação e assinatura do recebedor" grow />
          </div>
        </div>
        <div className="box" style={{ width: "34mm", flex: "0 0 34mm", textAlign: "center" }}>
          <span className="val" style={{ fontSize: "11pt" }}>NF-e</span>
          <span className="val">Nº {nfNumber}</span>
          <span className="val">SÉRIE {series}</span>
        </div>
      </div>
      <div className="cut" />

      {homolog && <div className="homolog">NF-E EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL (ATLAS.ERP · ENSINO)</div>}

      {/* Emitente / DANFE / chave */}
      <div className="row">
        <div className="box" style={{ width: "80mm", flex: "0 0 80mm", minHeight: "32mm", textAlign: "center" }}>
          <span className="lbl">Identificação do emitente</span>
          <div style={{ fontSize: "10pt", fontWeight: "bold", margin: "1.5mm 0" }}>{e.name}</div>
          <div>
            {e.street}, {e.number}
            {e.complement ? ` - ${e.complement}` : ""}
          </div>
          <div>
            {e.district} - CEP {formatCep(e.zip)}
          </div>
          <div>
            {e.city} - {e.uf}
            {e.phone ? ` · Fone: ${e.phone}` : ""}
          </div>
        </div>
        <div className="box" style={{ width: "34mm", flex: "0 0 34mm", textAlign: "center" }}>
          <div style={{ fontSize: "12pt", fontWeight: "bold" }}>DANFE</div>
          <div style={{ fontSize: "6pt" }}>Documento Auxiliar da Nota Fiscal Eletrônica</div>
          <div className="row" style={{ alignItems: "center", justifyContent: "center", gap: "2mm", margin: "1.5mm 0" }}>
            <div style={{ fontSize: "6pt", textAlign: "left" }}>
              0 - ENTRADA
              <br />1 - SAÍDA
            </div>
            <div style={{ border: "0.5pt solid #000", padding: "0.5mm 2mm", fontSize: "11pt", fontWeight: "bold" }}>{data.direction}</div>
          </div>
          <div style={{ fontWeight: "bold" }}>Nº {nfNumber}</div>
          <div style={{ fontWeight: "bold" }}>SÉRIE {series}</div>
          <div>FOLHA 1/1</div>
        </div>
        <div className="grow" style={{ display: "flex", flexDirection: "column" }}>
          <div className="box" style={{ padding: "1mm 2mm" }}>
            <Barcode value={data.accessKey} />
          </div>
          <Box label="Chave de acesso" value={<span style={{ fontSize: "7.5pt", letterSpacing: "0.2pt" }}>{formatAccessKey(data.accessKey)}</span>} />
          <div className="box grow" style={{ textAlign: "center", display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: "7pt" }}>Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</span>
          </div>
        </div>
      </div>
      <div className="row">
        <Box label="Natureza da operação" value={data.operationNature} grow />
        <Box label="Protocolo de autorização de uso" value={`${data.protocol} - ${date(data.protocolAt)} ${time(data.protocolAt)}`} width="86mm" />
      </div>
      <div className="row">
        <Box label="Inscrição estadual" value={e.ie} grow />
        <Box label="Inscrição estadual do subst. trib." value="" grow />
        <Box label="CNPJ" value={formatDocument(e.document)} grow />
      </div>

      {/* Destinatário */}
      <div className="sec">Destinatário / remetente</div>
      <div className="row">
        <Box label="Nome / razão social" value={d.name} grow />
        <Box label="CNPJ / CPF" value={formatDocument(d.document)} width="40mm" />
        <Box label="Data da emissão" value={date(data.issuedAt)} width="26mm" />
      </div>
      <div className="row">
        <Box label="Endereço" value={`${d.street}, ${d.number}${d.complement ? ` - ${d.complement}` : ""}`} grow />
        <Box label="Bairro / distrito" value={d.district} width="44mm" />
        <Box label="CEP" value={formatCep(d.zip)} width="22mm" />
        <Box label="Data da saída/entrada" value={date(data.exitAt)} width="26mm" />
      </div>
      <div className="row">
        <Box label="Município" value={d.city} grow />
        <Box label="Fone / fax" value={d.phone} width="34mm" />
        <Box label="UF" value={d.uf} width="10mm" />
        <Box label="Inscrição estadual" value={d.ie} width="38mm" />
        <Box label="Hora da saída/entrada" value={time(data.exitAt)} width="26mm" />
      </div>

      {/* Fatura */}
      {data.installments.length > 0 && (
        <>
          <div className="sec">Fatura / duplicatas</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {data.installments.map((p) => (
              <div key={p.number} className="box" style={{ width: "33.33mm", flex: "0 0 33.33mm", minHeight: "9mm" }}>
                <span className="lbl">Num. {p.number}</span>
                <span className="lbl">Venc. {isoDate(p.due)}</span>
                <span className="val">R$ {money(p.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Cálculo do imposto */}
      <div className="sec">Cálculo do imposto</div>
      <div className="row">
        <Box label="Base de cálc. do ICMS" value={money(t.vBC)} num grow />
        <Box label="Valor do ICMS" value={money(t.vICMS)} num grow />
        <Box label="Base de cálc. ICMS S.T." value={money(t.vBCST)} num grow />
        <Box label="Valor do ICMS subst." value={money(t.vST)} num grow />
        <Box label="V. aprox. tributos" value={money(t.vTotTrib)} num grow />
        <Box label="Valor total dos produtos" value={money(t.vProd)} num grow />
      </div>
      <div className="row">
        <Box label="Valor do frete" value={money(t.vFrete)} num grow />
        <Box label="Valor do seguro" value={money(t.vSeg)} num grow />
        <Box label="Desconto" value={money(t.vDesc)} num grow />
        <Box label="Outras despesas" value={money(t.vOutro)} num grow />
        <Box label="Valor total do IPI" value={money(t.vIPI)} num grow />
        <Box label="Valor total da nota" value={money(t.vNF)} num grow />
      </div>

      {/* Transportador */}
      <div className="sec">Transportador / volumes transportados</div>
      <div className="row">
        <Box label="Nome / razão social" value={data.carrier?.name} grow />
        <Box label="Frete por conta" value={FREIGHT_LABEL[data.freightMode] ?? data.freightMode} width="30mm" />
        <Box label="Código ANTT" value="" width="20mm" />
        <Box label="Placa do veículo" value="" width="22mm" />
        <Box label="UF" value="" width="10mm" />
        <Box label="CNPJ / CPF" value={formatDocument(data.carrier?.document)} width="36mm" />
      </div>
      <div className="row">
        <Box label="Endereço" value={data.carrier?.address} grow />
        <Box label="Município" value={data.carrier?.city} width="50mm" />
        <Box label="UF" value={data.carrier?.uf} width="10mm" />
        <Box label="Inscrição estadual" value={data.carrier?.ie} width="36mm" />
      </div>
      <div className="row">
        <Box label="Quantidade" value={data.volumes?.quantity} num grow />
        <Box label="Espécie" value={data.volumes?.species} grow />
        <Box label="Marca" value={data.volumes?.brand} grow />
        <Box label="Numeração" value={data.volumes?.numbering} grow />
        <Box label="Peso bruto" value={data.volumes?.gross ? formatBrDecimal(data.volumes.gross, 3) : ""} num grow />
        <Box label="Peso líquido" value={data.volumes?.net ? formatBrDecimal(data.volumes.net, 3) : ""} num grow />
      </div>

      {/* Produtos */}
      <div className="sec">Dados dos produtos / serviços</div>
      <table>
        <colgroup>
          <col style={{ width: "15mm" }} />
          <col />
          <col style={{ width: "13mm" }} />
          <col style={{ width: "9mm" }} />
          <col style={{ width: "8mm" }} />
          <col style={{ width: "7mm" }} />
          <col style={{ width: "14mm" }} />
          <col style={{ width: "14mm" }} />
          <col style={{ width: "14mm" }} />
          <col style={{ width: "13mm" }} />
          <col style={{ width: "11mm" }} />
          <col style={{ width: "10mm" }} />
          <col style={{ width: "8mm" }} />
          <col style={{ width: "8mm" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Código produto</th>
            <th>Descrição do produto / serviço</th>
            <th>NCM/SH</th>
            <th>{simples ? "O/CSOSN" : "O/CST"}</th>
            <th>CFOP</th>
            <th>UN</th>
            <th>Quant.</th>
            <th>Valor unit.</th>
            <th>Valor total</th>
            <th>B. cálc. ICMS</th>
            <th>Valor ICMS</th>
            <th>Valor IPI</th>
            <th>Alíq. ICMS</th>
            <th>Alíq. IPI</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((i, k) => (
            <tr key={k}>
              <td style={{ wordBreak: "break-all" }}>{i.code}</td>
              <td>{i.description}</td>
              <td className="c">{i.ncm}</td>
              <td className="c">{i.cst}</td>
              <td className="c">{i.cfop}</td>
              <td className="c">{i.unit}</td>
              <td className="n">{qty(i.quantity)}</td>
              <td className="n">{unitPrice(i.unitPrice)}</td>
              <td className="n">{money(i.total)}</td>
              <td className="n">{money(i.icmsBase)}</td>
              <td className="n">{money(i.icmsValue)}</td>
              <td className="n">{money(i.ipiValue)}</td>
              <td className="n">{formatBrDecimal(i.icmsRate, 2)}</td>
              <td className="n">{formatBrDecimal(i.ipiRate, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ISSQN */}
      <div className="sec">Cálculo do ISSQN</div>
      <div className="row">
        <Box label="Inscrição municipal" value="" grow />
        <Box label="Valor total dos serviços" value="" num grow />
        <Box label="Base de cálculo do ISSQN" value="" num grow />
        <Box label="Valor do ISSQN" value="" num grow />
      </div>

      {/* Dados adicionais */}
      <div className="sec">Dados adicionais</div>
      <div className="row">
        <div className="box grow" style={{ minHeight: "28mm" }}>
          <span className="lbl">Informações complementares</span>
          <div style={{ fontSize: "6.5pt", whiteSpace: "normal", marginTop: "0.5mm" }}>
            {data.additionalInfo}
            {Number(t.vTotTrib) > 0 ? ` Valor aproximado dos tributos: R$ ${money(t.vTotTrib)}.` : ""}
          </div>
        </div>
        <Box label="Reservado ao fisco" value="" width="60mm" style={{ minHeight: "28mm" }} />
      </div>
    </div>
  );
}
