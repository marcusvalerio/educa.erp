// NF-e de ensino (0099) executada no PostgreSQL com o esquema do ATLAS.ERP.
// POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL (nunca produção), com
// a empresa e o administrador de exemplo (seed). Tudo numa transação desfeita.
//
// Cobre: pedido aprovado → nota com frete do pedido e NCM do cadastro do
// produto; numeração com sequência própria; total sem ICMS "por dentro"
// (só IPI soma); conferência; emissão em homologação guardando o XML e
// atualizando o pedido; anon não emite; emitir de novo é recusado.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const COMPANY = "00000000-0000-0000-0000-000000000001";
const ADMIN_AUTH = "9126ce02-9fdd-468b-955b-4b47becc0fea";

describe("NF-e de ensino (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const ids = { est: randomUUID(), cust: randomUUID(), prod: randomUUID(), order: randomUUID(), cfop: randomUUID(), nature: randomUUID(), rule: randomUUID() };
  let doc = "";

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const GERENTE_AUTH = randomUUID();
  // Emissão como o Gerente de produção: todas as permissões do Administrador
  // menos configurar sequências de numeração (document_sequences.*).
  const asAdmin = async () => {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: GERENTE_AUTH, role: "authenticated" })]);
  };
  const asOwner = () => db.query("reset role");

  before(async () => {
    await db.connect();
    await db.query("begin");
    const role = await one<{ id: string }>("insert into roles (company_id, code, name) values ($1, 'GERENTE-NFE-T', 'Gerente teste NF-e') returning id", [COMPANY]);
    await db.query(
      `insert into role_permissions (role_id, permission_id)
       select distinct $1::uuid, rp.permission_id from role_permissions rp join permissions p on p.id = rp.permission_id
        join user_roles ur on ur.role_id = rp.role_id join users u on u.id = ur.user_id
       where u.auth_user_id = $2 and p.code not like 'document_sequences.%'`,
      [role.id, ADMIN_AUTH],
    );
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'gerente.nfe@example.com', now())", [GERENTE_AUTH]);
    await db.query("select set_config('educa.auth_link', 'invitation', true)");
    const user = await one<{ id: string }>("insert into users (company_id, auth_user_id, name, email, login, status) values ($1, $2, 'Gerente NF-e', 'gerente.nfe@example.com', 'gerente.nfe', 'active') returning id", [COMPANY, GERENTE_AUTH]);
    await db.query("insert into user_roles (user_id, role_id) values ($1, $2)", [user.id, role.id]);
    await db.query(
      `insert into fiscal_establishments (id, company_id, code, name, cnpj, state_registration, tax_regime, address, address_number, neighborhood, city, state, zip_code)
       values ($1, $2, 'EST-T', 'Escola Teste Ltda', '11222333000181', '123456789012', 'LUCRO_PRESUMIDO', 'Praça da Sé', '100', 'Sé', 'São Paulo', 'SP', '01001000')`,
      [ids.est, COMPANY],
    );
    // 0116 já semeia o 6102 em toda empresa: reaproveita.
    ids.cfop = (await one<{ id: ReturnType<typeof randomUUID> }>(
      `insert into fiscal_cfops (id, company_id, code, description, direction, scope) values ($1, $2, '6102', 'Venda fora do estado', 'SAIDA', 'INTERSTATE')
       on conflict (company_id, code) do update set direction = 'SAIDA' returning id`,
      [ids.cfop, COMPANY],
    )).id;
    await db.query(`insert into fiscal_operation_natures (id, company_id, code, name, direction, default_cfop_id) values ($1, $2, 'VENDA-FORA-T', 'Venda de mercadoria (fora do estado)', 'SAIDA', $3)`, [ids.nature, COMPANY, ids.cfop]);
    await db.query(
      `insert into customers (id, company_id, code, name, document, state_registration, zip_code, state, city, neighborhood, address, address_number)
       values ($1, $2, 'CLI-NFE-T', 'Cliente Rio Ltda', '11444777000161', '12345678', '20010000', 'RJ', 'Rio de Janeiro', 'Centro', 'Rua Primeiro de Março', '1')`,
      [ids.cust, COMPANY],
    );
    const unit = await one<{ code: string }>("select code from units where company_id = $1 order by code limit 1", [COMPANY]);
    await db.query(`insert into products (id, company_id, code, name, unit, ncm, sale_price) values ($1, $2, 'PRD-NFE-T', 'Caderno 96 folhas', $3, '4820.20.00', 20)`, [ids.prod, COMPANY, unit.code]);
    await db.query(`insert into sales_orders (id, company_id, code, customer_id, status, freight_cost) values ($1, $2, 'PV-NFE-T', $3, 'reserved', 10)`, [ids.order, COMPANY, ids.cust]);
    await db.query(
      `insert into sales_order_items (company_id, order_id, product_id, description, unit, ordered_quantity, unit_price) values ($1, $2, $3, 'Caderno 96 folhas', $4, 5, 20)`,
      [COMPANY, ids.order, ids.prod, unit.code],
    );
    // Regra: ICMS 12% (por dentro) e IPI 5% (por fora) para este produto.
    await db.query(`insert into tax_rules (id, company_id, name, product_id, status, valid_from) values ($1, $2, 'Regra teste NF-e', $3, 'active', current_date - 1)`, [ids.rule, COMPANY, ids.prod]);
    await db.query(`insert into tax_rule_items (company_id, tax_rule_id, tax_type, cst, rate, reduction_percentage) values ($1, $2, 'ICMS', '00', 12, 0), ($1, $2, 'IPI', '50', 5, 0)`, [COMPANY, ids.rule]);
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  test("pedido aprovado vira nota com frete do pedido e NCM do cadastro do produto", async () => {
    await asAdmin();
    const created = await one<{ id: string; freight_amount: string; freight_mode: string; status: string }>(
      "select * from fn_create_fiscal_document_from_sales_order($1, $2, $3, null)",
      [ids.order, ids.est, ids.nature],
    );
    doc = created.id;
    assert.equal(created.status, "DRAFT");
    assert.equal(Number(created.freight_amount), 10);
    assert.equal(created.freight_mode, "EMITENTE");
    const item = await one<{ ncm_code: string; cfop_code: string }>("select ncm_code, cfop_code from fiscal_document_items where fiscal_document_id = $1", [doc]);
    assert.equal(item.ncm_code, "48202000");
    assert.equal(item.cfop_code, "6102");
    await asOwner();
  });

  test("numera sem a permissão de configurar sequências (caso do Gerente) e cria a série", async () => {
    await asAdmin();
    await db.query("savepoint seq_cfg");
    await assert.rejects(db.query("select fn_create_document_sequence($1, 'FISCAL_DOCUMENT', '9', null, 9, $2, 'x')", [COMPANY, ids.est]), /Permissão negada/);
    await db.query("rollback to savepoint seq_cfg");
    const numbered = await one<{ number: number; series: string }>("select * from fn_assign_fiscal_document_number($1, '1')", [doc]);
    assert.equal(numbered.number, 1);
    assert.equal(numbered.series, "1");
    await db.query("savepoint renum");
    await assert.rejects(db.query("select fn_assign_fiscal_document_number($1, '1')", [doc]), /não é trocado/);
    await db.query("rollback to savepoint renum");
    await assert.rejects(db.query("select * from fn_next_document_number_internal($1, 'FISCAL_DOCUMENT', '1', $2)", [COMPANY, ids.est]), /permission denied/);
    await db.query("rollback to savepoint renum");
    await asOwner();
    const seq = await one<{ current_number: string; padding: number }>("select current_number, padding from document_sequences where company_id = $1 and establishment_id = $2 and document_type = 'FISCAL_DOCUMENT'", [COMPANY, ids.est]);
    assert.deepEqual([Number(seq.current_number), seq.padding], [1, 9]);
  });

  test("calcula (ICMS por dentro, IPI por fora) e confere", async () => {
    await asAdmin();
    const calc = await one<{ products_amount: string; taxes_amount: string; total_amount: string; status: string }>("select * from fn_calculate_fiscal_document($1)", [doc]);
    assert.equal(calc.status, "CALCULATED");
    assert.equal(Number(calc.products_amount), 100);
    // só o IPI (5% de 100) soma; o ICMS de 12 fica destacado mas não soma
    assert.equal(Number(calc.taxes_amount), 5);
    assert.equal(Number(calc.total_amount), 115);
    const icms = await one<{ amount: string }>("select t.amount from fiscal_document_item_taxes t join fiscal_document_items i on i.id = t.fiscal_document_item_id where i.fiscal_document_id = $1 and t.tax_type = 'ICMS'", [doc]);
    assert.equal(Number(icms.amount), 12);
    const ready = await one<{ status: string }>("select * from fn_mark_fiscal_document_ready($1)", [doc]);
    assert.equal(ready.status, "READY");
    await asOwner();
  });

  test("anon não emite", async () => {
    await db.query("savepoint anon_try");
    await db.query("set local role anon");
    await assert.rejects(db.query("select fn_issue_fiscal_document_education($1, $2, '135260000000001', '<x/>')", [doc, "3".repeat(44)]), /permission denied/);
    await db.query("rollback to savepoint anon_try");
    await asOwner();
  });

  test("emite em homologação: guarda o XML, autoriza e atualiza o pedido", async () => {
    await asAdmin();
    await db.query("savepoint bad_key");
    await assert.rejects(db.query("select fn_issue_fiscal_document_education($1, '123', 'p', '<x/>')", [doc]), /44 dígitos/);
    await db.query("rollback to savepoint bad_key");
    const key = "35261011222333000181550010000000011" + "00000000" + "5";
    const issued = await one<{ status: string; access_key: string; environment: string; return_code: string; protocol: string }>(
      "select * from fn_issue_fiscal_document_education($1, $2, '135260000000001', '<nfeProc>teste</nfeProc>')",
      [doc, key],
    );
    assert.equal(issued.status, "AUTHORIZED");
    assert.equal(issued.access_key, key);
    assert.equal(issued.environment, "HOMOLOGATION");
    assert.equal(issued.return_code, "100");
    assert.equal(issued.protocol, "135260000000001");
    await asOwner();
    const file = await one<{ content: string; file_type: string; content_hash: string }>("select content, file_type, content_hash from fiscal_document_files where fiscal_document_id = $1", [doc]);
    assert.equal(file.file_type, "XML_AUTHORIZED");
    assert.equal(file.content, "<nfeProc>teste</nfeProc>");
    assert.equal(file.content_hash.length, 64);
    const order = await one<{ fiscal_document_number: string; fiscal_access_key: string; fiscal_status: string }>("select * from sales_orders where id = $1", [ids.order]);
    assert.equal(order.fiscal_document_number, "1");
    assert.equal(order.fiscal_access_key, key);
    assert.equal(order.fiscal_status, "authorized");
    const attempt = await one<{ provider_code: string; status: string }>("select provider_code, status from fiscal_authorization_attempts where fiscal_document_id = $1", [doc]);
    assert.deepEqual(attempt, { provider_code: "ENSINO", status: "AUTHORIZED" });
  });

  test("nota já autorizada não é emitida de novo", async () => {
    await asAdmin();
    await db.query("savepoint again");
    await assert.rejects(db.query("select fn_issue_fiscal_document_education($1, $2, 'x', '<x/>')", [doc, "3".repeat(44)]), /conferência concluída/);
    await db.query("rollback to savepoint again");
    await asOwner();
  });
});
