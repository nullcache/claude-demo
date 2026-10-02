#!/usr/bin/env python3
"""
弹丸论破 PV 配乐 + 音效：纯程序合成（numpy / scipy），与画面共用 144 BPM 节拍网格。
输出 public/dangan/score.m4a（48 kHz 立体声 AAC）。

用法：python3 scripts/dangan-audio.py [--wav out/score.wav]
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
DUR = 20.0
N = int(SR * DUR)
BEAT = 60 / 144
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(1440)


def B(x):
    return x * BEAT


def hz(note):
    """'E2' / 'F#4' / 'Bb3' → Hz"""
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[note[0]]
    rest = note[1:]
    if rest.startswith('#'):
        n += 1
        rest = rest[1:]
    elif rest.startswith('b'):
        n -= 1
        rest = rest[1:]
    midi = n + 12 * (int(rest) + 1)
    return 440.0 * 2 ** ((midi - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


# ───────────── 振荡器 ─────────────
def blep(ph, dt):
    out = np.zeros_like(ph)
    m = ph < dt
    x = ph[m] / dt[m] if np.ndim(dt) else ph[m] / dt
    out[m] = x + x - x * x - 1
    m2 = ph > 1 - (dt if not np.ndim(dt) else dt)
    x2 = (ph[m2] - 1) / (dt[m2] if np.ndim(dt) else dt)
    out[m2] = x2 * x2 + x2 + x2 + 1
    return out


def phase(freq, n):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.cumsum(f / SR) % 1.0, f / SR


def saw(freq, dur):
    n = int(dur * SR)
    ph, dt = phase(freq, n)
    return 2 * ph - 1 - blep(ph, dt)


def square(freq, dur, duty=0.5):
    n = int(dur * SR)
    ph, dt = phase(freq, n)
    a = 2 * ph - 1 - blep(ph, dt)
    ph2 = (ph + (1 - duty)) % 1.0
    b_ = 2 * ph2 - 1 - blep(ph2, dt)
    return (a - b_) * 0.5


def sine(freq, dur, ph0=0.0):
    n = int(dur * SR)
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.sin(2 * np.pi * (np.cumsum(f) / SR) + ph0)


def noise(dur):
    return rng.uniform(-1, 1, int(dur * SR))


def env_exp(dur, decay, attack=0.002):
    t = tt(dur)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    return a * np.exp(-t / decay)


def env_adsr(dur, a=0.005, d=0.1, s=0.6, r=0.1):
    t = tt(dur)
    e = np.where(t < a, t / a, np.where(t < a + d, 1 - (1 - s) * (t - a) / d, s))
    rel = np.clip((dur - t) / r, 0, 1)
    return e * rel


# ───────────── 滤波 ─────────────
def lp(x, fc, order=2):
    fc = min(fc, SR * 0.45)
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    hi = min(hi, SR * 0.45)
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def sweep_lp(x, fc_fn, block=256, order=2):
    """时变低通：fc_fn(t 秒，局部) → 截止频率"""
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        fc = float(np.clip(fc_fn(i / SR), 30, SR * 0.45))
        sos = butter(order, fc, 'low', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + block], zi = sosfilt(sos, x[i:i + block], zi=zi)
    return out


def sweep_bp(x, fc_fn, q=1.2, block=256):
    out = np.zeros_like(x)
    zi = None
    for i in range(0, len(x), block):
        fc = float(np.clip(fc_fn(i / SR), 60, SR * 0.4))
        lo, hi = fc / (1 + 0.5 / q), fc * (1 + 0.5 / q)
        sos = butter(1, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + block], zi = sosfilt(sos, x[i:i + block], zi=zi)
    return out


# ───────────── 总线 ─────────────
class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def add(self, t0, sig, gain=1.0, pan=0.0):
        sig = np.asarray(sig)
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4
            sig = np.vstack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
        i0 = int(round(t0 * SR))
        if i0 >= N:
            return
        j0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(sig.shape[1] - j0, N - i0)
        if n > 0:
            self.x[:, i0:i0 + n] += gain * sig[:, j0:j0 + n]


drums, music, fx, verb_send = Bus(), Bus(), Bus(), Bus()
kicks = []


# ───────────── 乐器 ─────────────
def kick(t0, g=1.0, long=False):
    d = 0.55 if long else 0.32
    t = tt(d)
    f = 46 + 120 * np.exp(-t / 0.035)
    body = sine(f, d) * np.exp(-t / (0.32 if long else 0.18))
    click = hp(noise(0.006), 2500) * np.exp(-tt(0.006) / 0.0015)
    s = np.tanh(body * 1.6) * 0.9
    s[: len(click)] += click * 0.35
    drums.add(t0, s, 0.95 * g)
    kicks.append((t0, g))


def clap(t0, g=1.0, pan=0.0):
    d = 0.32
    n = noise(d)
    e = np.zeros(int(d * SR))
    t = tt(d)
    for k, off in enumerate([0, 0.011, 0.022]):
        e += (t >= off) * np.exp(-np.clip(t - off, 0, None) / (0.006 if k < 2 else 0.13))
    s = bp(n, 900, 5200) * e
    drums.add(t0, s, 0.55 * g, pan)
    verb_send.add(t0, s, 0.25 * g, pan)


def snare(t0, g=1.0):
    d = 0.22
    s = bp(noise(d), 1500, 9000) * env_exp(d, 0.07) * 0.8 + sine(185, d) * env_exp(d, 0.05) * 0.6
    drums.add(t0, s, 0.5 * g)


def hat(t0, g=1.0, open_=False, pan=0.25):
    d = 0.25 if open_ else 0.05
    s = hp(noise(d), 7500, 4) * env_exp(d, 0.09 if open_ else 0.014)
    drums.add(t0, s, 0.28 * g, pan)


def crash(t0, g=1.0):
    d = 2.2
    s = hp(noise(d), 4200, 2) * env_exp(d, 0.65)
    s2 = hp(noise(d), 4200, 2) * env_exp(d, 0.7)
    drums.add(t0, np.vstack([s, s2]), 0.32 * g)


def boom(t0, g=1.0, f0=58, d=1.8):
    t = tt(d)
    f = f0 * (0.6 + 0.4 * np.exp(-t / 0.25)) + 50 * np.exp(-t / 0.03)
    s = np.tanh(sine(f, d) * np.exp(-t / 0.55) * 2.2) * 0.8
    s += lp(noise(d), 700) * np.exp(-t / 0.12) * 0.9
    fx.add(t0, s, 0.9 * g)
    verb_send.add(t0, s, 0.25 * g)
    kicks.append((t0, 1.4 * g))


def subdrop(t0, g=1.0, d=1.2):
    t = tt(d)
    s = sine(85 * np.exp(-t / 0.5) + 28, d) * np.exp(-t / 0.7) * np.clip(t / 0.01, 0, 1)
    fx.add(t0, s, 0.85 * g)


def shatter(t0, g=1.0, d=0.9, density=70, pan_spread=0.8):
    out = np.zeros((2, int((d + 0.5) * SR)))
    for _ in range(density):
        dt_ = (rng.random() ** 2.2) * d
        f = 1800 + rng.random() * 7500
        dd = 0.03 + rng.random() * 0.18
        t = tt(dd)
        ping = np.sin(2 * np.pi * f * t + rng.random() * 6) * np.exp(-t / (dd * 0.3))
        ping *= (0.25 + rng.random() * 0.75) * (1 - dt_ / d * 0.6)
        p = (rng.random() * 2 - 1) * pan_spread
        a = (p + 1) * np.pi / 4
        i0 = int(dt_ * SR)
        out[0, i0:i0 + len(ping)] += ping * np.cos(a)
        out[1, i0:i0 + len(ping)] += ping * np.sin(a)
    n = hp(noise(d), 3000) * env_exp(d, d * 0.22)
    out[:, : len(n)] += n * 0.7
    crunch = bp(noise(0.12), 400, 3000) * env_exp(0.12, 0.03)
    out[:, : len(crunch)] += crunch * 0.8
    fx.add(t0, out, 0.42 * g)
    verb_send.add(t0, out, 0.3 * g)


def gunshot(t0, g=1.0):
    d = 0.9
    t = tt(d)
    crack = hp(noise(d), 1200) * np.exp(-t / 0.018)
    body = lp(noise(d), 3500) * np.exp(-t / 0.08)
    thump = sine(90 * np.exp(-t / 0.08) + 40, d) * np.exp(-t / 0.15)
    s = np.tanh((crack * 1.4 + body * 1.0 + thump * 1.3) * 1.8)
    fx.add(t0, s, 0.9 * g)
    verb_send.add(t0, s, 0.6 * g)
    kicks.append((t0, 1.3 * g))


def whoosh(t0, d=0.45, g=1.0, f0=300, f1=4000, pan0=-0.7, pan1=0.7):
    n = noise(d)
    s = sweep_bp(n, lambda x: f0 * (f1 / f0) ** (x / d), q=1.4)
    e = np.sin(np.pi * np.clip(tt(d) / d, 0, 1)) ** 2
    s = s * e * 2.2
    pans = np.linspace(pan0, pan1, len(s))
    a = (pans + 1) * np.pi / 4
    fx.add(t0, np.vstack([s * np.cos(a), s * np.sin(a)]), 0.6 * g)


def riser(t0, d, g=1.0, f0=200, f1=6000):
    n = noise(d)
    s = sweep_bp(n, lambda x: f0 * (f1 / f0) ** ((x / d) ** 1.5), q=2.0)
    e = (tt(d) / d) ** 2.2
    tone = saw(110 * 2 ** (3 * (tt(d) / d) ** 1.3), d) * 0.22
    fx.add(t0, (s * 2.2 + lp(tone, 3000)) * e, 0.5 * g)


def reverse_swell(t0_end, d=0.8, g=1.0):
    s = hp(noise(d), 3000) * (tt(d) / d) ** 3
    fx.add(t0_end - d, s, 0.35 * g)


def click(t0, g=1.0, f=3200, d=0.012, pan=0.0):
    s = bp(noise(d), f * 0.7, f * 1.4) * env_exp(d, d * 0.25, 0.0005)
    fx.add(t0, s, 0.7 * g, pan)


def metal(t0, g=1.0, f=220):
    d = 1.4
    t = tt(d)
    s = np.zeros_like(t)
    for r, a, dec in [(1, 1, 0.5), (2.76, 0.6, 0.35), (5.4, 0.4, 0.2), (8.9, 0.25, 0.12)]:
        s += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / dec)
    s += hp(noise(d), 2000) * np.exp(-t / 0.03) * 0.6
    fx.add(t0, s * 0.4, g)
    verb_send.add(t0, s * 0.3, g)


def bell(t0, note, d=1.6, g=1.0, pan=0.0, ratio=3.5, idx=2.2):
    f = hz(note) if isinstance(note, str) else note
    t = tt(d)
    mod = np.sin(2 * np.pi * f * ratio * t) * idx * np.exp(-t / 0.4)
    s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (d * 0.35))
    music.add(t0, s * 0.35, g, pan)
    verb_send.add(t0, s * 0.35, g * 0.8, pan)


def pluck(t0, note, g=1.0, d=0.35, pan=0.0, bright=0.5):
    """Karplus–Strong 拨弦"""
    f = hz(note)
    n = int(d * SR)
    L = int(SR / f)
    buf = rng.uniform(-1, 1, L)
    buf = lp(buf, 2000 + 6000 * bright)
    out = np.zeros(n)
    for i in range(n):
        j = i % L
        out[i] = buf[j]
        buf[j] = 0.5 * (buf[j] + buf[(j + 1) % L]) * 0.994
    music.add(t0, out * env_exp(d, d * 0.4), 0.6 * g, pan)
    verb_send.add(t0, out, 0.12 * g, pan)


def stab(t0, notes, g=1.0, d=0.6, cutoff=3200, dist=1.0, detune=0.12, decay=0.25):
    s = np.zeros(int(d * SR))
    sR = np.zeros(int(d * SR))
    for note in notes:
        f = hz(note)
        for k, cents in enumerate([-detune * 100, 0, detune * 100]):
            v = saw(f * 2 ** (cents / 1200), d)
            if k == 0:
                s += v
            elif k == 2:
                sR += v
            else:
                s += v * 0.7
                sR += v * 0.7
    e = env_exp(d, decay, 0.003)
    st = np.vstack([s, sR]) / (len(notes) * 1.7)
    out = np.vstack([sweep_lp(st[i] * e, lambda x: 300 + cutoff * np.exp(-x / 0.12)) for i in range(2)])
    out = np.tanh(out * (1 + dist)) * 0.8
    music.add(t0, out, 0.65 * g)
    verb_send.add(t0, out, 0.35 * g)


def bass(t0, note, d, g=1.0, cutoff=900):
    f = hz(note)
    s = saw(f, d) * 0.7 + square(f / 2, d) * 0.35
    e = env_adsr(d, 0.003, 0.08, 0.7, 0.03)
    s = sweep_lp(s * e, lambda x: 120 + cutoff * np.exp(-x / 0.06))
    music.add(t0, np.tanh(s * 1.8) * 0.7, 0.75 * g)


def arp_note(t0, note, d, g=1.0, pan=0.0, cutoff=2600):
    s = square(hz(note), d, 0.3) * env_exp(d, 0.08)
    music.add(t0, lp(s, cutoff), 0.17 * g, pan)
    music.add(t0 + B(0.75), lp(s, cutoff * 0.6), 0.07 * g, -pan)  # 附点 8 分延迟


def pad(t0, notes, d, g=1.0, cutoff=1400, attack=0.4):
    s = np.zeros((2, int(d * SR)))
    for note in notes:
        f = hz(note)
        for i, c in enumerate([-9, -3, 4, 10]):
            s[i % 2] += saw(f * 2 ** (c / 1200), d)
    s = np.vstack([lp(s[0], cutoff), lp(s[1], cutoff)]) / (len(notes) * 2.5)
    e = env_adsr(d, attack, 0.2, 0.85, min(0.6, d * 0.4))
    music.add(t0, s * e, 0.5 * g)
    verb_send.add(t0, s * e, 0.3 * g)


def lead(t0, note, d, g=1.0, glide_from=None):
    f1 = hz(note)
    t = tt(d)
    f = f1 * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) / 0.2, 0, 1))
    if glide_from:
        f0 = hz(glide_from)
        f = f * (1 + (f0 / f1 - 1) * np.exp(-t / 0.03))
    s = saw(f, d) * 0.6 + saw(f * 1.006, d) * 0.6 + square(f * 0.5, d) * 0.25
    s = lp(s, 4200) * env_adsr(d, 0.01, 0.15, 0.75, 0.08)
    music.add(t0, s, 0.32 * g, 0.1)
    verb_send.add(t0, s, 0.4 * g, -0.1)


def chip(t0, note, d, g=1.0, duty=0.5, pan=0.0):
    f = hz(note)
    s = square(f, d, duty) * env_adsr(d, 0.002, 0.05, 0.8, 0.01)
    # 量化：8-bit 风格
    s = np.round(s * 7) / 7
    fx.add(t0, s, 0.22 * g, pan)


def chip_noise(t0, d=0.06, g=1.0):
    n = np.repeat(rng.uniform(-1, 1, int(d * SR / 24) + 1), 24)[: int(d * SR)]
    fx.add(t0, np.round(n * env_exp(d, d * 0.3) * 4) / 4, 0.25 * g)


def blip(t0, f=1800, g=1.0, d=0.03, pan=0.0):
    s = np.sin(2 * np.pi * f * tt(d)) * env_exp(d, d * 0.3, 0.001)
    fx.add(t0, s, 0.18 * g, pan)


def shing(t0, g=1.0):
    d = 1.2
    t = tt(d)
    s = np.zeros_like(t)
    for f in [2637, 3520, 4186, 5274]:
        s += np.sin(2 * np.pi * f * (1 + 0.004 * np.sin(2 * np.pi * 7 * t)) * t) * np.exp(-t / 0.35)
    s += hp(noise(d), 6000) * np.exp(-t / 0.08)
    fx.add(t0, s * 0.18, g)
    verb_send.add(t0, s * 0.18, g)


def splat(t0, g=1.0):
    d = 0.7
    t = tt(d)
    n = noise(d)
    s = sweep_bp(n, lambda x: 2400 * np.exp(-x / 0.08) + 180, q=1.5) * np.exp(-t / 0.16) * 2.4
    s += lp(noise(d), 300) * np.exp(-t / 0.08) * 1.2
    fx.add(t0, np.tanh(s), 0.7 * g)
    verb_send.add(t0, s, 0.2 * g)


def stamp(t0, g=1.0):
    d = 0.3
    t = tt(d)
    s = sine(150 * np.exp(-t / 0.04) + 70, d) * np.exp(-t / 0.09) + bp(noise(d), 600, 4000) * np.exp(-t / 0.02) * 0.8
    fx.add(t0, np.tanh(s * 1.5), 0.6 * g)
    kicks.append((t0, 0.6 * g))


def glitch(t0, d=0.2, g=1.0):
    n = int(d * SR)
    hold = np.repeat(rng.uniform(-1, 1, n // 90 + 1), 90)[:n]
    s = np.sign(hold) * (np.abs(hold) > 0.3) * env_adsr(d, 0.002, 0.05, 0.7, 0.03)
    s = bp(s, 300, 6000)
    fx.add(t0, s, 0.3 * g, rng.uniform(-0.5, 0.5))


def tape_stop(t0, d=0.5, g=1.0, f=hz('E2')):
    t = tt(d)
    fr = f * (1 - t / d) ** 1.5 + 1
    s = lp(saw(fr, d), 900) * (1 - t / d)
    music.add(t0, s, 0.4 * g)


def crt(t0, on=True, g=1.0):
    d = 0.5
    t = tt(d)
    thoomp = sine(70 * np.exp(-t / 0.1) + 30, d) * np.exp(-t / 0.12)
    whine = np.sin(2 * np.pi * 7800 * t) * np.exp(-t / 0.25) * 0.05
    stat = hp(noise(d), 2000) * np.exp(-t / 0.05) * 0.4
    fx.add(t0, (thoomp + whine + stat), 0.6 * g)


def heartbeat(t0, g=1.0):
    for k, o in enumerate([0, 0.16]):
        d = 0.4
        t = tt(d)
        s = sine(55 * np.exp(-t / 0.05) + 35, d) * np.exp(-t / 0.1)
        fx.add(t0 + o, s, (0.8 if k == 0 else 0.55) * g)


# ═════════════ 编排（以拍为单位） ═════════════
CH = {
    'Em': ['E3', 'G3', 'B3', 'E4'],
    'C': ['C3', 'G3', 'C4', 'E4'],
    'Am': ['A2', 'E3', 'A3', 'C4'],
    'B': ['B2', 'F#3', 'B3', 'D#4'],
}
ROOTS = {'Em': 'E', 'C': 'C', 'Am': 'A', 'B': 'B'}
ARP = {
    'Em': ['E4', 'G4', 'B4', 'E5', 'G5', 'E5', 'B4', 'G4'],
    'C': ['C4', 'E4', 'G4', 'C5', 'E5', 'C5', 'G4', 'E4'],
    'Am': ['A3', 'C4', 'E4', 'A4', 'C5', 'A4', 'E4', 'C4'],
    'B': ['B3', 'D#4', 'F#4', 'B4', 'D#5', 'B4', 'F#4', 'D#4'],
}
BASS16 = [0, None, 12, 0, None, 0, 12, None, 0, None, 12, 0, 10, None, 12, 7]


def bass_note(chord, semis):
    base = {'E': 'E2', 'C': 'C2', 'A': 'A1', 'B': 'B1'}[ROOTS[chord]]
    f = hz(base) * 2 ** (semis / 12)
    midi = round(69 + 12 * np.log2(f / 440))
    names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return f'{names[midi % 12]}{midi // 12 - 1}'


def groove(b0, b1, chord, kick_on=True, clap_on=True, hats=True, bass_on=True, arp_on=True, gain=1.0, cutoff=900):
    x = b0
    while x < b1 - 1e-6:
        step = round((x - np.floor(x)) * 4) % 4
        idx16 = int(round((x - b0) * 4)) % 16
        if step == 0:
            if kick_on:
                kick(B(x), gain)
            if clap_on and int(round(x)) % 2 == 1:
                clap(B(x), 0.9 * gain)
        if hats:
            hat(B(x), (0.9 if step == 2 else 0.45) * gain, open_=(step == 2), pan=0.3 if step % 2 else -0.2)
        if bass_on:
            s = BASS16[idx16]
            if s is not None:
                bass(B(x), bass_note(chord, s), B(0.22), 0.9 * gain, cutoff)
        if arp_on:
            k = int(round((x - b0) * 4)) % 8
            arp_note(B(x), ARP[chord][k], B(0.25), gain, pan=0.4 if k % 2 else -0.4)
        x += 0.25


# ── Bar 1（b0–4）：裂缝 · 希望 · 绝望 ──
pad(0, ['E1', 'E2', 'B2'], B(4.2), 0.9, cutoff=500, attack=1.2)
whoosh(0, 0.4, 0.9, 200, 6000, 0, 0)
boom(0, 0.55, f0=50)
for k, n in enumerate(['E5', 'G#5', 'B5', 'E6']):
    bell(B(1) + k * 0.012, n, 2.0, 0.8, pan=-0.5)
stamp(B(1), 0.8)
stab(B(2), ['E3', 'F3', 'G3', 'B3', 'C4'], 1.0, d=1.0, cutoff=2400, dist=2.5, detune=0.25, decay=0.4)
glitch(B(2), 0.22, 1.2)
boom(B(2), 0.5, f0=45)
reverse_swell(B(4), B(1), 1.0)
whoosh(B(3), B(1), 0.9, 2500, 200, 0.6, -0.6)

# ── Bar 2（b4–8）：黑白熊 · 噗噗噗 · 校规 ──
shing(B(4), 1.0)
kick(B(4), 0.8)
# “噗噗噗噗”：与画面里四个拟声字同步（反拍八分音符），每声带一个十六分前倚音
for k, n in enumerate(['B4', 'A#4', 'B4', 'D5']):
    pluck(B(4.25 + k * 0.5) - 0.045, 'F#4', 0.45, 0.12, pan=(-0.4 if k % 2 else 0.4))
    pluck(B(4.25 + k * 0.5), n, 1.0, 0.3, pan=(-0.4 if k % 2 else 0.4))
for x in [5, 5.5]:
    kick(B(x), 0.5)
for x in np.arange(4, 6, 0.5):
    hat(B(x), 0.6, pan=0.3)
bass(B(4), 'E2', B(0.4), 0.7)
bass(B(5), 'E2', B(0.4), 0.7)
stamp(B(6), 1.1)
boom(B(6), 0.5, f0=60, d=0.8)
for k in range(7):
    blip(B(6) + k * 0.022, 2400 + k * 120, 0.8)
stab(B(6), ['E3', 'B3', 'E4'], 0.7, d=0.5, cutoff=1800, dist=1)
boom(B(7), 1.0, f0=48)
splat(B(7) + 0.02, 1.0)
stab(B(7), ['E2', 'E3', 'F3', 'B3', 'E4'], 1.1, d=0.9, cutoff=3000, dist=3, detune=0.2, decay=0.35)
reverse_swell(B(8), B(0.9), 1.2)

# ── Bar 3（b8–12）：节拍进入 · 学园 · 超高校级 ──
crash(B(8), 0.9)
stab(B(8), CH['Em'], 1.0, d=1.2, cutoff=2600)
groove(8, 12, 'Em', arp_on=False, gain=0.95)
metal(B(9), 0.9, 196)
for k in range(6):
    click(B(10 + k * 0.25), 1.0, f=2200, d=0.02)
    blip(B(10 + k * 0.25), 1200 + k * 150, 0.6)
glitch(B(11.5), 0.25, 1.3)
stab(B(11.5), ['E3', 'F3', 'Bb3', 'E4'], 0.8, d=0.3, dist=3)
riser(B(10), B(2), 0.7)

# ── Bar 4（b12–16）：尸体发现 · 下行电梯 ──
boom(B(12), 1.1, f0=46, d=2.2)
splat(B(12), 1.3)
crash(B(12), 0.6)
for k, n in enumerate(['E5', 'C5', 'D5', 'G4']):
    bell(B(12.25 + k * 0.5), n, 1.4, 0.9, pan=0.0, ratio=2.0, idx=1.0)
stamp(B(12.25), 1.0)
for k in range(13):
    blip(B(12.75) + k / 44, 1500 + (k % 3) * 200, 0.5)
rumble = lp(noise(B(2)), 140) * np.linspace(0.3, 1.0, int(B(2) * SR))
fx.add(B(14), rumble, 0.8)
for k, n in enumerate([['E3', 'B3', 'E4'], ['G3', 'B3', 'G4'], ['A3', 'C4', 'A4'], ['B3', 'D#4', 'B4']]):
    stab(B(14 + k * 0.5), n, 0.85, d=0.4, cutoff=2600, dist=1.5)
    stamp(B(14 + k * 0.5), 0.7)
x = 14.0
while x < 15.75:
    step = 0.5 if x < 14.5 else 0.25 if x < 15.25 else 0.125
    snare(B(x), 0.4 + 0.5 * (x - 14) / 1.75)
    x += step
riser(B(14), B(1.75), 1.0, 300, 9000)

# ── Bar 5–6（b16–24）：学级裁判 · 议论开始 ──
boom(B(16), 1.2, f0=50, d=2.0)
crash(B(16), 1.0)
stab(B(16), ['E2', 'E3', 'B3', 'E4', 'F#4', 'G4'], 1.2, d=1.4, cutoff=3800, dist=1.5, decay=0.5)
groove(16, 20, 'Em')
stamp(B(17), 0.9)
stab(B(18), CH['Em'], 0.5, d=0.3)
whoosh(B(18), B(0.7), 0.5, 3000, 400, 0.3, -0.6)
groove(20, 24, 'C')
whoosh(B(20), 0.5, 0.8, 300, 5000, 0.8, -0.6)
blip(B(20), 1200, 1.0)
whoosh(B(20.8), 0.6, 0.8, 250, 4000, -0.8, 0.2)
whoosh(B(21.7), 0.5, 0.7, 400, 6000, 0.7, -0.8)
for k, x in enumerate([23, 23.25, 23.5]):
    blip(B(x), 1600 + k * 500, 1.4, 0.06)

# ── Bar 7（b24–28）：言弹装填 → 发射 ──
groove(24, 27, 'Am', clap_on=True, gain=0.85, cutoff=500)
# 弹巢棘轮：与画面同一角度函数，每过一格响一次
turns = 2.6
prev = None
for i in range(int(B(1.5) * SR / 64)):
    tl = i * 64 / SR
    u = tl / B(1.5)
    e = 1 - 2 ** (-10 * u) if u < 1 else 1
    ang = (1 - e) * turns * 6
    k = int(np.floor(ang))
    if prev is not None and k != prev:
        click(B(24) + tl, 0.9, f=2800, d=0.015, pan=0.2)
    prev = k
metal(B(25.5), 0.8, 330)
click(B(25.5), 1.6, f=1500, d=0.04)
whoosh(B(25.5), 0.3, 0.6, 500, 3000, 0, 0)
click(B(26.5), 1.4, f=2400, d=0.02)
click(B(26.5) + 0.07, 1.6, f=1700, d=0.03)
reverse_swell(B(27), B(0.5), 0.8)
gunshot(B(27), 1.2)
whoosh(B(27), B(1), 1.0, 1200, 150, 0.8, -0.1)
heartbeat(B(27.4), 0.7)

# ── Bar 8（b28–32）：那是错的！ ──
boom(B(28), 1.2, f0=52)
shatter(B(28), 1.4, d=1.0, density=90)
crash(B(28), 0.9)
stab(B(28), ['B2', 'B3', 'D#4', 'F#4', 'A4'], 1.1, d=0.8, cutoff=3500, dist=2)
whoosh(B(28.5), 0.25, 0.8, 600, 5000, -0.8, 0.3)
stab(B(29), ['B2', 'F#3', 'B3', 'D#4', 'F#4'], 1.2, d=1.0, cutoff=4200, dist=2.5, decay=0.45)
stamp(B(29), 1.0)
for x in [29, 30]:
    kick(B(x), 0.9)
bass(B(29), 'B1', B(1.4), 0.9, cutoff=500)
heartbeat(B(30.5), 1.0)
heartbeat(B(31), 1.1)
x = 30.5
while x < 31.75:
    step = 0.25 if x < 31 else 0.125 if x < 31.5 else 0.0625
    snare(B(x), 0.3 + 0.7 * (x - 30.5) / 1.25)
    x += step
riser(B(30.5), B(1.25), 1.2, 200, 10000)
pad(B(30.5), ['B2', 'F#3', 'B3', 'D#4'], B(1.25), 0.7, cutoff=2600, attack=0.8)

# ── Bar 9（b32–36）：论破！ ──
boom(B(32), 1.5, f0=48, d=2.4)
subdrop(B(32), 1.0)
shatter(B(32), 1.6, d=1.2, density=110)
crash(B(32), 1.2)
stab(B(32), ['E2', 'E3', 'G3', 'B3', 'E4', 'G4', 'B4'], 1.3, d=1.6, cutoff=5000, dist=2.5, decay=0.6)
groove(32, 35.25, 'Em', gain=1.0, cutoff=1300)
for x in np.arange(32.5, 35, 1.0):
    stab(B(x), ['E4', 'G4', 'B4'], 0.45, d=0.2, cutoff=4000, dist=1)
# 冰裂声
for k in range(26):
    click(B(34) + (k / 26) ** 1.4 * 0.3, 0.6 + rng.random() * 0.6, f=2000 + rng.random() * 5000, d=0.01, pan=rng.uniform(-0.8, 0.8))
shatter(B(35.25), 1.3, d=1.1, density=90)
boom(B(35.25), 0.6, f0=60, d=1.0)

# ── Bar 10（b35–40）：投票 → GAME OVER ──
groove(35.25, 38, 'C', clap_on=True, arp_on=True, gain=0.8)
metal(B(35.6), 0.6, 140)
x = 35.25
while x < 37.5:
    click(B(x), 0.5, f=3500, d=0.008, pan=0.3)
    x += 0.125
for k, x in enumerate([36.5, 37, 37.5]):
    bell(B(x), ['E6', 'G6', 'B6'][k], 0.8, 1.2, pan=-0.4 + 0.4 * k)
    stamp(B(x), 0.6)
for k in range(40):
    tc = B(37.5) + (rng.random() ** 1.3) * 0.9
    bell(tc, 2200 + rng.random() * 2600, 0.25, 0.25, pan=rng.uniform(-0.9, 0.9), ratio=1.41, idx=1.5)
stab(B(37.5), ['C4', 'E4', 'G4', 'C5'], 0.7, d=0.5, cutoff=5000)
tape_stop(B(37.75), B(0.25))
# 8-bit 段
for k in range(9):
    chip(B(38) + k * B(0.125), ['E5', 'D5', 'C5', 'B4', 'A4', 'G4', 'F#4', 'E4', 'D#4'][k], B(0.11), 1.0, 0.25)
melody = [('E5', 39, 0.25), ('B4', 39.25, 0.25), ('G4', 39.5, 0.25), ('E4', 39.75, 0.25)]
for n, x, d in melody:
    chip(B(x), n, B(d) * 0.9, 1.0, 0.5)
for x in np.arange(38, 40, 0.5):
    chip_noise(B(x), 0.05, 1.0 if x % 1 == 0 else 0.5)
    chip(B(x), 'E2', B(0.2), 0.9, 0.5)
for x in np.arange(38, 40, 0.25):
    chip(B(x) + B(0.125), 'B2', B(0.1), 0.5, 0.125)

# ── Bar 11–12（b40–48）：标题 → 收尾 ──
boom(B(40), 1.4, f0=48, d=2.4)
crash(B(40), 1.1)
subdrop(B(40), 0.8)
stab(B(40), ['E2', 'E3', 'B3', 'E4', 'F#4', 'G4', 'B4'], 1.2, d=2.0, cutoff=4200, dist=1.5, decay=0.8)
pad(B(40), ['E3', 'B3', 'E4', 'G4', 'B4'], B(8), 0.9, cutoff=2400, attack=0.3)
for k, x in enumerate([B(40) + 0.1, B(40.5), B(41), B(41.5)]):
    d = 0.5
    tt_ = tt(d)
    taiko = sine((95 + k * 12) * np.exp(-tt_ / 0.06) + 50 + k * 6, d) * np.exp(-tt_ / 0.16)
    fx.add(x, np.tanh(taiko * 1.8), 0.75)
    stamp(x, 0.6)
groove(40, 42, 'Em', clap_on=False, arp_on=True, gain=0.85)
gunshot(B(42), 1.3)
shatter(B(42), 0.8, d=0.7, density=50)
groove(42.25, 44, 'C', gain=0.9)
for n, x, d in [('B4', 42.5, 0.5), ('E5', 43, 0.5), ('G5', 43.5, 0.25), ('F#5', 43.75, 0.25)]:
    lead(B(x), n, B(d) * 0.95, 0.9)
for k in range(11):
    blip(B(43) + k * 0.05, 2000, 0.4)
stab(B(44), ['E2', 'E3', 'B3', 'E4', 'G4', 'B4'], 1.0, d=2.5, cutoff=3000, dist=1, decay=1.0)
lead(B(44), 'E5', B(3), 0.8, glide_from='F#5')
kick(B(44), 1.0, long=True)
crash(B(44), 0.7)
shing(B(45.1), 0.9)
for k, n in enumerate(['B4', 'A#4', 'B4', 'A#4']):
    pluck(B(45.5 + k * 0.25), n, 0.6, 0.25, pan=0.6)
crt(B(47.1), False, 1.0)

# ═════════════ 混音 ═════════════
t_axis = np.arange(N) / SR
duck = np.ones(N)
for t0, g in kicks:
    i0 = int(t0 * SR)
    seg = min(N - i0, int(0.35 * SR))
    if seg > 0:
        duck[i0:i0 + seg] = np.minimum(duck[i0:i0 + seg], 1 - min(0.6, 0.45 * g) * np.exp(-np.arange(seg) / SR / 0.09))

# 混响 IR：去相关的指数衰减噪声 + 高频阻尼
ir_d = 2.4
ir_t = np.arange(int(ir_d * SR)) / SR
irL = lp(rng.standard_normal(len(ir_t)), 5500) * np.exp(-ir_t / 0.5)
irR = lp(rng.standard_normal(len(ir_t)), 5500) * np.exp(-ir_t / 0.5)
irL[: int(0.012 * SR)] = 0
irR[: int(0.017 * SR)] = 0
irL /= np.sqrt(np.sum(irL ** 2))
irR /= np.sqrt(np.sum(irR ** 2))
wet = np.vstack([fftconvolve(verb_send.x[0], irL)[:N], fftconvolve(verb_send.x[1], irR)[:N]])

mix = drums.x * 1.0 + music.x * duck * 1.0 + fx.x * 1.0 + wet * 0.55
mix = np.vstack([hp(mix[0], 28), hp(mix[1], 28)])
# 母带：轻压 + 软削波 + 归一化
peak = np.max(np.abs(mix))
mix = mix / peak * 1.6
mix = np.tanh(mix) / np.tanh(1.6)
fade = np.clip((DUR - t_axis) / 0.15, 0, 1)
mix *= fade
mix = mix / np.max(np.abs(mix)) * 0.93

wav_path = ROOT / 'out' / 'dangan-score.wav'
if '--wav' in sys.argv:
    wav_path = Path(sys.argv[sys.argv.index('--wav') + 1])
wav_path.parent.mkdir(parents=True, exist_ok=True)
from scipy.io import wavfile

wavfile.write(wav_path, SR, (mix.T * 32767).astype(np.int16))
out = ROOT / 'public' / 'dangan' / 'score.m4a'
out.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav_path), '-c:a', 'aac', '-b:a', '256k', str(out)], check=True)
print('wrote', out, f'{out.stat().st_size / 1024:.0f} KB')
