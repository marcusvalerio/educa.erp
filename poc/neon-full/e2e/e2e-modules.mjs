// E2E dos 8 módulos restantes (Financeiro, Fiscal, Produção, CRM, Qualidade,
// Projetos/Serviços, Workflow, Importação) — mesma pilha do e2e-postgres.mjs:
// navegador → app → Neon Auth (dublê) → src/lib/database/pg → PostgreSQL com o
// esquema de produção. Chamado ao fim do e2e-postgres.mjs, reaproveitando as
// sessões reais já abertas (A1 admin Alfa, A2 leitura Alfa, B1 admin Beta).
//
// Por módulo: acesso autorizado (CRUD + funções RPC do banco), validação (400),
// papel sem permissão (403), outra empresa (404/recusa, sem efeito no banco),
// sem sessão (401) e conferência do resultado direto no banco.

export async function runModuleE2E({ APP, api, sql, check, a1, a2, b1, companyA, companyB, made, crypto }) {
  const post = (s, url, body) => api(s.page, url, { method: "POST", body: JSON.stringify(body ?? {}) });
  const patch = (s, url, body) => api(s.page, url, { method: "PATCH", body: JSON.stringify(body) });
  const get = (s, url) => api(s.page, url);
  const anon = async (url) => (await fetch(`${APP}${url}`)).status;
  const idOf = (r) => r.body?.data?.id ?? r.body?.data?.job?.id ?? (typeof r.body?.data === "string" ? r.body.data : undefined);
  const j = (r) => `${r.status} ${JSON.stringify(r.body)?.slice(0, 240)}`;
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
  // Validação no app = 422 VALIDATION_ERROR (src/lib/database/errors.ts), nada gravado.
  const invalid = (r) => r.status === 422 && r.body?.error?.code === "VALIDATION_ERROR";
  // O papel "leitura" só lê o que o próprio papel tem no banco (RBAC real, não suposto).
  const readerHas = (code) => sql(`select count(*) from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id where r.company_id = '${companyA}' and r.code = 'leitura' and p.code = ${q(code)}`) === "1";
  // Erro genérico do banco devolvido pelo app (sem vazar SQL).
  const dbError = (r) => r.status === 500 && r.body?.error?.code === "DATABASE_ERROR" && !/select|insert|relation|constraint/i.test(JSON.stringify(r.body));
  const inA = (table, id) => sql(`select company_id from ${table} where id=${q(id)}`) === companyA;

  async function mod(name, fn) {
    try {
      await fn((label, ok, detail) => check(`[${name}] ${label}`, ok, detail));
    } catch (error) {
      check(`[${name}] execução sem exceção`, false, error?.stack ?? String(error));
    }
  }

  // ------------------------------------------------------------------ Financeiro
  await mod("Financeiro", async (c) => {
    const cat = await post(a1, "/api/financial-categories", { code: "DESP-POC", name: "Despesas POC", type: "EXPENSE" });
    c("categoria: criar (201) na Alfa", cat.status === 201 && inA("financial_categories", idOf(cat)), j(cat));
    const catUpd = await patch(a1, `/api/financial-categories/${idOf(cat)}`, { name: "Despesas POC Ed." });
    c("categoria: editar", catUpd.status === 200 && catUpd.body?.data?.name === "Despesas POC Ed.", j(catUpd));
    const badCat = await post(a1, "/api/financial-categories", { code: "X", name: "X", type: "OUTRO" });
    c("validação: tipo de categoria inválido → 422", invalid(badCat), j(badCat));

    const acc = await post(a1, "/api/financial-accounts", { code: "CX-POC", name: "Caixa POC", type: "CASH", openingBalance: 1000 });
    const accId = sql(`select id from financial_accounts where company_id='${companyA}' and code='CX-POC'`);
    c("conta: criar via RPC fn_create_financial_account (saldo = abertura)", acc.status === 201 && Number(sql(`select current_balance from financial_accounts where id='${accId}'`)) === 1000, j(acc));

    const noInst = await post(a1, "/api/accounts-payable", { supplierId: made.supplier, description: "Sem parcelas", originalAmount: 10, installments: [] });
    c("validação: título sem parcelas → 422", invalid(noInst), j(noInst));
    const ap = await post(a1, "/api/accounts-payable", {
      supplierId: made.supplier, description: "Compra POC", originalAmount: 300, categoryId: idOf(cat),
      installments: [{ dueDate: "2026-12-10", amount: 150 }, { dueDate: "2027-01-10", amount: 150 }],
    });
    const apId = sql(`select id from accounts_payable where company_id='${companyA}' and description='Compra POC'`);
    c("contas a pagar: criar título com 2 parcelas (RPC transacional)", ap.status === 201 && sql(`select count(*) from accounts_payable_installments where payable_id='${apId}'`) === "2", j(ap));
    const apGet = await get(a1, `/api/accounts-payable/${apId}`);
    c("contas a pagar: ler com parcelas", apGet.status === 200 && apGet.body?.data?.installments?.length === 2, j(apGet));
    const apUpd = await patch(a1, `/api/accounts-payable/${apId}`, { description: "Compra POC Ed." });
    c("contas a pagar: editar via RPC", apUpd.status === 200 && sql(`select description from accounts_payable where id='${apId}'`) === "Compra POC Ed.", j(apUpd));

    const [inst1, inst2] = sql(`select id from accounts_payable_installments where payable_id='${apId}' order by installment_number`).split("\n");
    const pay = await post(a1, `/api/accounts-payable-installments/${inst1}/pay`, { financialAccountId: accId, amount: 150, method: "PIX", idempotencyKey: "poc-pay-1" });
    c("pagamento: baixa parcela e debita a conta (1000 → 850)", pay.status === 201 && Number(sql(`select current_balance from financial_accounts where id='${accId}'`)) === 850, j(pay));
    const pay2 = await post(a1, `/api/accounts-payable-installments/${inst1}/pay`, { financialAccountId: accId, amount: 150, method: "PIX", idempotencyKey: "poc-pay-1" });
    c("pagamento: mesma chave de idempotência não debita de novo", pay2.status < 300 && Number(sql(`select current_balance from financial_accounts where id='${accId}'`)) === 850, j(pay2));
    const over = await post(a1, `/api/accounts-payable-installments/${inst2}/pay`, { financialAccountId: accId, amount: 999, method: "PIX" });
    c("pagamento: valor acima do saldo da parcela recusado (409), nada gravado", over.status === 409 && Number(sql(`select current_balance from financial_accounts where id='${accId}'`)) === 850, j(over));

    const ap2 = await post(a1, "/api/accounts-payable", { supplierId: made.supplier, description: "Título a cancelar POC", originalAmount: 50, installments: [{ dueDate: "2026-12-20", amount: 50 }] });
    const ap2Id = sql(`select id from accounts_payable where company_id='${companyA}' and description='Título a cancelar POC'`);
    const cancel = await post(a1, `/api/accounts-payable/${ap2Id}/cancel`, { reason: "E2E" });
    c("contas a pagar: cancelar título sem pagamento (RPC)", ap2.status === 201 && cancel.status === 200 && /cancel/i.test(sql(`select status from accounts_payable where id='${ap2Id}'`)), j(cancel));
    const cancelPart = await post(a1, `/api/accounts-payable/${apId}/cancel`, { reason: "E2E" });
    const inst = sql(`select string_agg(status, ',' order by installment_number) from accounts_payable_installments where payable_id='${apId}'`);
    c("contas a pagar: cancelar título parcialmente pago mantém a parcela paga e cancela a aberta (regra do banco)", cancelPart.status === 200 && inst === "PAID,CANCELLED" && Number(sql(`select current_balance from financial_accounts where id='${accId}'`)) === 850, `${j(cancelPart)} ${inst}`);
    const cancelAgain = await post(a1, `/api/accounts-payable/${ap2Id}/cancel`, { reason: "E2E" });
    c("contas a pagar: título já cancelado não cancela de novo (409)", cancelAgain.status === 409, j(cancelAgain));

    const rList = await get(a2, "/api/accounts-payable");
    const rPost = await post(a2, "/api/accounts-payable", { supplierId: made.supplier, description: "X", originalAmount: 1, installments: [{ dueDate: "2026-12-10", amount: 1 }] });
    c("papel leitura: leitura segue accounts_payable.view do papel; criação 403", rList.status === (readerHas("accounts_payable.view") ? 200 : 403) && rPost.status === 403, `${rList.status} ${rPost.status}`);
    const bGet = await get(b1, `/api/accounts-payable/${apId}`);
    const bList = await get(b1, "/api/accounts-payable");
    c("outra empresa: B1 não lê título da Alfa (404) nem o vê na lista", bGet.status === 404 && !(bList.body?.data ?? []).some((x) => x.id === apId), `${bGet.status}`);
    const bPay = await post(b1, `/api/accounts-payable-installments/${inst2}/pay`, { financialAccountId: accId, amount: 10, method: "PIX" });
    c("outra empresa: B1 não paga parcela da Alfa (saldo intacto)", bPay.status >= 400 && Number(sql(`select current_balance from financial_accounts where id='${accId}'`)) === 850, j(bPay));
    c("sem sessão: 401", (await anon("/api/accounts-payable")) === 401);
  });

  // ---------------------------------------------------------------------- Fiscal
  await mod("Fiscal", async (c) => {
    const est = await post(a1, "/api/fiscal-establishments", { code: "EST-POC", name: "Matriz Fiscal POC", cnpj: "12.345.678/0001-90", taxRegime: "SIMPLES_NACIONAL", state: "SP", city: "São Paulo" });
    c("estabelecimento: criar (201)", est.status === 201 && inA("fiscal_establishments", idOf(est)), j(est));
    const estUpd = await patch(a1, `/api/fiscal-establishments/${idOf(est)}`, { name: "Matriz Fiscal POC Ed." });
    c("estabelecimento: editar", estUpd.status === 200 && estUpd.body?.data?.name === "Matriz Fiscal POC Ed.", j(estUpd));
    const badEst = await post(a1, "/api/fiscal-establishments", { code: "E2", name: "X", cnpj: "1", taxRegime: "INVALIDO" });
    c("validação: regime tributário inválido → 422", invalid(badEst), j(badEst));
    const nat = await post(a1, "/api/fiscal-operation-natures", { code: "VENDA-POC", name: "Venda POC", direction: "SAIDA" });
    c("natureza de operação: criar", nat.status === 201, j(nat));

    const doc = await post(a1, "/api/fiscal-documents", { fiscalEstablishmentId: idOf(est), type: "NFE", direction: "SAIDA", operationNatureId: idOf(nat), customerId: made.customer });
    const docId = sql(`select id from fiscal_documents where company_id='${companyA}' order by created_at desc limit 1`);
    c("documento fiscal: criar rascunho via RPC", doc.status === 201 && !!docId, j(doc));
    const item = await post(a1, `/api/fiscal-documents/${docId}/items`, { productId: made.product, quantity: 2, unitPrice: 13.9, ncmCode: "73181500", cfopCode: "5102", unit: "UN" });
    c("documento fiscal: incluir item via RPC", item.status === 201 && sql(`select count(*) from fiscal_document_items where fiscal_document_id='${docId}'`) === "1", j(item));
    const badItem = await post(a1, `/api/fiscal-documents/${docId}/items`, { productId: made.product, quantity: 0, unitPrice: 1 });
    c("validação: item com quantidade 0 → 422", invalid(badItem), j(badItem));
    const calc = await post(a1, `/api/fiscal-documents/${docId}/calculate`, {});
    c("documento fiscal: calcular (RPC) com total 27,80", calc.status === 200 && JSON.stringify(calc.body).includes("27.8"), j(calc));
    const dGet = await get(a1, `/api/fiscal-documents/${docId}`);
    c("documento fiscal: ler", dGet.status === 200, j(dGet));

    const rPost = await post(a2, "/api/fiscal-documents", { fiscalEstablishmentId: idOf(est), type: "NFE", direction: "SAIDA", operationNatureId: idOf(nat) });
    const rList = await get(a2, "/api/fiscal-documents");
    c("papel leitura: leitura segue fiscal_documents.view do papel; criação 403", rPost.status === 403 && rList.status === (readerHas("fiscal_documents.view") ? 200 : 403), `${rPost.status} ${rList.status}`);
    const bGet = await get(b1, `/api/fiscal-documents/${docId}`);
    c("outra empresa: B1 não lê documento da Alfa (404)", bGet.status === 404, j(bGet));
    const bItem = await post(b1, `/api/fiscal-documents/${docId}/items`, { productId: made.product, quantity: 1, unitPrice: 1 });
    c("outra empresa: B1 não inclui item em documento da Alfa", bItem.status >= 400 && sql(`select count(*) from fiscal_document_items where fiscal_document_id='${docId}'`) === "1", j(bItem));
    const bDoc = await post(b1, "/api/fiscal-documents", { fiscalEstablishmentId: idOf(est), type: "NFE", direction: "SAIDA", operationNatureId: idOf(nat) });
    c("outra empresa: B1 não usa estabelecimento da Alfa em documento próprio", bDoc.status >= 400 && sql(`select count(*) from fiscal_documents where company_id='${companyB}'`) === "0", j(bDoc));
    c("sem sessão: 401", (await anon("/api/fiscal-documents")) === 401);
  });

  // -------------------------------------------------------------------- Produção
  await mod("Produção", async (c) => {
    const wc = await post(a1, "/api/work-centers", { code: "CT-POC", name: "Torno POC", type: "machine" });
    c("centro de trabalho: criar", wc.status === 201 && inA("work_centers", idOf(wc)), j(wc));
    const wcUpd = await patch(a1, `/api/work-centers/${idOf(wc)}`, { name: "Torno POC Ed." });
    c("centro de trabalho: editar", wcUpd.status === 200 && sql(`select name from work_centers where id='${idOf(wc)}'`) === "Torno POC Ed.", j(wcUpd));
    const unitId = sql(`select id from units where company_id='${companyA}' and code='UN'`);
    const purchased = await post(a1, "/api/production-orders", { productId: made.product, unitId, sourceWarehouseId: made.warehouse, consumptionLocationId: made.location, targetWarehouseId: made.warehouse, outputLocationId: made.location, plannedQuantity: 1 });
    c("linha de base: produto 'purchased' não gera ordem (409, regra do banco; a API não expõe production_type)", purchased.status === 409, j(purchased));
    const fab = await post(a1, "/api/products", { codigo: "P-POC-FAB", descricao: "Conjunto fabricado POC", categoria: "Ferramentas", unidade: "UN" });
    const fabId = idOf(fab);
    // A API de produtos não expõe production_type nem preenche unit_id (só o texto
    // "unit"); em produção esses campos vieram de carga/seed. Dado de teste por SQL
    // de dono — lacunas pré-existentes registradas como dívida (sem correção silenciosa).
    c("linha de base: produto criado pela API fica sem unit_id (igual a produção)", sql(`select count(*) from products where id in ('${fabId}','${made.product}') and unit_id is null`) === "2");
    sql(`update products set production_type = 'manufactured' where id = '${fabId}'`);
    sql(`update products set unit_id = '${unitId}' where id in ('${fabId}', '${made.product}')`);
    // Estrutura (BOM) pelo app: criar → item (componente = produto comprado) → ativar.
    const bom = await post(a1, "/api/product-boms", { productId: fabId, referenceQuantity: 1, unitId });
    const bomId = sql(`select id from product_boms where company_id='${companyA}' and product_id='${fabId}' order by created_at desc limit 1`);
    const bomItem = await post(a1, `/api/product-boms/${bomId}/items`, { componentProductId: made.product, quantity: 2, unitId });
    const bomAct = await post(a1, `/api/product-boms/${bomId}/activate`, {});
    c("estrutura (BOM): criar, incluir componente e ativar (RPCs)", bom.status === 201 && bomItem.status === 201 && bomAct.status === 200 && /active/i.test(sql(`select status from product_boms where id='${bomId}'`)), `${j(bom)} ${j(bomItem)} ${j(bomAct)}`);
    const bBom = await post(b1, `/api/product-boms/${bomId}/activate`, {});
    c("outra empresa: B1 não mexe na BOM da Alfa", bBom.status >= 400, j(bBom));
    const base = { productId: fabId, unitId, sourceWarehouseId: made.warehouse, consumptionLocationId: made.location, targetWarehouseId: made.warehouse, outputLocationId: made.location };
    const bad = await post(a1, "/api/production-orders", { ...base, plannedQuantity: 0 });
    c("validação: quantidade planejada 0 → 422", invalid(bad), j(bad));
    const op = await post(a1, "/api/production-orders", { ...base, plannedQuantity: 10, priority: "high" });
    const opId = sql(`select id from production_orders where company_id='${companyA}' order by created_at desc limit 1`);
    c("ordem de produção: criar via RPC", op.status === 201 && !!opId, j(op));
    const plan = await post(a1, `/api/production-orders/${opId}/plan`, {});
    c("ordem de produção: planejar (transição no banco)", plan.status === 200 && /plan/i.test(sql(`select status from production_orders where id='${opId}'`)), j(plan));
    const opGet = await get(a1, `/api/production-orders/${opId}`);
    c("ordem de produção: ler", opGet.status === 200, j(opGet));

    const rPost = await post(a2, "/api/production-orders", { ...base, plannedQuantity: 1 });
    const rList = await get(a2, "/api/production-orders");
    c("papel leitura: leitura segue production_orders.view do papel; criação 403", rPost.status === 403 && rList.status === (readerHas("production_orders.view") ? 200 : 403), `${rPost.status} ${rList.status}`);
    const statusBefore = sql(`select status from production_orders where id='${opId}'`);
    const bGet = await get(b1, `/api/production-orders/${opId}`);
    const bCancel = await post(b1, `/api/production-orders/${opId}/cancel`, {});
    c("outra empresa: B1 não lê (404) nem cancela ordem da Alfa", bGet.status === 404 && bCancel.status >= 400 && sql(`select status from production_orders where id='${opId}'`) === statusBefore, `${bGet.status} ${j(bCancel)}`);
    const bOp = await post(b1, "/api/production-orders", { ...base, plannedQuantity: 1 });
    c("outra empresa: B1 não cria ordem com produto/depósito da Alfa", bOp.status >= 400 && sql(`select count(*) from production_orders where company_id='${companyB}'`) === "0", j(bOp));
    const cancel = await post(a1, `/api/production-orders/${opId}/cancel`, { reason: "E2E" });
    c("ordem de produção: cancelar", cancel.status === 200 && /cancel/i.test(sql(`select status from production_orders where id='${opId}'`)), j(cancel));
    c("sem sessão: 401", (await anon("/api/production-orders")) === 401);
  });

  // ------------------------------------------------------------------------- CRM
  await mod("CRM", async (c) => {
    const bad = await post(a1, "/api/leads", { name: "Lead", email: "não-é-email" });
    c("validação: e-mail inválido → 422", invalid(bad), j(bad));
    const lead = await post(a1, "/api/leads", { name: "Lead POC", companyName: "Empresa Lead", email: "lead@poc.test", qualification: "HOT" });
    const leadId = idOf(lead);
    c("lead: criar", lead.status === 201 && inA("leads", leadId), j(lead));
    const leadUpd = await patch(a1, `/api/leads/${leadId}`, { status: "CONTACTED" });
    c("lead: editar status", leadUpd.status === 200 && sql(`select status from leads where id='${leadId}'`) === "CONTACTED", j(leadUpd));
    const pipe = await post(a1, "/api/pipelines", { code: "PIPE-POC", name: "Funil POC" });
    const pipeId = idOf(pipe);
    const s1 = await post(a1, "/api/pipeline-stages", { pipelineId: pipeId, code: "S1", name: "Prospecção", sequence: 1, probabilityDefault: 10 });
    const s2 = await post(a1, "/api/pipeline-stages", { pipelineId: pipeId, code: "S2", name: "Proposta", sequence: 2, probabilityDefault: 50 });
    c("pipeline + 2 estágios: criar", pipe.status === 201 && s1.status === 201 && s2.status === 201, `${j(pipe)} ${j(s1)} ${j(s2)}`);
    const conv = await post(a1, `/api/leads/${leadId}/convert-to-opportunity`, { pipelineId: pipeId, stageId: idOf(s1), estimatedValue: 5000 });
    // Sem a 0089 (esquema igual ao da produção) a conversão falha pela auditoria
    // 'INSERT'; com a 0089 ela funciona. O E2E confere o comportamento do
    // esquema que está rodando, em vez de fixar um dos dois.
    const has0089 = sql("select count(*) from pg_proc where proname='fn_convert_lead_to_opportunity' and prosrc like '%já tem a oportunidade%'") === "1";
    if (has0089) {
      c("lead → oportunidade (com a 0089): 201, oportunidade aberta e auditoria CREATE", conv.status === 201 && sql(`select count(*) from opportunities where lead_id='${leadId}' and status='OPEN'`) === "1" && sql(`select count(*) from audit_logs where entity='opportunities' and action='CREATE' and entity_id='${idOf(conv)}'`) === "1", j(conv));
    } else {
      c("linha de base (bug de produção): lead → oportunidade falha como no Supabase (audit 'INSERT' fora do CHECK); erro genérico e nada gravado", dbError(conv) && sql(`select count(*) from opportunities where lead_id='${leadId}'`) === "0" && sql(`select status from leads where id='${leadId}'`) === "CONTACTED", j(conv));
    }
    const opp = await post(a1, "/api/opportunities", { title: "Oportunidade POC", leadId, pipelineId: pipeId, stageId: idOf(s1), estimatedValue: 5000, probability: 10 });
    const oppId = idOf(opp) ?? sql(`select id from opportunities where company_id='${companyA}' and lead_id='${leadId}'`);
    c("oportunidade: criar pelo cadastro direto", opp.status === 201 && inA("opportunities", oppId), j(opp));
    const mv = await post(a1, `/api/opportunities/${oppId}/move-stage`, { stageId: idOf(s2) });
    c("oportunidade: mover estágio (RPC)", mv.status === 200 && sql(`select stage_id from opportunities where id='${oppId}'`) === idOf(s2), j(mv));
    const list = await get(a1, "/api/opportunities");
    c("oportunidades: listar", list.status === 200 && (list.body?.data ?? []).some((o) => o.id === oppId), j(list));

    const rPost = await post(a2, "/api/leads", { name: "X" });
    const rList = await get(a2, "/api/leads");
    c("papel leitura: leitura segue leads.view do papel; criação 403", rPost.status === 403 && rList.status === (readerHas("leads.view") ? 200 : 403), `${rPost.status} ${rList.status}`);
    const bGet = await get(b1, `/api/leads/${leadId}`);
    const bMv = await post(b1, `/api/opportunities/${oppId}/move-stage`, { stageId: idOf(s1) });
    c("outra empresa: B1 não lê lead (404) nem move oportunidade da Alfa", bGet.status === 404 && bMv.status >= 400 && sql(`select stage_id from opportunities where id='${oppId}'`) === idOf(s2), `${bGet.status} ${j(bMv)}`);
    const bPatch = await patch(b1, `/api/leads/${leadId}`, { name: "Invadido" });
    c("outra empresa: B1 não altera lead da Alfa", bPatch.status >= 400 && sql(`select name from leads where id='${leadId}'`) === "Lead POC", j(bPatch));
    c("sem sessão: 401", (await anon("/api/leads")) === 401);
  });

  // -------------------------------------------------------------------- Qualidade
  await mod("Qualidade", async (c) => {
    const bad = await post(a1, "/api/quality-inspections", { inspectionType: "QUALQUER" });
    c("validação: tipo de inspeção inválido → 422", invalid(bad), j(bad));
    const ins = await post(a1, "/api/quality-inspections", { inspectionType: "RECEIVING", productId: made.product, notes: "Lote POC" });
    const insId = idOf(ins) ?? sql(`select id from quality_inspections where company_id='${companyA}' order by created_at desc limit 1`);
    c("inspeção: criar", ins.status === 201 && inA("quality_inspections", insId), j(ins));
    const nc = await post(a1, `/api/quality-inspections/${insId}/nonconformity`, { severity: "HIGH", description: "Rosca fora de especificação" });
    const ncId = sql(`select id from nonconformities where company_id='${companyA}' order by created_at desc limit 1`);
    c("não conformidade a partir da inspeção (RPC)", nc.status === 201 && !!ncId, j(nc));
    const tr = await post(a1, `/api/nonconformities/${ncId}/transition`, { newStatus: "IN_ANALYSIS" });
    c("não conformidade: transição de status (RPC)", tr.status === 200 && sql(`select status from nonconformities where id='${ncId}'`) === "IN_ANALYSIS", j(tr));
    const badTr = await post(a1, `/api/nonconformities/${ncId}/transition`, { newStatus: "REABERTA" });
    c("validação: status de transição inválido → 422", invalid(badTr), j(badTr));
    const fin = await post(a1, `/api/quality-inspections/${insId}/finalize`, { status: "REJECTED", notes: "E2E" });
    c("inspeção: finalizar como reprovada (RPC)", fin.status === 200 && sql(`select status from quality_inspections where id='${insId}'`) === "REJECTED", j(fin));

    const rPost = await post(a2, "/api/quality-inspections", { inspectionType: "RECEIVING" });
    const rList = await get(a2, "/api/quality-inspections");
    c("papel leitura: leitura segue quality_inspections.view do papel; criação 403", rPost.status === 403 && rList.status === (readerHas("quality_inspections.view") ? 200 : 403), `${rPost.status} ${rList.status}`);
    const bGet = await get(b1, `/api/quality-inspections/${insId}`);
    const bTr = await post(b1, `/api/nonconformities/${ncId}/transition`, { newStatus: "CLOSED" });
    c("outra empresa: B1 não lê inspeção (404) nem muda NC da Alfa", bGet.status === 404 && bTr.status >= 400 && sql(`select status from nonconformities where id='${ncId}'`) === "IN_ANALYSIS", `${bGet.status} ${j(bTr)}`);
    c("sem sessão: 401", (await anon("/api/quality-inspections")) === 401);
  });

  // ------------------------------------------------------------ Projetos/Serviços
  await mod("Projetos", async (c) => {
    const bad = await post(a1, "/api/projects", { name: "" });
    c("validação: projeto sem nome → 422", invalid(bad), j(bad));
    const pj = await post(a1, "/api/projects", { name: "Projeto POC", customerId: made.customer, budget: 10000 });
    const pjId = idOf(pj);
    c("projeto: criar", pj.status === 201 && inA("projects", pjId), j(pj));
    const pjUpd = await patch(a1, `/api/projects/${pjId}`, { status: "IN_PROGRESS" });
    c("projeto: editar status", pjUpd.status === 200 && sql(`select status from projects where id='${pjId}'`) === "IN_PROGRESS", j(pjUpd));
    const task = await post(a1, "/api/project-tasks", { projectId: pjId, name: "Levantamento", priority: "HIGH", estimatedHours: 8 });
    c("tarefa do projeto: criar", task.status === 201 && sql(`select count(*) from project_tasks where project_id='${pjId}'`) === "1", j(task));
    const badOs = await post(a1, "/api/service-orders", { title: "Sem cliente" });
    c("validação: OS sem cliente → 422", invalid(badOs), j(badOs));
    const os = await post(a1, "/api/service-orders", { customerId: made.customer, projectId: pjId, title: "Instalação POC", priority: "HIGH" });
    const osId = idOf(os);
    c("ordem de serviço: criar vinculada ao projeto", os.status === 201 && sql(`select project_id from service_orders where id='${osId}'`) === pjId, j(os));
    const tr = await post(a1, `/api/service-orders/${osId}/transition`, { newStatus: "SCHEDULED" });
    c("ordem de serviço: transição (RPC)", tr.status === 200 && sql(`select status from service_orders where id='${osId}'`) === "SCHEDULED", j(tr));

    const rPost = await post(a2, "/api/projects", { name: "X" });
    const rList = await get(a2, "/api/projects");
    c("papel leitura: leitura segue projects.view do papel; criação 403", rPost.status === 403 && rList.status === (readerHas("projects.view") ? 200 : 403), `${rPost.status} ${rList.status}`);
    const bGet = await get(b1, `/api/projects/${pjId}`);
    const bPatch = await patch(b1, `/api/projects/${pjId}`, { name: "Invadido" });
    c("outra empresa: B1 não lê (404) nem altera projeto da Alfa", bGet.status === 404 && bPatch.status >= 400 && sql(`select name from projects where id='${pjId}'`) === "Projeto POC", `${bGet.status} ${j(bPatch)}`);
    const bTr = await post(b1, `/api/service-orders/${osId}/transition`, { newStatus: "CANCELLED" });
    c("outra empresa: B1 não muda OS da Alfa", bTr.status >= 400 && sql(`select status from service_orders where id='${osId}'`) === "SCHEDULED", j(bTr));
    c("sem sessão: 401", (await anon("/api/projects")) === 401);
  });

  // --------------------------------------------------------------------- Workflow
  await mod("Workflow", async (c) => {
    const bad = await post(a1, "/api/workflows", { code: "WF-X", name: "X" });
    c("validação: workflow sem módulo/entidade → 422", invalid(bad), j(bad));
    const wf = await post(a1, "/api/workflows", { code: "WF-POC", name: "Aprovação POC", module: "poc", entityType: "poc_entity" });
    const wfId = sql(`select id from workflows where company_id='${companyA}' and code='WF-POC'`);
    c("workflow: criar (RPC)", wf.status === 201 && !!wfId, j(wf));
    const ver = await post(a1, `/api/workflows/${wfId}/versions`, {});
    const verId = sql(`select id from workflow_versions where workflow_id='${wfId}' order by created_at desc limit 1`);
    c("versão: criar", ver.status === 201 && !!verId, j(ver));
    const step = await post(a1, `/api/workflow-versions/${verId}/steps`, { stepOrder: 1, name: "Aprovação do admin", approvalPolicy: "ANY" });
    const stepId = sql(`select id from workflow_steps where workflow_version_id='${verId}' order by step_order limit 1`);
    const adminRole = sql(`select id from roles where company_id='${companyA}' and code='admin'`);
    const appr = await post(a1, `/api/workflow-steps/${stepId}/approvers`, { approverType: "ROLE", roleId: adminRole });
    c("etapa + aprovador (papel admin): criar", step.status === 201 && appr.status === 201, `${j(step)} ${j(appr)}`);
    const pub = await post(a1, `/api/workflow-versions/${verId}/publish`, {});
    c("versão: publicar", pub.status === 200, j(pub));
    const late = await post(a1, `/api/workflow-versions/${verId}/steps`, { stepOrder: 2, name: "Depois de publicar" });
    c("versão publicada é imutável (recusa nova etapa)", late.status >= 400 && sql(`select count(*) from workflow_steps where workflow_version_id='${verId}'`) === "1", j(late));
    await post(a1, `/api/workflows/${wfId}/status`, { status: "active" });

    const entityId = crypto.randomUUID();
    const startWf = await post(a1, "/api/workflow-instances", { entityType: "poc_entity", entityId, workflowCode: "WF-POC", entitySnapshot: { valor: 100 } });
    c("linha de base (bug de produção): iniciar instância falha como no Supabase (v_step record → workflow_steps); erro genérico e nada gravado", dbError(startWf) && sql(`select count(*) from workflow_instances where entity_id='${entityId}'`) === "0", j(startWf));
    const pending = await get(a1, "/api/approvals/pending");
    c("aprovações pendentes: listar (RPC)", pending.status === 200 && Array.isArray(pending.body?.data), j(pending));
    const wfGet = await get(a1, `/api/workflows/${wfId}`);
    c("workflow: ler com versões", wfGet.status === 200, j(wfGet));
    const inactive = await post(a1, `/api/workflows/${wfId}/status`, { status: "inactive" });
    c("workflow: desativar (RPC)", inactive.status === 200 && sql(`select status from workflows where id='${wfId}'`) === "inactive", j(inactive));
    const badStatus = await post(a1, `/api/workflows/${wfId}/status`, { status: "talvez" });
    c("validação: status inválido → 422", invalid(badStatus), j(badStatus));

    const rCreate = await post(a2, "/api/workflows", { code: "WF-R", name: "X", module: "poc", entityType: "x" });
    const rList = await get(a2, "/api/workflows");
    c("papel leitura: leitura segue workflow.view do papel; criação 403", rCreate.status === 403 && rList.status === (readerHas("workflow.view") ? 200 : 403), `${rCreate.status} ${rList.status}`);
    const bGet = await get(b1, `/api/workflows/${wfId}`);
    const bVer = await post(b1, `/api/workflows/${wfId}/versions`, {});
    const bStatus = await post(b1, `/api/workflows/${wfId}/status`, { status: "active" });
    c("outra empresa: B1 não lê (404), não versiona nem ativa workflow da Alfa", bGet.status === 404 && bVer.status >= 400 && bStatus.status >= 400 && sql(`select status from workflows where id='${wfId}'`) === "inactive" && sql(`select count(*) from workflow_versions where workflow_id='${wfId}'`) === "1", `${bGet.status} ${j(bVer)} ${j(bStatus)}`);
    c("sem sessão: 401", (await anon("/api/workflows")) === 401);
  });

  // ------------------------------------------------------------------- Importação
  await mod("Importação", async (c) => {
    const upload = (s, csv, name, entityType) =>
      s.page.evaluate(
        async ([csvText, fileName, entity]) => {
          const fd = new FormData();
          fd.append("file", new File([csvText], fileName, { type: "text/csv" }));
          fd.append("entityType", entity);
          const r = await fetch("/api/imports", { method: "POST", body: fd });
          let body = null;
          try {
            body = await r.json();
          } catch {}
          return { status: r.status, body };
        },
        [csv, name, entityType]
      );
    const csv = "tipo,nome,documento\nPessoa Jurídica,Cliente Importado 1,31.111.111/0001-11\nPessoa Jurídica,Cliente Importado 2,32.222.222/0001-22\nPessoa Jurídica,,33.333.333/0001-33\n";
    const badEntity = await upload(a1, csv, "clientes.csv", "sales-orders");
    c("validação: entidade não importável → 422", invalid(badEntity), j(badEntity));
    const xlsx = await upload(a1, csv, "clientes.xlsx", "customers");
    c("validação: XLSX recusado → 422", invalid(xlsx), j(xlsx));
    const up = await upload(a1, csv, "clientes.csv", "customers");
    const jobId = sql(`select id from import_jobs where company_id='${companyA}' and entity_type='customers' order by created_at desc limit 1`);
    c("upload CSV: job criado e 3 linhas encenadas (RPC)", up.status === 201 && sql(`select count(*) from import_job_rows where import_job_id='${jobId}'`) === "3", j(up));
    const map = await post(a1, `/api/imports/${jobId}/mapping`, { mapping: { tipo: "tipo", nome: "nome", documento: "documento" } });
    c("mapeamento de colunas", map.status === 200, j(map));
    const val = await post(a1, `/api/imports/${jobId}/validate`, {});
    const counts = sql(`select string_agg(status || '=' || n, ',' order by status) from (select status, count(*) n from import_job_rows where import_job_id='${jobId}' group by 1) t`);
    c("validação: 2 válidas, 1 inválida (com erro registrado)", val.status === 200 && counts === "INVALID=1,VALID=2" && Number(sql(`select count(*) from import_job_errors where import_job_id='${jobId}'`)) >= 1, `${j(val)} ${counts}`);
    const errs = await get(a1, `/api/imports/${jobId}/errors`);
    c("erros da importação: listar", errs.status === 200 && (errs.body?.data ?? []).length >= 1, j(errs));

    const rUp = await upload(a2, csv, "clientes.csv", "customers");
    const rList = await get(a2, "/api/imports");
    c("papel leitura: não importa (403); leitura segue import_export.view do papel", rUp.status === 403 && rList.status === (readerHas("import_export.view") ? 200 : 403), `${rUp.status} ${rList.status}`);
    const bGet = await get(b1, `/api/imports/${jobId}`);
    const bProc = await post(b1, `/api/imports/${jobId}/process`, {});
    c("outra empresa: B1 não lê (404) nem processa importação da Alfa", bGet.status === 404 && bProc.status >= 400 && sql(`select count(*) from customers where document in ('31.111.111/0001-11','32.222.222/0001-22')`) === "0", `${bGet.status} ${j(bProc)}`);

    const proc = await post(a1, `/api/imports/${jobId}/process`, {});
    c("processar: 2 clientes criados na Alfa (validação do cadastro manual)", proc.status === 200 && sql(`select count(*) from customers where company_id='${companyA}' and document in ('31.111.111/0001-11','32.222.222/0001-22')`) === "2", `${j(proc)}`);
    const up2 = await upload(a1, csv, "clientes-de-novo.csv", "customers");
    const job2 = sql(`select id from import_jobs where company_id='${companyA}' and entity_type='customers' order by created_at desc limit 1`);
    await post(a1, `/api/imports/${job2}/mapping`, { mapping: { tipo: "tipo", nome: "nome", documento: "documento" } });
    await post(a1, `/api/imports/${job2}/validate`, {});
    const proc2 = await post(a1, `/api/imports/${job2}/process`, {});
    c("reimportar o mesmo arquivo não duplica (chave natural = documento)", up2.status === 201 && proc2.status === 200 && sql(`select count(*) from customers where company_id='${companyA}' and document in ('31.111.111/0001-11','32.222.222/0001-22')`) === "2", j(proc2));
    c("sem sessão: 401", (await anon("/api/imports")) === 401);
  });
}
