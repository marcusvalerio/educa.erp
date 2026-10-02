"""ATLAS.ERP — product tour: trilha e sound design sintetizados (sem amostras externas).

Lê timeline.json (cenas + deixas exportadas pelo compositor) e gera tour-audio.wav
(48 kHz, estéreo, 24-bit). Tudo é determinístico (semente fixa).

Trilha: eletrônica/corporativa discreta em Ré menor, 100 BPM.
  Abertura atmosférica → tensão no "problema" → pulso suave nos módulos →
  leve intensificação no fluxo completo → resolução em Ré maior com cauda longa.
Sound design: clique, troca de tela, foco, etapa, confirmação, aprovação,
  notificação de usuário, bloqueio, transições — sempre baixo, sob a trilha.
"""
import json
import sys
import wave
import numpy as np
from scipy import signal

SR = 48000
RNG = np.random.default_rng(20261002)
tl = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "timeline.json"))
TOTAL = tl["total"]
N = int((TOTAL + 0.2) * SR)
SC = {s["n"]: s for s in tl["scenes"]}


def db(x):
    return 10 ** (x / 20)


def t_arr(dur):
    return np.arange(int(dur * SR)) / SR


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    e = np.full(n, s, dtype=np.float64)
    a = min(a, n)
    e[:a] = np.linspace(0, 1, a, endpoint=False)
    d = min(d, n - a)
    e[a:a + d] = np.linspace(1, s, d, endpoint=False)
    if r > 0:
        r = min(r, n)
        e[n - r:] *= np.linspace(1, 0, r)
    return e


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x, f1, f2, order=2):
    b, a = signal.butter(order, [f1 / (SR / 2), min(f2, SR * 0.45) / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(buf, x, t, gain=1.0, pan=0.0):
    """Soma o sinal mono/estéreo x em buf (2, N) a partir de t segundos."""
    i = int(t * SR)
    if i >= buf.shape[1] or i + 1 <= 0:
        return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.vstack([x * l * 1.4142, x * r * 1.4142])
    j = min(buf.shape[1], i + x.shape[1])
    s0 = max(0, -i)
    buf[:, max(i, 0):j] += gain * x[:, s0:j - i]


# ---------------------------------------------------------------- automação (intensidade por tempo)
def scene_t(n, lt=0.0):
    return SC[n]["start"] + lt


def curve(points):
    """Interpolação linear de [(t, v)] em todo o comprimento."""
    ts = np.array([p[0] for p in points]) * SR
    vs = np.array([p[1] for p in points])
    return np.interp(np.arange(N), ts, vs)


CUT = next(c["t"] for c in tl["cues"] if c["type"] == "cut")
IMPACT = next(c["t"] for c in tl["cues"] if c["type"] == "impact")
RESOLVE = next(c["t"] for c in tl["cues"] if c["type"] == "resolve")
FLOW0, FLOW1 = scene_t(13), SC[13]["end"]
END = TOTAL

# brilho do pad (corte do filtro, Hz)
bright = curve([(0, 350), (6, 900), (IMPACT, 2400), (CUT - 2, 1300), (CUT, 600), (CUT + 0.3, 2600), (scene_t(3), 1800), (scene_t(7), 2400), (FLOW0, 2600), (FLOW0 + 12, 4200), (FLOW1, 3000), (scene_t(15), 2200), (RESOLVE, 3200), (END, 1800)])
# nível do pad
padlv = curve([(0, 0), (4, 0.7), (IMPACT, 1.0), (CUT - 0.05, 0.85), (CUT, 0.0), (CUT + 0.25, 0.0), (CUT + 0.6, 1.0), (FLOW0 + 10, 1.15), (FLOW1, 1.0), (RESOLVE - 1, 0.9), (RESOLVE + 0.5, 1.25), (END - 3.5, 0.9), (END, 0)])
# bateria / pulso
kicklv = curve([(0, 0), (scene_t(4), 0), (scene_t(4) + 2, 0.55), (scene_t(7), 0.8), (FLOW0, 0.85), (FLOW0 + 10, 1.0), (FLOW1, 0.8), (scene_t(15) + 2, 0.5), (RESOLVE - 2.2, 0.35), (RESOLVE - 1.2, 0), (END, 0)])
hatlv = curve([(0, 0), (scene_t(5), 0), (scene_t(5) + 2, 0.5), (scene_t(7), 0.75), (FLOW0 + 6, 1.0), (FLOW1, 0.7), (scene_t(15), 0.4), (RESOLVE - 2, 0), (END, 0)])
arplv = curve([(0, 0), (IMPACT, 0), (IMPACT + 1.5, 0.45), (CUT - 0.05, 0.55), (CUT, 0), (CUT + 1.0, 0), (CUT + 3, 0.6), (scene_t(6), 0.75), (FLOW0, 0.85), (FLOW0 + 10, 1.0), (FLOW1, 0.7), (scene_t(16), 0.5), (RESOLVE - 1.5, 0.2), (RESOLVE + 2, 0.15), (END - 4, 0), (END, 0)])
basslv = curve([(0, 0.0), (3, 0.5), (IMPACT, 0.8), (CUT - 0.05, 0.8), (CUT, 0), (CUT + 0.5, 0.75), (FLOW0 + 10, 1.0), (FLOW1, 0.85), (RESOLVE - 1, 0.6), (RESOLVE + 0.3, 1.0), (END - 3, 0.6), (END, 0)])

BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
# progressão (2 compassos por acorde): Dm9 – B♭maj7 – Fmaj7/A – Gm9
PROG = [[50, 53, 57, 60, 64], [46, 50, 53, 57, 64], [45, 53, 57, 60, 64], [43, 50, 53, 57, 58]]
ROOT = [38, 34, 33, 31]
CHORD_LEN = 2 * BAR
FINAL = [50, 54, 57, 61, 64, 69]       # Ré maior com 9ª (resolução)
F_ROOT = 38


def chord_at(t):
    if t >= RESOLVE - 0.05:
        return FINAL, F_ROOT
    k = int(t // CHORD_LEN) % len(PROG)
    return PROG[k], ROOT[k]


# ---------------------------------------------------------------- PAD (serras desafinadas, filtro variável por bloco)
def saw(freq, n, phase0=0.0):
    ph = (phase0 + np.cumsum(np.full(n, freq / SR))) % 1.0
    return 2 * ph - 1


def render_pad():
    out = np.zeros((2, N))
    # cada acorde = segmento com envelope próprio (sobreposição suave)
    starts = list(np.arange(0, RESOLVE - 0.05, CHORD_LEN)) + [RESOLVE - 0.05]
    for i, s in enumerate(starts):
        notes, _ = chord_at(s + 0.01)
        last = i == len(starts) - 1
        dur = (END - s + 0.2) if last else min(CHORD_LEN, RESOLVE - 0.05 - s) + 1.6
        n = int(dur * SR)
        seg = np.zeros((2, n))
        for m in notes:
            f = mtof(m)
            for d, pan in ((-7, -0.6), (0, 0.0), (7, 0.6)):
                ff = f * 2 ** (d / 1200)
                x = saw(ff, n, RNG.random()) * 0.33
                l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
                seg[0] += x * l
                seg[1] += x * r
        e = env_adsr(n, 1.4 if not last else 2.2, 0.5, 0.85, 1.6 if not last else 4.0)
        seg *= e / len(notes)
        place(out, seg, s)
    # filtro variável: blocos de 50 ms com estado contínuo
    blk = int(0.05 * SR)
    res = np.zeros_like(out)
    zi = [np.zeros(2), np.zeros(2)]
    for i in range(0, N, blk):
        fc = float(bright[min(i, N - 1)])
        b, a = signal.butter(2, fc / (SR / 2), "low")
        for c in range(2):
            res[c, i:i + blk], zi[c] = signal.lfilter(b, a, out[c, i:i + blk], zi=zi[c])
    # leve "respiração" (LFO) e sidechain dos bumbos é aplicado depois
    lfo = 1 + 0.06 * np.sin(2 * np.pi * 0.09 * np.arange(N) / SR)
    return res * padlv * lfo


# ---------------------------------------------------------------- shimmer (sinos agudos lentos)
def render_shimmer():
    out = np.zeros((2, N))
    t = 0.0
    k = 0
    while t < END - 2:
        notes, _ = chord_at(t)
        m = notes[(k * 3) % len(notes)] + 24
        n = int(2.6 * SR)
        tt = np.arange(n) / SR
        x = (np.sin(2 * np.pi * mtof(m) * tt) + 0.3 * np.sin(2 * np.pi * mtof(m) * 2.01 * tt)) * np.exp(-tt * 1.6)
        x *= np.minimum(1, tt / 0.02)
        place(out, x, t, 0.05, pan=np.sin(k * 1.7) * 0.7)
        t += BEAT * 3
        k += 1
    lvl = curve([(0, 0.0), (3, 0.5), (IMPACT, 1.0), (CUT, 0), (CUT + 1, 0.7), (FLOW0, 1.0), (FLOW1, 0.8), (END - 2, 0.6), (END, 0)])
    return out * lvl


# ---------------------------------------------------------------- ARP (pluck com eco)
def pluck(m, dur=0.42):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = mtof(m)
    x = 0.6 * np.sin(2 * np.pi * f * tt) + 0.25 * signal.sawtooth(2 * np.pi * f * tt, 0.5) + 0.12 * np.sin(2 * np.pi * 2 * f * tt)
    x *= np.exp(-tt * 9) * np.minimum(1, tt / 0.003)
    return lp(x, 3200)


def render_arp():
    out = np.zeros((2, N))
    step = BEAT / 2   # colcheias
    pattern = [0, 2, 1, 3, 2, 4, 1, 3]
    t, k = 0.0, 0
    while t < END:
        notes, _ = chord_at(t)
        m = notes[pattern[k % 8] % len(notes)] + 12
        if (k % 16) in (6, 14):
            m += 12
        a = float(arplv[min(int(t * SR), N - 1)])
        if a > 0.01:
            place(out, pluck(m), t, 0.11 * a * (1.0 if k % 2 == 0 else 0.75), pan=0.35 * np.sin(k * 0.9))
        t += step
        k += 1
    # eco pingue-pongue (3/8)
    d = int(BEAT * 0.75 * SR)
    echo = np.zeros_like(out)
    echo[0, d:] += out[1, :-d] * 0.38
    echo[1, d:] += out[0, :-d] * 0.38
    echo[0, 2 * d:] += out[0, :-2 * d] * 0.16
    echo[1, 2 * d:] += out[1, :-2 * d] * 0.16
    return out + lp(echo, 2200)


# ---------------------------------------------------------------- BAIXO (sub + corpo)
def render_bass():
    out = np.zeros(N)
    t = 0.0
    while t < END:
        _, r = chord_at(t + 0.01)
        nxt = min(t + BEAT * 2, END)
        if t >= RESOLVE - 0.05:
            nxt = END
        n = int((nxt - t) * SR)
        tt = np.arange(n) / SR
        f = mtof(r + 12)
        x = np.sin(2 * np.pi * f * tt) + 0.18 * np.tanh(3 * np.sin(2 * np.pi * f * tt))
        e = env_adsr(n, 0.02, 0.4, 0.75, 0.08 if nxt < END else 3.0)
        i = int(t * SR)
        out[i:i + n] += (x * e)[: N - i]
        t = nxt
    out = lp(out, 420) * basslv * 0.28
    return np.vstack([out, out])


# ---------------------------------------------------------------- BATERIA (bumbo suave, chimbal, shaker)
def kick():
    n = int(0.42 * SR)
    tt = np.arange(n) / SR
    f = 46 + 90 * np.exp(-tt * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7.5)
    x += 0.15 * hp(RNG.standard_normal(n), 2500) * np.exp(-tt * 180)
    return lp(x, 900)


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    tt = np.arange(n) / SR
    x = hp(RNG.standard_normal(n), 7000) * np.exp(-tt * (14 if open_ else 80))
    return x


KICK = kick()


def render_drums():
    out = np.zeros((2, N))
    duck = np.ones(N)
    t, k = 0.0, 0
    while t < END:
        kl = float(kicklv[min(int(t * SR), N - 1)])
        hl = float(hatlv[min(int(t * SR), N - 1)])
        if kl > 0.01 and k % 4 in (0, 2) or (kl > 0.6 and k % 4 == 3 and (k // 4) % 2 == 1):
            if kl > 0.01:
                place(out, KICK, t, 0.42 * kl)
                i = int(t * SR)
                m = int(0.32 * SR)
                if i + m < N:
                    duck[i:i + m] = np.minimum(duck[i:i + m], 1 - 0.15 * kl * np.exp(-np.arange(m) / (0.08 * SR)))
        if hl > 0.01:
            # chimbal nos contratempos; aberto a cada 2 compassos no fluxo
            place(out, hat(), t + BEAT / 2, 0.05 * hl, pan=0.25)
            if hl > 0.85 and k % 8 == 7:
                place(out, hat(True), t + BEAT / 2, 0.035 * hl, pan=-0.2)
            # shaker em semicolcheias (bem baixo)
            for q in (0.25, 0.75):
                place(out, hat() * 0.6, t + BEAT * q, 0.022 * hl, pan=-0.35)
        t += BEAT
        k += 1
    return out, duck


# ---------------------------------------------------------------- SFX
def sine(f, dur, decay):
    tt = t_arr(dur)
    return np.sin(2 * np.pi * f * tt) * np.exp(-tt * decay) * np.minimum(1, tt / 0.002)


def noise_sweep(dur, f0, f1, shape="swell"):
    n = int(dur * SR)
    x = RNG.standard_normal(n)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    blk = int(0.01 * SR)
    for i in range(0, n, blk):
        p = i / n
        fc = f0 * (f1 / f0) ** p
        b, a = signal.butter(2, [max(60, fc * 0.6) / (SR / 2), min(fc * 1.6, SR * 0.45) / (SR / 2)], "band")
        out[i:i + blk] = signal.lfilter(b, a, x[i:i + blk])
    if shape == "swell":
        e = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 1.6
    elif shape == "rise":
        e = (tt / dur) ** 2.2 * np.minimum(1, (dur - tt) / 0.03)
    else:
        e = np.exp(-tt * 6)
    return out * e


def bell(m, dur=1.2, decay=3.5):
    f = mtof(m)
    tt = t_arr(dur)
    x = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt * 6) + 0.18 * np.sin(2 * np.pi * f * 5.4 * tt) * np.exp(-tt * 10)
    return x * np.exp(-tt * decay) * np.minimum(1, tt / 0.003)


def addv(*xs):
    n = max(len(x) for x in xs)
    o = np.zeros(n)
    for x in xs:
        o[: len(x)] += x
    return o


STEP_NOTES = [74, 77, 79, 81, 84, 86, 89]  # Ré menor pentatônica


def sfx(c):
    k = c["type"]
    if k == "click":
        x = sine(2300, 0.03, 160) * 0.7
        nz = hp(RNG.standard_normal(int(0.01 * SR)), 2500) * np.exp(-t_arr(0.01) * 400)
        x[: len(nz)] += nz * 0.5
        return x, -14, 0.15
    if k == "focus":
        return addv(bell(93, 0.35, 14) * 0.6, bell(100, 0.3, 18) * 0.3), -30, 0.25
    if k == "swap":
        return noise_sweep(0.22, 2500, 5000, "swell"), -28, 0.0
    if k == "swipe":
        return noise_sweep(0.38, 900, 4200, "swell"), -25, 0.4
    if k in ("whoosh", "whooshSoft"):
        return noise_sweep(0.95, 300, 3200, "swell"), -18 if k == "whoosh" else -21, 0.0
    if k == "whooshDeep":
        x = noise_sweep(1.0, 200, 2600, "swell")
        tt = t_arr(1.0)
        x += 0.5 * np.sin(2 * np.pi * np.cumsum(70 + 60 * tt) / SR) * np.sin(np.pi * tt) ** 2
        return x, -18, 0.0
    if k == "step":
        m = STEP_NOTES[c.get("i", 0) % len(STEP_NOTES)]
        return addv(bell(m, 0.9, 6) * 0.8, bell(m - 12, 0.6, 9) * 0.25), -29, 0.0
    if k == "confirm":
        x = np.zeros(int(1.4 * SR))
        a, b = bell(81, 1.1, 4.5), bell(86, 1.2, 4.0)
        x[: len(a)] += a
        o = int(0.11 * SR)
        x[o:o + len(b)] += b
        return x, -28, 0.0
    if k == "approve":
        x = np.zeros(int(1.8 * SR))
        for j, m in enumerate((74, 78, 81, 86)):
            b = bell(m, 1.4, 3.5)
            o = int(j * 0.09 * SR)
            x[o:o + len(b)] += b * (0.9 if j < 3 else 0.7)
        return x, -26, 0.0
    if k == "user":
        tt = t_arr(0.16)
        f = 880 + 440 * np.minimum(1, tt / 0.06)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 22) * np.minimum(1, tt / 0.004)
        return x, -28, 0.3
    if k == "blocked":
        x = np.zeros(int(0.6 * SR))
        for o, f in ((0.0, 190), (0.14, 150)):
            s_ = addv(sine(f, 0.3, 16), 0.3 * sine(f * 2, 0.2, 30))
            i = int(o * SR)
            x[i:i + len(s_)] += s_
        return lp(x, 1200), -24, 0.0
    if k == "lock":
        return lp(addv(sine(420, 0.12, 40), 0.5 * sine(840, 0.08, 60)), 2000), -30, 0.0
    if k == "connect":
        x = np.zeros(int(1.6 * SR))
        for j, m in enumerate((86, 89, 93, 98)):
            b = bell(m, 1.0, 5)
            o = int(j * 0.07 * SR)
            x[o:o + len(b)] += b
        return x, -32, 0.0
    if k in ("core", "resolve"):
        tt = t_arr(2.5)
        boom = np.sin(2 * np.pi * np.cumsum(42 + 40 * np.exp(-tt * 8)) / SR) * np.exp(-tt * 2.2)
        x = boom + 0.25 * lp(RNG.standard_normal(len(tt)), 600) * np.exp(-tt * 9)
        b = bell(86, 2.5, 1.6)
        x += 0.35 * b
        return x, -17 if k == "resolve" else -19, 0.0
    if k == "build":
        return noise_sweep(1.6, 400, 2400, "swell") * 0.8, -28, 0.0
    if k == "lockup":
        tt = t_arr(1.6)
        x = (np.sin(2 * np.pi * mtof(62) * tt) + 0.5 * np.sin(2 * np.pi * mtof(69) * tt)) * np.sin(np.pi * tt / 1.6) ** 2
        return x, -30, 0.0
    if k in ("riser", "converge"):
        d = c.get("dur", 1.8)
        x = noise_sweep(d, 300, 7000, "rise")
        tt = t_arr(d)
        x += 0.35 * np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * tt / d)) / SR) * (tt / d) ** 2
        return x, -24 if k == "riser" else -26, 0.0
    if k == "impact":
        tt = t_arr(3.0)
        boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-tt * 10)) / SR) * np.exp(-tt * 1.4)
        x = boom + 0.4 * lp(RNG.standard_normal(len(tt)), 1800) * np.exp(-tt * 5)
        return x, -14, 0.0
    if k == "cut":
        tt = t_arr(0.8)
        x = np.sin(2 * np.pi * np.cumsum(55 + 50 * np.exp(-tt * 20)) / SR) * np.exp(-tt * 6)
        return x, -18, 0.0
    if k == "swell":
        return noise_sweep(1.6, 2000, 9000, "swell"), -31, 0.0
    return None


