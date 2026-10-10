// Funil do CRM executado de verdade no PostgreSQL com o esquema do ATLAS.ERP.
// POC_DATABASE_OWNER_URL: conexão do DONO de um banco DESCARTÁVEL (ver
// poc/neon-full/README.md; nunca produção). As ações rodam como
// "authenticated", pela RLS e pelas funções do banco, numa única transação
// desfeita no fim (cada passo isolado num savepoint).
//
// Cobre o caminho que a API percorre: o corpo validado pelos schemas Zod do
// CRM, convertido por toRpcSalesItems, chega às funções de conversão (0055).
// Os três defeitos que eram `todo` (conversões de lead e lead convertido
// editável) foram corrigidos pela migration 0089: o banco de teste precisa
// tê-la (docs/homologacao/RELATORIO-CORRECOES-CRM-E-PAINEIS.md).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { convertOpportunityToQuoteSchema, convertOpportunityToOrderSchema } from "@/lib/validations/crm";
import { toRpcSalesItems } from "@/lib/commercial/rpc-items";

const url = process.env.POC_DATABASE_OWNER_URL;
const COMPANY = "00000000-0000-0000-0000-000000000001";

describe("funil do CRM (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const seller = randomUUID();
  let appUser = "";
  let product = "";
  let customer = "";
  let pipeline = "";
  let stage1 = "";
  let stage2 = "";
  let step = 0;

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const asSeller = async () => {
    await db.query("reset role");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: seller, role: "authenticated" }), seller]);
  };
  // Cada verificação num savepoint: um erro esperado não derruba as seguintes.
  const isolated = async <T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    const sp = `crm_${++step}`;
    await db.query(`savepoint ${sp}`);
    try {
      const value = await fn();
      await db.query(`release savepoint ${sp}`);
      return { ok: true, value };
    } catch (error) {
      await db.query(`rollback to savepoint ${sp}`);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  const newLead = async (fields: { name: string; document?: string; email?: string; responsible?: string }) =>
    (
      await one<{ id: string }>(
        "insert into public.leads (company_id, name, document, email, responsible_user_id) values ($1, $2, $3, $4, $5) returning id",
        [COMPANY, fields.name, fields.document ?? null, fields.email ?? null, fields.responsible ?? null]
      )
    ).id;
  const newOpportunity = async (customerId: string | null) =>
    (
      await one<{ id: string }>(
        "insert into public.opportunities (company_id, title, customer_id, pipeline_id, stage_id, estimated_value) values ($1, 'Oportunidade do teste', $2, $3, $4, 1000) returning id",
        [COMPANY, customerId, pipeline, stage1]
      )
    ).id;
  // Corpo como o navegador/integração enviaria à API (camelCase), validado pelo schema do CRM.
  const apiItems = (schema: typeof convertOpportunityToQuoteSchema | typeof convertOpportunityToOrderSchema) => {
    const parsed = schema.parse({ items: [{ productId: product, description: "Item do teste", quantity: 2, unitPrice: 50 }] });
    return JSON.stringify(toRpcSalesItems(parsed.items!));
  };

  before(async () => {
    await db.connect();
    await db.query("begin");
    await db.query("select set_config('educa.auth_link', 'invitation', true)");
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'teste.crm@example.com', now())", [seller]);
    appUser = (
      await one<{ id: string }>(
        "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, 'teste.crm', 'teste.crm@example.com', 'teste.crm', 'active') returning id",
        [COMPANY, seller]
      )
    ).id;
    await db.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = 'admin'", [appUser, COMPANY]);
    product = (await one<{ id: string }>("insert into public.products (company_id, code, name, unit, status) values ($1, 'TESTE-CRM', 'Produto do teste de CRM', 'UN', 'active') returning id", [COMPANY])).id;
    customer = (await one<{ id: string }>("insert into public.customers (company_id, type, name, document) values ($1, 'company', 'Cliente do teste de CRM', '44555666000177') returning id", [COMPANY])).id;
    pipeline = (await one<{ id: string }>("insert into public.pipelines (company_id, code, name) values ($1, 'TESTE-CRM', 'Funil do teste') returning id", [COMPANY])).id;
    stage1 = (await one<{ id: string }>("insert into public.pipeline_stages (company_id, pipeline_id, code, name, sequence) values ($1, $2, 'E1', 'Qualificação', 1) returning id", [COMPANY, pipeline])).id;
    stage2 = (await one<{ id: string }>("insert into public.pipeline_stages (company_id, pipeline_id, code, name, sequence) values ($1, $2, 'E2', 'Proposta', 2) returning id", [COMPANY, pipeline])).id;
    await asSeller();
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  test("lead criado pelo usuário entra como NEW, na empresa dele (RLS)", async () => {
    const id = await newLead({ name: "Lead do teste" });
    const row = await one<{ status: string; company_id: string }>("select status, company_id from public.leads where id = $1", [id]);
    assert.deepEqual([row.status, row.company_id], ["NEW", COMPANY]);
  });

  test("não há deduplicação de leads: mesmo documento e e-mail são aceitos de novo", async () => {
    await newLead({ name: "Duplicado 1", document: "11222333000181", email: "dup@example.com" });
    await newLead({ name: "Duplicado 2", document: "11222333000181", email: "dup@example.com" });
    const n = await one<{ n: string }>("select count(*) n from public.leads where company_id = $1 and document = '11222333000181'", [COMPANY]);
    assert.equal(Number(n.n), 2);
  });

  test("lead → cliente reaproveita o cliente de mesmo documento (não duplica)", async () => {
    const doc = (await one<{ document: string }>("select document from public.customers where id = $1", [customer])).document;
    const lead = await newLead({ name: "Lead de cliente existente", document: doc });
    const r = await isolated(() => one<{ id: string }>("select (public.fn_convert_lead_to_customer($1)).id", [lead]));
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal(r.value.id, customer);
    assert.equal((await one<{ status: string }>("select status from public.leads where id = $1", [lead])).status, "CONVERTED");
  });

  test("mover estágio grava o histórico e mantém a oportunidade aberta", async () => {
    const opp = await newOpportunity(customer);
    await one("select public.fn_move_opportunity_stage($1, $2)", [opp, stage2]);
    const o = await one<{ stage_id: string; status: string }>("select stage_id, status from public.opportunities where id = $1", [opp]);
    assert.deepEqual([o.stage_id, o.status], [stage2, "OPEN"]);
    const h = await one<{ n: string }>("select count(*) n from public.opportunity_stage_history where opportunity_id = $1", [opp]);
    assert.ok(Number(h.n) >= 1);
  });

  test("oportunidade → orçamento com o corpo da API (itens convertidos) gera orçamento de origem 'opportunity'", async () => {
    const opp = await newOpportunity(customer);
    const r = await isolated(() =>
      one<{ source_type: string; source_id: string }>("select (q).source_type, (q).source_id from (select public.fn_convert_opportunity_to_sales_quote($1, $2::jsonb) q) x", [opp, apiItems(convertOpportunityToQuoteSchema)])
    );
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.deepEqual([r.value.source_type, r.value.source_id], ["opportunity", opp]);
  });

  test("oportunidade → pedido com o corpo da API gera pedido em rascunho de origem 'opportunity'", async () => {
    const opp = await newOpportunity(customer);
    const r = await isolated(() =>
      one<{ source_type: string; status: string }>("select (o).source_type, (o).status from (select public.fn_convert_opportunity_to_sales_order($1, $2::jsonb) o) x", [opp, apiItems(convertOpportunityToOrderSchema)])
    );
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.deepEqual([r.value.source_type, r.value.status], ["opportunity", "draft"]);
  });

  test("o corpo validado SEM conversão (como a API enviava antes) falha no banco", async () => {
    const opp = await newOpportunity(customer);
    const raw = JSON.stringify(convertOpportunityToQuoteSchema.parse({ items: [{ productId: product, description: "Item", quantity: 1, unitPrice: 10 }] }).items);
    const r = await isolated(() => one("select public.fn_convert_opportunity_to_sales_quote($1, $2::jsonb)", [opp, raw]));
    assert.equal(r.ok, false);
  });

  test("oportunidade sem cliente não vira orçamento", async () => {
    const opp = await newOpportunity(null);
    const r = await isolated(() => one("select public.fn_convert_opportunity_to_sales_quote($1, $2::jsonb)", [opp, apiItems(convertOpportunityToQuoteSchema)]));
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /não tem cliente vinculado/);
  });

  test("fechar como ganha", async () => {
    const opp = await newOpportunity(customer);
    const r = await one<{ status: string }>("select (public.fn_close_opportunity($1, 'WON', null)).status", [opp]);
    assert.equal(r.status, "WON");
  });

  // ----------------------------- defeitos corrigidos pela 0089 (antes: `todo`)
  test("lead → cliente NOVO (documento sem cliente)", async () => {
    const lead = await newLead({ name: "Lead sem cliente", document: "55666777000188" });
    const r = await isolated(() => one("select public.fn_convert_lead_to_customer($1)", [lead]));
    assert.ok(r.ok, r.ok ? "" : r.error);
  });

  test("lead → oportunidade", async () => {
    const lead = await newLead({ name: "Lead para oportunidade" });
    const r = await isolated(() => one("select public.fn_convert_lead_to_opportunity($1, $2, $3, 'Oportunidade', 100)", [lead, pipeline, stage1]));
    assert.ok(r.ok, r.ok ? "" : r.error);
  });

  test("lead convertido não volta a NEW por edição direta", async () => {
    const doc = (await one<{ document: string }>("select document from public.customers where id = $1", [customer])).document;
    const lead = await newLead({ name: "Lead convertido", document: doc });
    await one("select public.fn_convert_lead_to_customer($1)", [lead]);
    const r = await isolated(() => db.query("update public.leads set status = 'NEW' where id = $1", [lead]));
    assert.ok(!r.ok || r.value.rowCount === 0, "o banco aceitou desfazer a conversão");
  });
});
