// Rodada 48 — auditoria e integridade dos dados, direto no banco, depois de
// todas as outras fases. Auditoria: autor/empresa/data corretos, nenhum
// "system" indevido, nenhuma ação gravada por usuário de outra empresa.
// Dados: saldo × razão, reservado × reservas ativas, títulos × pedidos,
// duplicidades, valores negativos, registros órfãos.
import fs from "node:fs";
import { check, state, evidenceCard, session, api, close } from "./lib.mjs";
import { COMPANIES } from "./companies.mjs";
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:55440/educa_poc", max: 2 });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const ids = COMPANIES.map((c) => state.companies[c.key].companyId);
const name = Object.fromEntries(COMPANIES.map((c) => [state.companies[c.key].companyId, c.name]));
const out = { audit: [], data: [] };
const A = (label, rows, okFn, note = "") => { const ok = okFn(rows); out.audit.push({ label, ok, rows: rows.slice(0, 20), note }); check("auditoria", label, ok, { expected: note || "0 ocorrências", actual: JSON.stringify(rows.slice(0, 5)).slice(0, 400) }); };
const Dt = (label, rows, note = "") => { const ok = rows.length === 0; out.data.push({ label, ok, n: rows.length, rows: rows.slice(0, 20), note }); check("dados", label, ok, { expected: note || "0 divergências", actual: `${rows.length}: ${JSON.stringify(rows.slice(0, 4)).slice(0, 400)}` }); };

// ---------------------------------------------------------------- auditoria
A("Volume de auditoria por empresa (rodada 48)", await q(`select company_id, count(*)::int n, count(distinct user_id)::int autores, min(created_at)::text de, max(created_at)::text ate from audit_logs where company_id = any($1) group by 1`, [ids]), (r) => r.length === 7 && r.every((x) => x.n > 0), "7 empresas com registros");
A("Registros sem autor (user_id nulo) nas 7 empresas", await q(`select company_id, entity, action, actor_label, count(*)::int n from audit_logs where company_id = any($1) and user_id is null group by 1,2,3,4 order by n desc`, [ids]), (r) => r.length === 0);
A("Registros com autor 'system'/'Sistema'/'service_role' nas 7 empresas", await q(`select company_id, entity, action, actor_label, count(*)::int n from audit_logs where company_id = any($1) and (actor_label ilike any(array['%system%','%sistema%','%service%','%dev%','%postgres%'])) group by 1,2,3,4 order by n desc`, [ids]), (r) => r.length === 0);
A("Registro gravado na empresa X por usuário da empresa Y", await q(`select a.company_id, u.company_id autor_empresa, a.entity, a.action, count(*)::int n from audit_logs a join users u on u.id = a.user_id where a.company_id = any($1) and u.company_id <> a.company_id group by 1,2,3,4`, [ids]), (r) => r.length === 0);
A("Registro cujo entity_id pertence a outra empresa (amostra: clientes, produtos, pedidos)", await q(`select a.company_id, a.entity, count(*)::int n from audit_logs a where a.company_id = any($1) and (
  (a.entity in ('customers','customer','Cliente') and exists (select 1 from customers x where x.id = a.entity_id and x.company_id <> a.company_id)) or
  (a.entity in ('products','product','Produto') and exists (select 1 from products x where x.id = a.entity_id and x.company_id <> a.company_id)) or
  (a.entity in ('sales_orders','sales_order') and exists (select 1 from sales_orders x where x.id = a.entity_id and x.company_id <> a.company_id))) group by 1,2`, [ids]), (r) => r.length === 0);
A("actor_label diferente do nome/e-mail do usuário autor", await q(`select a.company_id, a.actor_label, u.name, u.email, count(*)::int n from audit_logs a join users u on u.id = a.user_id where a.company_id = any($1) and a.actor_label is distinct from u.name and a.actor_label is distinct from u.email group by 1,2,3,4 limit 20`, [ids]), (r) => r.length === 0);
A("Datas de auditoria no futuro ou antes da criação da empresa", await q(`select a.company_id, count(*)::int n from audit_logs a join companies c on c.id = a.company_id where a.company_id = any($1) and (a.created_at > now() + interval '5 minutes' or a.created_at < c.created_at - interval '1 minute') group by 1`, [ids]), (r) => r.length === 0);
// Cobertura: ações críticas têm registro de auditoria?
const coverage = await q(`with ops as (
  select 'pedido aprovado' op, company_id, id from sales_orders where company_id = any($1) and approved_at is not null
  union all select 'pedido cancelado', company_id, id from sales_orders where company_id = any($1) and status = 'cancelled'
  union all select 'recebimento (baixa)', company_id, id from receipts where company_id = any($1)
  union all select 'pagamento (baixa)', company_id, id from payments where company_id = any($1)
  union all select 'expedição expedida', company_id, id from shipments where company_id = any($1) and shipped_at is not null
  union all select 'NF-e gerada', company_id, id from fiscal_documents where company_id = any($1)
  union all select 'papel alterado', r.company_id, r.id from roles r where r.company_id = any($1) and not r.is_system)
  select op, count(*)::int total, count(*) filter (where exists (select 1 from audit_logs a where a.entity_id = ops.id))::int auditados from ops group by 1 order by 1`, [ids]);
