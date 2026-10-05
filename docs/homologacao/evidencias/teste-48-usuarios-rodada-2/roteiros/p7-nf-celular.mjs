// Captura do detalhe e do documento simulado da NF-e no celular (390 px) e no
// tablet (768 px), com a conta Fiscal da Vértice. Confere faixa/marca d'água e
// ausência de rolagem horizontal da página.
import { session, goto, shot, close, bodyText } from "../r48/lib.mjs";
const DOC = process.env.NF_DOC;
const out = [];
for (const [name, vp] of [["celular-390", { width: 390, height: 844 }], ["tablet-768", { width: 768, height: 1024 }]]) {
  const s = await session("fiscal@verticeoperacoes.test", undefined, { viewport: vp, isMobile: name.startsWith("celular"), hasTouch: true });
  for (const [k, route] of [["detalhe", `/app/fiscal/notas-fiscais/${DOC}`], ["documento-simulado", `/app/fiscal/notas-fiscais/${DOC}/documento-simulado`]]) {
    await goto(s.page, route);
    await s.page.waitForTimeout(1500);
    const t = await bodyText(s.page);
    const hscroll = await s.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const banner = /SEM VALOR FISCAL/i.test(t);
    const watermark = await s.page.locator("text=ATLAS.ERP — SIMULAÇÃO").count();
    await shot(s.page, "02-fiscal-simulado", `08-vertice-${k}-${name}`, { full: true });
    out.push({ tela: k, dispositivo: name, rolagemHorizontal: hscroll, faixaSemValorFiscal: banner, marcaDagua: watermark });
  }
  await s.c.close();
}
console.log(JSON.stringify(out));
await close();
