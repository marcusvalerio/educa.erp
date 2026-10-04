// Rodada 48 — concorrência (cenários A–G). Sessões reais em paralelo
// (Promise.all) na Vértice Operações (operação híbrida) e na Sertão Atacado.
// Cada cenário cria os próprios dados (produto/pedido/título novos) para não
// depender da massa e confere o resultado no banco.
import fs from "node:fs";
import { check, issue, session, api, post, idOf, errMsg, state, close, evidenceCard, inDays } from "./lib.mjs";
import { COMPANIES } from "./companies.mjs";
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
const db = new pg.Pool({ connectionString: "postgres://postgres@127.0.0.1:55440/educa_poc", max: 3 });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const out = { scenarios: [] };
const report = (id, name, ok, detail) => {
  out.scenarios.push({ id, name, ok, ...detail });
  check("concorrencia", `${id} — ${name}`, ok, { company: detail.company, target: detail.target, expected: detail.expected, actual: detail.actual });
};
const st = (r) => `${r.status}${r.status >= 300 ? " " + errMsg(r).slice(0, 90) : ""}`;

async function run(coKey, RUN) {
  const co = COMPANIES.find((c) => c.key === coKey);
  const S = state.companies[coKey];
  const D = S.data, cid = S.companyId;
  const who = (role) => co.users.find((u) => u.role === role) ?? co.users.find((u) => u.role === "gerente");
  const sess = {};
  const as = async (role) => (sess[role] ??= await session(role === "admin" ? co.admin.email : who(role).email));
  for (const r of ["admin", "gerente", "vendedor", "operador", "financeiro", "fiscal", "logistica"]) await as(r);
  const P = (role) => sess[role].page;
  const tag = `${co.prefix}-${RUN}`;

  // Produto novo com saldo exato.
  async function newProduct(label, qty) {
    const r = await post(P("gerente"), "/api/products", { codigo: `${tag}-${label}`, descricao: `Produto de concorrência ${label} (${tag})`, categoria: "Produto acabado", subcategoria: "Geral", unidade: "UN", ncm: co.ncm, estoqueMinimo: 0, estoqueMaximo: 1000, pontoReposicao: 0, precoCusto: 10, precoVenda: 25 });
    const id = idOf(r);
    if (qty) await post(P("operador"), "/api/stock-movements/receive", { productId: id, locationId: D.locations.pick, quantity: qty, unitCost: 10, notes: `Saldo para cenário ${label}`, idempotencyKey: `r48c-${tag}-${label}` });
    if (D.ncmId) await post(P("fiscal"), "/api/product-fiscal-profiles", { productId: id, ncmId: D.ncmId, originCode: "0" });
    return id;
  }
  async function approvedOrder(productId, qty, note) {
    const r = await post(P("vendedor"), "/api/sales-orders", { customerId: D.customers[1], paymentTermsId: D.paymentTermId, expectedDeliveryAt: inDays(5), notes: note, items: [{ productId, description: "Item de concorrência", unit: "UN", quantity: qty, unitPrice: 25, discount: 0 }] });
    const id = idOf(r);
    await post(P("vendedor"), `/api/sales-orders/${id}/submit`);
    await post(P("gerente"), `/api/sales-orders/${id}/approve`);
    return id;
  }
  const bal = async (productId) => (await q(`select coalesce(sum(on_hand),0)::float q, coalesce(sum(reserved),0)::float r from stock_balances where company_id=$1 and product_id=$2`, [cid, productId]))[0];
  const ledger = async (productId) => (await q(`select coalesce(sum(case when movement_type in ('RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','RETURN_IN','PRODUCTION_IN') then quantity when movement_type in ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT','RETURN_OUT','PRODUCTION_OUT','SCRAP') then -quantity else 0 end),0)::float s from stock_movements where company_id=$1 and product_id=$2`, [cid, productId]).catch(async () => [{ s: null }]))[0].s;

  // ------------------------------------------------------------ A: dois usuários editam o mesmo cadastro
  {
    const pid = await newProduct("A", 0);
    const g = (await api(P("gerente"), `/api/products/${pid}`)).body?.data;
    const before = (await q(`select updated_at::text u from products where id=$1`, [pid]))[0].u;
    // Ambos abriram o cadastro (mesma versão) e salvam o formulário inteiro, cada um mudando um campo.
    const fa = { ...g, precoVenda: 31.5 }, fb = { ...g, descricao: `${g.descricao} — revisada`, precoVenda: g.precoVenda };
    for (const k of ["id", "createdAt", "updatedAt", "created_at", "updated_at"]) { delete fa[k]; delete fb[k]; }
    const [ra, rb] = await Promise.all([post(P("gerente"), `/api/products/${pid}`, fa, "PATCH"), post(P("operador"), `/api/products/${pid}`, fb, "PATCH")]);
    const fin = (await api(P("gerente"), `/api/products/${pid}`)).body?.data;
    const both = Number(fin.precoVenda) === 31.5 && /revisada/.test(fin.descricao);
    const audits = (await q(`select count(*)::int n from audit_logs where company_id=$1 and entity_id=$2 and action = 'UPDATE'`, [cid, pid]))[0].n;
    // Edição com versão velha (sequencial): B salva depois de A, a partir da cópia antiga.
    const old = (await api(P("operador"), `/api/products/${pid}`)).body?.data;
    await post(P("gerente"), `/api/products/${pid}`, { precoVenda: 40 }, "PATCH");
    const stale = { ...old, descricao: `${old.descricao} (2)` };
    for (const k of ["id", "createdAt", "updatedAt", "created_at", "updated_at"]) delete stale[k];
    const rs = await post(P("operador"), `/api/products/${pid}`, stale, "PATCH");
    const fin2 = (await api(P("gerente"), `/api/products/${pid}`)).body?.data;
    // Rodada 2: com o bloqueio otimista (R48-02) o critério é "nada se perde em
    // silêncio": as duas alterações ficam OU uma grava e a outra recebe 409.
    const oneWins = [ra.status, rb.status].sort().join("/") === "200/409";
    report("A", "Dois usuários salvam o mesmo produto ao mesmo tempo (formulário inteiro)", (both || oneWins) && rs.status === 409 && Number(fin2.precoVenda) === 40, {
      company: co.name, target: "PATCH /api/products/:id × 2 (Gerente + Operador)", expected: "as duas alterações preservadas ou a segunda recusada com aviso (bloqueio otimista)",
      actual: `HTTP ${ra.status}/${rb.status}; preço final ${fin.precoVenda}, descrição "${fin.descricao}"; auditoria: ${audits} alterações; edição com cópia velha: HTTP ${rs.status}, preço voltou para ${fin2.precoVenda} (Gerente tinha gravado 40)`,
      lostUpdate: !both || Number(fin2.precoVenda) !== 40, before,
    });
  }

  // ------------------------------------------------------------ B: Vendedor e Gerente no mesmo pedido
  {
    const pid = await newProduct("B", 50);
    const r = await post(P("vendedor"), "/api/sales-orders", { customerId: D.customers[2], paymentTermsId: D.paymentTermId, notes: "Cenário B", items: [{ productId: pid, description: "Item B", unit: "UN", quantity: 5, unitPrice: 25, discount: 0 }] });
    const oid = idOf(r);
    await post(P("vendedor"), `/api/sales-orders/${oid}/submit`);
    const [ra, rc, rv] = await Promise.all([
      post(P("gerente"), `/api/sales-orders/${oid}/approve`),
      post(P("vendedor"), `/api/sales-orders/${oid}/cancel`, { reason: "Cliente pediu cancelamento (cenário B)" }),
      post(P("vendedor"), `/api/sales-orders/${oid}`, { notes: "Vendedor alterou observação durante a aprovação" }, "PATCH"),
    ]);
    const [o] = await q(`select status, notes, approved_at::text from sales_orders where id=$1`, [oid]);
    const okStates = (o.status === "approved" && rc.status >= 400) || (o.status === "cancelled" && ra.status >= 400) || (o.status === "cancelled" && ra.status < 300);
    const bothWon = ra.status < 300 && rc.status < 300;
    report("B", "Gerente aprova enquanto Vendedor cancela e edita o mesmo pedido", okStates && !(bothWon && o.status === "approved"), {
      company: co.name, target: "approve × cancel × PATCH simultâneos", expected: "um vence; o outro recebe recusa clara; estado final coerente",
      actual: `aprovar ${st(ra)}; cancelar ${st(rc)}; editar ${st(rv)}; status final ${o.status}; obs "${(o.notes ?? "").slice(0, 60)}"`,
    });
    // B2: editar itens de pedido JÁ aprovado.
    const oid2 = await approvedOrder(pid, 3, "Cenário B2");
    const re = await post(P("vendedor"), `/api/sales-orders/${oid2}`, { notes: "Alterado depois de aprovado", items: [{ productId: pid, description: "Item B", unit: "UN", quantity: 30, unitPrice: 1, discount: 0 }] }, "PATCH");
    const [o2] = await q(`select status, total_amount::float t from sales_orders where id=$1`, [oid2]);
    const items2 = await q(`select ordered_quantity::float qtd, unit_price::float p from sales_order_items where order_id=$1`, [oid2]);
    const changed = items2.some((x) => x.qtd === 30 || x.p === 1);
    report("B2", "Vendedor tenta mudar itens/preço de pedido já aprovado", !changed, {
      company: co.name, target: "PATCH /api/sales-orders/:id (aprovado)", expected: "itens e preço do pedido aprovado não mudam",
      actual: `HTTP ${st(re)}; status ${o2.status}; itens ${JSON.stringify(items2)}; total ${o2.t}`,
    });
  }

  // ------------------------------------------------------------ C: corrida de reserva (10 em estoque; 8 + 7)
  for (let k = 1; k <= 3; k++) {
    const pid = await newProduct(`C${k}`, 10);
    const o1 = await approvedOrder(pid, 8, `Cenário C${k} — pedido de 8`);
    const o2 = await approvedOrder(pid, 7, `Cenário C${k} — pedido de 7`);
    const [r1, r2] = await Promise.all([
      post(P("gerente"), `/api/sales-orders/${o1}/reserve`, { locationId: D.locations.pick }),
      post(P("logistica"), `/api/sales-orders/${o2}/reserve`, { locationId: D.locations.pick }),
    ]);
    const b = await bal(pid);
    const res = await q(`select r.reference_id sales_order_id, sum(i.quantity)::float q, r.status from stock_reservations r join stock_reservation_items i on i.reservation_id = r.id where r.company_id=$1 and i.product_id=$2 group by 1,3`, [cid, pid]);
    const active = res.filter((x) => !/released|cancel/i.test(x.status)).reduce((s, x) => s + x.q, 0);
    const ok = b.r <= b.q && active <= 10 && b.r === active;
    report(`C${k}`, `Corrida de reserva: estoque 10, A reserva 8 e B reserva 7 ao mesmo tempo (rodada ${k})`, ok, {
      company: co.name, target: "POST /reserve × 2 (Vendedor + Logística)", expected: "reservado ≤ 10; um pedido fica parcial/pendente",
      actual: `HTTP ${st(r1)} / ${st(r2)}; saldo ${b.q}, reservado ${b.r}, reservas ativas ${active} (${res.map((x) => `${x.q} ${x.status}`).join(", ")})`,
    });
  }
  // C4: mesmo pedido reservado duas vezes ao mesmo tempo (duplo clique).
  {
    const pid = await newProduct("C4", 10);
    const o1 = await approvedOrder(pid, 6, "Cenário C4 — duplo clique");
    const rr = await Promise.all([1, 2, 3].map(() => post(P("logistica"), `/api/sales-orders/${o1}/reserve`, { locationId: D.locations.pick })));
    const b = await bal(pid);
    report("C4", "Mesmo pedido: 3 cliques simultâneos em Reservar", b.r === 6, {
      company: co.name, target: "POST /reserve × 3 (mesmo usuário, Logística)", expected: "reservado = 6 (não 12 ou 18)", actual: `HTTP ${rr.map(st).join(" / ")}; reservado ${b.r}`,
    });
  }

  // ------------------------------------------------------------ D: entrada, consulta, reserva e separação ao mesmo tempo
  {
    const pid = await newProduct("D", 20);
    const oA = await approvedOrder(pid, 5, "Cenário D — separação");
    await post(P("logistica"), `/api/sales-orders/${oA}/reserve`, { locationId: D.locations.pick });
    const pl = idOf(await post(P("logistica"), `/api/sales-orders/${oA}/pick-lists`, { warehouseId: D.warehouseId, notes: "Cenário D" }));
    await post(P("logistica"), `/api/pick-lists/${pl}/start`);
    const plItems = (await api(P("logistica"), `/api/pick-lists/${pl}`)).body?.data?.items ?? [];
    const oB = await approvedOrder(pid, 9, "Cenário D — reserva concorrente");
    const t0 = Date.now();
    const rs = await Promise.all([
      post(P("operador"), "/api/stock-movements/receive", { productId: pid, locationId: D.locations.pick, quantity: 15, unitCost: 10, notes: "Cenário D — entrada", idempotencyKey: `r48c-${tag}-D-in` }),
      api(P("vendedor"), `/api/stock-balances?productId=${pid}`),
      post(P("gerente"), `/api/sales-orders/${oB}/reserve`, { locationId: D.locations.pick }),
      ...plItems.map((it) => post(P("logistica"), `/api/pick-lists/${pl}/items/${it.id}/pick`, { pickedQuantity: Number(it.requested_quantity ?? it.quantity ?? 5) })),
      post(P("operador"), "/api/stock-movements/issue", { productId: pid, locationId: D.locations.pick, quantity: 3, notes: "Cenário D — saída avulsa", idempotencyKey: `r48c-${tag}-D-out` }),
    ]);
    const ms = Date.now() - t0;
    await post(P("logistica"), `/api/pick-lists/${pl}/complete`);
    const b = await bal(pid);
    const led = await ledger(pid);
    const ok = b.r <= b.q && (led === null || Math.abs(led - b.q) < 0.0001);
    report("D", "Entrada + consulta + reserva + separação + saída no mesmo produto, simultâneas", ok, {
      company: co.name, target: "5 operações em paralelo (Operador, Vendedor, Gerente, Logística)", expected: "saldo = soma do razão; reservado ≤ saldo; nenhum 5xx",
      actual: `HTTP ${rs.map(st).join(" / ")} em ${ms} ms; saldo ${b.q}, reservado ${b.r}, razão ${led}`,
    });
  }

  // ------------------------------------------------------------ E: baixa duplicada do mesmo título
  for (const [label, sameUser] of [["E1", false], ["E2", true]]) {
    const ap = idOf(await post(P("financeiro"), "/api/accounts-payable", { supplierId: D.suppliers[0], description: `Cenário ${label} (${tag})`, originalAmount: 500, installments: [{ dueDate: inDays(10), amount: 500 }], categoryId: D.expenseCat, issueDate: inDays(0) }));
    const inst = (await api(P("financeiro"), `/api/accounts-payable/${ap}`)).body?.data?.installments?.[0];
    const bankBefore = (await q(`select current_balance::float b from financial_accounts where id=$1`, [D.bankId]).catch(() => [{ b: null }]))[0]?.b;
    const body = (n) => ({ financialAccountId: D.bankId, amount: 500, method: "PIX", ...(sameUser ? {} : { idempotencyKey: `r48c-${tag}-${label}-${n}` }) });
    const rr = await Promise.all([post(P("financeiro"), `/api/accounts-payable-installments/${inst.id}/pay`, body(1)), post(P(sameUser ? "financeiro" : "gerente"), `/api/accounts-payable-installments/${inst.id}/pay`, body(2))]);
    const [i2] = await q(`select status, paid_amount::float p from accounts_payable_installments where id=$1`, [inst.id]);
    const pays = (await q(`select count(*)::int n, coalesce(sum(amount),0)::float s from payments where installment_id=$1`, [inst.id]).catch(() => [{ n: null, s: null }]))[0];
    const tx = (await q(`select count(*)::int n, coalesce(sum(amount),0)::float s from financial_transactions where company_id=$1 and (reference_id=$2 or reference_id=$3 or reference_id in (select id from payments where installment_id=$2))`, [cid, inst.id, ap]).catch(() => [{ n: null }]))[0];
    const bankAfter = (await q(`select current_balance::float b from financial_accounts where id=$1`, [D.bankId]).catch(() => [{ b: null }]))[0]?.b;
    const debited = bankBefore != null && bankAfter != null ? Math.round((bankBefore - bankAfter) * 100) / 100 : null;
    const ok = rr.filter((r) => r.status < 300).length <= 1 && (i2.p == null || i2.p <= 500) && (debited == null || debited <= 500);
    report(label, `Baixa duplicada do mesmo título (R$ 500) — ${sameUser ? "mesmo usuário, duplo clique, sem chave de idempotência" : "Financeiro e Gerente ao mesmo tempo"}`, ok, {
      company: co.name, target: "POST /pay × 2", expected: "uma baixa; a outra recusada; banco debitado uma vez",
      actual: `HTTP ${rr.map(st).join(" / ")}; parcela ${JSON.stringify(i2)}; pagamentos ${JSON.stringify(pays)}; lançamentos ${JSON.stringify(tx)}; débito no banco ${debited}`,
    });
  }
  // E3: recebimento (contas a receber) duplicado.
  {
    const pid = await newProduct("E3", 10);
    const oid = await approvedOrder(pid, 2, "Cenário E3");
    const arId = idOf(await post(P("financeiro"), `/api/sales-orders/${oid}/generate-receivable`, { categoryId: D.incomeCat }));
    const inst = (await api(P("financeiro"), `/api/accounts-receivable/${arId}`)).body?.data?.installments?.[0];
    const amt = Number(inst.open_amount ?? inst.amount);
    const rr = await Promise.all([1, 2].map((n) => post(P(n === 1 ? "financeiro" : "gerente"), `/api/accounts-receivable-installments/${inst.id}/receive`, { financialAccountId: D.bankId, amount: amt, method: "PIX", idempotencyKey: `r48c-${tag}-E3-${n}` })));
    const [i2] = await q(`select status, received_amount::float r from accounts_receivable_installments where id=$1`, [inst.id]).catch(async () => q(`select * from accounts_receivable_installments where id=$1`, [inst.id]));
    const rec = (await q(`select count(*)::int n, coalesce(sum(amount),0)::float s from receipts where installment_id=$1`, [inst.id]).catch(() => [{ n: null }]))[0];
    const ok = rr.filter((r) => r.status < 300).length <= 1;
    report("E3", `Recebimento duplicado da mesma parcela (R$ ${amt})`, ok, {
      company: co.name, target: "POST /receive × 2 (Financeiro + Gerente)", expected: "um recebimento; o outro recusado",
      actual: `HTTP ${rr.map(st).join(" / ")}; parcela ${JSON.stringify(i2).slice(0, 160)}; recebimentos ${JSON.stringify(rec)}`,
    });
    // E4: gerar a conta a receber duas vezes ao mesmo tempo.
    const oid2 = await approvedOrder(pid, 1, "Cenário E4");
    const g = await Promise.all(["financeiro", "gerente"].map((r) => post(P(r), `/api/sales-orders/${oid2}/generate-receivable`, { categoryId: D.incomeCat })));
    const n = (await q(`select count(*)::int n from accounts_receivable where company_id=$1 and origin_id=$2 and status <> 'CANCELLED'`, [cid, oid2]))[0].n;
    report("E4", "Gerar conta a receber do mesmo pedido 2× ao mesmo tempo", n === 1, {
      company: co.name, target: "POST /generate-receivable × 2", expected: "1 título ativo; o 2º informado", actual: `HTTP ${g.map(st).join(" / ")} · ${g.map((x) => x.body?.message ?? "").filter(Boolean).join(" | ")}; títulos ativos do pedido: ${n}`,
    });
  }

  // ------------------------------------------------------------ F: documento fiscal processado duas vezes
  {
    const pid = await newProduct("F", 10);
    const oid = await approvedOrder(pid, 2, "Cenário F");
    const body = { fiscalEstablishmentId: D.establishmentId, operationNatureId: D.natureId, notes: "Cenário F" };
    const g = await Promise.all([post(P("fiscal"), `/api/sales-orders/${oid}/generate-fiscal-document`, body), post(P("gerente"), `/api/sales-orders/${oid}/generate-fiscal-document`, body)]);
    const docs = await q(`select id, status from fiscal_documents where company_id=$1 and source_id=$2`, [cid, oid]);
    report("F1", "Gerar NF-e do mesmo pedido 2× ao mesmo tempo (Fiscal + Gerente)", docs.length === 1 && g.filter((r) => r.status === 201).length === 1, {
      company: co.name, target: "POST /generate-fiscal-document × 2", expected: "1 documento", actual: `HTTP ${g.map(st).join(" / ")}; documentos: ${docs.length}`,
    });
    const doc = docs[0]?.id;
    if (doc) {
      const c = await Promise.all([1, 2].map(() => post(P("fiscal"), `/api/fiscal-documents/${doc}/calculate`)));
      const itemsN = (await q(`select count(*)::int n, coalesce(sum(total_amount),0)::float t from fiscal_document_items where fiscal_document_id=$1`, [doc]).catch(() => [{}]))[0];
      const rd = await Promise.all([1, 2].map(() => post(P("fiscal"), `/api/fiscal-documents/${doc}/ready`)));
      const an = await Promise.all([1, 2].map(() => post(P("fiscal"), `/api/fiscal-documents/${doc}/assign-number`, {})));
      const [d] = await q(`select status, number, series from fiscal_documents where id=$1`, [doc]).catch(async () => q(`select status from fiscal_documents where id=$1`, [doc]));
      // Rodada 2: a 0083 recusa chave inventada; a corrida usa a mesma chave VÁLIDA (com o número do documento).
      const [{ k: validKey }] = await q(`select public.fn_fiscal_simulated_access_key($1) k`, [doc]);
      const auth = await Promise.all([1, 2].map(() => post(P("fiscal"), `/api/fiscal-documents/${doc}/authorize`, { accessKey: validKey, protocol: "PROTOCOLO-TESTE-CONCORRENCIA" })));
      const [d2] = await q(`select status, access_key from fiscal_documents where id=$1`, [doc]).catch(async () => q(`select status from fiscal_documents where id=$1`, [doc]));
      const ok = itemsN.n === 1 && auth.filter((r) => r.status < 300).length === 1 && d2?.status === "AUTHORIZED";
      report("F2", "Calcular, marcar pronta, numerar e autorizar a mesma NF-e 2× ao mesmo tempo", ok, {
        company: co.name, target: "calculate/ready/assign-number/authorize × 2", expected: "itens não duplicam; uma autorização; número único",
        actual: `calcular ${c.map(st).join("/")}; itens ${JSON.stringify(itemsN)}; pronta ${rd.map(st).join("/")}; numerar ${an.map(st).join("/")} → ${JSON.stringify(d)}; autorizar ${auth.map(st).join(" / ")} → ${JSON.stringify(d2).slice(0, 120)}`,
      });
    }
  }

  // ------------------------------------------------------------ G: separação/expedição feita duas vezes
  {
    const pid = await newProduct("G", 10);
    const oid = await approvedOrder(pid, 4, "Cenário G");
    await post(P("logistica"), `/api/sales-orders/${oid}/reserve`, { locationId: D.locations.pick });
    const pls = await Promise.all([1, 2].map(() => post(P("logistica"), `/api/sales-orders/${oid}/pick-lists`, { warehouseId: D.warehouseId, notes: "Cenário G" })));
    const plCount = (await q(`select count(*)::int n from pick_lists where company_id=$1 and sales_order_id=$2 and status <> 'cancelled'`, [cid, oid]))[0].n;
    report("G1", "Criar separação do mesmo pedido 2× ao mesmo tempo", plCount === 1, {
      company: co.name, target: "POST /pick-lists × 2", expected: "1 lista de separação ativa", actual: `HTTP ${pls.map(st).join(" / ")}; listas ativas ${plCount}`,
    });
    const pl = idOf(pls.find((r) => r.status < 300));
    await post(P("logistica"), `/api/pick-lists/${pl}/start`);
    const it = (await api(P("logistica"), `/api/pick-lists/${pl}`)).body?.data?.items?.[0];
    const pk = await Promise.all([1, 2].map(() => post(P("logistica"), `/api/pick-lists/${pl}/items/${it.id}/pick`, { pickedQuantity: 4 })));
    const [pi] = await q(`select picked_quantity::float p from pick_list_items where id=$1`, [it.id]);
    const cp = await Promise.all([1, 2].map(() => post(P("logistica"), `/api/pick-lists/${pl}/complete`)));
    report("G2", "Separar o mesmo item e concluir a separação 2× ao mesmo tempo", pi.p === 4, {
      company: co.name, target: "pick × 2, complete × 2", expected: "separado = 4 (não 8)", actual: `separar ${pk.map(st).join("/")}; separado ${pi.p}; concluir ${cp.map(st).join("/")}`,
    });
    const order = (await api(P("logistica"), `/api/sales-orders/${oid}`)).body?.data;
    const items = (order?.items ?? []).map((x) => ({ salesOrderItemId: x.id, locationId: D.locations.pick, quantity: Number(x.ordered_quantity) }));
    const shs = await Promise.all([1, 2].map(() => post(P("logistica"), `/api/sales-orders/${oid}/shipments`, { warehouseId: D.warehouseId, pickListId: pl, expectedShipDate: inDays(1), items })));
    const shN = (await q(`select count(*)::int n from shipments where company_id=$1 and sales_order_id=$2 and status <> 'cancelled'`, [cid, oid]))[0].n;
    const sh = idOf(shs.find((r) => r.status < 300));
    await post(P("logistica"), `/api/shipments/${sh}/packages`, { packageNumber: 1, weight: 2 });
    await post(P("logistica"), `/api/shipments/${sh}/ready`);
    await post(P("logistica"), `/api/shipments/${sh}/pack`);
    await post(P("gerente"), `/api/shipments/${sh}/approve`);
    const before = await bal(pid);
    const sp = await Promise.all([post(P("logistica"), `/api/shipments/${sh}/ship`, {}), post(P("gerente"), `/api/shipments/${sh}/ship`, {}), post(P("logistica"), `/api/shipments/${sh}/ship`, {})]);
    const after = await bal(pid);
    const outMov = (await q(`select count(*)::int n, coalesce(sum(quantity),0)::float s from stock_movements where company_id=$1 and product_id=$2 and movement_type='ISSUE'`, [cid, pid]))[0];
    const dl = await Promise.all([1, 2].map(() => post(P("logistica"), `/api/shipments/${sh}/deliver`, { recipientName: "Recebedor fictício", podType: "signature" })));
    const ev = (await q(`select count(*)::int n from delivery_events where shipment_id=$1`, [sh]).catch(() => [{ n: null }]))[0].n;
    const ok = shN === 1 && before.q - after.q === 4 && outMov.s === 4 && ev === 1;
    report("G3", "Criar expedição 2×, expedir 3× e entregar 2× ao mesmo tempo", ok, {
      company: co.name, target: "shipments × 2; ship × 3 (Logística + Gerente); deliver × 2", expected: "1 expedição; baixa de estoque única (4 un.); 1 evento de entrega",
      actual: `criar ${shs.map(st).join("/")}, ativas ${shN}; expedir ${sp.map(st).join("/")}; saldo ${before.q}→${after.q}; saídas ${JSON.stringify(outMov)}; entregar ${dl.map(st).join("/")}; eventos ${ev}`,
    });
  }
  for (const s of Object.values(sess)) await s.c.close();
}

const RUN = process.env.RUN ?? "1";
for (const k of (process.env.ONLY ?? "vertice,sertao").split(",")) await run(k, RUN);
const rows = [["ID", "Cenário", "Empresa", "Resultado", "O que aconteceu"], ...out.scenarios.map((s) => [s.id, s.name, s.company, s.ok ? "PASS" : "FAIL", s.actual])];
await evidenceCard(null, "concorrencia", `00-concorrencia-rodada-${RUN}`, `Concorrência A–G — rodada ${RUN}`, rows);
fs.writeFileSync(new URL(`./r5-concorrencia-${RUN}.out.json`, import.meta.url), JSON.stringify(out, null, 2));
console.log(`concorrência: ${out.scenarios.filter((s) => s.ok).length} PASS, ${out.scenarios.filter((s) => !s.ok).length} FAIL`);
await db.end();
await close();
