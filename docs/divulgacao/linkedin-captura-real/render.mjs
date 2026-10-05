import { chromium } from "/home/user/educa.erp/node_modules/playwright/index.mjs";
const here = new URL(".", import.meta.url).pathname;
const b = await chromium.launch();
for (const scale of [1, 2]) {
  const p = await b.newPage({ viewport: { width: 1200, height: 627 }, deviceScaleFactor: scale });
  await p.goto("file://" + here + "composicao.html"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: here + (scale === 1 ? "atlas-erp-linkedin-real-1200x627.png" : "atlas-erp-linkedin-real-2400x1254@2x.png") });
}
await b.close();
