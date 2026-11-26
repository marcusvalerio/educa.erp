const BASE = 'https://educaerp.vercel.app';
function field(d, label) {
  return d.locator(`xpath=.//label[normalize-space(.)="${label}" or normalize-space(.)="${label}*"]/following::*[self::input or self::textarea or self::button or self::select][1]`).first();
}
async function fill(d, label, v) { const f = field(d, label); await f.click(); await f.fill(String(v)); }
async function pick(p, d, label, text) {
  const f = field(d, label);
  await f.click(); await p.waitForTimeout(400);
  const search = p.locator('[role=listbox] input, [cmdk-input], [role=dialog] input[placeholder*="uscar"]').last();
  if (await search.count()) { try { await search.fill(text); await p.waitForTimeout(800); } catch {} }
  const opt = p.locator('[role=option]').filter({ hasText: text }).first();
  await opt.click();
  await p.waitForTimeout(300);
}
async function caption(p, text) {
  await p.evaluate((t) => {
    let el = document.getElementById('__cap');
    if (!el) { el = document.createElement('div'); el.id='__cap'; Object.assign(el.style,{position:'fixed',left:'50%',bottom:'28px',transform:'translateX(-50%)',background:'rgba(17,24,20,.92)',color:'#fff',font:'600 22px Inter,system-ui,sans-serif',padding:'12px 22px',borderRadius:'10px',zIndex:2147483647,maxWidth:'80%',textAlign:'center',pointerEvents:'none'}); document.body.appendChild(el); }
    el.textContent = t; el.style.display = t ? 'block' : 'none';
  }, text);
}
module.exports = { BASE, field, fill, pick, caption };
