// Caixa de e-mail local para os E2E da POC (subconjunto da API do Mailpit):
// POST /api/v1/send · GET /api/v1/search?query=to:<email> · GET /api/v1/message/:id · DELETE /api/v1/messages
import http from "node:http";
const PORT = Number(process.env.MAIL_SINK_PORT ?? 58025);
let seq = 0;
let messages = [];
const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "POST" && url.pathname === "/api/v1/send") {
    let body = ""; for await (const c of req) body += c;
    const m = JSON.parse(body);
    messages.unshift({ ID: String(++seq), To: m.To, Subject: m.Subject, HTML: m.HTML, Text: m.Text, Created: new Date().toISOString() });
    return json(res, 200, { ID: String(seq) });
  }
  if (req.method === "GET" && url.pathname === "/api/v1/search") {
    const to = (url.searchParams.get("query") ?? "").replace(/^to:/, "").toLowerCase();
    return json(res, 200, { messages: messages.filter((m) => m.To.some((t) => t.Email.toLowerCase() === to)).map(({ ID, Subject, Created }) => ({ ID, Subject, Created })) });
  }
  const one = /^\/api\/v1\/message\/(\d+)$/.exec(url.pathname);
  if (req.method === "GET" && one) { const m = messages.find((x) => x.ID === one[1]); return m ? json(res, 200, m) : json(res, 404, {}); }
  if (req.method === "DELETE" && url.pathname === "/api/v1/messages") { messages = []; return json(res, 200, {}); }
  json(res, 404, {});
}).listen(PORT, () => console.log(`caixa de e-mail local em http://localhost:${PORT}`));
