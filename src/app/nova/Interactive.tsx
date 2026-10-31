"use client";

import { useEffect, useState } from "react";

// Peças interativas da landing /nova:
//   ChaosField + SilenceButton — as mensagens do caos e o botão que as
//     resolve uma a uma (evento "nv:silence");
//   Diagnostic — seis perguntas de sim/não que dão a nota da operação.

export type Noise = { who: string; t: string; at: string; ok: string };

const SILENCE = "nv:silence";

export function SilenceButton() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="nv-btn nv-btn-line nv-silence"
      aria-pressed={done}
      onClick={() => {
        setDone(true);
        window.dispatchEvent(new Event(SILENCE));
        window.setTimeout(() => document.getElementById("silencio")?.scrollIntoView({ behavior: "smooth" }), 3800);
      }}
    >
      {done ? "Silenciado" : "Silenciar tudo"}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <path d="m23 9-6 6" />
        <path d="m17 9 6 6" />
      </svg>
    </button>
  );
}

export function ChaosField({ items }: { items: Noise[] }) {
  const [silenced, setSilenced] = useState(false);
  useEffect(() => {
    const on = () => setSilenced(true);
    window.addEventListener(SILENCE, on);
    return () => window.removeEventListener(SILENCE, on);
  }, []);
  return (
    <div className={`nv-noise${silenced ? " is-silenced" : ""}`} aria-hidden="true">
      {items.map((n, i) => (
        <div key={i} className={`nv-msg m${i}`} style={silenced ? { animationDelay: `${i * 0.22}s` } : undefined}>
          <span className="who">{silenced ? "Atlas" : n.who}</span>
          <span className="t">{silenced ? n.ok : n.t}</span>
          <span className="at">{silenced ? "✓" : n.at}</span>
        </div>
      ))}
    </div>
  );
}

const QUESTIONS = [
  { q: "Já vendeu algo que não tinha mais em estoque?", pain: "Venda de produto já prometido", weight: 20 },
  { q: "Alguém já pagou juros por um boleto esquecido?", pain: "Contas pagas fora do prazo", weight: 15 },
  { q: "O fiscal já precisou refazer uma nota por erro de cadastro?", pain: "Nota fiscal refeita", weight: 15 },
  { q: "O mesmo pedido é digitado em mais de um lugar?", pain: "Redigitação entre áreas", weight: 20 },
  { q: "Para saber o saldo de caixa do mês, alguém monta uma planilha?", pain: "Caixa sem visão do futuro", weight: 15 },
  { q: "Já faltou matéria-prima no meio de uma produção?", pain: "Ruptura na produção", weight: 15 },
];

function verdict(score: number) {
  if (score >= 80) return "Operação conectada. Poucos vazamentos.";
  if (score >= 55) return "Operação funcionando no esforço das pessoas.";
  if (score >= 30) return "Operação em silos. O dinheiro escapa entre as áreas.";
  return "Operação no limite. Cada dia custa caro.";
}

