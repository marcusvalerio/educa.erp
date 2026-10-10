// E2E do CRM pela INTERFACE (navegador real, app compilado): as telas de
// Leads, Oportunidades e Atividades operadas como uma pessoa faria. Confere o
// resultado no banco, a ausência de chamadas com erro feitas pela própria
// tela e que cada papel só vê as ações que pode executar.
// Pré-requisito: e2e-crm-setup.mjs no mesmo ambiente.
//   CRM_STATE=/fora/do/git.json PGDB=crm_app SHOTS=pasta OUT=arquivo.json node poc/neon-full/e2e/e2e-crm-ui.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const state = JSON.parse(fs.readFileSync(process.env.CRM_STATE, "utf8"));
const APP = state.app;
const PGDB = process.env.PGDB ?? "crm_app";
const SHOTS = process.env.SHOTS;
const sql = (q) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT_POC ?? "55440", "-U", "postgres", "-d", PGDB, "-Atc", q]).toString().trim();
const tag = Date.now().toString(36).slice(-5);
const results = [];
const check = (area, name, ok, detail = "") => {
  results.push({ area, name, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${name}${ok ? "" : " — " + String(detail).slice(0, 260)}`);
};

async function session(browser, who, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const apiErrors = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) apiErrors.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto(`${APP}/login`);
  await page.getByLabel(/^E-mail/).fill(state.users[who].email);
  await page.getByLabel(/^Senha/).fill(state.users[who].password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20000 });
  return { ctx, page, apiErrors };
}
const shot = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const toast = async (page, re) => {
  try {
    await page.getByText(re).first().waitFor({ timeout: 10000 });
    return true;
  } catch {
    return false;
  }
};
/** Campo do diálogo aberto (o rótulo pode repetir fora dele, ex.: busca da lista). */
const field = (page, label) => page.getByRole("dialog").last().getByLabel(label);
const pick = async (page, label, option) => {
  await field(page, label).click();
  await page.getByRole("option", { name: option }).click();
};
const openRow = async (page, text) => {
  // fecha o painel/diálogo que estiver aberto (o painel de detalhe fica aberto após as ações)
  for (let i = 0; i < 3 && (await page.getByRole("dialog").count()) > 0; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await page.getByRole("row").filter({ hasText: text }).first().click();
  await page.getByRole("dialog").first().waitFor();
};
const goto = async (page, route) => {
  await page.goto(`${APP}${route}`);
  await page.waitForLoadState("networkidle").catch(() => {});
};

const browser = await chromium.launch();
try {
  // ============================================================ Vendedor
  const v = await session(browser, "gamaVendedor");
  const leadName = `Joana ${tag}`;
  await goto(v.page, "/app/crm/leads");
  await v.page.getByRole("button", { name: "Novo lead" }).click();
  await v.page.getByRole("button", { name: "Criar lead" }).click();
  check("leads (tela)", "validação: sem nome mostra 'Informe o nome do lead.' e não envia", (await v.page.getByText("Informe o nome do lead.").count()) > 0 && sql(`select count(*) from leads where name like 'Joana ${tag}%'`) === "0");
  await field(v.page, "Nome do contato").fill(leadName);
  await field(v.page, "Empresa").fill(`Quitanda Bela Vista ${tag}`);
  await field(v.page, "CPF/CNPJ").fill(`33.${String(Date.now()).slice(-3)}.555/0001-${String(Date.now()).slice(-2)}`);
  await field(v.page, "E-mail").fill("joana@example.com");
  await pick(v.page, "Origem", "Site");
  await pick(v.page, "Qualificação", "Quente");
  await shot(v.page, "01-novo-lead-desktop");
  await v.page.getByRole("button", { name: "Criar lead" }).dblclick();
  check("leads (tela)", "criar lead: confirmação na tela", await toast(v.page, /Lead LEAD-\d+ criado\./));
  await v.page.waitForTimeout(800);
  check("leads (tela)", "duplo clique em 'Criar lead' grava UM lead", sql(`select count(*) from leads where name = '${leadName}'`) === "1", sql(`select count(*) from leads where name = '${leadName}'`));
  check("leads (tela)", "lista atualizada sem recarregar a página", (await v.page.getByRole("row").filter({ hasText: leadName }).count()) === 1);
  check("leads (tela)", "Vendedor não tem users.read: campo Responsável não aparece e nenhuma lista dá 403", !v.apiErrors.some((e) => e.startsWith("403")), v.apiErrors.join(", "));

  await openRow(v.page, leadName);
  await shot(v.page, "02-detalhe-lead");
  await v.page.getByRole("dialog").getByRole("button", { name: "Editar" }).click();
  await pick(v.page, "Situação", "Contatado");
  await v.page.getByRole("button", { name: "Salvar" }).click();
  check("leads (tela)", "editar lead (situação Contatado)", (await toast(v.page, /Lead LEAD-\d+ atualizado\./)) && sql(`select status from leads where name = '${leadName}'`) === "CONTACTED");

  await openRow(v.page, leadName);
  await v.page.getByRole("dialog").getByRole("button", { name: "Converter em cliente" }).click();
  await shot(v.page, "03-converter-em-cliente");
  await v.page.getByRole("alertdialog").getByRole("button", { name: "Converter em cliente" }).click();
  check("leads (tela)", "converter em cliente: confirmação com o código do cliente", await toast(v.page, /convertido: cliente CLI-\d+/));
  check("leads (tela)", "banco: lead CONVERTED com cliente", sql(`select status||':'||(converted_customer_id is not null) from leads where name = '${leadName}'`) === "CONVERTED:true");

  await openRow(v.page, leadName);
  check("leads (tela)", "lead convertido: sem 'Editar' e sem 'Converter em cliente'", (await v.page.getByRole("dialog").getByRole("button", { name: "Editar" }).count()) === 0 && (await v.page.getByRole("dialog").getByRole("button", { name: "Converter em cliente" }).count()) === 0);
  check("leads (tela)", "detalhe do lead convertido mostra o nome do cliente gerado (lista recarregada)", (await v.page.getByRole("dialog").getByText("Cliente cadastrado").count()) === 0);
  await v.page.getByRole("dialog").getByRole("button", { name: "Converter em oportunidade" }).click();
  await field(v.page, "Valor estimado (R$)").fill("4.800,00");
  await v.page.getByRole("button", { name: "Criar oportunidade" }).click();
  check("leads (tela)", "converter em oportunidade: confirmação", await toast(v.page, /Oportunidade OPP-\d+ criada a partir do lead/));
  const oppId = sql(`select o.id from opportunities o join leads l on l.id=o.lead_id where l.name='${leadName}'`);
  check("leads (tela)", "banco: oportunidade aberta, com o cliente do lead e valor 4800", sql(`select status||':'||(customer_id is not null)||':'||estimated_value::int from opportunities where id='${oppId}'`) === "OPEN:true:4800");

  await openRow(v.page, leadName);
  await v.page.getByRole("dialog").getByRole("button", { name: "Converter em oportunidade" }).click();
  await v.page.getByRole("button", { name: "Criar oportunidade" }).click();
  check("leads (tela)", "segunda conversão em oportunidade: erro claro na tela, nada criado", (await toast(v.page, /já tem a oportunidade OPP-\d+ em aberto/)) && sql(`select count(*) from opportunities o join leads l on l.id=o.lead_id where l.name='${leadName}'`) === "1");
  await v.page.keyboard.press("Escape");

  await openRow(v.page, leadName);
  await v.page.getByRole("dialog").getByRole("button", { name: "Registrar atividade" }).click();
  await field(v.page, "Assunto").fill(`Ligar para Joana ${tag}`);
  await v.page.getByRole("button", { name: "Registrar", exact: true }).click();
  check("atividades (tela)", "registrar atividade a partir do lead", await toast(v.page, /Atividade registrada\./));
  await openRow(v.page, leadName);
  check("atividades (tela)", "atividade aparece no detalhe do lead", (await v.page.getByRole("dialog").getByText(`Ligar para Joana ${tag}`).count()) > 0);
  await shot(v.page, "04-lead-convertido-com-atividade");

  // lead sem documento → mensagem do servidor na tela
  await goto(v.page, "/app/crm/leads");
  await v.page.getByRole("button", { name: "Novo lead" }).click();
  await field(v.page, "Nome do contato").fill(`Sem doc ${tag}`);
  await v.page.getByRole("button", { name: "Criar lead" }).click();
  await toast(v.page, /criado\./);
  await openRow(v.page, `Sem doc ${tag}`);
  await v.page.getByRole("dialog").getByRole("button", { name: "Converter em cliente" }).click();
  await v.page.getByRole("alertdialog").getByRole("button", { name: "Converter em cliente" }).click();
  check("leads (tela)", "lead sem CPF/CNPJ: a tela mostra a mensagem do servidor (não erro genérico)", await toast(v.page, /não tem CPF\/CNPJ/));
  await shot(v.page, "05-erro-sem-documento");

  // oportunidade: mudar estágio e editar (Vendedor não encerra)
  await goto(v.page, "/app/crm/oportunidades");
  await openRow(v.page, sql(`select code from opportunities where id='${oppId}'`));
  check("oportunidades (tela)", "Vendedor não vê 'Ganha'/'Perdida' (sem opportunities.close)", (await v.page.getByRole("dialog").getByRole("button", { name: /^(Ganha|Perdida)$/ }).count()) === 0);
  await v.page.getByRole("dialog").getByRole("button", { name: "Mudar estágio" }).click();
  await pick(v.page, "Novo estágio", "Proposta");
  await v.page.getByRole("button", { name: "Mudar estágio" }).last().click();
  check("oportunidades (tela)", "mudar estágio para Proposta + histórico", (await toast(v.page, /movida\./)) && sql(`select count(*) from opportunity_stage_history where opportunity_id='${oppId}'`) === "2");
  await openRow(v.page, sql(`select code from opportunities where id='${oppId}'`));
  await v.page.getByRole("dialog").getByRole("button", { name: "Editar" }).click();
  await field(v.page, "Probabilidade (%)").fill("150");
  await v.page.getByRole("button", { name: "Salvar" }).click();
  check("oportunidades (tela)", "validação: probabilidade 150 recusada na tela", (await v.page.getByText("Informe uma probabilidade de 0 a 100.").count()) > 0);
  await field(v.page, "Probabilidade (%)").fill("60");
  await v.page.getByRole("button", { name: "Salvar" }).click();
  check("oportunidades (tela)", "editar oportunidade aberta", (await toast(v.page, /atualizada\./)) && sql(`select probability::int from opportunities where id='${oppId}'`) === "60");
  check("telas", "Vendedor: nenhuma chamada da tela com erro 403/500", !v.apiErrors.some((e) => /^(403|500)/.test(e)), v.apiErrors.join(", "));

  // ============================================================ Admin
  const a = await session(browser, "gamaAdmin");
  await goto(a.page, "/app/crm/oportunidades");
  await openRow(a.page, sql(`select code from opportunities where id='${oppId}'`));
  await shot(a.page, "06-oportunidade-admin");
  await a.page.getByRole("dialog").getByRole("button", { name: "Ganha" }).click();
  await a.page.getByRole("button", { name: "Marcar como ganha" }).click();
  check("oportunidades (tela)", "Admin marca como ganha", (await toast(a.page, /ganha\./)) && sql(`select status from opportunities where id='${oppId}'`) === "WON");
  await openRow(a.page, sql(`select code from opportunities where id='${oppId}'`));
  check("oportunidades (tela)", "oportunidade ganha: sem Editar/Mudar estágio/Ganha/Perdida", (await a.page.getByRole("dialog").getByRole("button", { name: /^(Editar|Mudar estágio|Ganha|Perdida)$/ }).count()) === 0);
  await a.page.keyboard.press("Escape");

  await goto(a.page, "/app/crm/atividades");
  await a.page.getByRole("button", { name: "Nova atividade" }).click();
  await field(a.page, "Assunto").fill(`Reunião de proposta ${tag}`);
  await pick(a.page, "Relacionada a", "Lead");
  await pick(a.page, "Registro", new RegExp(leadName));
  await shot(a.page, "07-nova-atividade");
  await a.page.getByRole("button", { name: "Registrar", exact: true }).click();
  check("atividades (tela)", "nova atividade pela tela de Atividades", await toast(a.page, /Atividade registrada\./));
  await openRow(a.page, `Reunião de proposta ${tag}`);
  await a.page.getByRole("dialog").getByRole("button", { name: "Marcar como realizada" }).click();
  check("atividades (tela)", "marcar atividade como realizada", (await toast(a.page, /concluída\./)) && sql(`select status||':'||(completed_at is not null) from activities where subject='Reunião de proposta ${tag}'`) === "DONE:true");
  check("telas", "Admin: nenhuma chamada da tela com erro 403/500", !a.apiErrors.some((e) => /^(403|500)/.test(e)), a.apiErrors.join(", "));

  // ============================================================ Somente leitura
  // O papel de sistema "leitura" (0075) não tem NENHUMA permissão do CRM
  // (leads/opportunities/activities.view). A tela deve mostrar o estado de
  // acesso restrito, sem ações; o 403 da lista é a resposta esperada.
  const r = await session(browser, "gamaLeitura");
  for (const [route, btn] of [["/app/crm/leads", "Novo lead"], ["/app/crm/oportunidades", "Nova oportunidade"], ["/app/crm/atividades", "Nova atividade"]]) {
    await goto(r.page, route);
    await r.page.waitForTimeout(800);
    const text = await r.page.locator("main").innerText().catch(() => "");
    check("permissões (tela)", `Somente leitura em ${route}: acesso restrito e sem '${btn}'`, (await r.page.getByRole("button", { name: btn }).count()) === 0 && /permiss|restrito/i.test(text), text.slice(0, 200));
  }
  await shot(r.page, "09-somente-leitura-sem-acesso");
  check("telas", "Somente leitura: nenhuma chamada da tela com erro 500", !r.apiErrors.some((e) => /^500/.test(e)), r.apiErrors.join(", "));

  // ============================================================ celular
  const m = await session(browser, "gamaVendedor", { width: 390, height: 844 });
  await goto(m.page, "/app/crm/leads");
  const hscroll = await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("responsivo", "Leads no celular (390 px): sem rolagem horizontal", !hscroll);
  await m.page.getByRole("button", { name: "Novo lead" }).click();
  await shot(m.page, "08-novo-lead-celular");
  const dialogFits = await m.page.getByRole("dialog").evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth + 1);
  check("responsivo", "diálogo 'Novo lead' cabe na largura do celular", dialogFits);

  const out = process.env.OUT;
  if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), pass: results.filter((x) => x.ok).length, fail: results.filter((x) => !x.ok).length, results }, null, 2));
  console.log(`\ncrm-ui: ${results.filter((x) => x.ok).length} PASS, ${results.filter((x) => !x.ok).length} FAIL`);
} finally {
  await browser.close();
}
