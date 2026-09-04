// Gerador pseudo-aleatório determinístico (mulberry32) usado apenas para
// popular as telas com dados simulados coerentes e estáveis entre renders.
export function seededRandom(seed: number) {
  let a = seed;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

export function int(rnd: () => number, min: number, max: number) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

export function code(prefix: string, n: number, width = 4) {
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

export function recentDate(rnd: () => number, maxDaysAgo = 60) {
  const d = new Date();
  d.setDate(d.getDate() - int(rnd, 0, maxDaysAgo));
  return d;
}

export function futureDate(rnd: () => number, maxDaysAhead = 45) {
  const d = new Date();
  d.setDate(d.getDate() + int(rnd, -5, maxDaysAhead));
  return d;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

export function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
