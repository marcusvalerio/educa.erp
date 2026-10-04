// Rodada 2 — fiscal SIMULADO de ponta a ponta pela API, com sessões reais
// (Fiscal, Gerente, Administrador, Vendedor, Operador) e conferência no banco.
// Nada fala com SEFAZ: o provedor é o SIMULACAO (migration 0082).
import fs from "node:fs";
import { check, close, evidenceCard, shot, goto, bodyText } from "../r48/lib.mjs";
import { company, db, q, st, post, api, idOf, errMsg } from "./ctx.mjs";

const PHASE = process.env.PHASE ?? "depois";
const rows = [["Empresa", "Cenário", "Resultado", "Detalhe"]];
let pass = 0, fail = 0;
const DV = (base) => { let s = 0, w = 2; for (let i = base.length - 1; i >= 0; i--) { s += Number(base[i]) * w; w = w === 9 ? 2 : w + 1; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
const keyOk = (k) => /^\d{44}$/.test(k ?? "") && DV(k.slice(0, 43)) === Number(k[43]);

async function run(coKey) {
  const C = await company(coKey, `R2F${PHASE[0]}${Date.now().toString(36).slice(-3)}`);
  const { co, D, cid } = C;
  const rep = (id, name, ok, detail) => {
    ok ? pass++ : fail++;
    rows.push([co.name, `${id} — ${name}`, ok ? "PASS" : "FAIL", detail]);
    check("fiscal", `${id} — ${name}`, ok, { company: co.name, target: id, expected: "ver roteiro", actual: detail });
  };
  for (const r of ["fiscal", "gerente", "admin", "vendedor", "operador"]) await C.as(r);
  const F = C.P("fiscal"), G = C.P("gerente"), A = C.P("admin");
  const est = D.establishmentId, nat = D.natureId;

  // C0 — série de numeração e provedor de simulação configurados pelo Administrador
  {
    const seq = await post(A, "/api/document-sequences", { documentType: "FISCAL_DOCUMENT", seriesCode: "1", padding: 9, establishmentId: est, description: "NF-e série 1 (homologação)" });
    const prov = await post(A, `/api/fiscal-establishments/${est}/provider`, { providerCode: "SIMULACAO", environment: "HOMOLOGATION", config: {} });
    const [{ s }] = await q(`select count(*)::int s from document_sequences where company_id=$1 and document_type='FISCAL_DOCUMENT' and establishment_id=$2 and status='active'`, [cid, est]);
    const [{ p }] = await q(`select count(*)::int p from fiscal_provider_configs where fiscal_establishment_id=$1 and provider_code='SIMULACAO' and status='active'`, [est]);
    rep("C0", "Administrador cadastra a série e o provedor SIMULACAO do estabelecimento", s >= 1 && p === 1, `série ${st(seq)} · provedor ${st(prov)} · séries ativas ${s} · provedor ${p}`);
  }
  // S0 — checklist da 1ª NF-e cita a série
  {
    const r = await api(F, "/api/fiscal-setup");
    rep("S0", "Checklist da 1ª NF-e conta a série de numeração", r.status === 200 && Number(r.body?.data?.fiscal_series) >= 1, `${r.status} séries ${r.body?.data?.fiscal_series}`);
  }

  // documento de pedido, via API, até "pronto"
  async function orderDoc(label, qty = 4, price = 37.5) {
    const pid = await C.newProduct(label, 20);
    const oid = await C.approvedOrder(pid, qty, `Fiscal ${label}`, { price });
    const g = await post(F, `/api/sales-orders/${oid}/generate-fiscal-document`, { fiscalEstablishmentId: est, operationNatureId: nat });
    return { pid, oid, doc: idOf(g), gen: g };
  }
  const toReady = async (doc, page = F) => {
    await post(page, `/api/fiscal-documents/${doc}/calculate`);
    return post(page, `/api/fiscal-documents/${doc}/ready`);
  };

  // N1 — o Fiscal numera
  const n1 = await orderDoc("N1");
  {
    const r = await post(F, `/api/fiscal-documents/${n1.doc}/assign-number`, { seriesCode: "1" });
    rep("N1", "O papel Fiscal numera a NF-e (antes: exigia permissão de configuração)", r.status === 200 && Number(r.body?.data?.number) > 0, `${st(r)} nº ${r.body?.data?.number}`);
  }
  // N2 — numerar depois de "pronto"
  const n2 = await orderDoc("N2");
  {
    const rd = await toReady(n2.doc);
    const r = await post(F, `/api/fiscal-documents/${n2.doc}/assign-number`, { seriesCode: "1" });
    rep("N2", "Documento já conferido (pronto) sem número pode ser numerado", rd.status < 300 && r.status === 200, `pronto ${st(rd)} · numerar ${st(r)}`);
  }
  // N3 — não renumera
  {
    const r = await post(F, `/api/fiscal-documents/${n1.doc}/assign-number`, { seriesCode: "1" });
    const [{ number }] = await q(`select number from fiscal_documents where id=$1`, [n1.doc]);
    rep("N3", "Numerar de novo é recusado e o número não muda", r.status >= 400 && r.status < 500 && /já tem o número/.test(errMsg(r)), `${st(r)} · número continua ${number}`);
  }
  // N4 — autorização manual: sem número / chave inválida
  {
    const nd = await orderDoc("N4");
    await toReady(nd.doc);
    const a = await post(G, `/api/fiscal-documents/${nd.doc}/authorize`, { accessKey: "123", protocol: "manual" });
    await post(F, `/api/fiscal-documents/${nd.doc}/assign-number`, { seriesCode: "1" });
    const b = await post(G, `/api/fiscal-documents/${nd.doc}/authorize`, { accessKey: "123", protocol: "manual" });
    const [{ status }] = await q(`select status from fiscal_documents where id=$1`, [nd.doc]);
    rep("N4", "Autorização manual recusa documento sem número e chave '123'", a.status >= 400 && b.status >= 400 && status !== "AUTHORIZED", `sem número: ${st(a)} · chave 123: ${st(b)} · situação ${status}`);
  }
  // N5 — numeração simultânea de dois documentos: números diferentes
  {
    const x = await orderDoc("N5a"), y = await orderDoc("N5b");
    const r = await Promise.all([post(F, `/api/fiscal-documents/${x.doc}/assign-number`, { seriesCode: "1" }), post(G, `/api/fiscal-documents/${y.doc}/assign-number`, { seriesCode: "1" })]);
    const nums = r.map((z) => z.body?.data?.number);
    const [{ dup }] = await q(`select count(*)::int dup from (select number from fiscal_documents where company_id=$1 and direction='SAIDA' and number is not null group by fiscal_establishment_id, coalesce(model,'55'), coalesce(series,'1'), number having count(*)>1) d`, [cid]);
    rep("N5", "Numerar dois documentos ao mesmo tempo dá números diferentes; nenhum número repetido na série", r.every((z) => z.status === 200) && nums[0] !== nums[1] && dup === 0, `${r.map(st).join(" / ")} · nº ${nums.join(" e ")} · repetidos ${dup}`);
  }

  // S1 — fluxo completo até a autorização simulada, conferido no banco
  const s1 = await orderDoc("S1", 4, 37.5);
  {
    await post(F, `/api/fiscal-documents/${s1.doc}/assign-number`, { seriesCode: "1" });
    await toReady(s1.doc);
    const r = await post(F, `/api/fiscal-documents/${s1.doc}/simulate-authorization`);
    const [d] = await q(`select fd.*, so.code so_code from fiscal_documents fd left join sales_orders so on so.id=fd.source_id where fd.id=$1`, [s1.doc]);
    const [it] = await q(`select product_id, quantity::float q, unit_price::float p, ncm_code, cfop_code, total_amount::float t from fiscal_document_items where fiscal_document_id=$1`, [s1.doc]);
    const [{ att }] = await q(`select count(*)::int att from fiscal_authorization_attempts where fiscal_document_id=$1 and provider_code='SIMULACAO'`, [s1.doc]);
    const [{ who }] = await q(`select string_agg(distinct actor_label, ',') who from audit_logs where entity_id=$1 and action='AUTHORIZE'`, [s1.doc]);
    const [{ cust }] = await q(`select customer_id::text cust from sales_orders where id=$1`, [s1.oid]);
    const ok = r.status === 200 && d.status === "AUTHORIZED" && keyOk(d.access_key) && /^SIMULACAO-/.test(d.protocol ?? "") && d.source_id === s1.oid && d.customer_id === cust
      && it.product_id === s1.pid && it.q === 4 && it.p === 37.5 && /^\d{8}$/.test(it.ncm_code ?? "") && /^\d{4}$/.test(it.cfop_code ?? "") && Number(d.total_amount) === it.t + Number(d.taxes_amount) && att === 1 && !!who && !/system/i.test(who);
    rep("S1", "Pedido → NF-e → numerar → calcular → pronta → autorizar na SIMULAÇÃO", ok,
      `${st(r)} · ${d.status} · chave válida ${keyOk(d.access_key)} · ${d.protocol} · pedido ${d.so_code} · qtd ${it.q} × ${it.p} · NCM ${it.ncm_code} · CFOP ${it.cfop_code} · total ${d.total_amount} · impostos ${d.taxes_amount} · tentativas ${att} · autor ${who}`);
  }
  // S2 — autorizar de novo
  {
    const r = await post(F, `/api/fiscal-documents/${s1.doc}/simulate-authorization`);
    rep("S2", "Autorizar de novo: recusa clara, nada refeito", r.status === 409 && /já foi autorizado/.test(errMsg(r)), st(r));
  }
  // S3 — três pessoas autorizando ao mesmo tempo
  {
    const d3 = await orderDoc("S3");
    await post(F, `/api/fiscal-documents/${d3.doc}/assign-number`, { seriesCode: "1" });
    await toReady(d3.doc);
    const r = await Promise.all([F, G, A].map((p) => post(p, `/api/fiscal-documents/${d3.doc}/simulate-authorization`)));
    const [{ att }] = await q(`select count(*)::int att from fiscal_authorization_attempts where fiscal_document_id=$1`, [d3.doc]);
    const [{ ev }] = await q(`select count(*)::int ev from fiscal_document_events where fiscal_document_id=$1 and event_type='AUTHORIZED'`, [d3.doc]);
    rep("S3", "Três pessoas autorizam ao mesmo tempo: 1 autoriza, os outros recebem 'já autorizado'", r.filter((x) => x.status === 200).length === 1 && att === 1 && ev === 1, `${r.map(st).join(" / ")} · tentativas ${att} · eventos ${ev}`);
  }
  // S4/S5 — rejeições com códigos próprios
  async function manualDoc(cfop) {
    const pid = await C.newProduct(`S45-${cfop}`, 5);
    const d = await post(F, "/api/fiscal-documents", { fiscalEstablishmentId: est, type: "NFE", direction: "SAIDA", operationNatureId: nat, customerId: D.customers[1] });
    const id = idOf(d);
    await post(F, `/api/fiscal-documents/${id}/items`, { productId: pid, quantity: 1, unitPrice: 50, ncmCode: co.ncm, cfopCode: cfop, originCode: "0", unit: "UN" });
    await post(F, `/api/fiscal-documents/${id}/assign-number`, { seriesCode: "1" });
    await toReady(id);
    const r = await post(F, `/api/fiscal-documents/${id}/simulate-authorization`);
    const [x] = await q(`select fd.status, a.error_code from fiscal_documents fd left join lateral (select error_code from fiscal_authorization_attempts where fiscal_document_id=fd.id order by attempt_number desc limit 1) a on true where fd.id=$1`, [id]);
    return { r, x };
  }
  {
    const { r, x } = await manualDoc("6102");
    rep("S4", "CFOP interestadual (6102) para cliente do mesmo estado → rejeitado SIM-106", x?.status === "REJECTED" && x?.error_code === "SIM-106", `${st(r)} · ${x?.status} ${x?.error_code}`);
  }
  {
    const { r, x } = await manualDoc("1102");
    rep("S5", "CFOP de entrada (1102) em documento de saída → rejeitado SIM-105", x?.status === "REJECTED" && x?.error_code === "SIM-105", `${st(r)} · ${x?.status} ${x?.error_code}`);
  }
  // S6 — cancelamento simulado
  {
    const short = await post(F, `/api/fiscal-documents/${s1.doc}/simulate-cancellation`, { reason: "curta" });
    const r = await Promise.all([post(F, `/api/fiscal-documents/${s1.doc}/simulate-cancellation`, { reason: "Cancelamento de teste da rodada 2 (Fiscal)" }), post(G, `/api/fiscal-documents/${s1.doc}/simulate-cancellation`, { reason: "Cancelamento de teste da rodada 2 (Gerente)" })]);
    const [{ c }] = await q(`select count(*)::int c from audit_logs where entity_id=$1 and action='CANCEL'`, [s1.doc]);
    const [{ status }] = await q(`select status from fiscal_documents where id=$1`, [s1.doc]);
    rep("S6", "Cancelar: justificativa curta recusada; 2 pessoas ao mesmo tempo → 1 cancela", short.status === 422 && r.filter((x) => x.status === 200).length === 1 && status === "CANCELLED" && c === 1, `curta ${st(short)} · ${r.map(st).join(" / ")} · ${status} · auditoria CANCEL ${c}`);
  }
  // S7 — gerar a NF-e do mesmo pedido 2× ao mesmo tempo
  {
    const pid = await C.newProduct("S7", 20);
    const oid = await C.approvedOrder(pid, 1, "Fiscal S7");
    const g = await Promise.all([post(F, `/api/sales-orders/${oid}/generate-fiscal-document`, { fiscalEstablishmentId: est, operationNatureId: nat }), post(G, `/api/sales-orders/${oid}/generate-fiscal-document`, { fiscalEstablishmentId: est, operationNatureId: nat })]);
    const [{ n }] = await q(`select count(*)::int n from fiscal_documents where source_id=$1 and status<>'CANCELLED'`, [oid]);
    const ok = n === 1 && g.filter((x) => x.status === 201).length === 1
      && g.some((x) => (x.status >= 400 && /já foi gerado/.test(errMsg(x))) || (x.status === 200 && x.body?.created === false && /já tem a NF-e/.test(x.body?.message ?? "")));
    rep("S7", "Gerar a NF-e do mesmo pedido 2× ao mesmo tempo: 1 documento, só uma resposta 'criado'", ok, `${g.map(st).join(" / ")} · ${g.map((x) => x.body?.message ?? "").filter(Boolean).join(" | ")} · documentos ${n}`);
  }
  // S8 — permissão e isolamento
  {
    const other = Object.entries((await import("../r48/lib.mjs")).state.companies).find(([k]) => k !== coKey)[1];
    const [foreign] = await q(`select id from fiscal_documents where company_id=$1 limit 1`, [other.companyId]);
    const v = await post(C.P("vendedor"), `/api/fiscal-documents/${n2.doc}/simulate-authorization`);
    const o = await post(C.P("operador"), `/api/fiscal-documents/${n2.doc}/simulate-cancellation`, { reason: "tentativa sem permissão nenhuma" });
    const x = foreign ? await post(A, `/api/fiscal-documents/${foreign.id}/simulate-authorization`) : { status: 0 };
    const xv = foreign ? await api(A, `/api/fiscal-documents/${foreign.id}/simulated-document`) : { status: 0 };
    rep("S8", "Simulação sem permissão e em documento de outra empresa", v.status === 403 && o.status === 403 && x.status >= 400 && xv.status === 404, `vendedor ${st(v)} · operador ${st(o)} · outra empresa ${x.status}/${xv.status}`);
  }
  // S9 — documento visual
  {
    const [auth] = await q(`select id from fiscal_documents where company_id=$1 and status='AUTHORIZED' and protocol like 'SIMULACAO-%' order by updated_at desc limit 1`, [cid]);
    await goto(F, `/app/fiscal/notas-fiscais/${auth.id}/documento-simulado`);
    await F.waitForTimeout(800);
    const t = await bodyText(F);
    const ev = await shot(F, "02-fiscal-simulado", `${co.n}-${co.key}-documento-simulado`, { full: true });
    const ok = /ATLAS\.ERP — SIMULAÇÃO/.test(t) && /SEM VALOR FISCAL/.test(t) && /NÃO AUTORIZADO PELA SEFAZ/.test(t) && !/autorizad[oa] pela sefaz(?!.*n[ãa]o)/i.test(t.replace(/NÃO AUTORIZADO PELA SEFAZ/g, ""));
    rep("S9", "Documento visual simulado: marca d'água e avisos, sem se apresentar como NF-e autorizada", ok, `capturado em ${ev}`);
    await goto(F, `/app/fiscal/notas-fiscais/${auth.id}`);
    await F.waitForTimeout(600);
    await shot(F, "02-fiscal-simulado", `${co.n}-${co.key}-detalhe-documento`);
  }
  // S10 — NF-e de ENTRADA a partir do recebimento de compra (fornecedor como remetente)
  {
    const cfop = await post(F, "/api/fiscal-cfops", { code: "1102", description: "Compra para comercialização", direction: "ENTRADA", scope: "INTERNAL" });
    const [cf] = await q(`select id from fiscal_cfops where company_id=$1 and code='1102' limit 1`, [cid]);
    const natE = await post(F, "/api/fiscal-operation-natures", { code: `ENT-${C.tag}`.slice(0, 20), name: "Compra para comercialização", direction: "ENTRADA", defaultCfopId: cf?.id });
    const g = await post(F, `/api/purchase-receipts/${D.recId}/generate-fiscal-document`, { fiscalEstablishmentId: est, operationNatureId: idOf(natE) });
    const doc = idOf(g);
    await post(F, `/api/fiscal-documents/${doc}/assign-number`, { seriesCode: "1" });
    await toReady(doc);
    const r = await post(F, `/api/fiscal-documents/${doc}/simulate-authorization`);
    const [d] = await q(`select status, direction, supplier_id, customer_id from fiscal_documents where id=$1`, [doc]);
    const cf2 = (await q(`select cfop_code from fiscal_document_items where fiscal_document_id=$1`, [doc])).map((x) => x.cfop_code);
    const sd = await api(F, `/api/fiscal-documents/${doc}/simulated-document`);
    rep("S10", "NF-e de ENTRADA do recebimento de compra autorizada na simulação (fornecedor como remetente)",
      d?.status === "AUTHORIZED" && d.direction === "ENTRADA" && !!d.supplier_id && !d.customer_id && cf2.length > 0 && cf2.every((x) => /^1/.test(x)) && sd.body?.data?.partner?.role === "remetente" && !!sd.body?.data?.partner?.name,
      `cfop ${st(cfop)} · natureza ${st(natE)} · gerar ${st(g)} · autorizar ${st(r)} · ${d?.status} ${d?.direction} · CFOP ${cf2.join(",")} · remetente ${sd.body?.data?.partner?.name}`);
  }
}

for (const k of (process.env.ONLY ?? "vertice,sertao").split(",")) await run(k);
await evidenceCard(null, "02-fiscal-simulado", `00-fiscal-${PHASE}`, `Fiscal simulado — ${PHASE} (${pass} PASS / ${fail} FAIL)`, rows);
fs.writeFileSync(new URL(`./p2-fiscal-${PHASE}.out.json`, import.meta.url), JSON.stringify({ phase: PHASE, pass, fail, rows }, null, 2));
console.log(`fiscal (${PHASE}): ${pass} PASS, ${fail} FAIL`);
await db.end();
await close();
process.exit(0);
