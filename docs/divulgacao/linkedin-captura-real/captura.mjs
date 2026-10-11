// Início real (Gerente da Ferrix), mouse fora do conteúdo, tema claro e escuro
// (o tema segue a preferência do sistema operacional — recurso real do app).
import { session, goto } from "/home/user/r48/lib.mjs";
const OUT = new URL(".", import.meta.url).pathname;
for (const theme of ["light", "dark"]) {
  const s = await session("gerente@ferrixindustria.test", undefined, { viewport: { width: 1440, height: 900 }, colorScheme: theme, deviceScaleFactor: 2 });
  await goto(s.page, "/app");
  await s.page.waitForLoadState("networkidle").catch(() => {});
  await s.page.mouse.move(1435, 895);
  await s.page.waitForTimeout(3000);
  await s.page.screenshot({ path: OUT + `inicio-1440x900@2x-${theme}.png` });
  await s.page.screenshot({ path: OUT + `inicio-pagina-inteira-${theme}.png`, fullPage: true });
  await s.c.close();
}
process.exit(0);
