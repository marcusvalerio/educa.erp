// Empresa RECÉM-CRIADA executada de verdade no PostgreSQL com o esquema do
// ATLAS.ERP (E2E NOVA ORBITA, problemas P1, P2 e P3; migration 0076).
// POC_DATABASE_OWNER_URL: conexão do DONO de um banco DESCARTÁVEL (ver
// poc/neon-full/README.md; nunca produção). Tudo numa única transação desfeita
// no fim: a empresa, os logins e os movimentos do teste não ficam no banco.
//
// - P1: local de estoque numa empresa nova — cria, lista, edita, pertence à
//   empresa, é recusado sem depósito ou com depósito de outra empresa, e é
//   usado de ponta a ponta (entrada, reserva, separação e expedição — o item
//   da expedição vai como a API o envia, com serial_numbers = null; 0080).
// - P2: categorias, marcas, unidades e fornecedores do produto passam pela RLS
//   com as permissões que existem no catálogo.
// - P3: os papéis padrão da empresa nova fazem o que o papel prevê — e nada
//   além — na RLS e nas funções do banco (a mesma barreira da API).
// - P4 (0077): relatórios dos painéis Fiscal, Estoque e Produção respondem,
//   com e sem movimento.
// - P8/P9 (0078): NF-e do pedido diz tudo o que falta (NCM/CFOP por
//   produto) antes de criar qualquer coisa, e a situação da preparação fiscal.
// - P10 (0077): a auditoria das operações feitas por funções do banco
//   registra o usuário que executou (A -> A, B -> B), não "system".
import { test, describe, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const ASTRA = "00000000-0000-0000-0000-000000000001";

describe("empresa recém-criada: estoque, catálogo e papéis padrão (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const who: Record<string, string> = {}; // papel -> auth sub
  let company = "";
  let warehouse = "";
  let product = "";
  let customer = "";
  let location = "";

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const asOwner = async () => {
    await db.query("reset role");
    await db.query("select set_config('educa.auth_link', 'invitation', true)");
  };
  const as = async (role: string) => {
    const sub = who[role];
    await db.query("reset role");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub, role: "authenticated" }), sub]);
  };
  // Executa e desfaz só este passo quando falha (a transação do teste segue).
  const attempt = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint passo");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint passo");
      return { ok: true as const, rows: r.rows, rowCount: r.rowCount ?? 0 };
    } catch (e) {
      await db.query("rollback to savepoint passo");
      return { ok: false as const, error: e as Error & { code?: string } };
    }
  };
  const has = (role: string, code: string) =>
    one<{ ok: boolean }>(
      "select exists (select 1 from users u join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role_id = ur.role_id join permissions p on p.id = rp.permission_id where u.auth_user_id = $1 and p.code = $2) ok",
      [who[role], code]
    ).then((r) => r.ok);

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    company = (await one<{ id: string }>("insert into public.companies (name, legal_name) values ('Teste Empresa Nova', 'TESTE EMPRESA NOVA LTDA') returning id")).id;
    for (const role of ["admin", "gerente", "vendedor", "operador", "leitura"]) {
      const sub = randomUUID();
      who[role] = sub;
      const login = `teste.nova.${role}`;
      await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [sub, `${login}@example.com`]);
      const u = await one<{ id: string }>(
        "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $3, 'active') returning id",
        [company, sub, login, `${login}@example.com`]
      );
      await db.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = $3", [u.id, company, role]);
    }
    warehouse = (await one<{ id: string }>("select id from public.warehouses where company_id = $1 and code = 'PRINCIPAL'", [company])).id;
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  // Uma falha não derruba os testes seguintes: só desfaz o que o teste que
  // falhou deixou pela metade.
  beforeEach(async () => {
    await db.query("reset role").catch(() => undefined);
    await db.query("savepoint caso");
  });
  afterEach(async () => {
    await db.query("release savepoint caso").catch(async () => {
      await db.query("rollback to savepoint caso");
    });
  });

  // ------------------------------------------------------------------ P1
  test("P1: gerente cria local no depósito da empresa; o registro pertence à empresa", async () => {
    await as("gerente");
    const r = await attempt(
      "insert into public.warehouse_locations (company_id, code, name, warehouse_id, location_type) values ($1, 'NO-A01', 'Prateleira A01', $2, 'Armazenagem') returning id, company_id, warehouse",
      [company, warehouse]
    );
    assert.equal(r.ok, true, r.ok ? "" : r.error.message);
    if (!r.ok) return;
    location = r.rows[0].id;
    assert.equal(r.rows[0].company_id, company);
    assert.equal(r.rows[0].warehouse, "PRINCIPAL", "texto legado sincronizado com o depósito");
    const listed = await one<{ n: string }>("select count(*) n from public.warehouse_locations where company_id = $1 and code = 'NO-A01'", [company]);
    assert.equal(Number(listed.n), 1, "aparece na listagem da empresa");
    const edited = await attempt("update public.warehouse_locations set name = 'Prateleira A01 (editada)' where id = $1", [location]);
    assert.equal(edited.ok && edited.rowCount, 1, "edição");
  });

  test("P1: sem depósito a recusa é clara; depósito de outra empresa é recusado", async () => {
    await as("gerente");
    const semDeposito = await attempt("insert into public.warehouse_locations (company_id, code, location_type) values ($1, 'NO-X', 'Armazenagem')", [company]);
    assert.equal(semDeposito.ok, false);
    if (!semDeposito.ok) assert.match(semDeposito.error.message, /Selecione o depósito/);
    await asOwner();
    const outro = (await one<{ id: string }>("select id from public.warehouses where company_id = $1 limit 1", [ASTRA])).id;
    await as("gerente");
    const cruzado = await attempt("insert into public.warehouse_locations (company_id, code, warehouse_id, location_type) values ($1, 'NO-Y', $2, 'Armazenagem')", [company, outro]);
    assert.equal(cruzado.ok, false, "depósito da ASTRA não serve para a empresa nova");
  });

  test("P1: o local é usado na entrada, na reserva, na separação e na expedição", async () => {
    await as("gerente");
    product = (await one<{ id: string }>("insert into public.products (company_id, code, name, unit, status) values ($1, 'NO-001', 'Caixa organizadora', 'UN', 'active') returning id", [company])).id;
    customer = (await one<{ id: string }>("insert into public.customers (company_id, code, name, document) values ($1, 'CLI-NO-1', 'Cliente Nova Orbita', '11222333000181') returning id", [company])).id;

    await as("operador");
    const entrada = await attempt("select public.fn_receive_stock(p_company_id => $1, p_product_id => $2, p_location_id => $3, p_quantity => 20)", [company, product, location]);
    assert.equal(entrada.ok, true, entrada.ok ? "" : `entrada: ${entrada.error.message}`);

    await as("gerente");
    const so = await one<{ id: string }>(
      "select (r).id from (select public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb) r) x",
      [company, customer, JSON.stringify([{ product_id: product, description: "Caixa", quantity: 5, unit_price: 10 }])]
    );
    await db.query("select public.fn_submit_sales_order_for_approval($1)", [so.id]);
    await db.query("select public.fn_approve_sales_order($1)", [so.id]);

    await as("operador");
    const reserva = await attempt("select (r).status from public.fn_reserve_sales_order_stock(p_order_id => $1, p_location_id => $2, p_idempotency_key => null) r", [so.id, location]);
    assert.equal(reserva.ok, true, reserva.ok ? "" : `reserva (operador): ${reserva.error.message}`);
    if (reserva.ok) assert.equal(reserva.rows[0].status, "reserved");

    const pick = await attempt("select (r).id from public.fn_create_pick_list(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_notes => null) r", [company, so.id, warehouse]);
    assert.equal(pick.ok, true, pick.ok ? "" : `separação: ${pick.error.message}`);
    if (!pick.ok) return;
    const pickId = pick.rows[0].id as string;
    await db.query("select public.fn_start_picking($1)", [pickId]);
    for (const it of (await db.query("select id, requested_quantity as quantity from public.pick_list_items where pick_list_id = $1", [pickId])).rows) {
      await db.query("select public.fn_pick_item(p_pick_list_item_id => $1, p_picked_quantity => $2)", [it.id, it.quantity]);
    }
    const concluida = await attempt("select public.fn_complete_pick_list($1)", [pickId]);
    assert.equal(concluida.ok, true, concluida.ok ? "" : `concluir separação (operador): ${concluida.error.message}`);

    const item = await one<{ id: string }>("select id from public.sales_order_items where order_id = $1", [so.id]);
    const exp = await attempt(
      "select (r).id from public.fn_create_shipment(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_items => $4::jsonb, p_pick_list_id => $5) r",
      [company, so.id, warehouse, JSON.stringify([{ sales_order_item_id: item.id, location_id: location, quantity: 5, serial_numbers: null, lot_id: null }]), pickId]
    );
    assert.equal(exp.ok, true, exp.ok ? "" : `expedição: ${exp.error.message}`);
    if (!exp.ok) return;
    const shipment = exp.rows[0].id as string;
    await db.query("select public.fn_mark_shipment_ready($1)", [shipment]);
    await db.query("select public.fn_pack_shipment($1)", [shipment]);
    // Aprovar a expedição é do Gerente; expedir é execução do Operador.
    await as("operador");
    assert.equal((await attempt("select public.fn_approve_shipment($1)", [shipment])).ok, false, "operador não aprova expedição");
    await as("gerente");
    await db.query("select public.fn_approve_shipment($1)", [shipment]);
    await as("operador");
    const enviada = await attempt("select (r).status from public.fn_ship_shipment(p_shipment_id => $1) r", [shipment]);
    assert.equal(enviada.ok, true, enviada.ok ? "" : `expedir (operador): ${enviada.error.message}`);

    await asOwner();
    const saldo = await one<{ on_hand: string; reserved: string }>(
      "select coalesce(sum(on_hand),0) on_hand, coalesce(sum(reserved),0) reserved from stock_balances where company_id = $1 and product_id = $2 and location_id = $3",
      [company, product, location]
    );
    assert.deepEqual([Number(saldo.on_hand), Number(saldo.reserved)], [15, 0], "expedição baixa o físico e consome a reserva");
  });

  // ------------------------------------------------------------------ P2
  test("P2: catálogo do produto (categorias, marcas, unidades, fornecedores) legível pelos papéis com produtos", async () => {
    for (const role of ["admin", "gerente", "vendedor", "operador", "leitura"]) {
      await as(role);
      for (const table of ["product_categories", "product_brands", "units", "product_suppliers"]) {
        const r = await attempt(`select count(*) n from public.${table} where company_id = $1`, [company]);
        assert.equal(r.ok, true, `${role} lê ${table}`);
      }
      const units = await one<{ n: string }>("select count(*) n from public.units where company_id = $1", [company]);
      assert.ok(Number(units.n) > 0, `${role} vê as unidades padrão da empresa`);
    }
  });

  test("P2: unidades de OUTRA empresa não são visíveis (policy USING true removida)", async () => {
    await as("leitura");
    const r = await one<{ n: string }>("select count(*) n from public.units where company_id <> $1", [company]);
    assert.equal(Number(r.n), 0);
  });

  test("P2: somente leitura não cria categoria; gerente cria", async () => {
    await as("leitura");
    assert.equal((await attempt("insert into public.product_categories (company_id, code, name) values ($1, 'NEG', 'Negada')", [company])).ok, false);
    await as("gerente");
    const r = await attempt("insert into public.product_categories (company_id, code, name) values ($1, 'ORG', 'Organização')", [company]);
    assert.equal(r.ok, true, r.ok ? "" : r.error.message);
  });

  // ------------------------------------------------------------------ P3
  test("P3: operador consulta estoque e pedidos; somente leitura consulta pedidos", async () => {
    for (const [role, code] of [["operador", "stock.view"], ["operador", "sales_orders.view"], ["leitura", "sales_orders.view"], ["leitura", "stock.view"], ["leitura", "accounts_receivable.view"], ["leitura", "fiscal_documents.view"]]) {
      assert.equal(await has(role, code), true, `${role} tem ${code}`);
    }
    await as("leitura");
    const pedidos = await attempt("select count(*) from public.sales_orders where company_id = $1", [company]);
    assert.equal(pedidos.ok, true);
    const n = await one<{ n: string }>("select count(*) n from public.sales_orders where company_id = $1", [company]);
    assert.ok(Number(n.n) >= 1, "somente leitura vê o pedido pela RLS");
  });

  test("P3: somente leitura não cria, edita, aprova nem exclui", async () => {
    for (const code of ["customers.create", "customers.update", "customers.delete", "sales_orders.approve", "sales_orders.create", "stock.create", "warehouse_locations.create"]) {
      assert.equal(await has("leitura", code), false, `leitura não tem ${code}`);
    }
    await as("leitura");
    assert.equal((await attempt("insert into public.customers (company_id, code, name, document) values ($1, 'CLI-L', 'Negado', '11444777000161')", [company])).ok, false);
    assert.equal((await attempt("update public.customers set name = 'x' where company_id = $1", [company])).rowCount ?? 0, 0);
  });

  test("P3: operador não exclui, não aprova e não administra", async () => {
    for (const code of ["customers.delete", "sales_orders.approve", "sales_orders.cancel", "shipments.approve", "stock.adjust", "stock.approve", "users.create", "roles.manage", "settings.update", "company_modules.manage", "accounts_receivable.approve"]) {
      assert.equal(await has("operador", code), false, `operador não tem ${code}`);
    }
  });

  test("P3: vendedor opera o comercial sem aprovar, reservar nem administrar", async () => {
    for (const code of ["sales_orders.create", "sales_quotes.create", "customers.create", "products.read", "units.read", "stock.view"]) {
      assert.equal(await has("vendedor", code), true, `vendedor tem ${code}`);
    }
    for (const code of ["sales_orders.approve", "sales_orders.reserve", "users.create", "roles.manage", "accounts_receivable.view", "stock.create"]) {
      assert.equal(await has("vendedor", code), false, `vendedor não tem ${code}`);
    }
  });

  // ------------------------------------------------------------------ P4
  test("P4: relatórios Fiscal, Estoque e Produção respondem sem e com movimento", async () => {
    await as("admin");
    const fiscal = await attempt("select row_to_json(r) j from public.fn_report_fiscal($1, '2026-01-01', '2030-12-31') r", [company]);
    assert.equal(fiscal.ok, true, fiscal.ok ? "" : `fiscal: ${fiscal.error.message}`);
    if (fiscal.ok) assert.equal(fiscal.rows[0].j.documents_count, 0, "empresa sem nota: zero, não erro");
    const producao = await attempt("select row_to_json(r) j from public.fn_report_production($1, '2026-01-01', '2030-12-31') r", [company]);
    assert.equal(producao.ok, true, producao.ok ? "" : `produção: ${producao.error.message}`);
    const estoque = await attempt("select row_to_json(r) j from public.fn_report_inventory($1, '2000-01-01', '2100-12-31') r", [company]);
    assert.equal(estoque.ok, true, estoque.ok ? "" : `estoque: ${estoque.error.message}`);
    if (estoque.ok) assert.ok(estoque.rows[0].j.receipts_count >= 1, "a entrada do teste de P1 aparece no relatório");
    await as("vendedor");
    const negado = await attempt("select * from public.fn_report_fiscal($1, '2026-01-01', '2030-12-31')", [company]);
    assert.equal(negado.ok, false, "vendedor sem fiscal_reports.view");
  });

  // ------------------------------------------------------------------ P8/P9
  test("P8/P9: NF-e do pedido — NCM ausente, CFOP ausente, ambos, e nova tentativa após corrigir", async () => {
    await as("gerente");
    const setup = async () =>
      (await one<{ j: Record<string, number> }>("select row_to_json(r) j from public.fn_fiscal_setup_status($1) r", [company])).j;
    const vazio = await setup();
    assert.deepEqual(
      [vazio.establishments, vazio.outbound_natures_with_cfop, vazio.cfops, vazio.ncms, vazio.products_with_ncm],
      [0, 0, 0, 0, 0],
      "empresa recém-criada: nada da preparação fiscal"
    );
    assert.ok(vazio.active_products >= 1);

    const est = await one<{ id: string }>(
      "insert into public.fiscal_establishments (company_id, code, name, cnpj, tax_regime, state, city) values ($1, 'EST-T', 'Matriz', '11222333000181', 'SIMPLES_NACIONAL', 'SP', 'São Paulo') returning id",
      [company]
    );
    const nat = await one<{ id: string }>("insert into public.fiscal_operation_natures (company_id, code, name, direction) values ($1, 'VENDA-T', 'Venda de mercadoria', 'SAIDA') returning id", [company]);
    const so = await one<{ id: string; code: string }>(
      "select (r).id, (r).code from (select public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb) r) x",
      [company, customer, JSON.stringify([{ product_id: product, description: "Caixa", quantity: 2, unit_price: 10 }])]
    );
    await db.query("select public.fn_submit_sales_order_for_approval($1)", [so.id]);
    await db.query("select public.fn_approve_sales_order($1)", [so.id]);
    const gerar = () =>
      attempt("select (r).id from public.fn_create_fiscal_document_from_sales_order(p_sales_order_id => $1, p_fiscal_establishment_id => $2, p_operation_nature_id => $3) r", [so.id, est.id, nat.id]);
    const docs = async () => Number((await one<{ n: string }>("select count(*) n from public.fiscal_documents where source_type = 'sales_order' and source_id = $1", [so.id])).n);

    // Ambos ausentes: uma mensagem com NCM e CFOP do produto e onde corrigir; nada gravado.
    const ambos = await gerar();
    assert.equal(ambos.ok, false);
    if (!ambos.ok) {
      assert.equal(ambos.error.code, "P0001", "regra de negócio (a API responde 422)");
      assert.match(ambos.error.message, /o produto NO-001 — Caixa organizadora precisa de NCM e CFOP/);
      assert.match(ambos.error.message, /perfil fiscal do produto/);
      assert.match(ambos.error.message, /CFOP padrão da natureza de operação «Venda de mercadoria»/);
    }
    assert.equal(await docs(), 0, "nenhum rascunho criado");

    // Só CFOP ausente.
    const ncm = await one<{ id: string }>("insert into public.fiscal_ncms (company_id, code, description) values ($1, '39249000', 'Outros artigos de uso doméstico de plástico') returning id", [company]);
    // Perfil fiscal só é gravado por função (sem policy de escrita): preparação como dono do banco.
    await asOwner();
    await db.query("insert into public.product_fiscal_profiles (company_id, product_id, ncm_id, origin_code) values ($1, $2, $3, '0')", [company, product, ncm.id]);
    await as("gerente");
    const soCfop = await gerar();
    assert.equal(soCfop.ok, false);
    if (!soCfop.ok) {
      assert.match(soCfop.error.message, /precisa de CFOP/);
      assert.doesNotMatch(soCfop.error.message, /NCM e CFOP|precisa de NCM/);
    }

    // Só NCM ausente (outra natureza com CFOP, produto sem perfil).
    const cfop = await one<{ id: string }>("insert into public.fiscal_cfops (company_id, code, description, direction, scope) values ($1, '5102', 'Venda de mercadoria adquirida de terceiros', 'SAIDA', 'INTERNAL') returning id", [company]);
    await asOwner();
    await db.query("update public.product_fiscal_profiles set status = 'obsolete' where product_id = $1", [product]);
    await as("gerente");
    await db.query("update public.fiscal_operation_natures set default_cfop_id = $2 where id = $1", [nat.id, cfop.id]);
    const soNcm = await gerar();
    assert.equal(soNcm.ok, false);
    if (!soNcm.ok) {
      assert.match(soNcm.error.message, /o produto NO-001 — Caixa organizadora precisa de NCM\b/);
      assert.doesNotMatch(soNcm.error.message, /CFOP padrão/);
    }

    // Corrigido: gera o rascunho na nova tentativa, e a preparação aparece completa.
    await asOwner();
    await db.query("update public.product_fiscal_profiles set status = 'active' where product_id = $1", [product]);
    await as("gerente");
    const ok = await gerar();
    assert.equal(ok.ok, true, ok.ok ? "" : ok.error.message);
    assert.equal(await docs(), 1);
    const pronto = await setup();
    assert.deepEqual([pronto.establishments, pronto.outbound_natures_with_cfop, pronto.cfops, pronto.ncms], [1, 1, 1, 1]);
    assert.ok(pronto.products_with_ncm >= 1);
  });

  // ------------------------------------------------------------------ P10
  test("P10: aprovação registra na auditoria o usuário que aprovou (A -> A, B -> B)", async () => {
    const aprovar = async (role: string) => {
      await as("gerente");
      const so = await one<{ id: string }>(
        "select (r).id from (select public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb) r) x",
        [company, customer, JSON.stringify([{ product_id: product, description: "Caixa", quantity: 1, unit_price: 10 }])]
      );
      await db.query("select public.fn_submit_sales_order_for_approval($1)", [so.id]);
      await as(role);
      await db.query("select public.fn_approve_sales_order($1)", [so.id]);
      await asOwner();
      return one<{ actor_label: string; user_name: string }>(
        "select a.actor_label, u.name user_name from audit_logs a join users u on u.id = a.user_id where a.entity = 'sales_orders' and a.entity_id = $1 and a.action = 'APPROVE'",
        [so.id]
      );
    };
    const a = await aprovar("gerente");
    assert.equal(a.actor_label, "teste.nova.gerente");
    assert.equal(a.actor_label, a.user_name);
    const b = await aprovar("admin");
    assert.equal(b.actor_label, "teste.nova.admin");
  });

  test("P10: evento sem usuário continua 'system'; rótulo informado não muda", async () => {
    await asOwner();
    const sem = await one<{ actor_label: string }>(
      "insert into audit_logs (company_id, user_id, actor_label, entity, entity_id, action) values ($1, null, 'system', 'teste', gen_random_uuid(), 'EVENT') returning actor_label",
      [company]
    );
    assert.equal(sem.actor_label, "system");
    const user = await one<{ id: string }>("select id from users where auth_user_id = $1", [who.gerente]);
    const informado = await one<{ actor_label: string }>(
      "insert into audit_logs (company_id, user_id, actor_label, entity, entity_id, action) values ($1, $2, 'platform:OWNER:x', 'teste', gen_random_uuid(), 'EVENT') returning actor_label",
      [company, user.id]
    );
    assert.equal(informado.actor_label, "platform:OWNER:x");
  });

  test("P3: gerente aprova e opera, sem governança", async () => {
    for (const code of ["sales_orders.approve", "shipments.approve", "stock.approve", "accounts_receivable.approve", "fiscal_documents.create"]) {
      assert.equal(await has("gerente", code), true, `gerente tem ${code}`);
    }
    for (const code of ["users.create", "roles.manage", "company_modules.manage", "settings.update"]) {
      assert.equal(await has("gerente", code), false, `gerente não tem ${code}`);
    }
  });
});
