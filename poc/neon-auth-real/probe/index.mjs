// Sonda do Neon Auth REAL, executada como Neon Function no projeto de teste
// isolado `educa-neon-auth-test`. Existe porque o container de desenvolvimento
// não alcança *.neon.tech: a função roda dentro da Neon, executa o roteiro em
// PROBE_PLAN contra NEON_AUTH_BASE_URL e registra o resultado nos logs da
// função (lidos pelo conector). Sem dependências.
//
// Segurança da sonda:
// - o roteiro só roda por gatilho agendado da Neon (cabeçalho
//   x-neon-trigger-invocation-id, que a Neon remove de requisições externas);
// - só fala com a origem do NEON_AUTH_BASE_URL (ou `site`, uma origem fixa de
//   teste declarada no plano) — não é proxy genérico;
// - tokens e cookies saem redigidos; só um passo com `reveal` registra o JWT
//   bruto (usuário descartável, validade de 15 min) para a ponte local.
import crypto from "node:crypto";

const BASE = (process.env.NEON_AUTH_BASE_URL || "").replace(/\/$/, "");
const JWKS_URL = process.env.NEON_AUTH_JWKS_URL || `${BASE}/.well-known/jwks.json`;
const done = new Set();
// Caixa de entrada do webhook (send.otp / send.magic_link) desta instância.
const inbox = [];

const log = (kind, obj) => console.log(`${kind} ${JSON.stringify(obj).slice(0, 7000)}`);
const b64json = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

let jwksCache = null;
async function jwks() {
  if (!jwksCache) jwksCache = await (await fetch(JWKS_URL)).json();
  return jwksCache;
}

async function inspectJwt(token) {
  const [h, p, s] = token.split(".");
  const header = b64json(h);
  const payload = b64json(p);
  let verified = "no-key";
  try {
    const set = await jwks();
    const jwk = set.keys.find((k) => k.kid === header.kid);
    if (jwk) {
      const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
      verified = crypto.verify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url")) ? "valid" : "INVALID";
    }
  } catch (e) {
    verified = `error:${e.message}`;
  }
  return { header, payload, sigLen: s.length, verified };
}

async function redact(value, reveal, found) {
  if (typeof value === "string") {
    if (JWT_RE.test(value)) {
      found.push(value);
      return { jwt: await inspectJwt(value) };
    }
    return value;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => redact(v, reveal, found)));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!reveal && typeof v === "string" && /token|secret|password|otp|^t$/i.test(k) && !JWT_RE.test(v)) {
        out[k] = `<redigido len=${v.length}>`;
      } else out[k] = await redact(v, reveal, found);
    }
    return out;
  }
  return value;
}

const fill = (v, vars) =>
  typeof v === "string"
    ? v.replace(/\$\{(\w+)\}/g, (_, n) => vars[n] ?? "")
    : Array.isArray(v)
      ? v.map((x) => fill(x, vars))
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, vars)]))
        : v;

const pick = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

