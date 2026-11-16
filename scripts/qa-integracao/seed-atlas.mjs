#!/usr/bin/env node
// Harness de QA: dados iniciais do ATLAS para o teste real ATLAS ↔ ORION.
// Roda como dono do banco (neondb_owner) sobre um banco recém-criado com as
// migrations do repositório. Gera também o usuarios.json do neon-auth-stub.
// Uso: DATABASE_URL=... node seed-atlas.mjs <saida-usuarios.json>
import pg from "pg";
import { writeFileSync } from "node:fs";

const C = "a1a1a1a1-0000-4000-8000-000000000001";
const PASSWORD = "Senha-QA-2026!";
const people = [
  { key: "owner", name: "Paula Plataforma", email: "paula@astraeus.test", role: null, platform: true },
  { key: "admin", name: "Ana Admin", email: "ana@alfa.test", role: "admin" },
  { key: "sup", name: "Sergio Supervisor", email: "sergio@alfa.test", role: "gerente" },
  { key: "op", name: "Olga Operadora", email: "olga@alfa.test", role: "operador" },
];

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows);
const ids = {};
await q(`insert into companies (id,name,legal_name,document,email,phone,address,city,state,zip_code)
         values ($1,'Alfa Indústria','Alfa Indústria e Comércio Ltda','11444777000161','contato@alfa.test','1133334444','Rua das Indústrias, 100','São Paulo','SP','01000000')
         on conflict (id) do nothing`, [C]);
const stubUsers = [];
for (const p of people) {
  const [a] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [p.email]);
  const neonId = `neon-${p.key}-${a.id.slice(0, 8)}`;
  await q(`insert into auth_identity_links (provider, external_user_id, auth_user_id, email) values ('neon', $1, $2, $3)`, [neonId, a.id, p.email]);
  stubUsers.push({ id: neonId, email: p.email, password: PASSWORD, name: p.name });
  ids[`${p.key}_auth`] = a.id;
  if (p.platform) {
    await q(`select bootstrap_platform_owner($1, $2, $3)`, [a.id, p.name, p.email]);
    continue;
  }
  await q("begin");
  await q("select set_config('educa.auth_link', 'invitation', true)");
  const [u] = await q(`insert into users (company_id, auth_user_id, name, email, login, status) values ($1,$2,$3,$4,$4,'active') returning id`, [C, a.id, p.name, p.email]);
  await q("commit");
  await q(`insert into user_roles (user_id, role_id) select $1, id from roles where company_id = $2 and code = $3`, [u.id, C, p.role]);
  ids[p.key] = u.id;
}
const [wh] = await q(`select id from warehouses where company_id = $1 and code = 'PRINCIPAL'`, [C]);
ids.warehouse = wh.id;
const [loc] = await q(`insert into warehouse_locations (company_id, warehouse_id, code, name, location_type, status) values ($1,$2,'PRINCIPAL-A01','Rua A 01','storage','active') returning id`, [C, wh.id]);
ids.location = loc.id;
const [un] = await q(`select id from units where company_id = $1 and code = 'UN'`, [C]);
const prod = async (code, sku, name, lot, exp, ncm = "73181500") =>
  (await q(`insert into products (company_id, code, sku, barcode, name, unit, unit_id, ncm, weight, batch_controlled, expiration_controlled, status, cost_price, sale_price)
            values ($1,$2,$3,null,$4,'UN',$5,$6,0.5,$7,$8,'active',10,25) returning id`, [C, code, sku, name, un.id, ncm, lot, exp]))[0].id;
ids.p100 = await prod("P-100", "P-100", "Parafuso inox M8 (lote/validade)", true, true);
ids.p200 = await prod("P-200", "ALT-200", "Porca sextavada M8 (SKU alternativo)", false, false);
ids.mp01 = await prod("MP-01", "MP-01", "Chapa de aço 2mm", false, false, "72085100");
ids.pa01 = await prod("PA-01", "PA-01", "Suporte metálico montado", false, false, "73269090");
await q(`update products set production_type = 'manufactured' where id = $1`, [ids.pa01]);
ids.customer = (await q(`insert into customers (company_id, code, type, name, document, email, state, city, address, address_number, zip_code, status)
  values ($1,'CLI-001','company','Cliente Beta Comércio','22333444000181','compras@beta.test','SP','São Paulo','Av. Paulista','1000','01310100','active') returning id`, [C]))[0].id;
ids.supplier = (await q(`insert into suppliers (company_id, code, type, legal_name, trade_name, document, email, status)
  values ($1,'FOR-001','company','Fornecedor Gama Ltda','Gama','33444555000172','vendas@gama.test','active') returning id`, [C]))[0].id;
// Estrutura (BOM): PA-01 consome 2 un. de MP-01.
const [bom] = await q(`insert into product_boms (company_id, code, product_id, version, status, reference_quantity, unit_id) values ($1,'BOM-PA-01',$2,1,'active',1,$3) returning id`, [C, ids.pa01, un.id]);
await q(`insert into product_bom_items (company_id, bom_id, component_product_id, quantity, unit_id, sequence) values ($1,$2,$3,2,$4,1)`, [C, bom.id, ids.mp01, un.id]);
ids.bom = bom.id;
ids.unit = un.id;
// Estoque inicial (empresa ainda sem ORION): lote com validade para P-100.
const [lot] = await q(`insert into product_lots (company_id, product_id, lot_number, expires_at) values ($1,$2,'L2611-A','2027-06-30') returning id`, [C, ids.p100]);
// Entrada pelo caminho normal do ATLAS, como a admin da empresa (RLS/permissões valem).
await q("begin");
await q("set local role authenticated");
await q("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ role: "authenticated", sub: ids.admin_auth }), ids.admin_auth]);
await q(`select fn_receive_stock($1,$2,$3,120,$4,10,'saldo inicial QA','qa-seed-p100')`, [C, ids.p100, loc.id, lot.id]);
await q(`select fn_receive_stock($1,$2,$3,300,null,2,'saldo inicial QA','qa-seed-p200')`, [C, ids.p200, loc.id]);
await q(`select fn_receive_stock($1,$2,$3,50,null,30,'saldo inicial QA','qa-seed-mp01')`, [C, ids.mp01, loc.id]);
await q("commit");
await db.end();
writeFileSync(process.argv[2], JSON.stringify(stubUsers, null, 2));
console.log(JSON.stringify({ company: C, password: PASSWORD, ...ids }, null, 2));
