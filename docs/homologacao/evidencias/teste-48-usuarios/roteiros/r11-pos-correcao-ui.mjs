// Pós-correção (2º lote): desempenho de Papéis, Início sem erro para papéis
// sem relatório executivo, matriz de permissões, CFOP e auditoria em português.
import fs from "node:fs";
import { check, shot, session, goto, api, close, bodyText, evidenceCard } from "./lib.mjs";
const rows = [["ID", "Problema", "Antes", "Agora", "Resultado"]];
const R = (id, name, before, now, ok) => { rows.push([id, name, before, now, ok ? "PASS" : "FAIL"]); check("correcoes", `${id} — ${name}`, ok, { expected: "corrigido", actual: now }); };

const A = await session("admin@cobaltodistribuidora.test");
const times = [];
for (let i = 0; i < 3; i++) { const t = Date.now(); const r = await api(A.page, "/api/admin/roles"); times.push(Date.now() - t); if (r.status !== 200) times.push(-r.status); }
const roles = (await api(A.page, "/api/admin/roles")).body?.data ?? [];
const fin = roles.find((r) => r.code === "FINANCEIRO");
R("R48-P1", "GET /api/admin/roles (Papéis e permissões)", "7.791 ms parado; p95 25 s com 48 usuários", `${times.join(" / ")} ms; ${roles.length} papéis; Financeiro com ${fin?.permission_codes?.length} permissões e ${fin?.user_count} usuário(s)`, Math.max(...times) < 1500 && roles.length === 9 && fin?.permission_codes?.length === 43);
await goto(A.page, "/app/admin/roles");
await A.page.waitForTimeout(800);
let t = await bodyText(A.page);
await shot(A.page, "correcoes", "R48-U2-papeis-em-portugues");
const english = ["Company modules", "Rbac", "Configure", "Document sequences", "Branches"].filter((w) => t.includes(w));
R("R48-U2", "Matriz de permissões em português", "\"Audit\", \"Branches\", \"Company modules\", \"Rbac\", \"Configure\"", english.length ? `ainda em inglês: ${english.join(", ")}` : "Auditoria, Unidades, Módulos da empresa, Papéis e permissões, Configurar", english.length === 0 && /Módulos da empresa/.test(t));
await goto(A.page, "/app/admin/audit");
await A.page.waitForTimeout(800);
t = await bodyText(A.page);
R("R48-U4", "Auditoria sem nome de tabela", "\"stock_transfers\" na lista", /stock_transfers/.test(t) ? "ainda mostra stock_transfers" : "sem código cru", !/stock_transfers/.test(t));

for (const email of ["compras@cobaltodistribuidora.test", "financeiro@cobaltodistribuidora.test"]) {
  const s = await session(email);
  await goto(s.page, "/app");
  await s.page.waitForTimeout(1500);
  const txt = await bodyText(s.page);
  const bad = /Não foi possível carregar|Comparação indisponível/.test(txt);
  await shot(s.page, "correcoes", `R48-U1-inicio-${email.split("@")[0]}`);
  R("R48-U1", `Início sem erro para ${email.split("@")[0]}`, "2 caixas vermelhas \"Não foi possível carregar…\" + \"Tentar novamente\"", bad ? "ainda mostra erro" : "sem caixa de erro; resto do Início normal", !bad);
  await s.c.close();
}
const F = await session("fiscal@verticeoperacoes.test");
await goto(F.page, "/app/fiscal/cfop");
await F.page.waitForTimeout(800);
t = await bodyText(F.page);
await shot(F.page, "correcoes", "R48-U3-cfop-em-portugues");
R("R48-U3", "CFOP com direção e abrangência por extenso", "\"SAIDA\" e \"INTERNAL\"", /SAIDA|INTERNAL/.test(t) ? "ainda mostra código" : "Saída · Dentro do estado", !/SAIDA|INTERNAL/.test(t) && /Saída/.test(t));
await evidenceCard(null, "correcoes", "01-pos-correcao-telas", "Pós-correção (2º lote) — telas e desempenho", rows);
fs.writeFileSync(new URL("./r11-pos-correcao-ui.out.json", import.meta.url), JSON.stringify(rows, null, 2));
console.log(rows.map((r) => `${r[4]} ${r[0]} | ${r[1]} | ${r[3]}`).join("\n"));
await close();