def render_sfx():
    out = np.zeros((2, N))
    for j, c in enumerate(tl["cues"]):
        r = sfx(c)
        if r is None:
            continue
        x, g, spread = r
        pan = spread * np.sin(j * 2.3)
        place(out, x, c["t"], db(g) * 2.2, pan=pan)
    return out


# ---------------------------------------------------------------- reverb (convolução com IR sintética)
def reverb(x, seconds=2.8, predelay=0.02):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    ir = np.zeros((2, n + int(predelay * SR)))
    for c in range(2):
        nz = RNG.standard_normal(n) * np.exp(-tt * (6.9 / seconds))
        ir[c, int(predelay * SR):] = lp(nz, 5000)
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    return np.vstack([signal.fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])


print("pad…", flush=True)
pad = render_pad()
print("arp/baixo/bateria…", flush=True)
arp = render_arp()
shim = render_shimmer()
bass = render_bass()
drums, duck = render_drums()
print("sfx…", flush=True)
fx = render_sfx()

# macro-dinâmica da trilha (dB): atmosférica → cresce nos módulos → pico no fluxo → resolve
macro = db(curve([(0, -12), (5, -9), (IMPACT, -4), (IMPACT + 2, -6), (CUT, -6), (CUT + 0.6, -4.5), (scene_t(3), -4), (scene_t(7), -2.5), (FLOW0, -2), (FLOW0 + 12, 0), (FLOW1, -1.5), (scene_t(15), -3.5), (RESOLVE - 1.5, -4.5), (RESOLVE + 0.5, -1), (END, -3)]))
# o "corte" da cena 2: silêncio quase total por um instante (inclusive a cauda do reverb)
gate = curve([(0, 1), (CUT - 0.06, 1), (CUT, 0.02), (CUT + 0.22, 0.02), (CUT + 0.32, 1), (END, 1)])
music_dry = (pad * 0.55 * duck + arp + bass + drums + shim) * macro
send = (pad * 0.35 + arp * 0.8 + shim * 1.2) * macro + fx * 0.35
print("reverb…", flush=True)
wet = reverb(send, 3.2)
mix = (music_dry + wet * 0.32) * gate + fx
if "--stats" in sys.argv:
    def r(x, a, b):
        return 20 * np.log10(np.sqrt(np.mean(x[:, int(a * SR):int(b * SR)] ** 2)) + 1e-12)
    for c in tl["cues"]:
        if c["type"] in ("click", "focus", "step", "confirm", "swipe", "whoosh", "approve", "blocked", "user"):
            a = c["t"]
            print(f'{c["type"]:9s} {a:7.2f}  fx {r(fx, a, a + 0.25):6.1f}  musica {r(music_dry + wet * 0.32, a - 0.5, a + 0.5):6.1f}')
