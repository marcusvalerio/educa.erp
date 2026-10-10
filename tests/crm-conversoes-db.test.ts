// Conversões de lead (migration 0089) executadas de verdade no PostgreSQL.
// POC_DATABASE_OWNER_URL: conexão do DONO de um banco DESCARTÁVEL reconstruído
// pelo plano (poc/neon-full/README.md; nunca produção). Diferente de
// crm-funnel-db.test.ts, os dados são GRAVADOS (commit), porque as corridas
// precisam de duas conexões reais; cada execução usa identificadores novos.
//
// Comparação antes × depois: rodar este arquivo num banco SEM a 0089 mostra os
// defeitos (A: legal_name; B: ação INSERT; C: representante = usuário;
// D: duplicidades e lead convertido editável). Ver
// docs/homologacao/RELATORIO-CORRECOES-CRM-E-PAINEIS.md.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const COMPANY = "00000000-0000-0000-0000-000000000001";

type Row = Record<string, unknown>;

describe("conversões de lead — 0089 (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const owner = new Client({ connectionString: url });
  const tag = randomUUID().slice(0, 8);
  const otherCompany = randomUUID();
  const admin = { auth: randomUUID(), app: "" };
  const reader = { auth: randomUUID(), app: "" };
  let pipeline = "";
  let stage = "";
  let otherPipeline = "";
  let otherStage = "";
  let otherLead = "";
  let seq = 0;

  // documento único por execução (só formato; o banco não valida dígito verificador)
  const doc = (len: 11 | 14) => {
    seq++;
    const base = `${Date.now()}${seq}`.slice(-(len - 2)).padStart(len - 2, "7");
    return `${base}${String(seq % 100).padStart(2, "0")}`;
  };
  const one = async <T = Row>(c: Client, sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows[0] as T;

  const connect = async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    return c;
  };
  const as = async (c: Client, who: { auth: string }) => {
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
      JSON.stringify({ sub: who.auth, role: "authenticated" }),
      who.auth,
    ]);
  };
  /** Executa como usuário numa transação própria e confirma (ou desfaz no erro). */
  const run = async <T>(who: { auth: string }, fn: (c: Client) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    const c = await connect();
    try {
      await c.query("begin");
      await as(c, who);
      const value = await fn(c);
      await c.query("commit");
      return { ok: true, value };
    } catch (error) {
      await c.query("rollback").catch(() => undefined);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await c.end();
    }
  };
  const newLead = async (f: { name: string; companyName?: string | null; document?: string | null; email?: string | null; responsible?: string | null; company?: string }) =>
    (
      await one<{ id: string }>(
        owner,
        "insert into public.leads (company_id, name, company_name, document, email, responsible_user_id) values ($1, $2, $3, $4, $5, $6) returning id",
        [f.company ?? COMPANY, `${f.name} ${tag}`, f.companyName ?? null, f.document ?? null, f.email ?? null, f.responsible ?? null]
      )
    ).id;
  const lead = (id: string) => one<{ status: string; converted_customer_id: string | null; code: string }>(owner, "select status, converted_customer_id, code from public.leads where id = $1", [id]);
  const customersByDigits = async (d: string) =>
    (await owner.query("select id, code, name, trade_name, type, document, default_sales_representative_id from public.customers where company_id = $1 and regexp_replace(document, '\\D', '', 'g') = $2", [COMPANY, d.replace(/\D/g, "")])).rows;
  const audits = async (entity: string, id: string) => (await owner.query("select action, user_id, new_data from public.audit_logs where entity = $1 and entity_id = $2 order by created_at", [entity, id])).rows;
  const convertCustomer = (c: Client, leadId: string) => one<{ id: string; code: string }>(c, "select * from public.fn_convert_lead_to_customer($1)", [leadId]);
  const convertOpp = (c: Client, leadId: string, p = pipeline, s = stage) => one<{ id: string; code: string; status: string; customer_id: string | null; owner_user_id: string | null; lead_id: string }>(c, "select * from public.fn_convert_lead_to_opportunity($1, $2, $3, 'Oportunidade do teste', 1500)", [leadId, p, s]);

  before(async () => {
    await owner.connect();
    await owner.query("select set_config('educa.auth_link', 'invitation', false)");
    for (const [who, role] of [[admin, "admin"], [reader, "leitura"]] as const) {
      await owner.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [who.auth, `crm.${role}.${tag}@example.com`]);
      who.app = (
        await one<{ id: string }>(owner, "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $5, 'active') returning id", [
          COMPANY,
          who.auth,
          `CRM ${role} ${tag}`,
          `crm.${role}.${tag}@example.com`,
          `crm.${role}.${tag}`,
        ])
      ).id;
      await owner.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = $3", [who.app, COMPANY, role]);
    }
    pipeline = (await one<{ id: string }>(owner, "insert into public.pipelines (company_id, code, name) values ($1, $2, 'Funil do teste') returning id", [COMPANY, `T${tag}`])).id;
    stage = (await one<{ id: string }>(owner, "insert into public.pipeline_stages (company_id, pipeline_id, code, name, sequence) values ($1, $2, 'E1', 'Qualificação', 1) returning id", [COMPANY, pipeline])).id;
    await owner.query("insert into public.companies (id, name) values ($1, $2)", [otherCompany, `Outra empresa ${tag}`]);
    otherPipeline = (await one<{ id: string }>(owner, "insert into public.pipelines (company_id, code, name) values ($1, $2, 'Funil de outra empresa') returning id", [otherCompany, `O${tag}`])).id;
    otherStage = (await one<{ id: string }>(owner, "insert into public.pipeline_stages (company_id, pipeline_id, code, name, sequence) values ($1, $2, 'E1', 'Etapa', 1) returning id", [otherCompany, otherPipeline])).id;
    otherLead = await newLead({ name: "Lead de outra empresa", document: doc(14), company: otherCompany });
  });

  after(async () => {
    await owner.end();
  });

  // ------------------------------------------------------- A: cliente novo
  test("A — lead com documento novo vira cliente (name, trade_name, documento, tipo empresa) e o lead fica CONVERTED", async () => {
    const d = doc(14);
    const l = await newLead({ name: "Maria", companyName: "Mercado Lua Ltda.", document: d, email: "maria@example.com" });
    const r = await run(admin, (c) => convertCustomer(c, l));
    assert.ok(r.ok, r.ok ? "" : r.error);
    const [cust] = await customersByDigits(d);
    assert.equal(cust.name, "Mercado Lua Ltda.");
    assert.equal(cust.trade_name, `Maria ${tag}`);
    assert.equal(cust.type, "company");
    assert.equal(cust.document, d);
    const after = await lead(l);
    assert.equal(after.status, "CONVERTED");
    assert.equal(after.converted_customer_id, cust.id);
  });

  test("A — CPF (11 dígitos) gera cliente pessoa física; sem empresa, o nome do cliente é o nome do lead", async () => {
    const d = doc(11);
    const l = await newLead({ name: "João Pessoa Física", document: d });
    const r = await run(admin, (c) => convertCustomer(c, l));
    assert.ok(r.ok, r.ok ? "" : r.error);
    const [cust] = await customersByDigits(d);
    assert.equal(cust.type, "individual");
    assert.equal(cust.name, `João Pessoa Física ${tag}`);
  });

  test("A — lead sem CPF/CNPJ: recusa com mensagem clara e não cria nada (customers.document é obrigatório)", async () => {
    const l = await newLead({ name: "Sem documento" });
    const r = await run(admin, (c) => convertCustomer(c, l));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /não tem CPF\/CNPJ\. Informe o documento no lead/);
    assert.equal((await lead(l)).status, "NEW");
  });

  test("A — cliente com o mesmo documento COM máscara é reaproveitado (lead sem máscara): não duplica", async () => {
    const d = doc(14);
    const masked = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    const existing = (await one<{ id: string }>(owner, "insert into public.customers (company_id, type, name, document) values ($1, 'company', 'Cliente já cadastrado', $2) returning id", [COMPANY, masked])).id;
    const l = await newLead({ name: "Lead de cliente existente", document: d });
    const r = await run(admin, (c) => convertCustomer(c, l));
    assert.ok(r.ok, r.ok ? "" : r.error);
    assert.equal((await customersByDigits(d)).length, 1);
    assert.equal((await lead(l)).converted_customer_id, existing);
  });

  test("A/D — falha depois de inserir o cliente desfaz tudo (sem cliente parcial, lead não marcado)", async () => {
    const d = doc(14);
    const l = await newLead({ name: "Falha no meio", document: d });
    // gatilho temporário (só nesta transação) que falha ao marcar o lead
    const c = await connect();
    let error = "";
    try {
      await c.query("begin");
      await c.query("create function pg_temp.boom() returns trigger language plpgsql as $$ begin raise exception 'falha simulada'; end $$");
      await c.query("create trigger t_boom before update on public.leads for each row when (new.id = '" + l + "'::uuid) execute function pg_temp.boom()");
      await as(c, admin);
      await convertCustomer(c, l).catch((e: Error) => {
        error = e.message;
      });
    } finally {
      await c.query("rollback").catch(() => undefined);
      await c.end();
    }
    assert.match(error, /falha simulada/);
    assert.equal((await customersByDigits(d)).length, 0, "ficou cliente criado");
    assert.equal((await lead(l)).status, "NEW");
  });

  test("A/D — repetir a conversão devolve o mesmo cliente e não grava outro CREATE", async () => {
    const d = doc(14);
    const l = await newLead({ name: "Repetido", document: d });
    const r1 = await run(admin, (c) => convertCustomer(c, l));
    const r2 = await run(admin, (c) => convertCustomer(c, l));
    assert.ok(r1.ok && r2.ok);
    if (r1.ok && r2.ok) assert.equal(r1.value.id, r2.value.id);
    const [cust] = await customersByDigits(d);
    const creates = (await audits("customers", cust.id as string)).filter((a) => a.action === "CREATE");
    assert.equal(creates.length, 1);
  });

  test("A/D — auditoria: CREATE do cliente e UPDATE do lead, com o usuário real", async () => {
    const d = doc(14);
    const l = await newLead({ name: "Auditado", document: d });
    const r = await run(admin, (c) => convertCustomer(c, l));
    assert.ok(r.ok, r.ok ? "" : r.error);
    const [cust] = await customersByDigits(d);
    const ca = await audits("customers", cust.id as string);
    assert.deepEqual(ca.map((a) => a.action), ["CREATE"]);
    assert.equal(ca[0].user_id, admin.app);
    const la = await audits("leads", l);
    assert.deepEqual(la.map((a) => a.action), ["UPDATE"]);
    assert.equal((la[0].new_data as Row).status, "CONVERTED");
  });

  // ------------------------------------------- C: responsável × representante
  test("C — responsável (usuário) NÃO vira representante de vendas do cliente; vai para a oportunidade como dono", async () => {
    const d = doc(14);
    const l = await newLead({ name: "Com responsável", document: d, responsible: admin.app });
    const r = await run(admin, (c) => convertCustomer(c, l));
    assert.ok(r.ok, r.ok ? "" : r.error);
    const [cust] = await customersByDigits(d);
    assert.equal(cust.default_sales_representative_id, null);
    const o = await run(admin, (c) => convertOpp(c, l));
    assert.ok(o.ok, o.ok ? "" : o.error);
    if (o.ok) assert.equal(o.value.owner_user_id, admin.app);
  });

  // ------------------------------------------------- B: oportunidade
  test("B — lead vira oportunidade aberta, auditoria CREATE; lead NEW → QUALIFIED com auditoria", async () => {
    const l = await newLead({ name: "Para oportunidade" });
    const r = await run(admin, (c) => convertOpp(c, l));
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.equal(r.value.status, "OPEN");
    assert.equal(r.value.lead_id, l);
    assert.equal(r.value.customer_id, null);
    const oa = await audits("opportunities", r.value.id);
    assert.deepEqual(oa.map((a) => a.action), ["CREATE"]);
    assert.equal(oa[0].user_id, admin.app);
    assert.equal((await lead(l)).status, "QUALIFIED");
    assert.deepEqual((await audits("leads", l)).map((a) => a.action), ["UPDATE"]);
  });

  test("B/D — converter de novo o mesmo lead com oportunidade aberta é recusado (sem duplicar)", async () => {
    const l = await newLead({ name: "Duplo clique" });
    const r1 = await run(admin, (c) => convertOpp(c, l));
    const r2 = await run(admin, (c) => convertOpp(c, l));
    assert.ok(r1.ok, r1.ok ? "" : r1.error);
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.match(r2.error, /já tem a oportunidade OPP-\d+ em aberto/);
    const n = await one<{ n: number }>(owner, "select count(*)::int n from public.opportunities where lead_id = $1", [l]);
    assert.equal(n.n, 1);
  });

  test("B — lead já convertido em cliente leva o cliente para a oportunidade", async () => {
    const d = doc(14);
    const l = await newLead({ name: "Cliente e depois oportunidade", document: d });
    const c1 = await run(admin, (c) => convertCustomer(c, l));
    const o = await run(admin, (c) => convertOpp(c, l));
    assert.ok(c1.ok && o.ok);
    if (c1.ok && o.ok) assert.equal(o.value.customer_id, c1.value.id);
  });

  test("B/D — pipeline de outra empresa e estágio de outro pipeline são recusados", async () => {
    const l = await newLead({ name: "Pipeline errado" });
    const r1 = await run(admin, (c) => convertOpp(c, l, otherPipeline, otherStage));
    assert.equal(r1.ok, false);
    const r2 = await run(admin, (c) => convertOpp(c, l, pipeline, otherStage));
    assert.equal(r2.ok, false);
    const n = await one<{ n: number }>(owner, "select count(*)::int n from public.opportunities where lead_id = $1", [l]);
    assert.equal(n.n, 0);
    assert.equal((await lead(l)).status, "NEW");
  });

  // ------------------------------------------- D: permissão e isolamento
  test("D — usuário sem leads.convert (Somente leitura) é recusado nas duas conversões", async () => {
    const l = await newLead({ name: "Sem permissão", document: doc(14) });
    const r1 = await run(reader, (c) => convertCustomer(c, l));
    const r2 = await run(reader, (c) => convertOpp(c, l));
    assert.equal(r1.ok, false);
    assert.equal(r2.ok, false);
    if (!r1.ok) assert.match(r1.error, /Permissão negada \(leads\.convert\)/);
    assert.equal((await lead(l)).status, "NEW");
  });

  test("D — lead de OUTRA empresa: administrador desta empresa é recusado e nada muda", async () => {
    const r1 = await run(admin, (c) => convertCustomer(c, otherLead));
    const r2 = await run(admin, (c) => convertOpp(c, otherLead));
    assert.equal(r1.ok, false);
    assert.equal(r2.ok, false);
    if (!r1.ok) assert.match(r1.error, /Permissão negada/);
    assert.equal((await lead(otherLead)).status, "NEW");
  });

  test("D — lead inexistente", async () => {
    const r = await run(admin, (c) => convertCustomer(c, randomUUID()));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /Lead não encontrado/);
  });

  test("D — lead convertido não pode ser editado nem 'desconvertido' por edição direta (RLS)", async () => {
    const l = await newLead({ name: "Congelado", document: doc(14) });
    assert.ok((await run(admin, (c) => convertCustomer(c, l))).ok);
    const back = await run(admin, (c) => c.query("update public.leads set status = 'NEW' where id = $1", [l]));
    assert.ok(!back.ok || back.value.rowCount === 0, "o banco aceitou desfazer a conversão");
    const rename = await run(admin, (c) => c.query("update public.leads set name = 'outro nome' where id = $1", [l]));
    assert.ok(!rename.ok || rename.value.rowCount === 0, "o banco aceitou editar lead convertido");
    assert.equal((await lead(l)).status, "CONVERTED");
  });

  test("D — lead aberto continua editável, mas não recebe cliente por edição direta", async () => {
    const l = await newLead({ name: "Aberto", document: doc(14) });
    const ok = await run(admin, (c) => c.query("update public.leads set status = 'CONTACTED' where id = $1", [l]));
    assert.ok(ok.ok && ok.value.rowCount === 1, ok.ok ? "" : ok.error);
    const someCustomer = (await one<{ id: string }>(owner, "select id from public.customers where company_id = $1 limit 1", [COMPANY])).id;
    const link = await run(admin, (c) => c.query("update public.leads set converted_customer_id = $2 where id = $1", [l, someCustomer]));
    assert.equal(link.ok, false, "o banco aceitou vincular cliente sem conversão");
  });

  // ------------------------------------------------- D: concorrência real
  const race = async (a: (c: Client) => Promise<unknown>, b: (c: Client) => Promise<unknown>) => {
    const c1 = await connect();
    const c2 = await connect();
    const go = async (c: Client, fn: (c: Client) => Promise<unknown>, delay: number, hold: number) => {
      await new Promise((r) => setTimeout(r, delay));
      try {
        await c.query("begin");
        await as(c, admin);
        const v = await fn(c);
        await new Promise((r) => setTimeout(r, hold));
        await c.query("commit");
        return { ok: true as const, value: v };
      } catch (e) {
        await c.query("rollback").catch(() => undefined);
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    };
    try {
      return await Promise.all([go(c1, a, 0, 400), go(c2, b, 80, 0)]);
    } finally {
      await c1.end();
      await c2.end();
    }
  };

  test("D — duas conversões SIMULTÂNEAS do mesmo lead em cliente: 1 cliente, mesma resposta, 1 auditoria CREATE", async () => {
    const d = doc(14);
    const l = await newLead({ name: "Corrida cliente", document: d });
    const [r1, r2] = await race((c) => convertCustomer(c, l), (c) => convertCustomer(c, l));
    assert.ok(r1.ok && r2.ok, JSON.stringify([r1, r2]));
    if (r1.ok && r2.ok) assert.equal((r1.value as Row).id, (r2.value as Row).id);
    const found = await customersByDigits(d);
    assert.equal(found.length, 1);
    assert.equal((await audits("customers", found[0].id as string)).filter((a) => a.action === "CREATE").length, 1);
  });

  test("D — dois leads DIFERENTES com o mesmo CNPJ (com e sem máscara) convertidos ao mesmo tempo: 1 cliente", async () => {
    const d = doc(14);
    const masked = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    const l1 = await newLead({ name: "Corrida A", document: d });
    const l2 = await newLead({ name: "Corrida B", document: masked });
    const [r1, r2] = await race((c) => convertCustomer(c, l1), (c) => convertCustomer(c, l2));
    assert.ok(r1.ok && r2.ok, JSON.stringify([r1, r2]));
    assert.equal((await customersByDigits(d)).length, 1);
    assert.equal((await lead(l1)).converted_customer_id, (await lead(l2)).converted_customer_id);
  });

  test("D — duas conversões SIMULTÂNEAS do mesmo lead em oportunidade: 1 oportunidade; a outra é recusada com mensagem", async () => {
    const l = await newLead({ name: "Corrida oportunidade" });
    const [r1, r2] = await race((c) => convertOpp(c, l), (c) => convertOpp(c, l));
    const oks = [r1, r2].filter((r) => r.ok).length;
    assert.equal(oks, 1, JSON.stringify([r1, r2]));
    const loser = [r1, r2].find((r) => !r.ok);
    if (loser && !loser.ok) assert.match(loser.error, /já tem a oportunidade/);
    const n = await one<{ n: number }>(owner, "select count(*)::int n from public.opportunities where lead_id = $1", [l]);
    assert.equal(n.n, 1);
  });
});
