# Base musicale ORIGINALE, scritta da programma (nessun campione, nessun brano esistente):
# groove latino leggero a 100 BPM — clave 3-2, shaker, conga, basso tumbao, accordi tipo marimba. 28,8 s, si ripete.
import numpy as np, wave
SR = 44100; BPM = 100; STEP = 60 / BPM / 4            # sedicesimo
BARS = 12; N = int(SR * STEP * 16 * BARS)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
def env(n, a=0.003, d=0.15):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)
def put(sig, start, pan=0.0, g=1.0):
    i = int(start * SR); j = min(N, i + len(sig)); s = sig[:j - i] * g
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))
def tono(f, dur, d, harm=((1, 1.0),), a=0.004):
    n = int(SR * dur); t = np.arange(n) / SR
    return sum(w * np.sin(2 * np.pi * f * h * t) for h, w in harm) * env(n, a, d)
def nota(m): return 440 * 2 ** ((m - 69) / 12)
clave = [0, 6, 12, 20, 24]                               # son 3-2 su 32 sedicesimi
accordi = [(57, [69, 72, 76]), (62, [69, 74, 77]), (64, [68, 71, 76]), (57, [69, 72, 76])]  # Am Dm E Am
for bar in range(BARS):
    t0 = bar * 16 * STEP
    root, ch = accordi[bar % 4]; nxt = accordi[(bar + 1) % 4][0]
    for s in range(16):
        t = t0 + s * STEP
        # shaker: rumore filtrato, accento sugli ottavi in levare
        n = int(SR * 0.05); nz = rng.standard_normal(n); nz = np.diff(nz, prepend=0) * env(n, 0.002, 0.018)
        put(nz, t, pan=0.35, g=0.10 if s % 2 else 0.05)
        if (bar % 2) * 16 + s in clave:
            put(tono(2500, 0.08, 0.02, ((1, 1), (2.7, 0.3))), t, pan=-0.2, g=0.22)
        if s in (0, 8):
            n = int(SR * 0.3); tt = np.arange(n) / SR
            put(np.sin(2 * np.pi * (50 + 70 * np.exp(-tt * 30)) * tt) * env(n, 0.002, 0.12), t, g=0.45)
        if s in (6, 7, 14, 15):                         # conga: toni aperti del tumbao
            put(tono(330 if s in (6, 14) else 290, 0.25, 0.09, ((1, 1), (1.5, 0.25))), t, pan=0.25, g=0.20)
        if s == 6:  put(tono(nota(root - 24), 0.5, 0.35, ((1, 1), (2, 0.35), (3, 0.12)), 0.01), t, g=0.55)
        if s == 12: put(tono(nota(nxt - 24), 0.6, 0.40, ((1, 1), (2, 0.35), (3, 0.12)), 0.01), t, g=0.55)
        if s in (2, 5, 8, 11, 14):                      # montuno leggero, tipo marimba
            for m in ch:
                put(tono(nota(m), 0.35, 0.12, ((1, 1), (4, 0.18)), 0.002), t, pan=-0.3, g=0.07)
mix = np.stack([L, R], 1)
# dolce compressione e normalizzazione
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix /= np.max(np.abs(mix)) / 0.89
f = int(SR * 0.02); mix[:f] *= np.linspace(0, 1, f)[:, None]; mix[-f:] *= np.linspace(1, 0, f)[:, None]
with wave.open('musica.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('durata', N / SR, 'picco', float(np.max(np.abs(mix))), 'rms', float(np.sqrt(np.mean(mix ** 2))))