export function Diagnostic() {
  const [answers, setAnswers] = useState<(boolean | null)[]>(() => QUESTIONS.map(() => null));
  const answered = answers.filter((a) => a !== null).length;
  const done = answered === QUESTIONS.length;
  const score = 100 - QUESTIONS.reduce((acc, q, i) => acc + (answers[i] ? q.weight : 0), 0);
  const pains = QUESTIONS.filter((_, i) => answers[i]).sort((a, b) => b.weight - a.weight);
  const set = (i: number, v: boolean) => setAnswers((prev) => prev.map((a, j) => (j === i ? v : a)));
  useEffect(() => {
    if (done) window.dispatchEvent(new CustomEvent("nv:diag", { detail: { score, pains: pains.map((p) => p.pain) } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, score]);

  return (
    <div className="nv-diag">
      <ol className="nv-diag-q">
        {QUESTIONS.map((q, i) => (
          <li key={q.q} className={answers[i] === null ? "" : "is-answered"}>
            <span className="q">{q.q}</span>
            <span className="yn" role="group" aria-label={q.q}>
              <button type="button" aria-pressed={answers[i] === true} onClick={() => set(i, true)}>Sim</button>
              <button type="button" aria-pressed={answers[i] === false} onClick={() => set(i, false)}>Não</button>
            </span>
          </li>
        ))}
      </ol>
      <div className={`nv-diag-out${done ? " is-done" : ""}`} aria-live="polite">
        <span className="nv-calc-label">{done ? "Maturidade da sua operação" : `Responda as 6 perguntas · ${answered}/6`}</span>
        <div className="nv-score">
          <svg viewBox="0 0 120 120" width="168" height="168" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#dbe0e1" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={score >= 55 ? "#ff9408" : "#ca3f16"}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(done ? score : 0) * 3.267} 999`}
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dasharray .9s ease" }}
            />
          </svg>
          <b className="nv-num">{done ? score : "–"}</b>
          <small>de 100</small>
        </div>
        {done && (
          <>
            <p className="nv-verdict">{verdict(score)}</p>
            {pains.length > 0 ? (
              <ul className="nv-pains">
                {pains.slice(0, 3).map((p) => (
                  <li key={p.pain}>{p.pain}</li>
                ))}
              </ul>
            ) : (
              <p className="nv-diag-note">Nenhum vazamento marcado. Ainda assim, o Atlas tira o trabalho manual que mantém tudo isso em dia.</p>
            )}
            <a className="nv-btn nv-btn-fire" href="#custo">
              Ver quanto isso custa em reais
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ contato

type Calc = { revenue: number; people: number; total: number };
type Diag = { score: number; pains: string[] };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function LeadForm() {
  const [calc, setCalc] = useState<Calc | null>(null);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const onCalc = (e: Event) => setCalc((e as CustomEvent<Calc>).detail);
    const last = (window as unknown as { __nvCalc?: Calc }).__nvCalc;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last) setCalc(last);
    const onDiag = (e: Event) => setDiag((e as CustomEvent<Diag>).detail);
    window.addEventListener("nv:calc", onCalc);
    window.addEventListener("nv:diag", onDiag);
    return () => {
      window.removeEventListener("nv:calc", onCalc);
      window.removeEventListener("nv:diag", onDiag);
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/landing/contato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(f.get("name") ?? ""),
          email: String(f.get("email") ?? ""),
          company: String(f.get("company") ?? ""),
          phone: String(f.get("phone") ?? ""),
          consent: f.get("consent") === "on",
          website: String(f.get("website") ?? ""),
          monthlyRevenue: calc?.revenue ?? null,
          people: calc?.people ?? null,
          monthlyLeak: calc ? Math.round(calc.total) : null,
          maturityScore: diag?.score ?? null,
          pains: diag?.pains ?? [],
        }),
      });
      const json = (await res.json().catch(() => null)) as { success?: boolean; error?: { message?: string } } | null;
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Não foi possível enviar agora.");
      setState("sent");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Não foi possível enviar agora.");
    }
  }

  if (state === "sent") {
    return (
      <div className="nv-lead-card is-sent" role="status">
        <b className="nv-display">Recebido.</b>
        <p>Vamos montar o diagnóstico da sua operação e falar com você em até um dia útil.</p>
      </div>
    );
  }

  return (
    <form className="nv-lead-card" onSubmit={submit} noValidate={false}>
      <div className="nv-lead-head">
        <span className="nv-calc-label">Receba o diagnóstico completo</span>
        <p>
          {calc ? <>Sua conta: <b>{brl(calc.total)}</b> por mês</> : "Com a sua conta e o plano para fechar os vazamentos"}
          {diag ? <> · nota <b>{diag.score}</b>/100</> : null}
        </p>
      </div>
      <div className="nv-lead-grid">
        <label htmlFor="nv-name"><span>Nome</span><input id="nv-name" name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label htmlFor="nv-email"><span>E-mail de trabalho</span><input id="nv-email" name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" /></label>
        <label htmlFor="nv-company"><span>Empresa</span><input id="nv-company" name="company" maxLength={160} autoComplete="organization" /></label>
        <label htmlFor="nv-phone"><span>WhatsApp (opcional)</span><input id="nv-phone" name="phone" maxLength={40} autoComplete="tel" inputMode="tel" /></label>
        <input className="nv-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      </div>
      <label className="nv-consent" htmlFor="nv-consent">
        <input id="nv-consent" name="consent" type="checkbox" required />
        <span>Aceito receber o diagnóstico e o contato do ATLAS.ERP sobre ele.</span>
      </label>
      <div className="nv-lead-foot">
        <button type="submit" className="nv-btn nv-btn-fire" disabled={state === "sending"}>
          {state === "sending" ? "Enviando…" : "Quero o meu diagnóstico"}
        </button>
        {state === "error" && <span className="nv-lead-err" role="alert">{error}</span>}
      </div>
    </form>
  );
}

// ------------------------------------------------------------ pedido ao vivo

const STAGES = [
  { area: "Comercial", t: "Pedido criado" },
  { area: "Comercial", t: "Pedido aprovado" },
  { area: "Estoque", t: "Estoque reservado" },
  { area: "Logística", t: "Separado e expedido" },
  { area: "Fiscal", t: "NF-e emitida" },
  { area: "Financeiro", t: "Conta a receber lançada" },
];

export function LiveOrder() {
  const [product, setProduct] = useState("Disjuntor 32A");
  const [qty, setQty] = useState(50);
  const [step, setStep] = useState(-1);
  const price = 38.9;
  const stockStart = 180;
  const running = step >= 0 && step < STAGES.length;

  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setStep((s) => s + 1), 1100);
    return () => window.clearTimeout(id);
  }, [step, running]);

  const stock = step >= 4 ? stockStart - qty : stockStart;
  const reserved = step === 3 ? qty : 0;
  const total = qty * price;
  const nf = 4821;

  return (
    <div className="nv-live-order">
      <form
        className="nv-lo-form"
        onSubmit={(e) => {
          e.preventDefault();
          setStep(0);
        }}
      >
        <label htmlFor="nv-lo-p"><span>Produto</span><input id="nv-lo-p" value={product} maxLength={40} onChange={(e) => setProduct(e.target.value)} /></label>
        <label htmlFor="nv-lo-q"><span>Quantidade</span><input id="nv-lo-q" type="number" min={1} max={180} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(180, Number(e.target.value) || 1)))} /></label>
        <button type="submit" className="nv-btn nv-btn-fire" disabled={running}>{running ? "Acontecendo…" : step >= STAGES.length ? "Fazer outro pedido" : "Fazer o pedido"}</button>
      </form>
      <ol className="nv-lo-track">
        {STAGES.map((s, i) => (
          <li key={s.t} className={i < step ? "done" : i === step ? "now" : ""}>
            <span className="area">{s.area}</span>
            <span className="t">{s.t}</span>
          </li>
        ))}
      </ol>
      <div className="nv-lo-ledger" aria-live="polite">
        <div><span>Pedido</span><b>{step >= 0 ? `PV-1042 · ${qty} × ${product || "produto"}` : "—"}</b></div>
        <div><span>Estoque disponível</span><b className="nv-num">{stock - reserved} un.{reserved ? ` (${reserved} reservadas)` : ""}</b></div>
        <div><span>Nota fiscal</span><b>{step >= 5 ? `NF-e ${nf} autorizada` : "—"}</b></div>
        <div><span>A receber</span><b className="nv-num">{step >= 6 ? total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</b></div>
        <small>{step >= STAGES.length ? "Seis áreas, zero mensagens, nada redigitado." : "Simulação na página, com dados de exemplo."}</small>
      </div>
    </div>
  );
}
