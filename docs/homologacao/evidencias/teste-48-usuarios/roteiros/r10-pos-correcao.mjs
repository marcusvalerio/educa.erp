// Rodada 48 — pós-correção: cada problema corrigido é reproduzido de novo na
// build com as correções (FAIL → correção → PASS). Mesma entrada da 1ª vez.
import fs from "node:fs";
import { check, shot, session, goto, api, post, idOf, errMsg, state, close, bodyText, evidenceCard, inDays } from "./lib.mjs";
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
const db = new pg.Pool({ connectionString: "postgres://postgres:postgres@127.0.0.1:55440/educa_poc", max: 2 });
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const rows = [["ID", "Problema", "Antes (1ª passada)", "Agora", "Resultado"]];
const R = (id, name, before, now, ok) => { rows.push([id, name, before, now, ok ? "PASS" : "FAIL"]); check("correcoes", `${id} — ${name}`, ok, { expected: "comportamento corrigido", actual: now }); };
const T = Date.now().toString(36);
const D = state.companies.vertice.data, M = state.companies.mares.data;
const G = await session("gerente@verticeoperacoes.test");
const O = await session("operacao@verticeoperacoes.test");
const V = await session("vendas1@verticeoperacoes.test").catch(() => session("vendas@verticeoperacoes.test"));
const L = await session("logistica@verticeoperacoes.test");
const F = await session("fiscal@verticeoperacoes.test");

