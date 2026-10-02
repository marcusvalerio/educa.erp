// Referência: roda no workspace do teste de 7 empresas (harness ../e2e7/lib.mjs e
// ../e2e-7-empresas/state.json, não versionados) contra o stack local de homologação.
// Senhas só por variáveis de ambiente (E2E7_PASSWORD, HOMOLOG_PASSWORD).
// Capturas reais do product tour (empresa demo Órbita Distribuidora), em
// 1600×900 com deviceScaleFactor 2 (3200×1800) — nitidez para os zooms.
// A história do pedido PV (do orçamento aprovado) é EXECUTADA aqui: cada
// ação de interface que existe é clicada de verdade e fotografada antes e
// depois; o que só existe pela API (separação, expedição, NF-e,
// recebimento) é executado pela API com o usuário do papel e o resultado é
// fotografado na tela real. O selo de homologação do app é ocultado só na
// captura; o vídeo leva um aviso fixo "ambiente de demonstração".
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import("playwright");

const APP = "http://localhost:3200";
const PASS = process.env.E2E7_PASSWORD, OWNER_PASS = process.env.HOMOLOG_PASSWORD;
const OUT = path.resolve("shots");
fs.mkdirSync(OUT, { recursive: true });
const T = JSON.parse(fs.readFileSync("tour-state.json", "utf8"));
const st = JSON.parse(fs.readFileSync("../e2e-7-empresas/state.json", "utf8")).companies;
const D = st.orbita.data;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const run = (k) => !ONLY || ONLY.includes(k);
const order = T.storyOrder.id;
const log = [];

