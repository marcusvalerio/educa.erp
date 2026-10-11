// Renderização determinística do product tour.
//   node render.mjs timeline                      → timeline.json (cenas + deixas de áudio)
//   node render.mjs stills 1.5,8,20 [dir] [escala] → PNGs de quadros específicos (revisão)
//   node render.mjs video saida.mp4 [--from s] [--to s] [--fps 30] [--scale 1] [--workers 3]
// Requer Playwright (Chromium) e um ffmpeg com libx264 (variável FFMPEG).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PW = process.env.PLAYWRIGHT_MODULE ?? pathToFileURL(path.resolve(HERE, "../../../../node_modules/playwright/index.mjs")).href;
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const { chromium } = await import(PW);
const [, , mode, ...rest] = process.argv;
const flag = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };

async function open(scale = 1) {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--force-color-profile=srgb", "--disable-lcd-text"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(pathToFileURL(path.join(HERE, "compositor.html")).href);
  await page.evaluate(async () => {
    const fams = ["400 40px ISerif", "italic 400 40px ISerif", "400 20px ISans", "500 20px ISans", "600 20px ISans", "400 14px JMono", "500 14px JMono", "600 14px JMono"];
    await Promise.all(fams.map((f) => document.fonts.load(f, "ÁÉÍÓÚçãõâê Atlas 0123")));
    await document.fonts.ready;
  });
  const cdp = await page.context().newCDPSession(page);
  return { browser, page, cdp };
}
const grab = async (cdp, fmt = "jpeg") => Buffer.from((await cdp.send("Page.captureScreenshot", { format: fmt, quality: fmt === "jpeg" ? 94 : undefined, optimizeForSpeed: fmt === "jpeg" })).data, "base64");

if (mode === "timeline") {
  const { browser, page } = await open();
  const tl = await page.evaluate(() => allCues());
  fs.writeFileSync(path.join(HERE, "timeline.json"), JSON.stringify(tl, null, 1));
  console.log(`total ${tl.total.toFixed(2)} s, ${tl.scenes.length} cenas, ${tl.cues.length} deixas`);
  for (const s of tl.scenes) console.log(String(s.n).padStart(2), s.start.toFixed(2).padStart(7), s.end.toFixed(2).padStart(7), s.name);
  await browser.close();
} else if (mode === "stills") {
  const times = rest[0].split(",").map(Number), dir = path.resolve(rest[1] ?? "stills"), scale = Number(rest[2] ?? 0.5);
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page, cdp } = await open(scale);
  for (const t of times) {
    await page.evaluate((x) => seek(x), t);
    fs.writeFileSync(path.join(dir, `t${t.toFixed(2).padStart(7, "0")}.png`), await grab(cdp, "png"));
  }
  await browser.close();
  console.log(`${times.length} quadros em ${dir}`);
} else if (mode === "video") {
  const out = path.resolve(rest[0]);
  const fps = Number(flag("fps", 30)), scale = Number(flag("scale", 1)), workers = Number(flag("workers", 1));
  const { browser: b0, page: p0 } = await open();
  const total = await p0.evaluate(() => totalTime());
  await b0.close();
  const from = Number(flag("from", 0)), to = Math.min(total, Number(flag("to", total)));
  const f0 = Math.round(from * fps), f1 = Math.round(to * fps);
  const crf = flag("crf", "17");
  const segs = [];
  const per = Math.ceil((f1 - f0) / workers);
  const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const a = f0 + w * per, b = Math.min(f1, a + per);
    if (a >= b) return;
    const seg = workers > 1 ? `${out}.part${w}.mp4` : out;
    segs[w] = seg;
    const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", flag("preset", "fast"), "-crf", crf, "-tune", "animation", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-r", String(fps), seg], { stdio: ["pipe", "inherit", "inherit"] });
    const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)))));
    const { browser, page, cdp } = await open(scale);
    for (let f = a; f < b; f++) {
      await page.evaluate((x) => seek(x), f / fps);
      const buf = await grab(cdp);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if ((f - a) % 150 === 0) console.log(`w${w} ${f - a}/${b - a} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    ff.stdin.end();
    await done;
    await browser.close();
  }));
  if (workers > 1) {
    const list = `${out}.txt`;
    fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join("\n"));
    await new Promise((res, rej) => spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out], { stdio: "inherit" }).on("close", (c) => (c === 0 ? res() : rej(new Error("concat")))));
    for (const s of segs.filter(Boolean)) fs.unlinkSync(s);
    fs.unlinkSync(list);
  }
  console.log(`ok ${out} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
} else {
  console.log("uso: node render.mjs timeline | stills t1,t2 [dir] [escala] | video saida.mp4 [--from] [--to] [--fps] [--scale] [--workers]");
}