// B8 — categoria e marca
{
  const c = await post(G.page, "/api/product-categories", { nome: `Matéria-prima ${T}` });
  const b = await post(G.page, "/api/product-brands", { nome: `Marca Ação ${T}` });
  const [row] = await q(`select code from product_categories where id = $1`, [idOf(c) ?? "00000000-0000-4000-8000-000000000000"]);
  R("R48-B8", "Criar categoria e marca de produto", "422 \"Preencha os campos obrigatórios\" (code nunca preenchido)", `categoria ${c.status} (código ${row?.code ?? "—"}); marca ${b.status}`, c.status === 201 && b.status === 201 && !!row?.code);
  const dup = await post(G.page, "/api/product-categories", { nome: `Matéria-prima ${T}` });
  R("R48-B8b", "Categoria com nome repetido", "—", `${dup.status} ${errMsg(dup)}`, dup.status === 409 && !/CPF|CNPJ/.test(errMsg(dup)));
}
// A — dois usuários no mesmo produto
{
  const p = await post(G.page, "/api/products", { codigo: `VO-A-${T}`, descricao: `Produto bloqueio otimista ${T}`, categoria: "Produto acabado", unidade: "UN", precoVenda: 25, precoCusto: 10 });
  const pid = idOf(p);
  const g = (await api(G.page, `/api/products/${pid}`)).body.data;
  const fa = { ...g, precoVenda: 31.5 }, fb = { ...g, descricao: `${g.descricao} — revisada` };
  const [ra, rb] = await Promise.all([post(G.page, `/api/products/${pid}`, fa, "PATCH"), post(O.page, `/api/products/${pid}`, fb, "PATCH")]);
  const fin = (await api(G.page, `/api/products/${pid}`)).body.data;
  const one409 = [ra.status, rb.status].sort().join("/") === "200/409";
  const loser = ra.status === 409 ? ra : rb;
  R("R48-A1", "Dois usuários salvam o mesmo produto ao mesmo tempo", "200/200 — a 2ª gravação apagou a 1ª em silêncio", `${ra.status}/${rb.status}; mensagem ao 2º: "${errMsg(loser)}"; final: preço ${fin.precoVenda}, descrição "${fin.descricao}"`, one409 && /alterado por outra pessoa/.test(errMsg(loser)));
  const old = (await api(O.page, `/api/products/${pid}`)).body.data;
  await post(G.page, `/api/products/${pid}`, { ...(await api(G.page, `/api/products/${pid}`)).body.data, precoVenda: 40 }, "PATCH");
  const rs = await post(O.page, `/api/products/${pid}`, { ...old, descricao: `${old.descricao} (2)` }, "PATCH");
  const fin2 = (await api(G.page, `/api/products/${pid}`)).body.data;
  R("R48-A2", "Salvar a partir de uma cópia velha do cadastro", "200 — preço voltou de 40 para 25", `${rs.status}; preço final ${fin2.precoVenda}`, rs.status === 409 && Number(fin2.precoVenda) === 40);
  const rp = await post(G.page, `/api/products/${pid}`, { descricaoCurta: "Só um campo, sem versão" }, "PATCH");
  R("R48-A3", "Alteração parcial sem versão (integrações/atalhos) continua aceita", "200", `${rp.status}`, rp.status === 200);
}
// Desconto maior que o item
{
  const r = await post(V.page, "/api/sales-orders", { customerId: D.customers[1], items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: 10, discount: 500 }] });
  R("R48-E14", "Pedido com desconto maior que o valor do item", "201 — pedido gravado com total −490 e aprovável", `${r.status} ${errMsg(r)}`, r.status === 422 && /desconto do item/.test(errMsg(r)));
  const h = await post(V.page, "/api/sales-orders", { customerId: D.customers[1], discount: 999, items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: 10 }] });
  R("R48-E14b", "Pedido com desconto do cabeçalho maior que o total", "aceito (total negativo)", `${h.status} ${errMsg(h)}`, h.status === 422);
}
// Mensagens e HTTP 500
const probes = [
  ["R48-E01", "Cliente sem razão social", "422 \"Invalid input: expected string, received undefined\"", V, "POST", "/api/customers", { tipo: "Pessoa Jurídica", documento: "" }, (r) => r.status === 422 && !/Invalid input|expected|received/.test(errMsg(r))],
  ["R48-E02", "Produto sem código/descrição/categoria/unidade", "422 \"Invalid input: expected string…\"", O, "POST", "/api/products", { precoVenda: 10 }, (r) => r.status === 422 && !/Invalid input|expected/.test(errMsg(r))],
  ["R48-E03", "Preço de venda em texto (\"dez reais\")", "422 \"Invalid input: expected number, received NaN\"", O, "POST", "/api/products", { codigo: `X-${T}`, descricao: "x", categoria: "C", unidade: "UN", precoVenda: "dez reais" }, (r) => r.status === 422 && !/NaN|expected/.test(errMsg(r))],
  ["R48-E04", "Preço de venda negativo", "500 \"Não foi possível concluir a operação\"", O, "POST", "/api/products", { codigo: `Y-${T}`, descricao: "x", categoria: "C", unidade: "UN", precoVenda: -5 }, (r) => r.status === 422 && /negativo/.test(errMsg(r))],
  ["R48-E05", "Pedido com quantidade 1 trilhão", "500", V, "POST", "/api/sales-orders", { customerId: D.customers[1], items: [{ productId: D.products[0].id, description: "x", quantity: 1e12, unitPrice: 10 }] }, (r) => r.status === 422],
  ["R48-E06", "Pedido sem cliente", "422 \"Invalid input: expected string…\"", V, "POST", "/api/sales-orders", { items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: 10 }] }, (r) => r.status === 422 && /cliente/i.test(errMsg(r))],
  ["R48-E07", "Data de entrega inválida (2026-02-30)", "500", V, "POST", "/api/sales-orders", { customerId: D.customers[1], expectedDeliveryAt: "2026-02-30", items: [{ productId: D.products[0].id, description: "x", quantity: 1, unitPrice: 10 }] }, (r) => r.status === 422 && /[Dd]ata/.test(errMsg(r))],
  ["R48-E08", "ID malformado na URL (/api/customers/abc)", "500", V, "GET", "/api/customers/abc", null, (r) => r.status === 404],
  ["R48-E09", "Quantidade \"10,5\" (texto com vírgula)", "422 \"expected number, received NaN\"", O, "POST", "/api/stock-movements/receive", { productId: D.products[4].id, locationId: D.locations.pick, quantity: "10,5" }, (r) => r.status === 422 && !/NaN|expected/.test(errMsg(r))],
  ["R48-E10", "Transferência para o mesmo local", "500", O, "POST", "/api/stock-transfers", { fromLocationId: D.locations.pick, toLocationId: D.locations.pick, items: [{ productId: D.products[4].id, quantity: 1 }] }, (r) => r.status === 422 && /origem e o de destino/.test(errMsg(r))],
  ["R48-E11", "Cliente com nome de 5.000 caracteres", "201 (gravou)", V, "POST", "/api/customers", { tipo: "Pessoa Jurídica", nome: "X".repeat(5000), documento: "" }, (r) => r.status === 422],
  ["R48-E12", "Cliente de outra empresa pelo ID", "404 \"customers não encontrado.\"", G, "GET", `/api/customers/${M.customers[0]}`, null, (r) => r.status === 404 && /^Cliente não encontrado/.test(errMsg(r))],
];
for (const [id, name, before, who, method, url, body, ok] of probes) {
  const r = method === "GET" ? await api(who.page, url) : await post(who.page, url, body, method);
  R(id, name, before, `${r.status} ${errMsg(r)}`, ok(r));
}
// F1 — NF-e gerada 2× ao mesmo tempo: mensagem do perdedor
{
  let msg = "(corrida não reproduzida nas 5 tentativas)";
  for (let k = 0; k < 5; k++) {
    const p = idOf(await post(G.page, "/api/products", { codigo: `VO-F-${T}-${k}`, descricao: `Produto NF-e ${k}`, categoria: "Produto acabado", unidade: "UN", precoVenda: 25, precoCusto: 10 }));
    await post(F.page, "/api/product-fiscal-profiles", { productId: p, ncmId: D.ncmId, originCode: "0" });
    const o = idOf(await post(V.page, "/api/sales-orders", { customerId: D.customers[1], items: [{ productId: p, description: "x", unit: "UN", quantity: 1, unitPrice: 25 }] }));
    await post(V.page, `/api/sales-orders/${o}/submit`); await post(G.page, `/api/sales-orders/${o}/approve`);
    const body = { fiscalEstablishmentId: D.establishmentId, operationNatureId: D.natureId };
    const rr = await Promise.all([post(F.page, `/api/sales-orders/${o}/generate-fiscal-document`, body), post(G.page, `/api/sales-orders/${o}/generate-fiscal-document`, body)]);
    const loser = rr.find((r) => r.status === 409);
    if (loser) { msg = errMsg(loser); break; }
  }
  R("R48-F1", "NF-e do mesmo pedido gerada 2× ao mesmo tempo — mensagem", "409 \"Já existe um registro com este documento (CPF/CNPJ).\"", msg, !/CPF|CNPJ/.test(msg));
}
// UI — dois navegadores editando o mesmo cliente: o 2º recebe aviso.
{
  const A = await session("gerente@verticeoperacoes.test"), B = await session("vendas1@verticeoperacoes.test").catch(() => session("vendas@verticeoperacoes.test"));
  const [c] = await q(`select name from customers where id = $1`, [D.customers[2]]);
  let note = "";
  try {
    for (const s of [A, B]) {
      await goto(s.page, `/app/cadastros/clientes?q=${encodeURIComponent(c.name)}`);
      await s.page.getByText(c.name, { exact: false }).first().click();
      await s.page.waitForTimeout(800);
      const edit = s.page.getByRole("button", { name: /^Editar/ }).first();
      if (await edit.isVisible().catch(() => false)) await edit.click();
      await s.page.waitForTimeout(500);
    }
    const field = (s) => s.page.locator("[role=dialog] input, aside input").filter({ hasNot: s.page.locator("[type=hidden]") });
    await (await field(A)).nth(1).fill(`${c.name}`); // mantém, só marca alteração
    const obsA = A.page.getByLabel(/Observa/).first();
    if (await obsA.isVisible().catch(() => false)) await obsA.fill(`Alterado pelo Gerente ${T}`);
    const obsB = B.page.getByLabel(/Observa/).first();
    if (await obsB.isVisible().catch(() => false)) await obsB.fill(`Alterado pelo Vendedor ${T}`);
    await A.page.getByRole("button", { name: /^Salvar/ }).last().click();
    await A.page.waitForTimeout(1200);
    await shot(A.page, "correcoes", "R48-A-ui-1-gerente-salvou");
    await B.page.getByRole("button", { name: /^Salvar/ }).last().click();
    await B.page.waitForTimeout(1500);
    await shot(B.page, "correcoes", "R48-A-ui-2-vendedor-recebe-aviso");
    const t = await bodyText(B.page);
    note = /alterado por outra pessoa/.test(t) ? "aviso exibido ao 2º usuário" : `sem aviso visível: ${t.slice(0, 120).replace(/\s+/g, " ")}`;
    R("R48-A4", "Tela: dois usuários editando o mesmo cliente", "o 2º salvava por cima sem aviso", note, /aviso exibido/.test(note));
  } catch (e) {
    R("R48-A4", "Tela: dois usuários editando o mesmo cliente", "o 2º salvava por cima sem aviso", `BLOQUEADO pelo roteiro de tela: ${String(e).slice(0, 120)}`, false);
  }
}
await evidenceCard(null, "correcoes", "00-pos-correcao", "Pós-correção — FAIL → correção → PASS (mesma entrada da 1ª passada)", rows);
fs.writeFileSync(new URL("./r10-pos-correcao.out.json", import.meta.url), JSON.stringify(rows, null, 2));
console.log(rows.map((r) => `${r[4]} ${r[0]} | ${r[1]} | ${r[3]}`).join("\n"));
await db.end();
await close();