const browser = await chromium.launch();
const ctxs = {};
async function as(email, pass = PASS) {
  if (ctxs[email]) return ctxs[email];
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "light" });
  await ctx.addInitScript(() => { try { localStorage.setItem("educa-erp-theme-preference", "light"); } catch {} });
  const p = await ctx.newPage();
  p.setDefaultTimeout(20000);
  await p.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await p.getByLabel(/^E-mail/).fill(email);
  await p.getByLabel(/^Senha/).fill(pass);
  await p.getByRole("button", { name: "Entrar" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await p.waitForLoadState("networkidle");
  return (ctxs[email] = p);
}
const U = (who) => `${who}@orbitadistribuidora.test`;
async function go(p, route) {
  await p.goto(`${APP}${route}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1100);
}
async function clean(p) {
  await p.evaluate(() => {
    for (const el of document.querySelectorAll("body *")) {
      const t = el.textContent?.trim();
      if (t && /^HOMOLOGAÇÃO\s*·\s*DADOS FICTÍCIOS$/i.test(t) && getComputedStyle(el).position === "fixed") el.style.display = "none";
    }
    document.querySelectorAll("[data-sonner-toaster], [role=status]").forEach(() => {});
  });
}
async function shot(p, name, note = "") {
  await clean(p);
  await p.waitForTimeout(250);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  log.push({ name, url: new URL(p.url()).pathname.replace(/[0-9a-f-]{36}/g, ":id"), note });
  console.log("ok", name);
}
async function scrollTo(p, y) {
  await p.evaluate((y) => {
    const el = [...document.querySelectorAll("*")].find((e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(e).overflowY));
    (el ?? document.scrollingElement).scrollTop = y;
  }, y);
  await p.waitForTimeout(500);
}
const apiPost = (p, url, body = {}) => p.evaluate(async ([u, b]) => { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => null) }; }, [url, body]);
const apiGet = (p, url) => p.evaluate(async (u) => (await (await fetch(u)).json()).data, url);
async function confirmDialog(p, label) {
  const d = p.getByRole("alertdialog").or(p.getByRole("dialog")).last();
  await d.waitFor();
  return d.getByRole("button", { name: label }).last();
}

// ============================================================ Administração Central (Owner)
if (run("central")) {
  const o = await as("owner@atlaserp.test", OWNER_PASS);
  await go(o, "/app/admincentral");
  await shot(o, "c00-central-visao-geral");
  await go(o, "/app/admincentral/companies");
  await shot(o, "c01-central-empresas");
  await o.getByText("Órbita Distribuidora", { exact: true }).first().click();
  await o.waitForTimeout(1300);
  await shot(o, "c02-central-empresa-detalhe");
  await o.keyboard.press("Escape");
  await go(o, "/app/admincentral/modules");
  await shot(o, "c03-central-modulos");
  await go(o, "/app/admincentral/platform-members");
  await shot(o, "c04-central-membros");
}

// ============================================================ Empresa, usuários, papéis
if (run("admin")) {
  const a = await as(U("admin"));
  await go(a, "/app/admin");
  await shot(a, "a00-admin-visao-geral");
  await go(a, "/app/admin/users");
  await shot(a, "a01-usuarios");
  await a.getByRole("button", { name: "Convidar usuário" }).click();
  await a.waitForTimeout(700);
  await a.getByRole("dialog").getByRole("combobox", { name: "Papel" }).click();
  await a.waitForTimeout(600);
  await shot(a, "a02-convite-papeis");
  await a.keyboard.press("Escape"); await a.keyboard.press("Escape");
  await go(a, "/app/admin/roles");
  const lst = a.getByRole("listbox", { name: "Papéis" });
  await lst.getByText("Logística", { exact: true }).click();
  await a.waitForTimeout(900);
  await shot(a, "a03-papel-logistica");
  // Aplicar uma permissão (sem salvar): marca e fotografa; depois descarta.
  const filt = a.getByLabel("Filtrar permissões");
  await filt.fill("customers");
  await a.waitForTimeout(700);
  await shot(a, "a04-papel-filtro");
  const box = a.locator("table [role=checkbox][data-state=unchecked], table input[type=checkbox]:not(:checked)").first();
  if (await box.count()) { await box.click(); await a.waitForTimeout(500); }
  await shot(a, "a05-permissao-aplicada", "marcada sem salvar; descartada em seguida");
  const disc = a.getByRole("button", { name: "Descartar" });
  if (await disc.isEnabled().catch(() => false)) await disc.click();
}
if (run("bloqueio")) {
  const v = await as(U("comercial"));
  await go(v, "/app/financeiro/contas-pagar");
  await shot(v, "b01-vendedor-acesso-restrito");
}

// ============================================================ Cadastros
if (run("cadastros")) {
  const g = await as(U("gerencia"));
  await go(g, "/app/cadastros/clientes");
  await shot(g, "k01-clientes");
  await g.locator("table tbody tr").nth(2).click();
  await g.waitForTimeout(1100);
  await shot(g, "k02-cliente-detalhe");
  await g.keyboard.press("Escape");
  await go(g, "/app/cadastros/fornecedores");
  await shot(g, "k03-fornecedores");
  await go(g, "/app/cadastros/produtos");
  await shot(g, "k04-produtos");
  await g.locator("table tbody tr").nth(1).click();
  await g.waitForTimeout(1100);
  await shot(g, "k05-produto-detalhe");
  await g.keyboard.press("Escape");
  await go(g, "/app/cadastros/locais-estoque");
  await shot(g, "k06-locais");
  await go(g, "/app/fiscal/ncm");
  await shot(g, "k07-ncm");
  await go(g, "/app/fiscal/cfop");
  await shot(g, "k08-cfop");
}

// ============================================================ Comercial + história do pedido (ações reais)
if (run("historia")) {
  const v = await as(U("comercial"));
  await go(v, "/app/comercial/orcamentos");
  await shot(v, "m01-orcamentos");
  await go(v, "/app/comercial/pedidos-venda");
  await shot(v, "m02-pedidos");
  await go(v, `/app/comercial/pedidos-venda/${order}`);
  await shot(v, "s01-pedido-rascunho");
  await v.getByRole("button", { name: "Enviar para aprovação" }).first().click();
  await v.waitForTimeout(600);
  await shot(v, "s02-enviar-dialogo");
  await (await confirmDialog(v, "Enviar para aprovação")).click();
  await v.waitForTimeout(1600);
  await shot(v, "s03-aguardando-aprovacao");

  const g = await as(U("gerencia"));
  await go(g, `/app/comercial/pedidos-venda/${order}`);
  await g.getByRole("button", { name: "Aprovar" }).first().click();
  await g.waitForTimeout(600);
  await shot(g, "s04-aprovar-dialogo");
  await (await confirmDialog(g, "Aprovar")).click();
  await g.waitForTimeout(1600);
  await shot(g, "s05-aprovado");

  const o = await as(U("operacao"));
  await go(o, `/app/comercial/pedidos-venda/${order}`);
  await o.getByRole("button", { name: /Reservar estoque/ }).first().click();
  const d = o.getByRole("dialog").last();
  await d.getByRole("combobox").first().click();
  await o.waitForTimeout(500);
  await o.getByRole("option", { name: /Picking/ }).first().click();
  await o.waitForTimeout(400);
  await shot(o, "s06-reservar-dialogo");
  await d.getByRole("button", { name: "Reservar" }).click();
  await o.waitForTimeout(2200);
  await shot(o, "s07-reservado");

  const f = await as(U("financeiro"));
  await go(f, `/app/comercial/pedidos-venda/${order}`);
  await f.getByRole("button", { name: "Gerar conta a receber" }).first().click();
  await f.waitForTimeout(600);
  await shot(f, "s08-gerar-receber-dialogo");
  await (await confirmDialog(f, "Gerar conta a receber")).click();
  await f.waitForTimeout(1800);
  await scrollTo(f, 900);
  await shot(f, "s09-financeiro-do-pedido");
  await go(f, "/app/financeiro/contas-receber");
  await shot(f, "s10-contas-receber-aberto");

  // Separação e expedição (pela API, Logística; aprovação da expedição pelo Gerente).
  const l = await as(U("logistica"));
  const pl = await apiPost(l, `/api/sales-orders/${order}/pick-lists`, { warehouseId: D.warehouseId, notes: "Separação do pedido" });
  const plId = pl.body?.data?.id;
  await apiPost(l, `/api/pick-lists/${plId}/start`);
  await go(l, "/app/logistica/picking");
  await shot(l, "s11-separacao-em-andamento");
  const full = await apiGet(l, `/api/pick-lists/${plId}`);
  for (const it of full?.items ?? []) await apiPost(l, `/api/pick-lists/${plId}/items/${it.id}/pick`, { pickedQuantity: Number(it.requested_quantity ?? 0) });
  await apiPost(l, `/api/pick-lists/${plId}/complete`);
  await go(l, "/app/logistica/picking");
  await shot(l, "s12-separacao-concluida");
  const so = await apiGet(l, `/api/sales-orders/${order}`);
  const items = (so?.items ?? []).map((x) => ({ salesOrderItemId: x.id, locationId: D.locations.pick, quantity: Number(x.ordered_quantity) }));
  const sh = await apiPost(l, `/api/sales-orders/${order}/shipments`, { warehouseId: D.warehouseId, pickListId: plId, expectedShipDate: new Date(Date.now() + 864e5).toISOString().slice(0, 10), notes: "Expedição do pedido", items });
  const shId = sh.body?.data?.id;
  await apiPost(l, `/api/shipments/${shId}/packages`, { packageNumber: 1, weight: 18.4, trackingCode: "OD-TRK-0223" });
  await apiPost(l, `/api/shipments/${shId}/ready`);
  await apiPost(l, `/api/shipments/${shId}/pack`);
  await go(l, "/app/logistica/expedicao");
  await shot(l, "s13-expedicao-embalada");
  await apiPost(g, `/api/shipments/${shId}/approve`);
  await apiPost(l, `/api/shipments/${shId}/ship`, { idempotencyKey: `tour-ship-${shId}` });
  await go(l, "/app/logistica/expedicao");
  await shot(l, "s14-expedicao-expedida");
  await apiPost(l, `/api/shipments/${shId}/deliver`, { recipientName: "Recebedor do cliente", podType: "signature" });
  await go(l, "/app/logistica/expedicao");
  await shot(l, "s15-expedicao-entregue");
  await go(g, `/app/comercial/pedidos-venda/${order}`);
  await shot(g, "s16-pedido-expedido");
  await scrollTo(g, 900);
  await shot(g, "s17-pedido-expedicoes-financeiro");

  // NF-e (pela API, Fiscal): gerar → calcular → pronta. Autorização SEFAZ fora do ambiente.
  const fi = await as(U("fiscal"));
  const gen = await apiPost(fi, `/api/sales-orders/${order}/generate-fiscal-document`, { fiscalEstablishmentId: D.establishmentId, operationNatureId: D.natureId, notes: "NF-e do pedido" });
  const docId = gen.body?.data?.id;
  await go(fi, "/app/fiscal/notas-fiscais");
  await shot(fi, "s18-nfe-gerada");
  await apiPost(fi, `/api/fiscal-documents/${docId}/calculate`);
  await go(fi, "/app/fiscal/notas-fiscais");
  await shot(fi, "s19-nfe-calculada");
  await apiPost(fi, `/api/fiscal-documents/${docId}/ready`);
  await go(fi, "/app/fiscal/notas-fiscais");
  await shot(fi, "s20-nfe-pronta");
  await go(fi, "/app/fiscal");
  await shot(fi, "s21-fiscal-painel");

  // Recebimento (pela API, Financeiro).
  const ars = await apiGet(f, "/api/accounts-receivable");
  const ar = (ars ?? []).find((x) => x.origin_id === order) ?? ars?.[0];
  const arFull = await apiGet(f, `/api/accounts-receivable/${ar.id}`);
  for (const inst of arFull?.installments ?? []) await apiPost(f, `/api/accounts-receivable-installments/${inst.id}/receive`, { financialAccountId: D.bankId, amount: Number(inst.amount), method: "PIX", idempotencyKey: `tour-rec-${inst.id}` });
  await go(f, "/app/financeiro/contas-receber");
  await shot(f, "s22-contas-receber-recebido");
  fs.writeFileSync("tour-story.json", JSON.stringify({ plId, shId, docId, arId: ar.id }, null, 2));
}

// ============================================================ Estoque / Compras / Financeiro
if (run("modulos")) {
  const g = await as(U("gerencia"));
  for (const [n, r] of [["e01-estoque-saldos", "/app/logistica/estoque"], ["e02-movimentacoes", "/app/logistica/movimentacoes"], ["e03-recebimento", "/app/logistica/recebimento"], ["e04-separacao", "/app/logistica/picking"], ["e05-expedicao", "/app/logistica/expedicao"],
    ["p01-solicitacoes", "/app/suprimentos/solicitacao-compra"], ["p02-pedidos-compra", "/app/suprimentos/pedidos-compra"], ["f01-contas-receber", "/app/financeiro/contas-receber"], ["f02-contas-pagar", "/app/financeiro/contas-pagar"], ["f03-fluxo-caixa", "/app/financeiro/fluxo-caixa"], ["f04-financeiro", "/app/financeiro"]]) {
    await go(g, r);
    await shot(g, n);
  }
  await go(g, "/app/suprimentos/pedidos-compra");
  await g.locator("table tbody tr").first().click();
  await g.waitForTimeout(1100);
  await shot(g, "p03-pedido-compra-detalhe");
  await g.keyboard.press("Escape");
}

// ============================================================ Auditoria, dashboard, multiempresa
if (run("final")) {
  const a = await as(U("admin"));
  await go(a, "/app/admin/audit");
  await shot(a, "u01-auditoria");
  const g = await as(U("gerencia"));
  await go(g, "/app");
  const btn = g.getByRole("button", { name: "Últimos 30 dias" }).or(g.getByRole("tab", { name: "Últimos 30 dias" })).or(g.getByRole("radio", { name: "Últimos 30 dias" }));
  if (await btn.count()) { await btn.first().click(); await g.waitForTimeout(1600); }
  await shot(g, "d01-dashboard");
  await scrollTo(g, 760);
  await shot(g, "d02-dashboard-fluxo");
  await scrollTo(g, 1500);
  await shot(g, "d03-dashboard-graficos");
  await go(g, "/app/gestao/dashboard");
  await shot(g, "d04-painel-executivo");
  for (const k of ["aster", "vita", "horizon", "lumen"]) {
    const p = await as(`gerencia@${{ aster: "asterindustrial", vita: "vitasuprimentos", horizon: "horizonservicos", lumen: "lumentecnologia" }[k]}.test`);
    await go(p, "/app");
    await shot(p, `x-${k}-dashboard`);
  }
}

fs.writeFileSync("shots-log.json", JSON.stringify(log, null, 2));
await browser.close();
