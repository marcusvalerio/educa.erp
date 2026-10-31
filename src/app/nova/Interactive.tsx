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