A("Cobertura: ações críticas com registro na trilha", coverage, (r) => r.every((x) => x.auditados === x.total), "auditados = total em cada operação");
// API de auditoria por entidade (B17 da rodada anterior).
{
  const co = COMPANIES[0];
  const D = state.companies[co.key].data;
  const s = await session(co.admin.email);
  const a1 = await api(s.page, `/api/admin/audit?entityId=${D.customers[0]}`);
  const a2 = await api(s.page, `/api/audit-logs?entityId=${D.customers[0]}`);
  const rows1 = a1.body?.data ?? [], rows2 = a2.body?.data ?? [];
  const foreign1 = rows1.filter((x) => (x.entityId ?? x.entity_id) && (x.entityId ?? x.entity_id) !== D.customers[0]).length;
  A("/api/admin/audit?entityId= devolve só a entidade pedida", [{ admin_audit: rows1.length, outras_entidades: foreign1, audit_logs_api: rows2.length }], () => foreign1 === 0, "filtro por entidade respeitado");
  await s.c.close();
}

// ---------------------------------------------------------------- dados
Dt("Saldo (stock_balances.on_hand) ≠ soma do razão de movimentos, por produto/local", await q(`with led as (
  select company_id, product_id, location_id, sum(case when movement_type in ('RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','RETURN_IN','PRODUCTION_IN') then quantity when movement_type in ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT','RETURN_OUT','PRODUCTION_OUT','SCRAP') then -quantity else 0 end) s
  from stock_movements where company_id = any($1) group by 1,2,3)
  select b.company_id, b.product_id, b.location_id, b.on_hand::float saldo, coalesce(l.s,0)::float razao from stock_balances b left join led l using (company_id, product_id, location_id)
  where b.company_id = any($1) and abs(b.on_hand - coalesce(l.s,0)) > 0.0001`, [ids]));
Dt("Saldo negativo ou reservado > saldo", await q(`select company_id, product_id, location_id, on_hand::float, reserved::float from stock_balances where company_id = any($1) and (on_hand < 0 or reserved < 0 or reserved > on_hand + 0.0001)`, [ids]));
Dt("Reservado no saldo ≠ soma das reservas ativas", await q(`with act as (select r.company_id, r.location_id, i.product_id, sum(i.quantity) q from stock_reservations r join stock_reservation_items i on i.reservation_id = r.id where r.company_id = any($1) and r.status in ('active','ACTIVE','reserved','RESERVED','partial','PARTIAL') group by 1,2,3)
  select b.company_id, b.product_id, b.location_id, b.reserved::float saldo_reservado, coalesce(a.q,0)::float reservas_ativas from stock_balances b left join act a on a.company_id=b.company_id and a.location_id=b.location_id and a.product_id=b.product_id where b.company_id = any($1) and abs(b.reserved - coalesce(a.q,0)) > 0.0001`, [ids]), "status de reserva ativos considerados: active/reserved/partial");
Dt("Movimento de estoque com idempotency_key repetida", await q(`select company_id, idempotency_key, count(*)::int n from stock_movements where company_id = any($1) and idempotency_key is not null group by 1,2 having count(*) > 1`, [ids]));
Dt("Mais de uma conta a receber ativa para o mesmo pedido", await q(`select company_id, origin_id, count(*)::int n from accounts_receivable where company_id = any($1) and origin_type = 'sales_order' and status not in ('CANCELLED','cancelled') group by 1,2 having count(*) > 1`, [ids]));
Dt("Parcela com recebido > valor ou pago > valor", await q(`select 'receber' t, company_id, id, amount::float, received_amount::float x from accounts_receivable_installments where company_id = any($1) and received_amount > amount + 0.005
  union all select 'pagar', company_id, id, amount::float, paid_amount::float from accounts_payable_installments where company_id = any($1) and paid_amount > amount + 0.005`, [ids]));
