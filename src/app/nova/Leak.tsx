"use client";

import { useEffect, useMemo, useState } from "react";

// Calculadora do "vazamento" (estimativa transparente) e o contador ao vivo
// de quanto escapa enquanto a pessoa lê. A conta é mostrada inteira na tela:
//   redigitação: pessoas × 9 h/mês × R$ 46/h
//   venda perdida por estoque prometido: 0,55% do faturamento
//   juros e multas por atraso: 0,35% do faturamento
//   nota refeita e estoque parado: 0,45% do faturamento
// O valor escolhido é avisado ao resto da página pelo evento "nv:leak".

const EVENT = "nv:leak";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brlCents = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function monthlyLeak(revenue: number, people: number) {
  const rework = people * 9 * 46;
  const lost = revenue * 0.0055;
  const late = revenue * 0.0035;
  const waste = revenue * 0.0045;
  return { rework, lost, late, waste, total: rework + lost + late + waste };
}

// Ritmo do expediente: 22 dias úteis × 10 h (8h às 18h).
const perBusinessSecond = (monthly: number) => monthly / (22 * 10 * 3600);

/** Segundos de expediente de hoje até agora (seg–sex, 8h às 18h). */
function businessSecondsToday(now: Date) {
  const day = now.getDay();
  if (day === 0 || day === 6) return 0;
  const open = new Date(now); open.setHours(8, 0, 0, 0);
  const close = new Date(now); close.setHours(18, 0, 0, 0);
  const t = Math.min(now.getTime(), close.getTime()) - open.getTime();
  return Math.max(0, t / 1000);
}

function publish(total: number) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: total }));
}

export function LeakCalculator() {
  const [revenue, setRevenue] = useState(1_500_000);
  const [people, setPeople] = useState(25);
  const leak = useMemo(() => monthlyLeak(revenue, people), [revenue, people]);
  const [copied, setCopied] = useState(false);

  // Link compartilhado: /nova?fat=1500000&pessoas=25#custo abre com os números de quem mandou.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fat = Number(q.get("fat"));
    const ppl = Number(q.get("pessoas"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fat >= 200_000 && fat <= 20_000_000) setRevenue(Math.round(fat / 100_000) * 100_000);
    if (ppl >= 3 && ppl <= 300) setPeople(Math.round(ppl));
  }, []);

  useEffect(() => {
    publish(leak.total);
    const detail = { revenue, people, total: leak.total };
    (window as unknown as { __nvCalc?: typeof detail }).__nvCalc = detail;
    window.dispatchEvent(new CustomEvent("nv:calc", { detail }));
  }, [leak.total, revenue, people]);

  const shareText = () => {
    const url = `${window.location.origin}/nova?fat=${revenue}&pessoas=${people}#custo`;
    return { url, text: `Fiz a conta: a nossa operação perde cerca de ${brl(leak.total)} por mês (${brl(leak.total * 12)} por ano) em retrabalho, venda perdida e juros. Dá uma olhada: ${url}` };
  };
  const whatsapp = () => `https://wa.me/?text=${encodeURIComponent(shareText().text)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText().text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="nv-calc">
      <div className="nv-calc-in">
        <label className="nv-range" htmlFor="nv-rev">
          <span>Faturamento por mês</span>
          <b className="nv-num">{brl(revenue)}</b>
          <input id="nv-rev" type="range" min={200_000} max={20_000_000} step={100_000} value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} />
        </label>
        <label className="nv-range" htmlFor="nv-ppl">
          <span>Pessoas na operação</span>
          <b className="nv-num">{people}</b>
          <input id="nv-ppl" type="range" min={3} max={300} step={1} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
        </label>
      </div>
      <div className="nv-calc-out" aria-live="polite">
        <span className="nv-calc-label">Escapa da sua operação todo mês</span>
        <b className="nv-calc-total nv-num">{brl(leak.total)}</b>
        <span className="nv-calc-year nv-num">{brl(leak.total * 12)} por ano</span>
        <ul className="nv-calc-lines">
          <li><span>Horas redigitando pedido, nota e título</span><b className="nv-num">{brl(leak.rework)}</b></li>
          <li><span>Venda de produto que já estava prometido</span><b className="nv-num">{brl(leak.lost)}</b></li>
          <li><span>Juros e multas por pagar fora do prazo</span><b className="nv-num">{brl(leak.late)}</b></li>
          <li><span>Nota refeita e estoque parado</span><b className="nv-num">{brl(leak.waste)}</b></li>
        </ul>
        <small>Estimativa: 9 h por pessoa por mês a R$ 46/h, mais 1,35% do faturamento em venda perdida, juros e retrabalho.</small>
        <div className="nv-share">
          <a className="nv-btn nv-btn-ink nv-btn-sm" href="https://wa.me/" target="_blank" rel="noopener noreferrer" onClick={(e) => { e.currentTarget.href = whatsapp(); }}>
            Mandar para o meu sócio
          </a>
          <button type="button" className="nv-btn nv-btn-sm nv-btn-ghost-ink" onClick={copy}>
            {copied ? "Copiado" : "Copiar a mensagem"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Quanto já escapou hoje no expediente (8h–18h), no ritmo da calculadora. */
export function LiveLeak({ prefix }: { prefix: string }) {
  const [monthly, setMonthly] = useState(() => monthlyLeak(1_500_000, 25).total);
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    const onLeak = (e: Event) => setMonthly((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, onLeak);
    const tick = () => setElapsed(businessSecondsToday(new Date()));
    tick();
    const id = window.setInterval(tick, 250);
    return () => {
      window.removeEventListener(EVENT, onLeak);
      window.clearInterval(id);
    };
  }, []);

  return (
    <p className="nv-live">
      <span>{elapsed ? prefix : "Num dia inteiro de expediente, escapam"}</span>
      <b className="nv-num">{elapsed === null ? "…" : brlCents(perBusinessSecond(monthly) * (elapsed || 10 * 3600))}</b>
    </p>
  );
}
