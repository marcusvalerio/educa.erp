// Complemento dos erros provocados: nome gigante e HTML injetado com CNPJ
// válido (na 1ª passada o CPF/CNPJ vazio barrou antes do que se queria testar).
import fs from "node:fs";
import { check, shot, session, goto, post, idOf, state, close, bodyText, evidenceCard } from "./lib.mjs";
const dv = (n, w) => { const r = n.reduce((s, d, i) => s + d * w[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
const cnpj = () => { const b = [...Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)), 0, 0, 0, 1]; const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]); const d2 = dv([...b, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]); return [...b, d1, d2].join("").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); };
const rows = [["Empresa", "Entrada", "HTTP", "Mensagem", "Esperado", "Real", "Resultado"]];
const v = await session("vendas1@maresvarejo.test");
const big = await post(v.page, "/api/customers", { tipo: "Pessoa Jurídica", nome: "X".repeat(5000), documento: cnpj(), segmento: "RETAIL" });
const bigOk = big.status >= 400 && big.status < 500;
rows.push(["Mares Varejo", "Cliente com nome de 5.000 caracteres (CNPJ válido)", big.status, big.body?.error?.message ?? "", "422 com limite de tamanho", big.status < 300 ? "ACEITOU (gravou 5.000 caracteres)" : "recusou", bigOk ? "PASS" : "FAIL"]);
check("erros", "Cliente com nome de 5.000 caracteres é recusado", bigOk, { company: "Mares Varejo", target: "POST /api/customers", expected: "422", actual: `${big.status} ${big.body?.error?.message ?? ""}` });
const name = `<img src=x onerror="window.__xss=1">Cliente XSS MV`;
const x = await post(v.page, "/api/customers", { tipo: "Pessoa Jurídica", nome: name, documento: cnpj(), segmento: "RETAIL" });
rows.push(["Mares Varejo", "Cliente com HTML/script no nome (CNPJ válido)", x.status, x.body?.error?.message ?? "", "recusado ou exibido como texto", x.status < 300 ? "gravou — conferido na tela" : "recusou", "—"]);
for (const route of ["/app/cadastros/clientes?q=Cliente%20XSS", "/app/comercial/pedidos-venda"]) {
  await goto(v.page, route);
  await v.page.waitForTimeout(900);
  const fired = await v.page.evaluate(() => window.__xss === 1);
  const shown = (await bodyText(v.page)).includes("onerror");
  rows.push(["Mares Varejo", `Tela ${route} com o cliente de nome HTML`, "—", shown ? "texto literal visível" : "—", "não executa", fired ? "SCRIPT EXECUTOU" : "não executou", fired ? "FAIL" : "PASS"]);
  check("erros", `HTML no nome do cliente não executa em ${route}`, !fired, { company: "Mares Varejo", target: route, expected: "não executa", actual: fired ? "executou" : `não executou; texto literal ${shown ? "visível" : "não visível"}` });
  if (route.includes("clientes")) await shot(v.page, "erros", "05-mares-cliente-com-html-no-nome");
}
await evidenceCard(null, "erros", "01-erros-complemento", "Erros provocados — complemento (nome gigante e HTML no nome)", rows);
fs.writeFileSync(new URL("./r7b-extra.out.json", import.meta.url), JSON.stringify(rows, null, 2));
console.log(rows.map((r) => r.join(" | ")).join("\n"));
await close();