Dt("Parcela com status incoerente com o valor recebido/pago", await q(`select 'receber' t, company_id, id, status, amount::float, received_amount::float x from accounts_receivable_installments where company_id = any($1) and ((status='RECEIVED' and received_amount < amount - 0.005) or (status='OPEN' and received_amount > 0.005))
  union all select 'pagar', company_id, id, status, amount::float, paid_amount::float from accounts_payable_installments where company_id = any($1) and ((status='PAID' and paid_amount < amount - 0.005) or (status='OPEN' and paid_amount > 0.005))`, [ids]));
Dt("Soma dos recebimentos ≠ recebido na parcela", await q(`select i.company_id, i.id, i.received_amount::float parcela, coalesce(sum(r.amount),0)::float recebimentos from accounts_receivable_installments i left join receipts r on r.installment_id = i.id and coalesce(r.status,'') not in ('CANCELLED','cancelled','REVERSED') where i.company_id = any($1) group by 1,2,3 having abs(i.received_amount - coalesce(sum(r.amount),0)) > 0.005`, [ids]));
Dt("Soma dos pagamentos ≠ pago na parcela", await q(`select i.company_id, i.id, i.paid_amount::float parcela, coalesce(sum(p.amount),0)::float pagamentos from accounts_payable_installments i left join payments p on p.installment_id = i.id and coalesce(p.status,'') not in ('CANCELLED','cancelled','REVERSED') where i.company_id = any($1) group by 1,2,3 having abs(i.paid_amount - coalesce(sum(p.amount),0)) > 0.005`, [ids]));
Dt("Saldo da conta financeira ≠ abertura + entradas − saídas", await q(`select a.company_id, a.code, a.current_balance::float atual, (a.opening_balance + coalesce(sum(case when t.type in ('INCOME','IN','CREDIT','RECEIPT') then t.amount when t.type in ('EXPENSE','OUT','DEBIT','PAYMENT') then -t.amount else 0 end),0))::float calculado
  from financial_accounts a left join financial_transactions t on t.financial_account_id = a.id where a.company_id = any($1) group by a.id, a.company_id, a.code, a.current_balance, a.opening_balance having abs(a.current_balance - (a.opening_balance + coalesce(sum(case when t.type in ('INCOME','IN','CREDIT','RECEIPT') then t.amount when t.type in ('EXPENSE','OUT','DEBIT','PAYMENT') then -t.amount else 0 end),0))) > 0.005`, [ids]), "tipos de lançamento considerados: INCOME/IN/CREDIT/RECEIPT e EXPENSE/OUT/DEBIT/PAYMENT");
Dt("Mais de um documento fiscal ativo para o mesmo pedido", await q(`select company_id, source_id, count(*)::int n from fiscal_documents where company_id = any($1) and source_type='sales_order' and status not in ('cancelled','CANCELLED','rejected','REJECTED','denied') group by 1,2 having count(*) > 1`, [ids]));
Dt("Número de NF-e repetido no mesmo estabelecimento/série", await q(`select company_id, fiscal_establishment_id, series, number, count(*)::int n from fiscal_documents where company_id = any($1) and number is not null group by 1,2,3,4 having count(*) > 1`, [ids]));
Dt("Mais de uma expedição ativa para o mesmo pedido com as mesmas quantidades", await q(`select company_id, sales_order_id, count(*)::int n from shipments where company_id = any($1) and status not in ('cancelled','CANCELLED') group by 1,2 having count(*) > 1`, [ids]), "pode ser legítimo em entrega parcial — conferir");
Dt("Item de pedido com expedido > pedido ou separado > pedido", await q(`select company_id, order_id, id, ordered_quantity::float, picked_quantity::float, shipped_quantity::float from sales_order_items where company_id = any($1) and (shipped_quantity > ordered_quantity + 0.0001 or picked_quantity > ordered_quantity + 0.0001)`, [ids]));
Dt("Total do pedido ≠ soma das linhas (− desconto + frete)", await q(`select o.company_id, o.code, o.total_amount::float total, (coalesce(sum(i.line_total),0) - coalesce(o.discount,0) + coalesce(o.freight_cost,0))::float calculado from sales_orders o join sales_order_items i on i.order_id = o.id where o.company_id = any($1) group by o.id having abs(o.total_amount - (coalesce(sum(i.line_total),0) - coalesce(o.discount,0) + coalesce(o.freight_cost,0))) > 0.01`, [ids]));
Dt("Código de pedido repetido na mesma empresa", await q(`select company_id, code, count(*)::int n from sales_orders where company_id = any($1) group by 1,2 having count(*) > 1`, [ids]));
Dt("Registro de uma empresa apontando para cadastro de outra (pedido→cliente, pedido-item→produto, CP→fornecedor)", await q(`select 'pedido→cliente' rel, o.company_id, o.id from sales_orders o join customers c on c.id = o.customer_id where o.company_id = any($1) and c.company_id <> o.company_id
  union all select 'item→produto', i.company_id, i.id from sales_order_items i join products p on p.id = i.product_id where i.company_id = any($1) and p.company_id <> i.company_id
  union all select 'CP→fornecedor', a.company_id, a.id from accounts_payable a join suppliers s on s.id = a.supplier_id where a.company_id = any($1) and s.company_id <> a.company_id
  union all select 'reserva→local', r.company_id, r.id from stock_reservations r join warehouse_locations l on l.id = r.location_id where r.company_id = any($1) and l.company_id <> r.company_id`, [ids]));
