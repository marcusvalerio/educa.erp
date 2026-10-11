// Rodada 2 — integridade DIRETO NO BANCO (27 verificações). Separa o que nasceu
// ANTES da aplicação das migrations 0081–0088 (histórico: contado e mantido) do
// que nasceu DEPOIS (tem de ser zero). Corte = instante em que as migrations
// foram aplicadas no banco local (cut-0081.txt).
import fs from "node:fs";
import { check, close, evidenceCard } from "../r48/lib.mjs";
import { db, q } from "./ctx.mjs";

const PHASE = process.env.PHASE ?? "final";
const CUT = process.env.CUT ?? fs.readFileSync(new URL("./cut-0081.txt", import.meta.url), "utf8").trim();
const rows = [["Verificação", "Total", "Antes das correções (histórico)", "Depois das correções", "Resultado"]];
const checks = [];
let pass = 0, fail = 0;

/** sql devolve linhas com a coluna "ts" (quando nasceu) para separar histórico de recente. */
async function v(name, sql, { allowHistoric = true } = {}) {
  const all = await q(sql, sql.includes("$1") ? [CUT] : []);
  const historic = all.filter((r) => r.ts && new Date(r.ts) < new Date(CUT)).length;
  const recent = all.length - historic;
  const ok = recent === 0 && (allowHistoric || historic === 0);
  ok ? pass++ : fail++;
  rows.push([name, all.length, historic, recent, ok ? "PASS" : "FAIL"]);
  checks.push({ name, total: all.length, historic, recent, ok, sample: all.slice(0, 3) });
  check("integridade", name, ok, { target: "banco local", expected: "0 depois das correções", actual: `total ${all.length}; histórico ${historic}; novas ${recent}${recent ? " · ex.: " + JSON.stringify(all.find((r) => !r.ts || new Date(r.ts) >= new Date(CUT))).slice(0, 200) : ""}` });
}

const OPEN_SH = `('draft','ready','picking','packed','ready_to_ship')`;
await v("Saldo físico = soma do razão de movimentos (por produto/local/lote)", `
  select b.product_id, b.location_id, b.updated_at ts from stock_balances b
  left join lateral (select coalesce(sum(case when m.movement_type in ('RECEIPT','TRANSFER_IN','ADJUSTMENT_IN','RETURN_IN','PRODUCTION_IN') then m.quantity
      when m.movement_type in ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT','RETURN_OUT','PRODUCTION_OUT','SCRAP') then -m.quantity else 0 end),0) s
    from stock_movements m where m.product_id=b.product_id and m.location_id=b.location_id and m.lot_id is not distinct from b.lot_id) l on true
  where b.on_hand <> l.s`);
await v("Saldo negativo ou reservado > físico", `select id, updated_at ts from stock_balances where on_hand < 0 or reserved < 0 or reserved > on_hand`);
await v("Reservado no saldo = reservas ativas ainda não consumidas (por produto/local)", `
  select b.product_id, b.location_id, now() ts from stock_balances b
  where b.lot_id is null and b.reserved <> coalesce((select sum(i.quantity - i.consumed_quantity) from stock_reservation_items i join stock_reservations r on r.id=i.reservation_id
     where r.status='active' and r.location_id=b.location_id and i.product_id=b.product_id), 0)`, { allowHistoric: false });
await v("Reserva 'active' de pedido já expedido/cancelado/concluído (reserva fantasma)", `
  select r.id, r.created_at ts from stock_reservations r join sales_orders so on so.id=r.reference_id
  where r.reference_type='sales_order' and r.status='active' and so.status in ('shipped','cancelled','completed')`, { allowHistoric: false });
await v("Reserva consumida acima do reservado ou item com consumo sem expedição", `
  select i.id, i.created_at ts from stock_reservation_items i where i.consumed_quantity > i.quantity or i.consumed_quantity < 0`);
await v("Item do pedido: reservado/separado/expedido/cancelado incoerentes", `
  select id, created_at ts from sales_order_items where reserved_quantity + cancelled_quantity > ordered_quantity or picked_quantity > reserved_quantity or shipped_quantity > picked_quantity`);