async function runPlan(plan) {
  const vars = { ...(plan.vars || {}) };
  const jars = {};
  const origin = plan.origin || "http://localhost:3000";
  const allowed = new Set([new URL(BASE).origin, ...(plan.site ? [new URL(plan.site).origin] : [])]);
  for (const raw of plan.steps) {
    // Senhas geradas dentro da função: nunca saem dela (nem no plano, nem nos logs).
    if (raw.gen) {
      // Com PROBE_SEED, a senha é derivada (HMAC) e se repete entre rodadas;
      // sem ele, é aleatória e morre com a rodada.
      const seed = process.env.PROBE_SEED;
      for (const n of raw.gen) vars[n] = `Tst-${(seed ? crypto.createHmac("sha256", seed).update(n).digest() : crypto.randomBytes(18)).toString("base64url").slice(0, 24)}`;
      continue;
    }
    const step = fill(raw, vars);
    if (step.inbox) {
      const m = inbox.filter((e) => e.type === step.inbox.type && e.body?.user?.email === step.inbox.email).at(-1);
      for (const [name, path] of Object.entries(step.save || {})) vars[name] = m ? pick(m.body, path) : undefined;
      log("PROBE", { run: plan.runId, id: step.id, inbox: m ? { type: m.type, eventData: await redact(m.body.event_data, false, []) } : "vazio" });
      continue;
    }
    if (step.sleep) {
      await new Promise((r) => setTimeout(r, step.sleep));
      log("PROBE", { run: plan.runId, id: step.id, slept: step.sleep });
      continue;
    }
    // Consulta ao Postgres do próprio projeto de teste (protocolo HTTP /sql do
    // driver serverless da Neon), p.ex. para ler o token de redefinição que o
    // e-mail levaria — o remetente compartilhado não entrega em caixa de teste.
    if (step.sql) {
      const db = new URL(process.env.DATABASE_URL);
      const res = await fetch(`https://${db.hostname}/sql`, {
        method: "POST",
        headers: { "neon-connection-string": process.env.DATABASE_URL, "content-type": "application/json" },
        body: JSON.stringify({ query: step.sql, params: step.params || [] }),
      });
      const out = await res.json().catch(() => ({}));
      for (const [name, path] of Object.entries(step.save || {})) vars[name] = pick(out, path);
      log("PROBE", { run: plan.runId, id: step.id, sql: res.status, rowCount: out.rowCount ?? null, rows: await redact(out.rows ?? out.message ?? null, false, []) });
      continue;
    }
    const url = step.url ? new URL(step.url) : new URL(BASE + step.path);
    if (!allowed.has(url.origin)) {
      log("PROBE", { run: plan.runId, id: step.id, error: "origem não permitida" });
      continue;
    }
    const jar = step.jar ? (jars[step.jar] ||= {}) : null;
    const headers = { origin, "user-agent": `educa-probe/${step.jar || "anon"}`, ...(step.headers || {}) };
    if (jar && Object.keys(jar).length && !step.noCookie) headers.cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    let body;
    if (step.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(step.json);
    }
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(url, { method: step.method || (body ? "POST" : "GET"), headers, body, redirect: "manual" });
    } catch (e) {
      log("PROBE", { run: plan.runId, id: step.id, fetchError: String(e) });
      continue;
    }
    const cookies = (res.headers.getSetCookie?.() || []).map((c) => {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const val = pair.slice(i + 1);
      const expired = /max-age=0/i.test(c) || val === "";
      if (jar) {
        if (expired) delete jar[name];
        else jar[name] = val;
      }
      return { name, len: val.length, attrs: attrs.map((a) => a.trim()).join("; ") };
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 600);
    }
    if (step.only === "keys:paths" && parsed?.paths) parsed = Object.keys(parsed.paths);
    const found = [];
    const setJwt = res.headers.get("set-auth-jwt");
    if (setJwt) found.push(setJwt);
    for (const [name, path] of Object.entries(step.save || {})) {
      vars[name] = path.startsWith("hdr:") ? res.headers.get(path.slice(4)) : path.startsWith("cookie:") ? jar?.[path.slice(7)] : pick(parsed, path);
    }
    log("PROBE", {
      run: plan.runId,
      id: step.id,
      req: `${step.method || (body ? "POST" : "GET")} ${url.pathname}${url.search ? "?…" : ""}`,
      status: res.status,
      ms: Date.now() - t0,
      location: res.headers.get("location")?.replace(/token=[^&]+/, "token=<redigido>") ?? undefined,
      setAuthJwt: setJwt ? await inspectJwt(setJwt) : undefined,
      rate: res.headers.get("x-retry-after") || res.headers.get("retry-after") || undefined,
      cookies: cookies.length ? cookies : undefined,
      body: await redact(parsed, !!step.reveal, found),
    });
    if (step.reveal) for (const t of new Set(found)) log("PROBE_SECRET", { run: plan.runId, id: step.id, jwt: t });
  }
  log("PROBE_END", { run: plan.runId, vars: Object.keys(vars) });
}

const probe = {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/webhook") {
      const raw = await request.text();
      const h = Object.fromEntries([...request.headers].filter(([k]) => k.startsWith("x-neon-")));
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw.slice(0, 300);
      }
      inbox.push({ at: Date.now(), type: h["x-neon-event-type"], body });
      log("WEBHOOK", { headers: h, body: await redact(body, false, []) });
      const allow = process.env.PROBE_WEBHOOK_ALLOW || "";
      if (h["x-neon-event-type"] === "user.before_create") {
        const email = body?.user?.email || "";
        const ok = allow.split(",").filter(Boolean).includes(email.toLowerCase());
        return Response.json(ok ? { allowed: true } : { allowed: false, error_message: "Cadastro somente por convite.", error_code: "INVITE_REQUIRED" });
      }
      return Response.json({ ok: true });
    }
    if (request.method !== "POST" || !request.headers.get("x-neon-trigger-invocation-id")) {
      return new Response("not found", { status: 404 });
    }
    const plan = JSON.parse(process.env.PROBE_PLAN || "{}");
    if (!plan.runId || done.has(plan.runId) || (plan.notAfter && Date.now() > Date.parse(plan.notAfter))) {
      log("PROBE_SKIP", { run: plan.runId || null });
      return Response.json({ skipped: true });
    }
    done.add(plan.runId);
    log("PROBE_START", { run: plan.runId, base: BASE, jwksUrl: JWKS_URL, node: process.version });
    await runPlan(plan);
    return Response.json({ ok: true });
  },
};

export default probe;