Dt("Usuário com mais de um vínculo de empresa ou papel de outra empresa", await q(`select u.company_id, u.email, r.company_id papel_de from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id where u.company_id = any($1) and r.company_id is not null and r.company_id <> u.company_id`, [ids]));
Dt("Usuários por empresa diferente do planejado", (await q(`select company_id, count(*)::int n from users where company_id = any($1) and status='active' group by 1`, [ids])).filter((r) => r.n !== COMPANIES.find((c) => state.companies[c.key].companyId === r.company_id).people.length).map((r) => ({ empresa: name[r.company_id], ativos: r.n })));

// Contagem final de dados (seção 12 do relatório).
const counts = await q(`select c.id, c.name,
  (select count(*) from users where company_id=c.id)::int usuarios, (select count(*) from customers where company_id=c.id)::int clientes, (select count(*) from customers where company_id=c.id and status in ('Inativo','inactive'))::int clientes_inativos,
  (select count(*) from products where company_id=c.id)::int produtos, (select count(*) from suppliers where company_id=c.id)::int fornecedores,
  (select count(*) from sales_orders where company_id=c.id)::int pedidos, (select count(*) from sales_orders where company_id=c.id and status='cancelled')::int pedidos_cancelados,
  (select count(*) from purchase_orders where company_id=c.id)::int pedidos_compra, (select count(*) from stock_movements where company_id=c.id)::int movimentos,
  (select count(*) from accounts_receivable where company_id=c.id)::int receber, (select count(*) from accounts_payable where company_id=c.id)::int pagar, (select count(*) from accounts_payable where company_id=c.id and status in ('CANCELLED','cancelled'))::int pagar_cancelados,
  (select count(*) from fiscal_documents where company_id=c.id)::int notas, (select count(*) from shipments where company_id=c.id)::int expedicoes, (select count(*) from audit_logs where company_id=c.id)::int auditoria
  from companies c where c.id = any($1) order by c.name`, [ids]);
out.counts = counts;
await evidenceCard(null, "auditoria", "00-auditoria-verificacoes", "Auditoria — verificações no banco (7 empresas)", [["Verificação", "Resultado", "Amostra"], ...out.audit.map((a) => [a.label, a.ok ? "PASS" : "FAIL", JSON.stringify(a.rows.slice(0, 3)).slice(0, 220)])]);
await evidenceCard(null, "dados", "00-integridade", "Integridade dos dados — verificações no banco (7 empresas)", [["Verificação", "Divergências", "Resultado", "Amostra"], ...out.data.map((d) => [d.label, d.n, d.ok ? "PASS" : "FAIL", JSON.stringify(d.rows.slice(0, 2)).slice(0, 220)])]);
await evidenceCard(null, "dados", "01-contagens", "Dados por empresa ao fim da rodada", [Object.keys(counts[0]).slice(1), ...counts.map((r) => Object.values(r).slice(1))]);
fs.writeFileSync(new URL("./r9-auditoria-dados.out.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`auditoria: ${out.audit.filter((a) => a.ok).length}/${out.audit.length} · dados: ${out.data.filter((d) => d.ok).length}/${out.data.length}`);
await db.end();
await close();
