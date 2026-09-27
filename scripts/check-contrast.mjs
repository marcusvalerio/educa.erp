#!/usr/bin/env node
// Mede o contraste WCAG dos tokens de src/app/globals.css (claro e escuro).
// Falha (exit 1) se algum par de texto ficar abaixo de 4.5:1 ou o anel de
// foco abaixo de 3:1. Rodar a cada mudança de paleta: node scripts/check-contrast.mjs
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  const open = css.indexOf("{", i + selectorStart.length - 1);
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    if (css[j] === "}" && --depth === 0) return css.slice(open + 1, j);
  }
  throw new Error(`bloco ${selectorStart} não encontrado`);
}
const vars = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
const themes = { claro: vars(block(':root,\n[data-theme="light"] {')), escuro: vars(block(':root[data-theme="dark"],')) };

const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const SURFACES = ["chrome", "background", "surface", "surface-muted", "surface-hover"];
const TEXT = ["foreground", "muted-foreground", "subtle-foreground", "accent-fg", "success-fg", "warning-fg", "danger-fg", "critical-fg", "info-fg"];
const SOFT = { "accent-fg": "accent-soft", "success-fg": "success-soft", "warning-fg": "warning-soft", "danger-fg": "danger-soft", "critical-fg": "critical-soft", "info-fg": "info-soft", "muted-foreground": "muted" };
let failures = 0;
for (const [name, t] of Object.entries(themes)) {
  const rows = [];
  const check = (fg, bg, min) => {
    if (!t[fg] || !t[bg]) return;
    const r = ratio(t[fg], t[bg]);
    if (r < min) failures++;
    rows.push(`${r < min ? "FALHA" : "ok   "} ${r.toFixed(2).padStart(5)}:1  ${fg} sobre ${bg}`);
  };
  for (const fg of TEXT) for (const bg of SURFACES) check(fg, bg, 4.5);
  for (const [fg, bg] of Object.entries(SOFT)) check(fg, bg, 4.5);
  check("primary-foreground", "primary", 4.5);
  check("sidebar-foreground", "sidebar", 4.5);
  check("sidebar-muted", "sidebar", 4.5);
  check("sidebar-muted", "sidebar-active", 4.5);
  for (const bg of ["surface", "background", "chrome"]) check("ring", bg, 3);
  const worst = rows.filter((r) => r.startsWith("FALHA"));
  console.log(`\n== ${name}: ${rows.length} pares, ${worst.length} abaixo do mínimo`);
  (worst.length ? worst : rows.sort((a, b) => parseFloat(a.slice(6)) - parseFloat(b.slice(6))).slice(0, 4)).forEach((r) => console.log(r));
}
process.exit(failures ? 1 : 0);
