// Divide um script SQL (PostgreSQL) em statements, respeitando:
// strings '...' (com ''), E'...' (com \'), identificadores "...",
// dollar quotes $tag$...$tag$, comentários -- e /* */ (aninhados).
// Usado para enviar o esquema ao Neon por HTTP (um statement por chamada).
export function splitSql(src) {
  const out = [];
  let buf = "", i = 0;
  const n = src.length;
  const last = (k) => buf[buf.length - k] || "";
  const push = () => {
    const s = buf.trim();
    if (s && s.split("\n").some((l) => { const t = l.trim(); return t !== "" && !t.startsWith("--"); })) out.push(s);
    buf = "";
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "-" && d === "-") { const j = src.indexOf("\n", i); const e = j < 0 ? n : j + 1; buf += src.slice(i, e); i = e; continue; }
    if (c === "/" && d === "*") { let depth = 0, j = i; while (j < n) { if (src[j] === "/" && src[j + 1] === "*") { depth++; j += 2; } else if (src[j] === "*" && src[j + 1] === "/") { depth--; j += 2; if (!depth) break; } else j++; } buf += src.slice(i, j); i = j; continue; }
    if (c === "'" ) { const esc = (last(1) === "e" || last(1) === "E") && !/\w/.test(last(2)); let j = i + 1; while (j < n) { if (esc && src[j] === "\\") { j += 2; continue; } if (src[j] === "'") { if (src[j + 1] === "'") { j += 2; continue; } break; } j++; } buf += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === '"') { let j = i + 1; while (j < n) { if (src[j] === '"') { if (src[j + 1] === '"') { j += 2; continue; } break; } j++; } buf += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === "$") { const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(src.slice(i, i + 64)); if (m && !/\w/.test(last(1))) { const tag = m[0]; const j = src.indexOf(tag, i + tag.length); if (j < 0) throw new Error("dollar quote sem fim: " + tag); buf += src.slice(i, j + tag.length); i = j + tag.length; continue; } }
    if (c === ";") { buf += c; push(); i++; continue; }
    buf += c; i++;
  }
  push();
  return out;
}