await v("Reservado no item do pedido = reservas do pedido (ativas + consumidas)", `
  select soi.id, soi.created_at ts from sales_order_items soi join sales_orders so on so.id=soi.order_id
  where so.status in ('reserved','reservation_pending','picking','ready_to_ship','partially_shipped','shipped') and soi.product_id is not null
    and soi.reserved_quantity <> coalesce((select sum(i.quantity) from stock_reservation_items i join stock_reservations r on r.id=i.reservation_id
      where r.reference_type='sales_order' and r.reference_id=so.id and r.status in ('active','consumed') and i.product_id=soi.product_id), 0)`);
await v("Mais de uma separação ABERTA por pedido", `
  select sales_order_id, max(created_at) ts from pick_lists where status in ('pending','in_progress') group by sales_order_id having count(*) > 1`, { allowHistoric: false });
await v("Expedições abertas + expedido > reservado (por item do pedido)", `
  select soi.id, soi.created_at ts from sales_order_items soi
  where soi.shipped_quantity + coalesce((select sum(si.quantity) from shipment_items si join shipments s on s.id=si.shipment_id where si.sales_order_item_id=soi.id and s.status in ${OPEN_SH}),0) > soi.reserved_quantity`, { allowHistoric: false });
await v("Saídas de estoque de expedição = quantidade expedida", `
  select s.id, s.shipped_at ts from shipments s where s.status in ('shipped','in_transit','delivered','completed')
    and coalesce((select sum(si.quantity) from shipment_items si where si.shipment_id=s.id),0) <> coalesce((select sum(m.quantity) from stock_movements m where m.reference_type='SHIPMENT' and m.reference_id=s.id and m.movement_type='ISSUE'),0)`);
await v("Mais de um evento 'entregue' por expedição (R2-10)", `
  select shipment_id, max(created_at) ts from delivery_events where status='delivered' group by shipment_id having count(*) > 1`);
await v("Expedição de pedido cancelado ainda aberta", `
  select s.id, s.created_at ts from shipments s join sales_orders so on so.id=s.sales_order_id where so.status='cancelled' and s.status in ${OPEN_SH}`);
await v("Mais de uma conta a receber ATIVA por pedido (R48-01)", `
  select origin_id, max(created_at) ts from accounts_receivable where origin_type='sales_order' and origin_id is not null and status<>'CANCELLED' group by company_id, origin_id having count(*) > 1`, { allowHistoric: false });
await v("Conta a receber de pedido com valor diferente do pedido", `
  select ar.id, ar.created_at ts from accounts_receivable ar join sales_orders so on so.id=ar.origin_id where ar.origin_type='sales_order' and ar.status<>'CANCELLED' and ar.original_amount <> so.total_amount`);
await v("Soma das parcelas ≠ valor do título (a receber)", `
  select ar.id, ar.created_at ts from accounts_receivable ar where ar.status<>'CANCELLED' and ar.updated_amount <> coalesce((select sum(amount) from accounts_receivable_installments i where i.receivable_id=ar.id),0)`);
await v("Soma das parcelas ≠ valor do título (a pagar)", `
  select ap.id, ap.created_at ts from accounts_payable ap where ap.status<>'CANCELLED' and ap.updated_amount <> coalesce((select sum(amount) from accounts_payable_installments i where i.payable_id=ap.id),0)`);
await v("Parcela recebida/paga acima do valor", `
  select id, created_at ts from accounts_receivable_installments where received_amount > amount
  union all select id, created_at from accounts_payable_installments where paid_amount > amount`);
await v("Saldo da conta financeira = abertura ± lançamentos", `
  select fa.id, fa.updated_at ts from financial_accounts fa where fa.current_balance <> fa.opening_balance
    + coalesce((select sum(case when t.type in ('CREDIT','INCOME','IN','RECEIPT') then t.amount when t.type in ('DEBIT','EXPENSE','OUT','PAYMENT') then -t.amount else 0 end) from financial_transactions t where t.financial_account_id=fa.id),0)`);
