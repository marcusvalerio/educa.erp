// Fases 2 e 3 — o OWNER cria as 7 empresas na Administração Central e convida
// o administrador de cada uma; o administrador cria os papéis Financeiro,
// Fiscal e Logística (papéis personalizados) e convida os 7 usuários pela
// tela Usuários. Cada usuário faz o primeiro acesso pelo link do e-mail.
// Idempotente: etapas já concluídas (state.json) são puladas.
import { OWNER, OWNER_PASS, check, issue, shot, newUser, session, login, logout, goto, api, post, idOf, errMsg, list, state, save, close, firstAccess, mailCount, bodyText, evidenceCard } from "./lib.mjs";
import { COMPANIES, CUSTOM_ROLES, ROLE_LABEL } from "./companies.mjs";
// Rodada 48: usuários indexados por "key" (ex.: vendedor2), 4 papéis personalizados (inclui Compras).

const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const todo = COMPANIES.filter((c) => !only || only.includes(c.key));
const S = (c) => (state.companies[c.key] ??= {});

// ------------------------------------------------------------ OWNER: empresas
{
  const { c: ctx, page } = await newUser();
  await login(page, OWNER, OWNER_PASS);
  await goto(page, "/app/admincentral/companies");
  const before = await list(page, "/api/platform/companies");
  state.companiesBefore ??= before.map((x) => ({ id: x.company_id, name: x.display_name }));
  save();
  await shot(page, "empresas", "00-central-empresas-antes");

  for (const co of todo) {
    const st = S(co);
    if (st.companyId) continue;
    const existing = (await list(page, "/api/platform/companies")).find((x) => x.display_name === co.name);
    if (existing) { st.companyId = existing.company_id; st.reused = true; save(); continue; }
    await goto(page, "/app/admincentral/companies");
    await page.getByRole("button", { name: "Nova empresa" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByText("Nome da empresa").waitFor();
    const field = (label) => dlg.getByLabel(new RegExp(`^${label}`));
    await field("Nome da empresa").fill(co.name);
    await field("Razão social").fill(co.legalName);
    await field("CNPJ").fill(co.document);
    await field("E-mail").fill(co.email);
    await field("Telefone").fill(co.phone);
    await field("Endereço").fill(co.address);
    await field("Cidade").fill(co.city);
    await field("UF").fill(co.state);
    await field("CEP").fill(co.zipCode);
    await shot(page, "empresas", `${co.n}-${co.key}-a-formulario`);
    const respP = page.waitForResponse((r) => r.url().endsWith("/api/platform/companies") && r.request().method() === "POST");
    await dlg.getByRole("button", { name: "Criar empresa" }).click();
    const resp = await respP;
    const created = (await resp.json().catch(() => null))?.data ?? null;
    await dlg.getByText("Empresa criada").first().waitFor().catch(() => {});
    await shot(page, "empresas", `${co.n}-${co.key}-b-criada`);
    st.companyId = created?.company_id ?? null;
    save();
    check("empresas", `Owner cria a empresa ${co.name} pela Central (HTTP ${resp.status()})`, resp.status() === 201 && !!st.companyId, { company: co.name, user: "Owner", target: "POST /api/platform/companies", expected: "201 + empresa criada", actual: `${resp.status()} ${JSON.stringify(created).slice(0, 160)}`, evidence: `01-empresas/${co.n}-${co.key}-b-criada.png` });
    await page.getByRole("button", { name: "Configurar depois" }).click();
    await page.waitForTimeout(500);
  }

  // Convite do administrador de cada empresa.
  for (const co of todo) {
    const st = S(co);
    if (!st.companyId || st.adminInvited) continue;
    await goto(page, "/app/admincentral/companies");
    await page.getByText(co.name, { exact: true }).first().click();
    const d = page.getByRole("dialog");
    await d.getByRole("heading", { name: "Administrador da empresa" }).waitFor();
    await page.waitForTimeout(500);
    await d.getByLabel(/^Nome do administrador/).fill(co.admin.name);
    await d.getByLabel(/^Nome do administrador/).locator("xpath=ancestor::form").getByLabel(/^E-mail/).fill(co.admin.email);
    const ra = page.waitForResponse((x) => x.url().includes("/admin-invitation") && x.request().method() === "POST");
    await d.getByRole("button", { name: "Convidar administrador" }).click();
    const r = await ra;
    await d.getByText(/Convite enviado|Convite criado/).first().waitFor().catch(() => {});
    await shot(page, "usuarios", `${co.n}-${co.key}-00-convite-administrador`);
    st.adminInvited = r.status() < 300;
    save();
    check("usuarios", `Owner convida o administrador da ${co.name}`, st.adminInvited && (await mailCount(co.admin.email)) > 0, { company: co.name, user: "Owner", target: "POST /api/platform/companies/:id/admin-invitation", expected: "convite + e-mail", actual: `HTTP ${r.status()}`, evidence: `02-usuarios/${co.n}-${co.key}-00-convite-administrador.png` });
    await page.keyboard.press("Escape");
  }
  await goto(page, "/app/admincentral/companies");
  await shot(page, "empresas", "90-central-empresas-depois", { full: true });
  const after = await list(page, "/api/platform/companies");
  state.companiesAfter = after.map((x) => ({ id: x.company_id, name: x.display_name, status: x.status ?? x.lifecycle_status }));
  save();
  await logout(page);
  await ctx.close();
}

// ------------------------------------------------------------ ADMIN de cada empresa
for (const co of todo) {
  const st = S(co);
  if (!st.companyId) continue;
  let adm;
  if (!st.adminActive) {
    adm = await firstAccess(co.admin.email, { dir: "usuarios", prefix: `${co.n}-${co.key}-01-administrador` });
    const ctx = (await api(adm.page, "/api/session/context")).body?.data;
    st.adminActive = ctx?.tenant?.company?.id === st.companyId && ctx.tenant.roles?.some((r) => r.code === "admin");
    save();
    check("usuarios", `Administrador da ${co.name}: primeiro acesso e entrada no /app com o papel Administrador`, st.adminActive, { company: co.name, user: co.admin.email, target: "/redefinir-senha → /convite → /app", expected: "entra na própria empresa", actual: JSON.stringify(ctx?.tenant?.company ?? null).slice(0, 160), evidence: `02-usuarios/${co.n}-${co.key}-01-administrador-c-entrou-no-app.png` });
  } else adm = await session(co.admin.email);
  const page = adm.page;

  // Papéis personalizados: cria pela tela (Novo papel → Criar papel) e grava as
  // permissões pela mesma API do botão "Salvar permissões".
  st.roles ??= {};
  const roles = await list(page, "/api/admin/roles");
  for (const [key, def] of Object.entries(CUSTOM_ROLES)) {
    let role = roles.find((r) => r.code === def.code);
    if (!role) {
      await goto(page, "/app/admin/roles");
      await page.getByRole("button", { name: /Novo papel/ }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel(/^Código/).fill(def.code);
      await d.getByLabel(/^Nome/).fill(def.name);
      await d.getByLabel(/^Descrição/).fill(def.description);
      if (key === "compras") await shot(page, "rbac", `${co.n}-${co.key}-papel-${key}-a-novo`);
      const rr = page.waitForResponse((x) => x.url().endsWith("/api/admin/roles") && x.request().method() === "POST");
      await d.getByRole("button", { name: "Criar papel" }).click();
      const res = await rr;
      role = (await res.json().catch(() => null))?.data ?? null;
      await page.waitForTimeout(500);
      check("rbac", `Administrador cria o papel personalizado ${def.name} (HTTP ${res.status()})`, res.status() === 201, { company: co.name, user: co.admin.email, target: "POST /api/admin/roles", expected: "201", actual: `${res.status()} ${JSON.stringify(role).slice(0, 120)}` });
      if (!role?.id) role = (await list(page, "/api/admin/roles")).find((r) => r.code === def.code);
    }
    st.roles[key] = role?.id ?? null;
    if (role?.id && !st[`perm_${key}`]) {
      const r = await post(page, `/api/admin/roles/${role.id}/permissions`, { permissionCodes: def.permissions }, "PUT");
      st[`perm_${key}`] = r.status;
      check("rbac", `Permissões do papel ${def.name}: ${def.permissions.length} códigos (HTTP ${r.status})`, r.status === 200 && Number(r.body?.data?.count) === def.permissions.length, { company: co.name, user: co.admin.email, target: `PUT /api/admin/roles/:id/permissions`, expected: `200, ${def.permissions.length}`, actual: `${r.status} ${JSON.stringify(r.body?.data ?? r.body?.error).slice(0, 160)}` });
    }
    save();
  }
  if (co.n === "01" && !st.rolesShot) {
    await goto(page, "/app/admin/roles");
    const fin = page.getByRole("listbox", { name: "Papéis" }).getByText("Compras", { exact: true });
    if (await fin.isVisible().catch(() => false)) await fin.click();
    await page.waitForTimeout(800);
    await shot(page, "rbac", `${co.n}-${co.key}-papel-compras-b-permissoes`);
    st.rolesShot = true;
  }

  // Convites dos 7 usuários pela tela Usuários.
  st.invited ??= {};
  for (const u of co.users) {
    if (st.invited[u.key]) continue;
    await goto(page, "/app/admin/users");
    await page.getByRole("button", { name: "Convidar usuário" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel(/^Nome/).fill(u.name);
    await d.getByLabel(/^E-mail/).fill(u.email);
    await d.getByRole("combobox", { name: "Papel" }).click();
    await page.getByRole("option", { name: ROLE_LABEL[u.role], exact: true }).click();
    const ri = page.waitForResponse((x) => x.url().includes("/api/admin/users/invite"));
    await d.getByRole("button", { name: "Enviar convite" }).click();
    const res = await ri;
    await d.getByText(/Convite enviado|Convite criado/).first().waitFor().catch(() => {});
    if (u.key === "compras1" || u.key === "financeiro1") await shot(page, "usuarios", `${co.n}-${co.key}-02-convite-${u.key}`);
    st.invited[u.key] = res.status() < 300;
    save();
    check("usuarios", `Administrador convida ${ROLE_LABEL[u.role]} (${u.email})`, st.invited[u.key], { company: co.name, user: co.admin.email, target: "POST /api/admin/users/invite", expected: "convite criado", actual: `HTTP ${res.status()}` });
    const done = d.getByRole("button", { name: "Concluir" });
    if (await done.isVisible().catch(() => false)) await done.click(); else await page.keyboard.press("Escape");
  }
  await logout(page);
  await adm.c.close();

  // Primeiro acesso dos 7.
  st.active ??= {};
  for (const u of co.users) {
    if (st.active[u.key]) continue;
    const s = await firstAccess(u.email, u.key === "compras1" ? { dir: "usuarios", prefix: `${co.n}-${co.key}-03-${u.key}` } : {});
    const ctx = (await api(s.page, "/api/session/context")).body?.data;
    const roleNames = (ctx?.tenant?.roles ?? []).map((r) => r.name);
    st.active[u.key] = ctx?.tenant?.company?.id === st.companyId && roleNames.length === 1 && roleNames[0] === ROLE_LABEL[u.role];
    save();
    check("usuarios", `${ROLE_LABEL[u.role]} (${u.key}): primeiro acesso e entrada na ${co.name} com um único papel`, st.active[u.key], { company: co.name, user: u.email, target: "primeiro acesso", expected: `papel ${ROLE_LABEL[u.role]}`, actual: JSON.stringify(roleNames) });
    await logout(s.page);
    await s.c.close();
  }

  // Lista final (administrador).
  {
    const a = await session(co.admin.email);
    await goto(a.page, "/app/admin/users");
    await shot(a.page, "usuarios", `${co.n}-${co.key}-09-usuarios-ativos`, { full: true });
    const users = await list(a.page, "/api/admin/users");
    st.userCount = users.length;
    save();
    check("usuarios", `${co.name}: ${co.people.length} usuários na lista da empresa`, users.length === co.people.length, { company: co.name, user: co.admin.email, target: "GET /api/admin/users", expected: String(co.people.length), actual: String(users.length), evidence: `02-usuarios/${co.n}-${co.key}-09-usuarios-ativos.png` });
    await logout(a.page);
    await a.c.close();
  }
}
await close();