# fade final e início
fade = np.ones(N)
fi = int(0.3 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fo0 = int((END - 2.2) * SR)
fade[fo0:] = np.linspace(1, 0, N - fo0) ** 1.5
mix *= fade
# loudness aproximada (RMS) e limitador suave
rms = np.sqrt(np.mean(mix ** 2))
target = db(-19.5)
mix *= target / max(rms, 1e-9)
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
peak = np.max(np.abs(mix))
if peak > db(-1.0):
    mix *= db(-1.0) / peak
print(f"rms {20*np.log10(np.sqrt(np.mean(mix**2))):.1f} dBFS, pico {20*np.log10(np.max(np.abs(mix))):.1f} dBFS, {N/SR:.2f} s")

pcm = (np.clip(mix.T, -1, 1) * (2 ** 23 - 1)).astype(np.int32)
b = np.zeros((pcm.shape[0], 2, 3), dtype=np.uint8)
for c in range(2):
    v = pcm[:, c].astype(np.uint32)
    b[:, c, 0] = v & 0xFF
    b[:, c, 1] = (v >> 8) & 0xFF
    b[:, c, 2] = (v >> 16) & 0xFF
with wave.open(sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else "tour-audio.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(3)
    w.setframerate(SR)
    w.writeframes(b.tobytes())
print("ok")