await v("Mais de uma NF-e ativa por pedido", `
  select source_id, max(created_at) ts from fiscal_documents where source_type='sales_order' and status<>'CANCELLED' group by company_id, source_id having count(*) > 1`, { allowHistoric: false });
await v("Número de documento de saída repetido na série", `
  select number, max(created_at) ts from fiscal_documents where direction='SAIDA' and number is not null group by company_id, fiscal_establishment_id, coalesce(model,'55'), coalesce(series,'1'), number having count(*) > 1`, { allowHistoric: false });
await v("Documento AUTORIZADO sem número ou com chave fora do padrão", `
  select id, coalesce(authorized_at, created_at) ts from fiscal_documents where status='AUTHORIZED' and (number is null or not public.fn_fiscal_access_key_is_valid(access_key))`);
await v("Documento simulado (protocolo SIMULACAO-) fora de homologação", `
  select id, created_at ts from fiscal_documents where protocol like 'SIMULACAO-%' and environment <> 'HOMOLOGATION'`, { allowHistoric: false });
await v("Total do documento ≠ produtos − desconto + frete + seguro + outras + impostos destacados", `
  select id, created_at ts from fiscal_documents where status in ('READY','AUTHORIZED') and abs(total_amount - (products_amount - discount_amount + freight_amount + insurance_amount + other_expenses_amount + taxes_amount)) > 0.01`);
await v("Registro apontando para cadastro de OUTRA empresa (pedido↔cliente, título↔pedido, NF-e↔pedido, expedição↔pedido)", `
  select so.id, so.created_at ts from sales_orders so join customers c on c.id=so.customer_id where c.company_id<>so.company_id
  union all select ar.id, ar.created_at from accounts_receivable ar join sales_orders so on so.id=ar.origin_id where ar.origin_type='sales_order' and so.company_id<>ar.company_id
  union all select fd.id, fd.created_at from fiscal_documents fd join sales_orders so on so.id=fd.source_id where fd.source_type='sales_order' and so.company_id<>fd.company_id
  union all select s.id, s.created_at from shipments s join sales_orders so on so.id=s.sales_order_id where so.company_id<>s.company_id`, { allowHistoric: false });
await v("Auditoria gravada na empresa X por usuário da empresa Y", `
  select a.id, a.created_at ts from audit_logs a join users u on u.id=a.user_id where u.company_id<>a.company_id`, { allowHistoric: false });
await v("Auditoria sem autor em ação de usuário (criados na rodada 2)", `
  select a.id, a.created_at ts from audit_logs a where a.created_at >= $1::timestamptz and a.user_id is null and coalesce(a.actor_label,'') not like 'platform:%'`);
await v("Ações críticas da rodada 2 sem registro de auditoria (títulos, NF-e autorizadas/canceladas, expedições)", `
  select ar.id, ar.created_at ts from accounts_receivable ar where ar.created_at >= $1::timestamptz and not exists (select 1 from audit_logs a where a.entity_id=ar.id)
  union all select fd.id, fd.authorized_at from fiscal_documents fd where fd.authorized_at >= $1::timestamptz and not exists (select 1 from audit_logs a where a.entity_id=fd.id and a.action='AUTHORIZE')
  union all select s.id, s.shipped_at from shipments s where s.shipped_at >= $1::timestamptz and not exists (select 1 from audit_logs a where a.entity_id=s.id and a.action='SHIP')`);

await evidenceCard(null, "03-integridade", `00-integridade-${PHASE}`, `Integridade direto no banco — ${PHASE} (${pass}/${pass + fail}) · corte ${CUT}`, rows);
fs.writeFileSync(new URL(`./p3-integridade-${PHASE}.out.json`, import.meta.url), JSON.stringify({ phase: PHASE, cut: CUT, pass, fail, checks }, null, 2));
console.log(`integridade (${PHASE}): ${pass} PASS, ${fail} FAIL`);
await db.end();
await close();
process.exit(0);
